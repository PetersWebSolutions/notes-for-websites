'use strict';
/*
 * Deploy-config audit: vercel.json and .vercelignore are part of the shipped
 * connection, not decoration. A wrong header here means visitors run old
 * scripts against new HTML, or the test folder (tests/dom.cjs encodes the
 * default passcode) ends up readable on the public URL. So the config is
 * checked against the repo it ships, by the same `npm test` as everything else.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { read } = require('./tests/dom.cjs');
const { files } = require('./tools/build-stamp.cjs');

const vercel = JSON.parse(read('vercel.json'));
const ignore = read('.vercelignore').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));

/* ---------- the repo, as Vercel would upload it ---------- */

const SKIP_DIRS = new Set(['node_modules', '.git', 'test-results', 'playwright-report']);
function walk(dir = '.', out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && dir === '.' && entry.name !== '.github') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { if (!SKIP_DIRS.has(entry.name)) walk(full, out); }
    else out.push(full.split(path.sep).join('/'));
  }
  return out;
}
const tracked = walk();

function ignoredPath(rel) {
  return ignore.some(pattern => {
    if (pattern.endsWith('/')) return rel.startsWith(pattern);
    if (pattern.startsWith('*.')) return rel.endsWith(pattern.slice(1));
    return rel === pattern;
  });
}

/* ---------- vercel.json source patterns ---------- */

/* Sources use path-to-regexp. Only three constructs appear in this file —
   a literal path, an alternation group, a (.*) wildcard — plus the \. escape. */
function sourceToRegExp(source) {
  const escape = ch => ch.replace(/[.+?^${}[\]\\]/g, '\\$&');
  let out = '';
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === '\\') { out += escape(source[++i]); continue; }
    if (ch === '(') {
      const close = source.indexOf(')', i);
      const body = source.slice(i + 1, close);
      out += '(' + body.split('|').map(part => (part === '.*' ? '.*' : escape(part))).join('|') + ')';
      i = close;
      continue;
    }
    out += escape(ch);
  }
  return new RegExp('^' + out + '$');
}

function rulesFor(rel) {
  const target = '/' + rel;
  return vercel.headers
    .filter(rule => sourceToRegExp(rule.source).test(target))
    .flatMap(rule => rule.headers);
}
function cacheControl(rel) {
  const found = rulesFor(rel).filter(h => h.key.toLowerCase() === 'cache-control');
  return found.length ? found[found.length - 1].value : '';
}

/* ---------- the stamped assets, read from the pages themselves ---------- */

function stampedAssets() {
  const found = new Set();
  for (const html of ['index.html', 'login.html', 'lists.html']) {
    const dom = new JSDOM(read(html));
    for (const el of dom.window.document.querySelectorAll('script[src],link[href]')) {
      const url = el.getAttribute('src') || el.getAttribute('href');
      if (!url.includes('?v=')) continue;
      if (/^https?:/.test(url)) continue;
      found.add(url.split('?')[0]);
    }
    dom.window.close();
  }
  return [...found].sort();
}

test('vercel.json keeps the documented static preset', () => {
  assert.equal(vercel.framework, null, 'framework: null keeps Vercel off any build toolchain');
  assert.equal(vercel.installCommand, '', 'the npm dependencies are test-only, so the deploy must not install them');
  assert.equal(vercel.buildCommand, '', 'there is no build step');
  assert.equal(vercel.outputDirectory, '.', 'the folder itself is the site');
});

test('the source pattern matcher understands every pattern in vercel.json', () => {
  const cases = {
    '/(.*)': ['/', '/index.html', '/app.js'],
    '/supabase-config.js': ['/supabase-config.js'],
    '/(app|tally|store|shared-store|lists|login).js': ['/app.js', '/shared-store.js', '/lists.js'],
    '/styles.css': ['/styles.css'],
    '/(.*)\\.html': ['/index.html', '/lists.html']
  };
  for (const [source, expected] of Object.entries(cases)) {
    const re = sourceToRegExp(source);
    for (const target of expected) assert.ok(re.test(target), `${source} should match ${target}`);
  }
  assert.equal(sourceToRegExp('/(app|tally).js').test('/manifest.js'), false, 'alternation must not match everything');
  assert.equal(sourceToRegExp('/(.*)\\.html').test('/app.js'), false, 'the html rule must not match scripts');
  for (const rule of vercel.headers) assert.doesNotThrow(() => sourceToRegExp(rule.source), rule.source);
});

