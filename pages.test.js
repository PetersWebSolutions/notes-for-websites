'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { read, boot, snapshot, KEYS, pass, ana, documentA, documentB, profile, submit, input } = require('./tests/dom.cjs');
function page(t, file, store, url) { const b=boot(file, store, url); t.after(b.close); return b; }
function tally(t, docs) { return page(t, 'index.html', profile(docs), 'https://example.test/index.html?doc=a'); }

test('inline guard: missing Store, missing session, missing/unknown doc, and valid doc', () => {
  // Execute the actual head IIFE, not jsdom's non-navigating location.replace.
  const source = read('index.html').match(/\(function \(\) \{[\s\S]*?\}\)\(\);/)[0];
  const guard = new Function('window', 'Store', source);
  const seen=[];
  const fake={session:()=>({name:'Joyce'}), currentDocId:()=> 'a', doc:()=>({id:'a'})};
  const window={Store:fake,location:{replace:u=>seen.push(u)}};
  guard({...window,Store:undefined}, undefined);
  assert.deepEqual(seen.splice(0), ['login.html']);
  guard(window, {...fake,session:()=>null});
  assert.deepEqual(seen.splice(0), ['login.html']);
  guard(window, {...fake,currentDocId:()=>''});
  assert.deepEqual(seen.splice(0), ['lists.html']);
  guard(window, {...fake,doc:()=>null});
  assert.deepEqual(seen.splice(0), ['lists.html']);
  guard(window, fake);
  assert.deepEqual(seen, []);
});
test('inline guard: shared mode is open to everyone, with or without a session', () => {
  const source = read('index.html').match(/\(function \(\) \{[\s\S]*?\}\)\(\);/)[0];
  const guard = new Function('window', 'Store', source);
  const seen=[];
  const window={location:{replace:u=>seen.push(u)},SharedStore:{enabled:()=>true}};
  guard(window, undefined);
  assert.deepEqual(seen, []);
  guard({...window,SharedStore:{enabled:()=>false}}, {session:()=>null});
  assert.deepEqual(seen, ['login.html']);
});
test('login focus, wrong passcode, input clears error, and successful persistent session', t => {
  const b=page(t, 'login.html');
  assert.equal(b.w.document.activeElement.id, 'login-name');
  input(b,'#login-name','Joyce'); input(b,'#login-pass','wrong'); submit(b,'#login-form');
  assert.equal(b.q('#login-error').hidden,false);
  assert.match(b.q('#login-error').textContent,/do not match/);
  assert.equal(b.q('#login-pass').selectionEnd,5);
  input(b,'#login-pass',pass);
  assert.equal(b.q('#login-error').hidden,true);
  submit(b,'#login-form');
  assert.equal(b.S.session().name,'Joyce');
});
test('signup rejects duplicates, clears error and immediately signs in normalized name', t => {
  const b=page(t,'login.html');
  input(b,'#new-name','joyce'); input(b,'#new-pass','secret'); submit(b,'#signup-form');
  assert.equal(b.q('#signup-error').hidden,false);
  input(b,'#new-name','  Cara   Lim ');
  assert.equal(b.q('#signup-error').hidden,true);
  submit(b,'#signup-form');
  assert.equal(b.S.session().name,'Cara Lim');
});
test('login storage denial displays error rather than redirecting in a loop', t => {
  const b=page(t,'login.html');
  b.w.Storage.prototype.setItem=()=>{throw new Error('blocked')};
  input(b,'#login-name','Joyce'); input(b,'#login-pass',pass); submit(b,'#login-form');
  assert.equal(b.S.session(),null);
  assert.match(b.q('#login-error').textContent,/Allow browser storage/);
});
test('files blank-name validation, create, owner and encoded open link', t => {
  const b=page(t,'lists.html',profile([]));
  assert.equal(b.q('#files-empty').hidden,false);
  assert.equal(b.q('#files-count').textContent,'Nothing saved yet');
  submit(b,'#new-file');
  assert.equal(b.q('#file-error').textContent,'Give the file a name.');
  input(b,'#file-name','  Joyce   listing ');
  assert.equal(b.q('#file-error').hidden,true);
  submit(b,'#new-file');
  assert.equal(b.q('#file-name').value,'');
  assert.equal(b.q('#files-count').textContent,'1 file on this device');
  assert.equal(b.q('#files-empty').hidden,true);
  assert.equal(b.q('.file-name').textContent,'Joyce listing');
  assert.equal(b.S.docs()[0].owner,'Joyce');
  assert.match(b.q('.file-open').getAttribute('href'),/^index.html\?doc=/);
  assert.equal(b.w.document.activeElement.id,'file-name');
});
test('files sorted by modification, counts and optional owner rendered as plain text', t => {
  const b=page(t,'lists.html',profile([{...documentA,updatedAt:1},{...documentB,name:'<img src=x>',owner:'',updatedAt:9}]));
  assert.equal(b.q('.file-name').textContent,'<img src=x>');
  assert.equal(b.q('.file-name img'),null);
  assert.equal(b.qa('.file-meta')[0].textContent,'1 person · 4 shirts');
  assert.equal(b.qa('.file-meta')[1].textContent,'2 people · 7 shirts · by Joyce');
  assert.equal(b.q('#who').textContent,'Signed in as Joyce');
  assert.equal(b.q('#files-count').textContent,'2 files on this device');
});
test('rename prompt cancellation, blank-name error and successful rename/sort', t => {
  const b=page(t,'lists.html',profile());
  b.w.prompt=()=>null; b.q('[data-rename="b"]').click();
  assert.equal(b.S.doc('b').name,'Other file');
  b.w.prompt=()=>''; b.q('[data-rename="b"]').click();
  assert.equal(b.q('#file-error').hidden,false);
  b.w.prompt=()=>' Renamed '; b.q('[data-rename="b"]').click();
  assert.equal(b.S.doc('b').name,'Renamed');
  assert.equal(b.q('.file-name').textContent,'Renamed');
});
test('delete modal names file/counts, cancel/backdrop/Escape keep it, confirmation removes only it', t => {
  const b=page(t,'lists.html',profile());
  const open=()=>b.q('[data-delete="a"]').click();
  open(); assert.equal(b.q('#confirm-modal').hidden,false);
  assert.match(b.q('#confirm-body').textContent,/2 people · 7 shirts/);
  assert.match(b.q('#confirm-body').textContent,/Joyce listing/);
  assert.equal(b.w.document.activeElement.id,'confirm-cancel');
  b.q('#confirm-cancel').click(); assert.ok(b.S.doc('a'));
  open(); b.q('[data-close]').click(); assert.equal(b.q('#confirm-modal').hidden,true);
  open(); b.w.document.dispatchEvent(new b.w.KeyboardEvent('keydown',{key:'Escape'}));
  assert.equal(b.q('#confirm-modal').hidden,true); assert.ok(b.S.doc('a'));
  open(); b.q('#confirm-ok').click();
  assert.equal(b.S.doc('a'),null); assert.ok(b.S.doc('b'));
  assert.equal(b.q('#confirm-modal').hidden,true);
});
test('add another person, list accounts, and sign out without deleting files', t => {
  const b=page(t,'lists.html',profile());
  assert.match(b.q('#people-here').textContent,/Joyce/);
  input(b,'#person-name','Ben'); input(b,'#person-pass','secret'); submit(b,'#add-person-form');
  assert.match(b.q('#people-here').textContent,/Joyce, Ben/);
  assert.equal(b.q('#person-name').value,''); assert.equal(b.q('#person-pass').value,'');
  assert.equal(b.S.session().name,'Joyce');
  b.q('#signout-btn').click();
  assert.equal(b.S.session(),null); assert.equal(b.S.docs().length,2);
});
test('file lists survive close/reopen with the same browser profile', t => {
  const b=page(t,'lists.html',profile());
  input(b,'#file-name','Persistent file'); submit(b,'#new-file');
  const state=snapshot(b.w); b.close();
  const c=page(t,'lists.html',state);
  assert.equal(c.qa('.file-item').length,3);
  assert.equal(c.q('.file-name').textContent,'Persistent file');
  assert.equal(c.S.session().name,'Joyce');
});
test('18 visible grid columns; body, footer and colgroup include 19 with hidden summary', t => {
  const b=tally(t);
  assert.equal(b.qa('#order-cols col').length,19);
  assert.equal(b.q('#order-body tr').children.length,19);
  assert.equal(b.q('#order-foot tr').children.length,19);
  assert.equal(b.q('#order-body tr').firstElementChild.tagName,'TH');
  assert.equal(b.q('#order-body tr').firstElementChild.className,'col-name');
  assert.equal(b.q('#order-head tr').firstElementChild.textContent,'NAME');
  assert.equal(b.qa('#order-head .cell-qty').length,14);
  assert.equal(b.qa('#order-head .col-summary').length,0);
  assert.equal(b.qa('#order-cols .col-summary').length,1);
  assert.equal(b.q('#open-file-name').textContent,'Joyce listing');
  assert.equal(b.q('#step3-title').textContent,'Joyce listing');
  assert.match(b.q('#open-file-when').textContent,/Last modified/);
});
test('summary chips ordered white then blue by size, and empty summary', t => {
  const b=tally(t,[{...documentA,people:[ana,{...ana,id:'empty',items:[]}]}]);
  assert.deepEqual(b.qa('#order-body tr:first-child .sum-chip').map(n=>n.textContent),['WhiteM×2','Blue2XL×1']);
  assert.equal(b.q('.sum-empty').textContent,'no shirts yet');
});
test('caret toggles row in place and remains expanded after redraw', t => {
  const b=tally(t);
  const row=b.q('#order-body tr');
  assert.equal(row.classList.contains('is-open'),false);
  row.querySelector('.expand-btn').click();
  assert.equal(row.classList.contains('is-open'),true);
  assert.equal(row.querySelector('.expand-btn').getAttribute('aria-expanded'),'true');
  row.querySelector('[data-action="toggle"]').click();
  assert.equal(b.q('#order-body tr').classList.contains('is-open'),true);
  b.q('.expand-btn').click();
  assert.equal(b.q('#order-body tr').classList.contains('is-open'),false);
});
test('quantities locked until EDIT, change (not input) applies qty, DONE relocks', t => {
  const b=tally(t);
  assert.equal(b.qa('[data-cell-input]').length,0);
  b.q('[data-action="edit"]').click();
  assert.equal(b.qa('[data-cell-input]').length,14);
  assert.ok(b.q('#order-body tr').classList.contains('is-open'));
  input(b,'[data-cell-input="white|M"]','5');
  assert.equal(b.S.doc('a').people[0].items[0].qty,2);
  input(b,'[data-cell-input="white|M"]','5','change');
  assert.equal(b.S.doc('a').people[0].items[0].qty,5);
  b.q('[data-action="edit"]').click();
  assert.equal(b.qa('[data-cell-input]').length,0);
  assert.match(b.q('#save-state').textContent,/Saved in Joyce listing/);
});
test('live names schedule a save, cleaned name applied on change; other file untouched', async t => {
  const b=tally(t);
  const before=JSON.stringify(b.S.doc('b'));
  b.q('[data-action="edit"]').click();
  input(b,'[data-field="name"]','  Ana   New ');
  await new Promise(r=>setTimeout(r,450));
  assert.equal(b.S.doc('a').people[0].name,'  Ana   New ');
  input(b,'[data-field="name"]','  Ana   New ','change');
  assert.equal(b.S.doc('a').people[0].name,'Ana New');
  assert.equal(JSON.stringify(b.S.doc('b')),before);
});
test('PAID/UNPAID tappable without EDIT and paid/unpaid/per-size totals correct', t => {
  const b=tally(t);
  assert.equal(b.q('#sum-shirts').textContent,'7');
  assert.equal(b.q('#sum-paid').textContent,'₱1,247');
  assert.equal(b.q('#sum-unpaid').textContent,'₱1,746');
  assert.equal(b.q('#sum-total').textContent,'₱2,993');
  assert.equal(b.q('#order-foot .sz-white[data-label="M"]').textContent,'2');
  assert.equal(b.q('#order-foot .sz-blue[data-label="4XL"]').textContent,'3');
  b.q('[data-action="toggle"]').click();
  assert.equal(b.q('#sum-paid').textContent,'₱0');
  assert.equal(b.q('#sum-unpaid').textContent,'₱2,993');
  assert.equal(b.qa('[data-cell-input]').length,0);
});
test('ADD to cart then ADD TO LIST, refresh session/data, per-file isolation', t => {
  const b=tally(t,[{...documentA,people:[]},documentB]);
  const before=JSON.stringify(b.S.doc('b'));
  input(b,'#name-input','Cara Lim'); input(b,'#size-input','M','change'); input(b,'#qty-input','2');
  submit(b,'#add-form');
  assert.equal(b.q('#cart-count').textContent,'2 shirts');
  assert.equal(b.S.doc('a').people.length,0);
  b.q('#add-person-btn').click();
  assert.equal(b.S.doc('a').people.length,1);
  assert.equal(b.S.doc('a').people[0].items[0].qty,2);
  assert.equal(b.q('#cart-count').textContent,'0 shirts');
  assert.equal(JSON.stringify(b.S.doc('b')),before);
  const c=page(t,'index.html',snapshot(b.w),'https://example.test/index.html?doc=a');
  assert.equal(c.q('.name-text').textContent,'Cara Lim');
  assert.equal(c.S.session().name,'Joyce');
  assert.equal(c.q('#sum-shirts').textContent,'2');
});
test('legacy rows preserved when migrated file is opened, then file-scoped writes leave legacy alone', t => {
  const state=profile([]); delete state[KEYS.docs]; state[KEYS.legacy]=JSON.stringify([ana]);
  const b=page(t,'lists.html',state);
  const id=b.S.docs()[0].id;
  const c=page(t,'index.html',snapshot(b.w),`https://example.test/index.html?doc=${id}`);
  assert.equal(c.q('.name-text').textContent,'Ana Reyes');
  c.q('[data-action="toggle"]').click();
  assert.equal(c.S.doc(id).people[0].paid,false);
  assert.equal(c.w.localStorage.getItem(KEYS.legacy),state[KEYS.legacy]);
});
test('backup payload and filename carry open-file name', t => {
  const b=tally(t);
  let result;
  b.w.download=(...args)=>{result=args;};
  b.w.downloadBackup();
  assert.match(result[0],/^team-elite-joyce-listing-\d{4}-\d{2}-\d{2}\.json$/);
  assert.equal(JSON.parse(result[1]).file,'Joyce listing');
  assert.equal(JSON.parse(result[1]).people.length,2);
});
test('failed file write displays the existing backup warning; missing file cannot overwrite another', t => {
  const b=tally(t);
  b.S.deleteDoc('a');
  const before=JSON.stringify(b.S.doc('b'));
  b.q('[data-action="toggle"]').click();
  assert.equal(b.q('#save-state').classList.contains('is-error'),true);
  assert.match(b.q('#save-state').textContent,/Export a backup/);
  assert.equal(JSON.stringify(b.S.doc('b')),before);
});
test('used-device empty-file recovery note is revealed', t => {
  const state=profile([{...documentA,people:[]}]); state[KEYS.used]='1';
  const b=page(t,'index.html',state,'https://example.test/index.html?doc=a');
  assert.equal(b.q('#recover-note').hidden,false);
});
test('open-file load normalizes old shapes, skips invalid rows and caps at 300', t => {
  const legacy={id:'old',name:' Older  person ',white:{size:'M',qty:2},blue:{},paid:false};
  const people=[null,legacy,...Array.from({length:305},(_,i)=>({...ana,id:`person-${i}`}))];
  const b=tally(t,[{...documentA,people}]);
  assert.equal(b.qa('#order-body tr').length,300);
  assert.equal(b.q('.name-text').textContent,'Older person');
  assert.match(b.q('#toast').textContent,/Some saved rows were skipped/);
});
test('oldest one-shirt-per-row backups keep their shirts when the file opens', t => {
  const order={id:'o1',name:'Oldest Row',size:'3XL',color:'blue',paid:true,createdAt:5};
  const b=tally(t,[{...documentA,people:[order]}]);
  assert.equal(b.q('.name-text').textContent,'Oldest Row');
  assert.equal(b.q('#sum-shirts').textContent,'1');
  assert.equal(b.q('#sum-paid').textContent,'₱449');
  assert.equal(b.q('#order-body .sz-blue[data-label="3XL"] .qty-figure').textContent,'1');
});
test('UPDATE LIST force-writes the in-memory people and confirms, then reverts', async t => {
  const b=tally(t);
  const before=JSON.stringify(b.S.doc('b'));
  b.q('[data-action="edit"]').click();
  input(b,'[data-field="name"]','  Ana   Updated ');
  // The 400ms auto-save is still pending; UPDATE LIST must write right now.
  b.q('#update-list-btn').click();
  assert.equal(b.S.doc('a').people[0].name,'  Ana   Updated ');
  assert.equal(JSON.stringify(b.S.doc('b')),before);
  assert.equal(b.q('#update-list-btn').textContent,'Saved ✓');
  assert.equal(b.q('#update-list-btn').classList.contains('is-saved'),true);
  assert.match(b.q('#update-when').textContent,/^Last saved /);
  assert.equal(b.q('#toast').hidden,false);
  assert.match(b.q('#toast').textContent,/saved on this device/i);
  assert.match(b.q('#save-state').textContent,/Saved in Joyce listing/);
  await new Promise(r=>setTimeout(r,2300));
  assert.equal(b.q('#update-list-btn').textContent,'UPDATE LIST');
  assert.equal(b.q('#update-list-btn').classList.contains('is-saved'),false);
});
test('UPDATE LIST without an open file writes nothing and points to the Files page', t => {
  const b=page(t,'index.html',profile([]),'https://example.test/index.html?doc=a');
  const before=snapshot(b.w);
  b.q('#update-list-btn').click();
  assert.equal(b.q('#update-list-btn').textContent,'UPDATE LIST');
  assert.equal(b.q('#update-when').classList.contains('is-error'),true);
  assert.match(b.q('#update-when').textContent,/Files page/);
  assert.equal(b.q('#toast').hidden,false);
  assert.match(b.q('#toast').textContent,/Files page/);
  assert.deepEqual(snapshot(b.w),before);
  // Adding a person with no open file must not write either.
  input(b,'#name-input','Ghost'); input(b,'#size-input','M','change'); input(b,'#qty-input','1');
  submit(b,'#add-form');
  b.q('#add-person-btn').click();
  assert.deepEqual(snapshot(b.w),before);
});
test('sign-out keeps every file; signing back in shows the same files and people', t => {
  const b=page(t,'lists.html',profile());
  b.q('#signout-btn').click();
  assert.equal(b.S.session(),null);
  assert.equal(b.S.docs().length,2);
  const c=page(t,'login.html',snapshot(b.w));
  input(c,'#login-name','Joyce'); input(c,'#login-pass',pass); submit(c,'#login-form');
  assert.equal(c.S.session().name,'Joyce');
  const d=page(t,'lists.html',snapshot(c.w));
  assert.equal(d.qa('.file-item').length,2);
  assert.match(d.qa('.file-meta')[0].textContent,/2 people · 7 shirts/);
  const e=page(t,'index.html',snapshot(d.w),'https://example.test/index.html?doc=a');
  assert.deepEqual(e.qa('.name-text').map(n=>n.textContent),['Ana Reyes','Ben Cruz']);
});
test('refresh preserves data: visibilitychange, pagehide and sign-out flush a pending save', t => {
  const b=tally(t);
  b.q('[data-action="edit"]').click();
  input(b,'[data-field="name"]','Pending Name');
  // The 400ms debounce has not fired; hiding the tab must flush it.
  Object.defineProperty(b.w.document,'visibilityState',{configurable:true,value:'hidden'});
  b.w.document.dispatchEvent(new b.w.Event('visibilitychange'));
  assert.equal(b.S.doc('a').people[0].name,'Pending Name');
  input(b,'[data-field="name"]','Pending Again');
  b.w.dispatchEvent(new b.w.Event('pagehide'));
  assert.equal(b.S.doc('a').people[0].name,'Pending Again');
  input(b,'[data-field="name"]','Signed Out Edit');
  // The same hook the sign-out button calls before dropping the session.
  assert.equal(typeof b.w.flushPendingSaves,'function');
  b.w.flushPendingSaves();
  assert.equal(b.S.doc('a').people[0].name,'Signed Out Edit');
  const c=page(t,'index.html',snapshot(b.w),'https://example.test/index.html?doc=a');
  assert.equal(c.q('.name-text').textContent,'Signed Out Edit');
  assert.equal(c.S.session().name,'Joyce');
});
