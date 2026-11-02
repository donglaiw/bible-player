/* Browser-only player. Audio and settings stay in IndexedDB on this device. */
const $ = id => document.getElementById(id);
const audio = $('audio');
let db, config, state, records = new Map(), queue = [];
let urls = new Map(), pending = new Map(), generation = 0, loadedKey = '', resumeAt = 0, lastSave = 0;
let saving = Promise.resolve(), currentLoad = null;
const freshState = () => ({track:config.defaultTrack || config.tracks[0].id,start:config.startDate || Plan.dateKey(),positions:{},speed:1,repeat:'off'});
const track = () => config.tracks.find(t=>t.id===state.track);
const position = () => state.positions[state.track] ||= {day:0,index:0,seconds:0,date:Plan.dateKey()};
function report(error) { $('message').textContent = error.message || String(error); }
function save() {
  if (!db || !state) return Promise.resolve();
  const snapshot=JSON.parse(JSON.stringify(state));
  saving=saving.then(()=>Library.put(db,'settings',snapshot,'progress')).catch(()=>report(Error('Your position could not be saved. Check available phone storage.')));
  return saving;
}
function unload() {
  generation++; currentLoad=null; audio.pause(); loadedKey=''; audio.removeAttribute('src'); audio.load();
  for(const url of urls.values()) URL.revokeObjectURL(url);
  urls.clear(); pending.clear();
}
function syncCalendar() {
  const t=track(), p=position(), today=Plan.dateKey();
  if(t.advance!=='completion' || t.type==='monthly') {
    const day=Plan.calendarDay(state.start,today);
    if(p.date!==today || p.day!==day) {
      unload(); Object.assign(p,{day,index:0,seconds:0,date:today}); save();
    }
  }
}
function render() {
  const t=track(), p=position();
  queue=Library.reading(t,p.day);
  if(p.index>=queue.length) { p.index=0; p.seconds=0; loadedKey=''; }
  $('appTitle').textContent=config.title;
  document.title=`${config.title} · Offline`;
  $('tracks').replaceChildren(...config.tracks.map(t=>{
    const button=document.createElement('button'); button.textContent=t.label;
    button.setAttribute('aria-pressed',String(t.id===state.track));
    button.onclick=()=>switchTrack(t.id); return button;
  }));
  $('dayLabel').textContent=t.type==='monthly' ? `MONTHLY READING · ${Plan.dateKey()}` : `READING ${t.type==='sequential'?p.day%t.days+1:p.day+1}`;
  const groups=[];
  for(const c of queue) {
    const last=groups.at(-1);
    if(last && last.book===c.book && c.chapter===last.end+1) last.end=c.chapter;
    else groups.push({book:c.book,start:c.chapter,end:c.chapter});
  }
  $('readingTitle').textContent=groups.map(g=>`${g.book} ${g.start}${g.end===g.start?'':'–'+g.end}`).join(' · ') || 'No chapters scheduled today';
  $('planNote').textContent=t.type==='monthly' ? 'Every selected book each month. Daily portions adjust to the month’s length.' : t.advance==='completion' ? 'Your next reading waits until you finish this one.' : 'Today’s portion, selected from your plan start date.';
  $('queue').replaceChildren(...queue.map((c,index)=>{
    const li=document.createElement('li'), button=document.createElement('button'), name=document.createElement('span'), status=document.createElement('small');
    name.textContent=`${c.book} ${c.chapter}`;
    const exists=records.has(Library.key(c.book,c.chapter));
    status.textContent=exists ? (index===p.index?'Selected':'Saved offline') : 'Import audio';
    button.disabled=!exists; button.append(name,status);
    button.onclick=()=>choose(index,true);
    li.className=index===p.index?'current':''; li.append(button); return li;
  }));
  const missing=queue.filter(c=>!records.has(Library.key(c.book,c.chapter)));
  $('play').disabled=!queue.length || missing.length>0;
  $('previous').disabled=p.index===0 || !queue.length;
  $('next').disabled=p.index>=queue.length-1;
  const current=queue[p.index];
  $('now').textContent=current ? `${current.book} ${current.chapter}` : 'Ready when you are.';
  $('message').textContent=missing.length ? `${missing.length} recording${missing.length===1?'':'s'} needed. Import them below. Available chapters can be played individually.` : '';
  $('play').textContent=audio.paused ? 'Play my reading' : 'Pause reading';
  $('repeat').value=state.repeat; $('speed').value=String(state.speed); $('start').value=state.start;
  audio.playbackRate=state.speed; audio.loop=state.repeat==='chapter';
}
async function urlFor(item, token=generation) {
  const id=Library.key(item.book,item.chapter);
  if(urls.has(id)) return urls.get(id);
  if(!pending.has(id)) {
    const promise=(async()=>{
      const record=await Library.get(db,'audio',id);
      if(!record?.blob) throw Error(`${item.book} ${item.chapter} is not saved. Import it to continue.`);
      if(token!==generation) return null;
      const url=URL.createObjectURL(record.blob); urls.set(id,url); return url;
    })();
    pending.set(id,promise);
  }
  const promise=pending.get(id);
  try{return await promise;}finally{if(pending.get(id)===promise) pending.delete(id);}
}
function releaseOldURLs() {
  const p=position(), keep=new Set(queue.slice(p.index,p.index+2).map(c=>Library.key(c.book,c.chapter)));
  for(const [id,url] of urls) if(!keep.has(id)){URL.revokeObjectURL(url); urls.delete(id);}
}
function loadCurrent() {
  if(currentLoad && currentLoad.token===generation) return currentLoad.promise;
  const token=generation, promise=loadCurrentOnce();
  currentLoad={token,promise};
  promise.finally(()=>{if(currentLoad?.promise===promise)currentLoad=null;}).catch(()=>{});
  return promise;
}
async function loadCurrentOnce() {
  const item=queue[position().index]; if(!item) return false;
  const id=Library.key(item.book,item.chapter);
  if(loadedKey===id) return true;
  const token=generation, url=await urlFor(item,token);
  if(!url || token!==generation) return false;
  resumeAt=position().seconds;
  audio.src=url; audio.load(); loadedKey=id;
  if('mediaSession' in navigator && typeof MediaMetadata!=='undefined') navigator.mediaSession.metadata=new MediaMetadata({title:`${item.book} ${item.chapter}`,artist:config.edition || config.title,album:track().label});
  releaseOldURLs();
  const next=queue[position().index+1];
  if(next && records.has(Library.key(next.book,next.chapter))) urlFor(next,token).catch(()=>{});
  return true;
}
async function play() {
  try {
    syncCalendar(); render();
    if(!loadedKey && !await loadCurrent()) return;
    await audio.play();
  } catch(error) { report(Error(`Playback paused. Tap the audio player’s Play button to continue. ${error.message}`)); }
}
async function choose(index, start=false) {
  audio.pause(); generation++; pending.clear(); currentLoad=null; loadedKey='';
  Object.assign(position(),{index,seconds:0}); save(); render();
  try { if(start) await play(); else await loadCurrent(); } catch(error){report(error);}
}
async function switchTrack(id) {
  if(id===state.track) return;
  unload(); state.track=id; syncCalendar(); save(); render();
  try{await loadCurrent();}catch(error){report(error);}
}
async function refreshLibrary(collapse=false) {
  const list=await Library.list(db); records=new Map(list.map(r=>[r.id,r]));
  const bytes=list.reduce((n,r)=>n+r.size,0);
  $('libraryStatus').textContent=`${list.length} chapters saved offline · ${(bytes/1024/1024).toFixed(1)} MB`;
  if(collapse && list.length) $('libraryPanel').open=false;
  await storageStatus(); render();
  const item=queue[position().index];
  if(item && records.has(Library.key(item.book,item.chapter))) await loadCurrent();
}
async function storageStatus() {
  const estimate=await navigator.storage?.estimate?.();
  const persistent=await navigator.storage?.persisted?.();
  $('storageStatus').textContent=`${persistent?'Persistent storage granted.':'Storage is managed by your browser.'}${estimate?.quota ? ` Site usage: ${((estimate.usage || 0)/1024/1024).toFixed(1)} MB of approximately ${(estimate.quota/1024/1024).toFixed(0)} MB allowed.`:''}`;
}
async function importRecordings(files) {
  if(!db || !files.length) return;
  $('files').disabled=$('folder').disabled=$('configFile').disabled=true;
  $('importProgress').hidden=false;
  $('importDetails').textContent='';
  $('importStatus').textContent='Importing locally. Keep this app open until finished.';
  try {
    const result=await Library.importFiles(db,files,config,p=>{
      $('importProgress').max=Math.max(1,p.total); $('importProgress').value=p.processed;
      $('importStatus').textContent=`${p.processed}/${p.total} checked · ${p.added} saved · ${p.existing} already present`;
    });
    $('importStatus').textContent=`${result.added} recordings saved. ${result.existing} already present. ${result.skipped.length} import notices.`;
    $('importDetails').textContent=result.skipped.join('\n') || 'All selected recordings were recognized.';
    await navigator.storage?.persist?.();
  } catch(error) {
    $('importStatus').textContent=`Import stopped: ${error.message}. ${error.imported || 0} new recordings saved before stopping. Free space if needed, then select the files again; saved chapters will be skipped.`;
  } finally {
    $('files').disabled=$('folder').disabled=$('configFile').disabled=false;
    $('files').value=$('folder').value=''; $('importProgress').hidden=true;
    try{await refreshLibrary();}catch(error){report(error);}
  }
}
async function setupOffline() {
  if(!('serviceWorker' in navigator) || !window.isSecureContext) {
    $('offlineStatus').textContent='Offline installation needs HTTPS (or localhost on the Mac). A file opened directly from Files cannot install this app.'; return;
  }
  try {
    await navigator.serviceWorker.register('./sw.js');
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error('Offline setup timed out')),15000);
      navigator.serviceWorker.ready.then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});
    });
    $('offlineStatus').textContent='App saved for offline use. Add to Home Screen in Safari, then open that icon and import recordings there.';
  } catch(error){$('offlineStatus').textContent=`Offline app setup failed: ${error.message}. Keep the connection open and reload to retry.`;}
}
audio.addEventListener('loadedmetadata',()=>{
  if(resumeAt && Number.isFinite(audio.duration)) audio.currentTime=Math.min(resumeAt,Math.max(0,audio.duration-0.25));
  resumeAt=0; audio.playbackRate=state.speed;
});
audio.addEventListener('timeupdate',()=>{
  if(!loadedKey) return;
  position().seconds=audio.currentTime || 0;
  if(Date.now()-lastSave>2000){save();lastSave=Date.now();}
});
audio.addEventListener('play',()=>{$('play').textContent='Pause reading'; if('mediaSession' in navigator) navigator.mediaSession.playbackState='playing';});
audio.addEventListener('pause',()=>{
  $('play').textContent='Resume reading';
  if(state && loadedKey) position().seconds=audio.currentTime || 0;
  save(); if('mediaSession' in navigator) navigator.mediaSession.playbackState='paused';
});
audio.addEventListener('error',()=>{loadedKey=''; report(Error('This recording could not be played. Check its format in Files, then try Play again.'));});
audio.addEventListener('ended',async()=>{
  try {
    const p=position();
    if(state.repeat==='chapter'){audio.currentTime=0; await play();return;}
    if(p.index<queue.length-1){await choose(p.index+1,true);return;}
    if(state.repeat==='reading'){await choose(0,true);return;}
    if(track().advance==='completion' && track().type!=='monthly') p.day++;
    p.index=0;p.seconds=0;
    const next=config.tracks[config.tracks.findIndex(t=>t.id===state.track)+1];
    unload(); await save(); render();
    if(config.autoAdvanceTracks && next){await switchTrack(next.id); if(!$('play').disabled) await play();}
    else $('message').textContent='Reading complete. Ready whenever you are.';
  } catch(error){report(error);}
});
$('play').onclick=()=>audio.paused?play():audio.pause();
$('previous').onclick=()=>{if(position().index>0) choose(position().index-1,true);};
$('next').onclick=()=>{if(position().index<queue.length-1) choose(position().index+1,true);};
$('speed').onchange=()=>{state.speed=Number($('speed').value); audio.playbackRate=state.speed;save();};
$('repeat').onchange=()=>{state.repeat=$('repeat').value; audio.loop=state.repeat==='chapter';save();};
$('files').onchange=()=>importRecordings(Array.from($('files').files));
$('folder').onchange=()=>importRecordings(Array.from($('folder').files));
$('persist').onclick=async()=>{
  try {const granted=await navigator.storage?.persist?.(); await storageStatus(); if(!granted) $('storageStatus').textContent+=' Keep the originals; persistent storage was not granted.';}
  catch(error){report(error);}
};
$('applyStart').onclick=async()=>{
  const start=$('start').value;
  if(!start || start>Plan.dateKey()){ $('configStatus').textContent='Choose today or an earlier date.';return;}
  unload(); state.start=start; state.positions={}; syncCalendar(); await save();render();
  $('configStatus').textContent='Start date saved. Reading positions reset.';
};
$('exportConfig').onclick=()=>{
  const url=URL.createObjectURL(new Blob([JSON.stringify({...config,startDate:state.start},null,2)],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download='bible-config.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
};
$('configFile').onchange=async()=>{
  try {
    const file=$('configFile').files[0];if(!file)return;
    if(file.size>2*1024*1024)throw Error('Config must be smaller than 2 MB.');
    const next=Library.validateConfig(JSON.parse(await file.text()));
    if(!confirm('Use this config and reset reading positions? Your recordings stay saved.'))return;
    await saving;
    await Library.put(db,'settings',next,'config');
    unload();config=next;state=freshState();syncCalendar();await save();render();
    $('configStatus').textContent='Config saved. Recordings remain on this phone.';
  }catch(error){$('configStatus').textContent=`Config not imported: ${error.message}`;}
  finally{$('configFile').value='';}
};
window.addEventListener('pagehide',save);
document.addEventListener('visibilitychange',()=>{
  if(!state)return;
  if(document.hidden)save();
  else if(audio.paused){syncCalendar();render();}
});
if('mediaSession' in navigator) for(const [action,handler] of Object.entries({play,pause:()=>audio.pause(),previoustrack:()=>$('previous').click(),nexttrack:()=>$('next').click(),seekbackward:()=>{audio.currentTime=Math.max(0,audio.currentTime-15);},seekforward:()=>{if(Number.isFinite(audio.duration))audio.currentTime=Math.min(audio.duration,audio.currentTime+15);}})) {
  try{navigator.mediaSession.setActionHandler(action,handler);}catch(_){}
}
async function init() {
  try {
    db=await Library.openDB();
    const savedConfig=await Library.get(db,'settings','config');
    config=Library.validateConfig(savedConfig || await (await fetch('./config.json')).json());
    state=freshState();
    const saved=await Library.get(db,'settings','progress');
    if(saved && config.tracks.some(t=>t.id===saved.track) && /^\d{4}-\d{2}-\d{2}$/.test(saved.start) && Number.isFinite(Date.parse(saved.start))) {
      state={...state,...saved,positions:{}};
      for(const t of config.tracks){
        const p=saved.positions?.[t.id];
        if(p && Number.isInteger(p.day) && p.day>=0 && Number.isInteger(p.index) && p.index>=0 && Number.isFinite(p.seconds) && p.seconds>=0) state.positions[t.id]=p;
      }
    }
    if(![0.75,1,1.25,1.5].includes(state.speed))state.speed=1;
    if(!['off','chapter','reading'].includes(state.repeat))state.repeat='off';
    syncCalendar(); await save(); await refreshLibrary(true);
    await setupOffline();
    // Prepare the current and following chapters before the user taps Play.
    if(queue[position().index] && records.has(Library.key(queue[position().index].book,queue[position().index].chapter))) await loadCurrent();
  }catch(error){report(error);$('offlineStatus').textContent='Setup incomplete. Open the app in a normal Safari window and retry.';}
}
init();
