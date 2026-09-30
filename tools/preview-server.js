'use strict';

/*
 * Preview server with a stand-in shared backend.
 *
 * Serves the static site AND a tiny Supabase-shaped REST endpoint
 * (/rest/v1/shared_lists) stored in .preview-shared-data.json, so the
 * shared-list mode can be tried before connecting a real Supabase project.
 * When supabase-config.js on disk already holds a real project URL, the
 * file is served as-is and this backend steps aside.
 *
 * Development tool only — production deploys are static files plus the
 * real Supabase project named in supabase-config.js.
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const DATA_FILE = process.env.SHARED_DATA_FILE || path.join(ROOT, '.preview-shared-data.json');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json'
};

/* All rows, keyed by id. An older single-row file is read as one row. */
function readRows() {
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    if (Array.isArray(data)) return data;
    return data && data.id ? [data] : [];
  } catch (error) { return []; }
}
function writeRows(rows) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(rows, null, 2));
}

function configHasRealUrl() {
  try {
    const text = fs.readFileSync(path.join(ROOT, 'supabase-config.js'), 'utf8');
    return /url:\s*["']https?:\/\//.test(text);
  } catch (error) { return false; }
}
function demoConfig() {
  return '/* Preview demo connection: stand-in shared backend on this same server. */\n'
    + 'window.SUPABASE_CONFIG = { url: window.location.origin, anonKey: "preview-demo-key", listId: "main" };\n';
}

function handleSharedLists(req, res, url) {
  if (req.method === 'GET') {
    const id = url.searchParams.has('id') ? String(url.searchParams.get('id')).replace(/^eq\./, '') : null;
    let rows = readRows();
    if (id !== null) rows = rows.filter((row) => row.id === id);
    if (/updated_at\.desc/.test(url.searchParams.get('order') || '')) {
      rows.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(rows));
    return;
  }
  if (req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      let incoming;
      try { incoming = JSON.parse(body); } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end('{}');
        return;
      }
      const rows = readRows();
      const prior = rows.find((item) => item.id === String(incoming.id || 'main')) || {};
      const row = {
        id: String(incoming.id || 'main'),
        people: Array.isArray(incoming.people) ? incoming.people : [],
        updated_at: incoming.updated_at || new Date().toISOString(),
        name: incoming.name !== undefined ? incoming.name : (prior.name || null),
        updated_by: incoming.updated_by !== undefined ? incoming.updated_by : (prior.updated_by || null)
      };
      writeRows(rows.filter((item) => item.id !== row.id).concat([row]));
      res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify([row]));
    });
    return;
  }
  if (req.method === 'PATCH' || req.method === 'DELETE') {
    const id = String(url.searchParams.get('id') || '').replace(/^eq\./, '');
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      const rows = readRows();
      if (req.method === 'DELETE') {
        writeRows(rows.filter((row) => row.id !== id));
      } else {
        let patch = {};
        try { patch = JSON.parse(body || '{}'); } catch (error) { patch = {}; }
        writeRows(rows.map((row) => (row.id === id ? Object.assign({}, row, patch) : row)));
      }
      res.writeHead(204);
      res.end();
    });
    return;
  }
  res.writeHead(405, { 'Content-Type': 'application/json' });
  res.end('{}');
}

function createServer() {
  return http.createServer((req, res) => {
    let url;
    try { url = new URL(req.url, 'http://preview.local'); } catch (error) {
      res.writeHead(400); res.end(); return;
    }

    if (url.pathname === '/supabase-config.js') {
      const file = path.join(ROOT, 'supabase-config.js');
      const text = configHasRealUrl() && fs.existsSync(file)
        ? fs.readFileSync(file, 'utf8')
        : demoConfig();
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(text);
      return;
    }

    if (url.pathname === '/rest/v1/shared_lists') {
      handleSharedLists(req, res, url);
      return;
    }

    let pathname = url.pathname === '/' ? '/index.html' : url.pathname;
    try { pathname = decodeURIComponent(pathname); } catch (error) {
      res.writeHead(400); res.end(); return;
    }
    const file = path.normalize(path.join(ROOT, pathname));
    if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 8080);
  createServer().listen(port, '0.0.0.0', () => {
    console.log(`Preview with demo shared backend on http://0.0.0.0:${port}`);
    console.log('Shared data file:', DATA_FILE);
  });
}

module.exports = { createServer, DATA_FILE };
