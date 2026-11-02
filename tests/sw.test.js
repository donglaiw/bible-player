const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
(async()=>{
  const handlers={},store=new Map(),deleted=[];
  const cache={addAll:async assets=>{for(const asset of assets){const name=asset==='./'?'index.html':asset.slice(2);assert.ok(fs.existsSync(path.join(__dirname,'../web',name)),name);store.set(new URL(asset,'https://example.com/bible/').href,{asset});}},match:async request=>store.get(new URL(typeof request==='string'?request:request.url,'https://example.com/bible/').href.split('?')[0])};
  const context=vm.createContext({URL,self:{location:{origin:'https://example.com'},clients:{claim:async()=>{}},addEventListener:(name,fn)=>handlers[name]=fn},caches:{open:async()=>cache,keys:async()=>['unrelated','daily-bible-shell-old'],delete:async name=>deleted.push(name)},fetch:async()=>{throw Error('Network offline');}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../web/sw.js'),'utf8'),context);
  let pending;handlers.install({waitUntil:p=>pending=p});await pending;
  handlers.activate({waitUntil:p=>pending=p});await pending;assert.deepEqual(deleted,['daily-bible-shell-old']);
  for(const asset of ['index.html','app.js','library.js','config.json','style.css']){
    handlers.fetch({request:{method:'GET',url:'https://example.com/bible/'+asset},respondWith:p=>pending=p});
    assert.ok(await pending,`${asset} available with network disabled`);
  }
  handlers.fetch({request:{method:'GET',url:'https://example.com/bible/another',mode:'navigate'},respondWith:p=>pending=p});assert.equal((await pending).asset,'./index.html');
  console.log('Service worker: all shell assets exist and load without network, navigation fallback, and scoped cache cleanup passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