test('every stamped asset is cached forever, and only those are', () => {
  const assets = stampedAssets();
  assert.ok(assets.includes('app.js') && assets.includes('styles.css'), 'the pages should stamp their local assets');
  for (const asset of assets) {
    if (asset === 'supabase-config.js') continue;
    assert.match(cacheControl(asset), /max-age=31536000/, `${asset}: expected an immutable cache`);
    assert.match(cacheControl(asset), /immutable/, `${asset}: expected immutable`);
  }
  /* Anything the stamp does not cover must never be pinned, or a changed file
     would stay stale behind the CDN for a year. */
  const stamped = new Set(assets.filter(a => a !== 'supabase-config.js'));
  for (const rel of tracked.filter(f => /\.(js|css|svg|json|html)$/.test(f))) {
    if (ignoredPath(rel)) continue;
    if (stamped.has(rel)) continue;
    assert.doesNotMatch(cacheControl(rel), /immutable/, `${rel}: not covered by the build stamp, so it must not be immutable`);
  }
  /* favicon.svg is in the stamp hash but linked without ?v=, so pinning it
     would keep a changed icon invisible for a year. */
  assert.equal(cacheControl('favicon.svg'), '', 'favicon.svg is left to revalidate');
});

test('the Supabase connection file is revalidated on every load', () => {
  const value = cacheControl('supabase-config.js');
  assert.match(value, /max-age=0/, 'a rotated project URL or anon key must reach visitors at once');
  assert.match(value, /must-revalidate/);
  assert.doesNotMatch(value, /immutable/);
});

test('documents are revalidated, so a new stamp is picked up immediately', () => {
  for (const html of ['index.html', 'login.html', 'lists.html']) {
    assert.match(cacheControl(html), /max-age=0/);
    assert.match(cacheControl(html), /must-revalidate/);
  }
});

test('every response carries the baseline security headers', () => {
  const headers = rulesFor('index.html').map(h => [h.key.toLowerCase(), h.value]);
  const get = key => (headers.find(([k]) => k === key) || [])[1];
  assert.equal(get('x-content-type-options'), 'nosniff');
  assert.ok(get('referrer-policy'), 'a referrer policy is required');
  assert.ok(get('permissions-policy'), 'a permissions policy is required');
  for (const rel of ['app.js', 'supabase-config.js', 'manifest.json']) {
    assert.equal(rulesFor(rel).some(h => h.key.toLowerCase() === 'x-content-type-options'), true, rel);
  }
});

test('supabase-config.js is in the build stamp file list', () => {
  assert.ok(files.includes('supabase-config.js'), 'rotating the connection must change every ?v=');
  for (const file of files) assert.ok(fs.existsSync(file), `${file} is hashed but missing`);
});

test('development-only files are kept off the deployment', () => {
  const devOnly = tracked.filter(rel =>
    rel.startsWith('tests/') || rel.startsWith('tools/') || rel.startsWith('.github/') || rel.startsWith('supabase/') ||
    rel.endsWith('.test.js') || rel === 'playwright.config.cjs');
  assert.ok(devOnly.includes('tests/dom.cjs'), 'tests/dom.cjs encodes the default passcode');
  assert.ok(devOnly.includes('tools/preview-server.js'), 'the stand-in shared backend is a dev tool');
  for (const rel of devOnly) assert.ok(ignoredPath(rel), `${rel} would be published`);
});

test('nothing the site needs at runtime is ignored', () => {
  const runtime = ['index.html', 'lists.html', 'login.html', 'manifest.json', 'vercel.json', ...files];
  for (const rel of [...new Set(runtime)]) {
    assert.equal(ignoredPath(rel), false, `${rel} must be deployed`);
    assert.ok(tracked.includes(rel), `${rel} is missing from the repo`);
  }
});
