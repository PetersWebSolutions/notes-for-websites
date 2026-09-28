'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { read, boot, snapshot, ana, ben, input } = require('./tests/dom.cjs');
// Keep test data out of the preview's demo database.
process.env.SHARED_DATA_FILE = path.join(__dirname, '.test-shared-data.json');
const { createServer, DATA_FILE } = require('./tools/preview-server.js');

const tick = (ms = 25) => new Promise(r => setTimeout(r, ms));

/* Boot index.html in shared mode with a stub SharedStore backend. */
function sharedBoot(t, { people = [], saveOk = true, loadFails = false } = {}) {
  const b = boot('index.html', {}, 'https://example.test/index.html', ['store.js', 'tally.js']);
  t.after(b.close);
  const stub = b.w.document.createElement('script');
  stub.textContent = `
    window.SUPABASE_CONFIG = { url: "https://demo.supabase.co", anonKey: "k", listId: "main" };
    window.__sharedCalls = { save: [], startPoll: 0, remote: null };
    window.SharedStore = {
      enabled: () => true,
      listId: () => "main",
      rememberWrite: () => {},
      load: () => ${loadFails
        ? 'Promise.reject(new Error("offline"))'
        : `Promise.resolve({ people: ${JSON.stringify(people)}, updatedAt: 1759000000000 })`},
      save: (list) => { window.__sharedCalls.save.push(list); return Promise.resolve(${saveOk}); },
      startPoll: (cb) => { window.__sharedCalls.startPoll += 1; window.__sharedCalls.remote = cb; }
    };`;
  b.w.document.body.appendChild(stub);
  const app = b.w.document.createElement('script');
  app.textContent = read('app.js');
  b.w.document.body.appendChild(app);
  return b;
}

test('shared-store.js stays disabled without a Supabase connection', t => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://example.test/', runScripts: 'dangerously' });
  t.after(() => dom.window.close());
  dom.window.SUPABASE_CONFIG = { url: '', anonKey: '', listId: 'main' };
  const s = dom.window.document.createElement('script');
  s.textContent = read('shared-store.js');
  dom.window.document.body.appendChild(s);
  assert.equal(dom.window.SharedStore.enabled(), false);
});

test('shared-store.js round-trips one shared row through the Supabase-shaped API', async t => {
  try { fs.unlinkSync(DATA_FILE); } catch (error) { /* first run */ }
  t.after(() => { try { fs.unlinkSync(DATA_FILE); } catch (error) { /* already gone */ } });
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const port = server.address().port;

  function visitor() {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://example.test/', runScripts: 'dangerously' });
    const w = dom.window;
    w.fetch = (url, init) => fetch(url, init);
    w.SUPABASE_CONFIG = { url: `http://127.0.0.1:${port}`, anonKey: 'test-key', listId: 'main' };
    const s = w.document.createElement('script');
    s.textContent = read('shared-store.js');
    w.document.body.appendChild(s);
    return { w, close: () => w.close() };
  }

  // JSON round-trips normalize the jsdom/Node realm difference for deepEqual.
  const plain = (value) => JSON.parse(JSON.stringify(value));

  const joyce = visitor();
  t.after(joyce.close);
  assert.equal(joyce.w.SharedStore.enabled(), true);
  assert.deepEqual(plain(await joyce.w.SharedStore.load()), { people: [], updatedAt: 0 });
  assert.equal(await joyce.w.SharedStore.save([ana], { at: 1759000000000 }), true);
  const back = await joyce.w.SharedStore.load();
  assert.deepEqual(plain(back.people), [ana]);
  assert.equal(back.updatedAt, 1759000000000);

  // A second visitor, brand new, sees the same shared list.
  const ben2 = visitor();
  t.after(ben2.close);
  assert.deepEqual(plain((await ben2.w.SharedStore.load()).people), [ana]);
  assert.equal(await ben2.w.SharedStore.save([ana, ben], { at: 1759000001000 }), true);
  assert.equal((await joyce.w.SharedStore.load()).people.length, 2);
});

