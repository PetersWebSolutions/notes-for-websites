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

function readRow() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch (error) { return null; }
}
function writeRow(row) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(row, null, 2));
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
    const id = String(url.searchParams.get('id') || '').replace(/^eq\./, '');
    const row = readRow();
    const rows = row && row.id === id ? [row] : [];
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
      const row = {
        id: String(incoming.id || 'main'),
        people: Array.isArray(incoming.people) ? incoming.people : [],
        updated_at: incoming.updated_at || new Date().toISOString()
      };
      writeRow(row);
      res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify([row]));
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
