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
function sharedBoot(t, { people = [], saveOk = true, loadFails = false, session = false } = {}) {
  const store = session ? { 'team-elite-session-v1': JSON.stringify({ id: 'fixed-joyce', name: 'Joyce', at: 1 }) } : {};
  const b = boot('index.html', store, 'https://example.test/index.html', ['store.js', 'tally.js']);
  t.after(b.close);
  const stub = b.w.document.createElement('script');
  stub.textContent = `
    window.SUPABASE_CONFIG = { url: "https://demo.supabase.co", anonKey: "k", listId: "main" };
    window.__sharedCalls = { save: [], saveOpts: [], created: [], startPoll: 0, remote: null };
    window.SharedStore = {
      enabled: () => true,
      listId: () => "main",
      rememberWrite: () => {},
      load: () => ${loadFails
        ? 'Promise.reject(new Error("offline"))'
        : `Promise.resolve({ people: ${JSON.stringify(people)}, updatedAt: 1759000000000, name: "Shared list", updatedBy: "Gen" })`},
      listAll: () => Promise.resolve([{ id: "main", name: "Shared list", updatedBy: "Gen" }, { id: "batch-2-x", name: "Batch 2", updatedBy: "Stuts" }]),
      create: (name, list, by) => { window.__sharedCalls.created.push({ name, list, by }); return Promise.resolve(${saveOk} ? "new-list-id" : ""); },
      save: (list, opts) => { window.__sharedCalls.save.push(list); window.__sharedCalls.saveOpts.push(opts); return Promise.resolve(${saveOk}); },
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
  assert.deepEqual(plain(await joyce.w.SharedStore.load()), { people: [], updatedAt: 0, name: 'Shared list', updatedBy: '', exists: false });
  assert.equal(await joyce.w.SharedStore.save([ana], { at: 1759000000000, by: 'Joyce' }), true);
  const back = await joyce.w.SharedStore.load();
  assert.deepEqual(plain(back.people), [ana]);
  assert.equal(back.updatedAt, 1759000000000);
  assert.equal(back.updatedBy, 'Joyce');
  assert.equal(back.name, 'Shared list');

  // A second visitor, brand new, sees the same shared list.
  const ben2 = visitor();
  t.after(ben2.close);
  assert.deepEqual(plain((await ben2.w.SharedStore.load()).people), [ana]);
  assert.equal(await ben2.w.SharedStore.save([ana, ben], { at: 1759000001000, by: 'Ben' }), true);
  const after = await joyce.w.SharedStore.load();
  assert.equal(after.people.length, 2);
  assert.equal(after.updatedBy, 'Ben');

  // SAVE LIST AS: a new row that every visitor can list and open by ?list=<id>.
  const id = await ben2.w.SharedStore.create('Batch 2 orders', [ben], 'Ben');
  assert.match(id, /^batch-2-orders-/);
  const all = plain(await joyce.w.SharedStore.listAll());
  assert.deepEqual(all.map(l => [l.id, l.name, l.updatedBy]), [[id, 'Batch 2 orders', 'Ben'], ['main', 'Shared list', 'Ben']]);
  const dom3 = new JSDOM('<!doctype html><html><body></body></html>', { url: `https://example.test/index.html?list=${id}`, runScripts: 'dangerously' });
  t.after(() => dom3.window.close());
  dom3.window.fetch = (url, init) => fetch(url, init);
  dom3.window.SUPABASE_CONFIG = { url: `http://127.0.0.1:${port}`, anonKey: 'test-key', listId: 'main' };
  const s3 = dom3.window.document.createElement('script');
  s3.textContent = read('shared-store.js');
  dom3.window.document.body.appendChild(s3);
  assert.equal(dom3.window.SharedStore.listId(), id);
  const opened = await dom3.window.SharedStore.load();
  assert.equal(opened.name, 'Batch 2 orders');
  assert.deepEqual(plain(opened.people), [ben]);
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

test('shared mode: shows who last modified the list, stamps saves with the signed-in name, lists other lists', async t => {
  const b = sharedBoot(t, { people: [ana], session: true });
  await tick();
  assert.match(b.q('#open-file-when').textContent, /^Last modified by Gen · /);
  assert.deepEqual(b.qa('#list-picker option').map(o => o.textContent), ['Shared list — Gen', 'Batch 2 — Stuts']);
  assert.equal(b.q('#list-picker').value, 'main');
  b.q('#update-list-btn').click();
  await tick();
  assert.equal(b.w.__sharedCalls.saveOpts[0].by, 'Joyce');
  assert.match(b.q('#open-file-when').textContent, /^Last modified by Joyce · /);
  // another person's change arrives through the poll
  b.w.__sharedCalls.remote([ana, ben], 1759000005000, { updatedBy: 'Stuts', name: 'Shared list' });
  assert.match(b.q('#open-file-when').textContent, /^Last modified by Stuts · /);
  assert.match(b.q('#save-state').textContent, /updated by Stuts/);
});

test('shared mode: SAVE LIST AS creates a new shared list from the current names', async t => {
  const b = sharedBoot(t, { people: [ana, ben], session: true });
  await tick();
  assert.equal(b.q('#save-as-form').hidden, true);
  b.q('#save-as-btn').click();
  assert.equal(b.q('#save-as-form').hidden, false);
  assert.equal(b.q('#save-as-btn').hidden, true);
  b.q('#save-as-form').dispatchEvent(new b.w.Event('submit', { bubbles: true, cancelable: true }));
  assert.match(b.q('#save-as-error').textContent, /name/);
  input(b, '#save-as-name', ' Batch  2 orders ');
  b.q('#save-as-form').dispatchEvent(new b.w.Event('submit', { bubbles: true, cancelable: true }));
  await tick();
  const made = b.w.__sharedCalls.created;
  assert.equal(made.length, 1);
  assert.equal(made[0].name, 'Batch 2 orders');
  assert.equal(made[0].by, 'Joyce');
  assert.equal(made[0].list.map(p => p.name).join(','), 'Ana Reyes,Ben Cruz');
  assert.match(b.q('#toast').textContent, /Saved as Batch 2 orders/);
  b.q('#save-as-cancel').click();
  assert.equal(b.q('#save-as-form').hidden, true);
});

test('shared mode: SAVE LIST AS reports a failed write and stays on the form', async t => {
  const b = sharedBoot(t, { people: [ana], saveOk: false, session: true });
  await tick();
  b.q('#save-as-btn').click();
  input(b, '#save-as-name', 'Copy');
  b.q('#save-as-form').dispatchEvent(new b.w.Event('submit', { bubbles: true, cancelable: true }));
  await tick();
  assert.match(b.q('#save-as-error').textContent, /Could not save to the shared database/);
  assert.equal(b.q('#save-as-form').hidden, false);
});

/* lists.html in shared mode with a stub backend. */
function sharedListsBoot(t, { lists = [], fail = false } = {}) {
  const store = { 'team-elite-session-v1': JSON.stringify({ id: 'fixed-joyce', name: 'Joyce', at: 1 }) };
  const b = boot('lists.html', store, 'https://example.test/lists.html', ['store.js']);
  t.after(b.close);
  const stub = b.w.document.createElement('script');
  stub.textContent = `
    window.__calls = { created: [], renamed: [], removed: [] };
    window.SharedStore = {
      enabled: () => true,
      listAll: () => ${fail ? 'Promise.reject(new Error("offline"))' : `Promise.resolve(${JSON.stringify(lists)})`},
      create: (name, people, by) => { window.__calls.created.push({ name, people, by }); return Promise.resolve("new-id"); },
      rename: (id, name) => { window.__calls.renamed.push({ id, name }); return Promise.resolve(true); },
      remove: (id) => { window.__calls.removed.push(id); return Promise.resolve(true); }
    };`;
  b.w.document.body.appendChild(stub);
  const script = b.w.document.createElement('script');
  script.textContent = read('lists.js');
  b.w.document.body.appendChild(script);
  return b;
}

test('lists page in shared mode: lists from the database with who modified them; OPEN goes to ?list=', async t => {
  const b = sharedListsBoot(t, { lists: [
    { id: 'main', name: 'Shared list', updatedAt: 1759000000000, updatedBy: 'Gen', people: [ana, ben] },
    { id: 'batch-2-x', name: 'Batch 2', updatedAt: 1759100000000, updatedBy: 'Stuts', people: [ben] }
  ] });
  await tick();
  assert.equal(b.q('body').classList.contains('shared-mode'), true);
  assert.equal(b.q('#files-title').textContent, 'Saved lists');
  assert.equal(b.q('#files-count').textContent, '2 lists saved online');
  assert.deepEqual(b.qa('.file-name').map(n => n.textContent), ['Batch 2', 'Shared list']);
  assert.match(b.qa('.file-time')[0].textContent, /^Last modified by Stuts · /);
  assert.deepEqual(b.qa('.file-open').map(a => a.getAttribute('href')), ['index.html?list=batch-2-x', 'index.html?list=main']);
  assert.match(b.qa('.file-meta')[1].textContent, /2 people · 7 shirts/);
  assert.equal(b.q('#new-file-btn').textContent, 'NEW LIST');
  assert.equal(b.q('.files-shared-only').hidden, false);
  // NEW LIST writes an empty list online and shows it at once
  input(b, '#file-name', ' Batch  3 ');
  b.q('#new-file').dispatchEvent(new b.w.Event('submit', { bubbles: true, cancelable: true }));
  await tick();
  assert.deepEqual(JSON.parse(JSON.stringify(b.w.__calls.created.map(c => [c.name, c.by, c.people.length]))), [['Batch 3', 'Joyce', 0]]);
  assert.equal(b.qa('.file-name')[0].textContent, 'Batch 3');
  assert.equal(b.q('#files-count').textContent, '3 lists saved online');
  // rename and delete go online too
  b.w.prompt = () => 'Batch three';
  b.q('[data-rename="new-id"]').click();
  await tick();
  assert.deepEqual(JSON.parse(JSON.stringify(b.w.__calls.renamed)), [{ id: 'new-id', name: 'Batch three' }]);
  assert.equal(b.qa('.file-name')[0].textContent, 'Batch three');
  b.q('[data-delete="batch-2-x"]').click();
  b.q('#confirm-ok').click();
  await tick();
  assert.deepEqual(JSON.parse(JSON.stringify(b.w.__calls.removed)), ['batch-2-x']);
  assert.deepEqual(b.qa('.file-name').map(n => n.textContent), ['Batch three', 'Shared list']);
  assert.deepEqual(snapshot(b.w), { 'team-elite-session-v1': JSON.stringify({ id: 'fixed-joyce', name: 'Joyce', at: 1 }) });
});

test('lists page in shared mode: an unreachable database shows an error, not an empty "no lists"', async t => {
  const b = sharedListsBoot(t, { fail: true });
  await tick();
  assert.equal(b.q('#files-load-error').hidden, false);
  assert.match(b.q('#files-load-error').textContent, /Could not load the saved lists/);
});
