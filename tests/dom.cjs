const fs = require('node:fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const read = (file) => fs.readFileSync(file, 'utf8');
const KEYS = { users: 'team-elite-users-v1', docs: 'team-elite-documents-v1', session: 'team-elite-session-v1', legacy: 'team-elite-ph-tshirt-people-v2', used: 'team-elite-ph-tshirt-used-v1' };
const pass = String.fromCharCode(69, 108, 105, 116, 101, 50, 54);
const me = { id: 'joyce', name: 'Joyce', at: 123 };
const ana = { id: 'ana', name: 'Ana Reyes', items: [{color:'white',size:'M',qty:2},{color:'blue',size:'2XL',qty:1}], paid: true, createdAt: 1 };
const ben = { id: 'ben', name: 'Ben Cruz', items: [{color:'blue',size:'4XL',qty:3},{color:'white',size:'S',qty:1}], paid: false, createdAt: 2 };
const documentA = { id: 'a', name: 'Joyce listing', owner: 'Joyce', createdAt: 1, updatedAt: 2, people: [ana, ben] };
const documentB = { id: 'b', name: 'Other file', owner: 'Ben', createdAt: 1, updatedAt: 1, people: [ben] };
function profile(docs = [documentA, documentB]) {
  return { [KEYS.session]: JSON.stringify(me), [KEYS.docs]: JSON.stringify(docs) };
}
function boot(file = 'login.html', store = {}, url = 'https://example.test/' + file, run) {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error) => {
    if (!/Not implemented: (navigation|Window's scrollTo)/i.test(error.message)) errors.push(error);
  });
  const dom = new JSDOM(read(file), { runScripts: 'dangerously', url, virtualConsole, pretendToBeVisual: true });
  dom.window.scrollTo = () => {};
  Object.entries(store).forEach(([k,v]) => dom.window.localStorage.setItem(k,v));
  (run || ['store.js', file === 'index.html' ? 'tally.js' : file.replace('.html','.js'), ...(file === 'index.html' ? ['app.js'] : [])]).forEach(src => {
    const s = dom.window.document.createElement('script');
    s.textContent = read(src);
    dom.window.document.body.appendChild(s);
  });
  if (errors.length) throw errors[0];
  return { dom, w: dom.window, S: dom.window.Store, q: (s) => dom.window.document.querySelector(s), qa: (s) => [...dom.window.document.querySelectorAll(s)], close: () => dom.window.close() };
}
function snapshot(w) { return Object.fromEntries(Object.keys(w.localStorage).map(k => [k,w.localStorage.getItem(k)])); }
function submit(b, selector) { b.q(selector).dispatchEvent(new b.w.Event('submit', { bubbles: true, cancelable: true })); }
function input(b, selector, value, type = 'input') { const el=b.q(selector); el.value=value; el.dispatchEvent(new b.w.Event(type, {bubbles:true})); }
module.exports = { read, KEYS, pass, me, ana, ben, documentA, documentB, profile, boot, snapshot, submit, input };