test('shared mode opens to everyone and renders the online list, not device storage', async t => {
  const b = sharedBoot(t, { people: [ana, ben] });
  await tick();
  assert.equal(b.q('body').classList.contains('shared-mode'), true);
  assert.deepEqual(b.qa('.name-text').map(n => n.textContent), ['Ana Reyes', 'Ben Cruz']);
  assert.equal(b.q('#open-file-name').textContent, 'Shared list');
  assert.match(b.q('#save-state').textContent, /Connected to the shared list/);
  assert.equal(b.q('#sum-shirts').textContent, '7');
  assert.deepEqual(snapshot(b.w), {});
});

test('shared mode: UPDATE LIST force-writes the pending edit and confirms after the network answers', async t => {
  const b = sharedBoot(t, { people: [ana] });
  await tick();
  b.q('[data-action="edit"]').click();
  input(b, '[data-field="name"]', '  Ana   Online ');
  b.q('#update-list-btn').click();
  await tick();
  const calls = b.w.__sharedCalls.save;
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0].name, '  Ana   Online ');
  assert.equal(b.q('#update-list-btn').textContent, 'Saved ✓');
  assert.equal(b.q('#update-list-btn').classList.contains('is-saved'), true);
  assert.match(b.q('#update-when').textContent, /^Last saved /);
  assert.match(b.q('#toast').textContent, /Saved to the shared list/);
  assert.deepEqual(snapshot(b.w), {});
  await new Promise(r => setTimeout(r, 2300));
  assert.equal(b.q('#update-list-btn').textContent, 'UPDATE LIST');
});

test('shared mode: a failed write shows an error instead of a false Saved', async t => {
  const b = sharedBoot(t, { people: [ana], saveOk: false });
  await tick();
  b.q('#update-list-btn').click();
  await tick();
  assert.equal(b.q('#update-list-btn').textContent, 'UPDATE LIST');
  assert.equal(b.q('#update-when').classList.contains('is-error'), true);
  assert.match(b.q('#update-when').textContent, /Could not reach the shared database/);
  assert.match(b.q('#toast').textContent, /Could not reach/);
});

test('shared mode: an unreachable database reports an error with Retry and writes nothing', async t => {
  const b = sharedBoot(t, { loadFails: true });
  await tick();
  assert.equal(b.q('#order-body').children.length, 0);
  assert.equal(b.q('#save-state').classList.contains('is-error'), true);
  assert.match(b.q('#save-state').textContent, /Could not load the shared list/);
  assert.equal(b.q('#toast').hidden, false);
  assert.match(b.q('#toast').textContent, /Retry/);
  assert.deepEqual(snapshot(b.w), {});
});

test('shared mode: auto-save writes through and pagehide flushes a pending edit', async t => {
  const b = sharedBoot(t, { people: [ana] });
  await tick();
  // ana arrives paid; the toggle flips her and writes through at once.
  b.q('[data-action="toggle"]').click();
  await tick();
  assert.equal(b.w.__sharedCalls.save.at(-1)[0].paid, false);
  b.q('[data-action="edit"]').click();
  input(b, '[data-field="name"]', 'Typing Still');
  b.w.dispatchEvent(new b.w.Event('pagehide'));
  await tick();
  assert.equal(b.w.__sharedCalls.save.at(-1)[0].name, 'Typing Still');
});

test("shared mode: the poll applies someone else's change when idle and defers while editing", async t => {
  const b = sharedBoot(t, { people: [ana] });
  await tick();
  assert.equal(b.w.__sharedCalls.startPoll, 1);
  const cb = b.w.__sharedCalls.remote;
  const cara = { id: 'cara', name: 'Cara Lim', items: [{ color: 'white', size: 'S', qty: 1 }], paid: false, createdAt: 3 };
  cb([ana, cara]);
  assert.deepEqual(b.qa('.name-text').map(n => n.textContent), ['Ana Reyes', 'Cara Lim']);
  // Mid-edit the swap is deferred so no keystroke is dropped. Ana's row now
  // shows her name in the edit input, not in a .name-text span.
  b.q('[data-action="edit"]').click();
  cb([ben]);
  assert.equal(b.qa('#order-body tr').length, 2);
  assert.equal(b.q('[data-field="name"]').value, 'Ana Reyes');
  assert.deepEqual(b.qa('.name-text').map(n => n.textContent), ['Cara Lim']);
  b.q('[data-action="edit"]').click();
  await tick();
  cb([ben]);
  assert.deepEqual(b.qa('.name-text').map(n => n.textContent), ['Ben Cruz']);
});
