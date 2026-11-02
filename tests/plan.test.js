const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const plan = require('../web/plan.js');
assert.deepEqual(plan.canon, JSON.parse(fs.readFileSync(path.join(__dirname,'../books.json'))));
assert.deepEqual(plan.reading(0).map(c=>c.chapter),[1,2,3,4,5,1]);
assert.deepEqual(plan.reading(29).map(c=>c.chapter),[146,147,148,149,150,30]);
assert.deepEqual(plan.reading(30).map(c=>c.chapter),[1,2,3,4,5,31]);
assert.deepEqual(plan.reading(31).map(c=>c.chapter),[6,7,8,9,10,1]);
assert.equal(plan.calendarDay('2024-02-28','2024-03-01'),2);
assert.equal(plan.calendarDay('2025-02-28','2025-03-01'),1);
assert.equal(plan.calendarDay('2026-12-31','2027-01-01'),1);
assert.equal(plan.calendarDay('2027-01-01','2026-01-01'),0);
for (const [year,month] of [[2026,1],[2024,1],[2026,3],[2026,0]]) {
  const days = new Date(year,month+1,0).getDate();
  const chapters = Array.from({length:days},(_,i)=>plan.monthly(new Date(year,month,i+1))).flat();
  assert.equal(chapters.length,181);
  assert.equal(new Set(chapters.map(c=>`${c.book}/${c.chapter}`)).size,181);
  assert.deepEqual(chapters.filter(c=>c.book==='Psalms').map(c=>c.chapter),Array.from({length:150},(_,i)=>i+1));
}
const annual = Array.from({length:365},(_,i)=>plan.annual(i)).flat();
assert.equal(annual.length,1189);
assert.equal(new Set(annual.map(c=>`${c.book}/${c.chapter}`)).size,1189);
assert.deepEqual(annual[0],{book:'Genesis',chapter:1});
assert.deepEqual(annual.at(-1),{book:'Revelation',chapter:22});
assert.deepEqual(plan.annual(365),plan.annual(0));
console.log('Reading plans: rolling cycles, leap years, monthly full coverage, and annual full coverage passed.');
