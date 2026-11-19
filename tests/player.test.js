const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {IDBFactory}=require('fake-indexeddb');
const Library=require('../web/library.js');
const MP3=require('../web/mp3.js');
const OriginalPlan=require('../web/plan.js');
class Element {
  constructor(){this.events={};this.paused=true;this.readyState=1;this.currentTime=0;this.duration=60;this.value='';this.children=[];this.files=[];}
  addEventListener(name,fn){this.events[name]=fn;}
  async emit(name){if(name==='ended')this.paused=true;return this.events[name]?.();}
  setAttribute(name,value){this[name]=value;}
  removeAttribute(name){delete this[name];}
  append(...items){this.children.push(...items);}
  replaceChildren(...items){this.children=items;}
  load(){this.paused=true;this.currentTime=0;}
  pause(){if(!this.paused){this.paused=true;this.events.pause?.();}}
  play(){if(!this.src)return Promise.reject(Error('No audio source'));this.paused=false;this.events.play?.();return Promise.resolve();}
  click(){return this.onclick?.();}
}
async function player({factory=new IDBFactory(),config,progress,missing=[],mp3=false}={}){
  let today='2026-11-02';
  config ||= {version:1,title:'Test Bible',defaultTrack:'first',startDate:today,autoAdvanceTracks:true,tracks:[
    {id:'first',label:'First',type:'custom',advance:'completion',readings:[[{book:'John',chapter:1},{book:'John',chapter:2}],[{book:'John',chapter:3}]]},
    {id:'second',label:'Second',type:'custom',readings:[[{book:'John',chapter:4}],[{book:'John',chapter:5}]]}
  ]};
  const db=await Library.openDB(factory);
  await Library.put(db,'settings',config,'config');
  if(progress)await Library.put(db,'settings',progress,'progress');
  const frame=Buffer.alloc(208);
  frame.set([0xff,0xfa,0x50,0xc0]);
  const recording=mp3 ? new Blob(Array(100).fill(frame),{type:'audio/mpeg'}) : new Blob(['audio']);
  for(let c=1;c<=5;c++)if(!missing.includes(c))await Library.put(db,'audio',{id:`John/${c}`,book:'John',chapter:c,name:`John ${c}.mp3`,size:recording.size,blob:recording});
  db.close();
  const elements={},Plan={...OriginalPlan,dateKey:()=>today,calendarDay:(start,end=today)=>OriginalPlan.calendarDay(start,end)};
  const context=vm.createContext({MP3,Plan,Library:{...Library,openDB:()=>Library.openDB(factory)},console,URL:{createObjectURL:()=>`blob:${Math.random()}`,revokeObjectURL(){}},Blob,
    document:{getElementById:id=>elements[id] ||= new Element(),createElement:()=>new Element(),addEventListener(){}},
    window:{addEventListener(){}},navigator:{storage:{persisted:async()=>true,estimate:async()=>({usage:10,quota:1000})}},
    confirm:()=>true,setTimeout,clearTimeout,fetch:()=>{throw Error('Unexpected network request');}});
  const run=code=>vm.runInContext(code,context);
  await run(fs.readFileSync(require.resolve('../web/app.js'),'utf8'));
  return {run,elements,factory,setDay:value=>{today=value;},close:async()=>{await run('save()');run('db.close()');}};
}
(async()=>{
  let p=await player();
  await p.run('play()');assert.equal(p.elements.audio.paused,false);
  p.elements.audio.currentTime=17;await p.elements.audio.emit('timeupdate');await p.run('save()');
  const factory=p.factory;await p.close();
  p=await player({factory});
  await p.elements.audio.emit('loadedmetadata');assert.equal(p.elements.audio.currentTime,17,'Reopening restores chapter position');
  await p.run('play()');await p.elements.audio.emit('ended');assert.equal(p.run('position().index'),1);assert.equal(p.elements.audio.paused,false);
  await p.elements.audio.emit('ended');assert.equal(p.run('state.track'),'second');assert.equal(p.run('state.positions.first.day'),1);assert.equal(p.elements.audio.paused,false,'Auto-transition to next schedule');
  await p.elements.audio.emit('ended');assert.equal(p.elements.audio.paused,true,'Stop after final schedule');
  await p.close();
  p=await player();
  p.run("state.repeat='chapter';render()");await p.run('play()');await p.elements.audio.emit('ended');assert.equal(p.run('position().index'),0);
  p.run("state.repeat='reading';position().index=1");await p.elements.audio.emit('ended');assert.equal(p.run('position().index'),0);assert.equal(p.run('state.track'),'first');
  await p.run("switchTrack('second')");p.setDay('2026-11-03');await p.run('play()');assert.equal(p.run('queue[0].chapter'),5,'A new date selects the new daily reading');
  await p.close();
  p=await player({missing:[2,4]});
  assert.equal(p.elements.play.disabled,true);await p.run('choose(0,true)');assert.equal(p.elements.audio.paused,false,'An available chapter can play individually');
  await p.elements.audio.emit('ended');assert.equal(p.run('position().index'),1);assert.equal(p.elements.audio.paused,true,'A missing chapter stops playback instead of skipping');
  assert.match(p.elements.message.textContent,/not saved/);
  await p.close();
  p=await player({mp3:true});
  const audio=p.elements.audio, source=audio.src;
  const boundary=p.run('joined.chapters[1].start');
  await p.run('play()');
  audio.currentTime=boundary+0.25;
  await audio.emit('timeupdate');
  assert.equal(audio.src,source,'The next chapter continues on the same native source');
  assert.equal(p.run('position().index'),1);
  assert.equal(p.run('position().seconds'),0.25);
  await p.close();
  p=await player({mp3:true,factory:p.factory});
  await p.elements.audio.emit('loadedmetadata');
  assert.equal(p.elements.audio.currentTime,boundary+0.25,'Joined playback resumes at the chapter offset');
  await p.run('play()');
  await p.elements.audio.emit('error');
  await p.elements.audio.emit('loadedmetadata');
  assert.equal(p.elements.audio.currentTime,0.25,'A media error retries the current chapter from its saved position');
  assert.equal(p.elements.audio.paused,false);
  await p.elements.audio.emit('error');
  assert.equal(p.elements.audio.paused,true,'An unrecoverable error stops after one automatic retry');
  await p.close();
  p=await player({mp3:true});
  const joinedAudio=p.elements.audio;
  await p.run('play()');
  joinedAudio.currentTime=p.run('joined.duration');
  await joinedAudio.emit('ended');
  assert.equal(p.run('state.track'),'second','Completing a joined reading advances the schedule once');
  assert.equal(p.run('state.positions.first.day'),1);
  joinedAudio.pause();
  const pausedSource=joinedAudio.src;
  await joinedAudio.emit('error');
  assert.equal(joinedAudio.src,pausedSource,'A paused player does not restart on a media error');
  assert.equal(joinedAudio.paused,true);
  await p.close();
  console.log('Player: offline resume after reopening, chapter/track transitions, repeat, date rollover, missing audio, joined MP3 playback, and error recovery passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
