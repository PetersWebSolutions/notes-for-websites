'use strict';
const fs = require('node:fs');
const crypto = require('node:crypto');
// Explicit, sorted list of shipped code/assets. README, manifest and tests are
// deliberately excluded. No runtime dependency or build step is introduced.
// supabase-config.js is in the list on purpose: rotating the project URL or the
// anon key then changes the stamp, so every ?v= on the three pages changes with
// it and no browser keeps serving the old connection.
const files = ['app.js', 'favicon.svg', 'index.html', 'lists.html', 'lists.js', 'login.html', 'login.js', 'shared-store.js', 'store.js', 'styles.css', 'supabase-config.js', 'tally.js'];
function current() { return fs.readFileSync('app.js', 'utf8').match(/const BUILD = "([a-f0-9]{6})";/)[1]; }
function calculate(old = current()) {
  const hash = crypto.createHash('sha1');
  files.forEach(file => hash.update(fs.readFileSync(file, 'utf8').split(old).join('<stamp>')));
  return hash.digest('hex').slice(0, 6);
}
if (require.main === module) {
  const old = current();
  const next = calculate(old);
  if (process.argv.includes('--check')) {
    if (old !== next) { console.error(`Stale build stamp: ${old}; expected ${next}. Run npm run stamp.`); process.exitCode = 1; }
    else console.log(`Build stamp ${old} verified.`);
  } else {
    files.forEach(file => {
      const text = fs.readFileSync(file, 'utf8');
      if (text.includes(old)) fs.writeFileSync(file, text.split(old).join(next));
    });
    console.log(`Build stamp ${old} → ${next}`);
  }
}
module.exports = { files, current, calculate };
