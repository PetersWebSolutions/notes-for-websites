'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { JSDOM } = require('jsdom');
const { read, pass } = require('./tests/dom.cjs');
const { files, current, calculate } = require('./tools/build-stamp.cjs');

test('all shipped scripts parse and CSS braces balance', () => {
  files.filter(f=>f.endsWith('.js')).forEach(f=>execFileSync(process.execPath,['--check',f]));
  const css=read('styles.css').replace(/\/\*[\s\S]*?\*\//g,'');
  let depth=0;
  for (const c of css) { if(c==='{') depth++; if(c==='}') depth--; assert.ok(depth>=0); }
  assert.equal(depth,0);
});
test('every literal getElementById resolves on its page, without duplicate ids', () => {
  for (const [html,script] of [['index.html','app.js'],['login.html','login.js'],['lists.html','lists.js']]) {
    const dom=new JSDOM(read(html)); const doc=dom.window.document;
    const ids=[...doc.querySelectorAll('[id]')].map(el=>el.id);
    assert.equal(new Set(ids).size,ids.length,`${html}: duplicate id`);
    for(const match of read(script).matchAll(/getElementById\("([^"]+)"\)/g)) assert.ok(doc.getElementById(match[1]),`${html}: missing #${match[1]}`);
    dom.window.close();
  }
});
test('all three pages have metadata, font preconnects, shared assets and live regions', () => {
  for(const html of ['index.html','login.html','lists.html']) {
    const dom=new JSDOM(read(html));const d=dom.window.document;
    assert.equal(d.doctype.name,'html'); assert.equal(d.documentElement.lang,'en');
    assert.equal(d.querySelector('meta[name="viewport"]').content,'width=device-width, initial-scale=1, viewport-fit=cover');
    assert.equal(d.querySelector('meta[name="theme-color"]').content,'#0b1f3a');
    assert.equal(d.querySelector('meta[name="robots"]').content,'noindex, nofollow');
    assert.equal(d.querySelectorAll('link[rel="preconnect"]').length,2);
    assert.ok(d.querySelector('link[href="favicon.svg"]'));
    assert.ok(d.querySelector('#toast'));assert.equal(d.querySelector('#live').getAttribute('aria-live'),'polite');
    const srcs=[...d.querySelectorAll('script[src]')].map(s=>s.getAttribute('src').split('?')[0]);
    assert.deepEqual(srcs,html==='index.html'?['store.js','tally.js','app.js']:['store.js',html.replace('.html','.js')]);
    dom.window.close();
  }
});
test('guard is in the head after Store; open-file bar first; modal copied verbatim', () => {
  const dom=new JSDOM(read('index.html'));const d=dom.window.document;
  assert.equal(d.body.firstElementChild.className,'file-bar no-print');
  assert.equal(d.head.querySelector('script[src]').getAttribute('src'),`store.js?v=${current()}`);
  assert.match(d.head.querySelector('script:not([src])').textContent,/Store\.session/);
  const lists=new JSDOM(read('lists.html'));
  assert.equal(lists.window.document.querySelector('#confirm-modal').outerHTML,d.querySelector('#confirm-modal').outerHTML);
  dom.window.close();lists.window.close();
});
test('no plaintext default passcode, root-relative paths, local hosts or service worker in shipped files', () => {
  for(const file of [...files,'manifest.json']) {
    const text=read(file);
    assert.equal(text.includes(pass),false,`${file}: plaintext passcode`);
    assert.doesNotMatch(text,/(?:localhost|127\.0\.0\.1|serviceWorker)/,file);
    assert.doesNotMatch(text,/(?:src|href)=["']\//,file);
    assert.doesNotMatch(text,/url\(["']?\//,file);
  }
});
test('one build stamp on every local script and stylesheet matches a fresh hash', () => {
  const stamp=current();assert.equal(calculate(stamp),stamp);
  for(const html of ['index.html','login.html','lists.html']) {
    const dom=new JSDOM(read(html));
    for(const el of dom.window.document.querySelectorAll('script[src],link[href^="styles.css"]')) {
      const url=el.getAttribute('src')||el.getAttribute('href');
      assert.equal(url.split('?v=')[1],stamp,`${html}: ${url}`);
    }
    dom.window.close();
  }
});
test('tally math and its original suite are byte-identical to current main at d4811a5', () => {
  const hashes = JSON.parse(read('tests/tally-hashes.json'));
  for(const [file,hash] of Object.entries(hashes)) assert.equal(createHash('sha256').update(read(file)).digest('hex'),hash,file);
});
