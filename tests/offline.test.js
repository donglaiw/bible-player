const assert=require('node:assert/strict');
const {IDBFactory}=require('fake-indexeddb');
const L=require('../web/library.js');
const Plan=require('../web/plan.js');
const config=require('../web/config.json');
const file=(name,text='audio',path='')=>{
  const blob=new Blob([text],{type:'audio/mpeg'});
  return {name,size:blob.size,type:blob.type,webkitRelativePath:path,slice:(...args)=>blob.slice(...args)};
};
(async()=>{
  L.validateConfig(config);
  assert.deepEqual(L.identify(file('B08___01_2CorinthiansENGESVN1DA.mp3'),config),{book:'2 Corinthians',chapter:1});
  assert.deepEqual(L.identify(file('A19___150_Psalms.mp3'),config),{book:'Psalms',chapter:150});
  assert.deepEqual(L.identify(file('001.mp3','x','My Bible/Psalms/001.mp3'),config),{book:'Psalms',chapter:1});
  assert.deepEqual(L.identify(file('2 Corinthians 1.mp3'),config),{book:'2 Corinthians',chapter:1});
  for(const name of ['B00___01_x.mp3','B28___01_x.mp3','A40___01_x.mp3','B08___14_x.mp3','001.mp3'])assert.equal(L.identify(file(name),config),null,name);
  const mapped={...config,recordings:[{book:'John',chapter:1,filename:'special.mp3'}]};
  assert.deepEqual(L.identify(file('special.mp3'),mapped),{book:'John',chapter:1});
  assert.throws(()=>L.validateConfig({...config,recordings:[{book:'John',chapter:99,filename:'x.mp3'}]}));
  assert.throws(()=>L.validateConfig({...config,startDate:'2026-02-30'}));
  assert.throws(()=>L.validateConfig({...config,tracks:[{...config.tracks[0],advance:'completion'}]}));
  assert.throws(()=>L.validateConfig({...config,tracks:[{id:'x',label:'x',type:'sequential',books:['John'],days:100}]}));
  for(const month of [0,1,3,10]){
    const count=new Date(2024,month+1,0).getDate();
    const readings=Array.from({length:count},(_,i)=>L.reading(config.tracks[0],i,new Date(2024,month,i+1))).flat();
    assert.equal(readings.length,181);assert.equal(new Set(readings.map(c=>L.key(c.book,c.chapter))).size,181);
  }
  const annual=Array.from({length:365},(_,d)=>L.reading(config.tracks[1],d)).flat();
  assert.equal(annual.length,1189); assert.equal(new Set(annual.map(c=>L.key(c.book,c.chapter))).size,1189);
  assert.deepEqual(L.reading({type:'custom',readings:[[{book:'John',chapter:3}],[{book:'John',chapter:4}]]},3),[{book:'John',chapter:4}]);
  const factory=new IDBFactory();let db=await L.openDB(factory);
  let result=await L.importFiles(db,[file('John 1.mp3','first'),file('John 1.m4a','conflicting'),file('John 2.mp3','second'),file('mystery.mp3')],config);
  assert.equal(result.added,1);assert.equal(result.skipped.length,2);assert.equal(await L.get(db,'audio','John/1'),undefined);
  result=await L.importFiles(db,[file('John 2.mp3','replacement'),file('John 3.mp3','third')],config);
  assert.equal(result.added,1);assert.equal(result.existing,1);
  await L.put(db,'settings',{track:'daily',positions:{daily:{day:4,index:2,seconds:17}}},'progress');
  db.close();db=await L.openDB(factory);
  assert.equal(await (await L.get(db,'audio','John/2')).blob.text(),'second','Retry must not overwrite a saved chapter');
  assert.equal((await L.get(db,'settings','progress')).positions.daily.seconds,17);
  const rows=await L.list(db);assert.equal(rows.length,2);assert.equal(rows[0].blob,undefined,'Library metadata must not retain all audio blobs');
  db.close();
  console.log('Offline library: filename mapping, config validation, calendar coverage, duplicate safety, and audio/progress reopening passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
