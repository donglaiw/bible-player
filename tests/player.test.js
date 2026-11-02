// Exercise player events without a browser or audio hardware.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const Plan = require('../web/plan.js');
class Element {
  constructor() { this.events={}; this.paused=true; this.currentTime=0; this.duration=60; this.value=''; }
  addEventListener(name, fn) { this.events[name]=fn; }
  emit(name) { return this.events[name]?.(); }
  setAttribute(name, value) { this[name]=value; }
  removeAttribute(name) { delete this[name]; }
  append() {}
  replaceChildren() {}
  load() { this.paused=true; this.currentTime=0; }
  pause() { if(!this.paused) { this.paused=true; this.emit('pause'); } }
  play() { this.paused=false; this.emit('play'); return Promise.resolve(); }
}
async function player(saved) {
  const elements={}; const stored={value:saved ? JSON.stringify(saved):null};
  const context=vm.createContext({
    Plan, console, Date, Number, Object, Array, String, JSON,
    document:{getElementById:id=>elements[id] ||= new Element(), createElement:()=>new Element(), addEventListener(){}},
    window:{addEventListener(){}},navigator:{},confirm:()=>true,
    localStorage:{getItem:()=>stored.value,setItem:(_,v)=>{stored.value=v;}},
    fetch:async()=>({ok:true,json:async()=>({warnings:[], books:Object.fromEntries(Plan.canon.map(([book,count])=>[book,Object.fromEntries(Array.from({length:count},(_,i)=>[i+1,`/audio/${book}/${i+1}.mp3`]))]))})})
  });
  const run=code=>vm.runInContext(code,context);
  run(fs.readFileSync(path.join(__dirname,'../web/app.js'),'utf8'));
  await new Promise(resolve=>setImmediate(resolve));
  return {run,elements,stored};
}
(async()=>{
  let p=await player();
  await p.run('play()');
  assert.equal(p.elements.audio.paused,false);
  const count=p.run('queue.length');
  for(let i=0;i<count;i++) p.elements.audio.emit('ended');
  assert.equal(p.run('state.part'),'annual','Monthly part must automatically start annual part');
  assert.equal(p.run('state.index'),0);
  assert.equal(p.elements.audio.paused,false);
  const annualCount=p.run('queue.length');
  for(let i=0;i<annualCount;i++) p.elements.audio.emit('ended');
  assert.equal(p.run('loaded'),false);
  assert.equal(p.elements.audio.paused,true,'Stop after annual reading');

  p=await player();
  p.run("state.repeat='chapter'; render(); play()");
  p.elements.audio.emit('ended');
  assert.equal(p.run('state.index'),0);
  assert.equal(p.run('state.part'),'daily');
  p.run("state.repeat='reading'; state.index=queue.length-1");
  p.elements.audio.emit('ended');
  assert.equal(p.run('state.index'),0);
  assert.equal(p.run('state.part'),'daily','Reading repeat must stay in the same part');

  const saved={mode:'progress',part:'daily',positions:{},start:Plan.dateKey(),day:30,index:2,seconds:12,repeat:'off',speed:1.25};
  p=await player(saved);
  await p.run('play()');
  p.elements.audio.emit('loadedmetadata');
  assert.equal(p.elements.audio.currentTime,12,'Restore saved audio position');
  assert.equal(p.elements.audio.playbackRate,1.25);
  assert.equal(p.run('queue[state.index].chapter'),3);
  p.run("switchPart('annual'); switchPart('daily')");
  assert.equal(p.run('state.seconds'),12,'Switching parts preserves position');
  p.run("state.index=queue.length-1; state.repeat='off'");
  p.elements.audio.emit('ended');
  assert.equal(p.run('state.positions.daily.day'),31,'Completed reading advances only that part');
  assert.equal(p.run('state.part'),'annual');

  p=await player();
  p.run("books.Genesis={}; state.index=queue.length-1");
  p.elements.audio.emit('ended');
  assert.equal(p.run('state.part'),'annual');
  assert.equal(p.elements.play.disabled,true,'Missing annual audio must stop instead of skipping');
  console.log('Player events: resume, repeat, independent progress, automatic part transition, and missing-audio stop passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
