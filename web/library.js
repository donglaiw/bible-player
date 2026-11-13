/* Local recordings and declarative schedules. No audio leaves this device. */
(function (root) {
  const Plan = root.Plan || require('./plan.js');
  const key = (book, chapter) => `${book}/${chapter}`;
  const validChapter = (book, chapter) => Plan.canon.some(([name, count]) => name === book && Number.isInteger(chapter) && chapter >= 1 && chapter <= count);
  function validateConfig(value) {
    if (!value || value.version !== 1 || !Array.isArray(value.tracks) || !value.tracks.length || value.tracks.length > 20) throw Error('Config needs version 1 and one to twenty tracks.');
    if (typeof value.title !== 'string' || !value.title.trim() || value.title.length > 100) throw Error('Config needs a title of at most 100 characters.');
    if (value.startDate != null && (!/^\d{4}-\d{2}-\d{2}$/.test(value.startDate) || !Number.isFinite(Date.parse(value.startDate)) || new Date(value.startDate + 'T00:00:00Z').toISOString().slice(0,10) !== value.startDate)) throw Error('Invalid config startDate.');
    const ids = new Set();
    for (const track of value.tracks) {
      if (!/^[a-z][a-z0-9-]{0,39}$/.test(track.id) || ids.has(track.id) || typeof track.label !== 'string' || !track.label.trim() || track.label.length > 100) throw Error('Tracks need unique IDs and labels.');
      ids.add(track.id);
      if(track.advance!=null && !['calendar','completion'].includes(track.advance)) throw Error('Unknown advance mode.');
      if(track.type==='monthly' && track.advance==='completion') throw Error('Monthly schedules must follow the calendar. Use cycle for completion-based readings.');
      if (!['monthly','sequential','cycle','custom'].includes(track.type)) throw Error('Unknown schedule type.');
      if (track.type === 'custom') {
        if (!Array.isArray(track.readings) || !track.readings.length || track.readings.some(r => !Array.isArray(r) || !r.length || r.length > 200 || r.some(c => !validChapter(c.book,c.chapter)))) throw Error('Custom readings need valid book/chapter entries.');
      } else {
        if (!Array.isArray(track.books) || !track.books.length || new Set(track.books).size !== track.books.length || track.books.some(book => !Plan.canon.some(([name]) => name === book))) throw Error('Unknown or duplicate schedule book.');
        if (track.type === 'sequential' && (!Number.isInteger(track.days) || track.days < 1 || track.days > track.books.reduce((n,book) => n + Plan.canon.find(([name]) => name===book)[1],0))) throw Error('Sequential schedule days must fit the selected chapters.');
        if (track.type === 'cycle' && (!Number.isInteger(track.chaptersPerBook) || track.chaptersPerBook < 1 || track.chaptersPerBook > 150)) throw Error('Cycle needs chaptersPerBook between 1 and 150.');
      }
    }
    if(value.autoAdvanceTracks!=null && typeof value.autoAdvanceTracks!=='boolean') throw Error('autoAdvanceTracks must be true or false.');
    if(value.edition!=null && (typeof value.edition!=='string' || value.edition.length>100)) throw Error('Invalid edition label.');
    if (value.defaultTrack && !ids.has(value.defaultTrack)) throw Error('Unknown defaultTrack.');
    const filenames = new Set(), chapters = new Set();
    if (value.recordings != null && !Array.isArray(value.recordings)) throw Error('recordings must be an array.');
    for (const entry of value.recordings || []) {
      if (!validChapter(entry.book,entry.chapter) || typeof entry.filename !== 'string' || !entry.filename.trim() || entry.filename.startsWith('/') || entry.filename.includes('://') || entry.filename.split('/').includes('..')) throw Error('Recordings need valid chapters and relative filenames.');
      if (filenames.has(entry.filename) || chapters.has(key(entry.book,entry.chapter))) throw Error('Duplicate recording mapping.');
      filenames.add(entry.filename); chapters.add(key(entry.book,entry.chapter));
    }
    return JSON.parse(JSON.stringify(value));
  }
  function reading(track, day, date = new Date()) {
    if (!Number.isInteger(day) || day < 0) throw Error('Invalid reading day.');
    if (track.type === 'custom') return track.readings[day % track.readings.length];
    const count = book => Plan.canon.find(([name]) => name===book)[1];
    if (track.type === 'monthly') {
      const days = new Date(date.getFullYear(), date.getMonth()+1,0).getDate(), d = date.getDate()-1;
      return track.books.flatMap(book => {
        const first = Math.floor(d*count(book)/days), end = Math.floor((d+1)*count(book)/days);
        return Array.from({length:end-first},(_,i) => ({book,chapter:first+i+1}));
      });
    }
    if (track.type === 'cycle') return track.books.flatMap(book => Array.from({length:track.chaptersPerBook},(_,i) => ({book,chapter:(day*track.chaptersPerBook+i)%count(book)+1})));
    const all = track.books.flatMap(book => Array.from({length:count(book)},(_,i) => ({book,chapter:i+1})));
    const index = day % track.days;
    return all.slice(Math.floor(index*all.length/track.days),Math.floor((index+1)*all.length/track.days));
  }
  function identify(file, config) {
    const path = file.webkitRelativePath || file.name;
    const explicit = (config.recordings || []).filter(entry => path === entry.filename || path.endsWith('/'+entry.filename));
    if (explicit.length === 1) return {book:explicit[0].book,chapter:explicit[0].chapter};
    if (explicit.length > 1) return null;
    // Faith Comes By Hearing filenames: A = OT, B = NT, then book and chapter.
    const numbered = /^([AB])(\d{2})_+(\d{1,3})_/i.exec(file.name);
    if (numbered) {
      const number=Number(numbered[2]);
      if(number<1 || number>(numbered[1].toUpperCase()==='B'?27:39)) return null;
      const index = number-1 + (numbered[1].toUpperCase()==='B' ? 39 : 0);
      if (index < 0 || index >= (numbered[1].toUpperCase()==='B' ? 66 : 39)) return null;
      const book = Plan.canon[index][0], chapter = Number(numbered[3]);
      return validChapter(book,chapter) ? {book,chapter} : null;
    }
    const stem = file.name.replace(/\.(mp3|m4a|wav|aac|ogg)$/i,'');
    const folder = path.split('/').at(-2);
    if (/^\d+$/.test(stem) && validChapter(folder,Number(stem))) return {book:folder,chapter:Number(stem)};
    const named = /^(.*?)\s+0*(\d+)$/.exec(stem.replace(/_/g,' '));
    if (named) {
      const book = Plan.canon.find(([name]) => name.toLowerCase()===named[1].trim().toLowerCase())?.[0];
      if (validChapter(book,Number(named[2]))) return {book,chapter:Number(named[2])};
    }
    return null;
  }
  function openDB(factory = root.indexedDB) {
    return new Promise((resolve,reject) => {
      if (!factory) return reject(Error('Offline storage is unavailable. Use a normal browser window.'));
      const request = factory.open('daily-bible-offline-v1',1);
      request.onupgradeneeded = () => {
        const db = request.result;
        const files = db.createObjectStore('audio',{keyPath:'id'});
        files.createIndex('metadata','id');
        db.createObjectStore('settings');
      };
      request.onsuccess = () => { const db=request.result; db.onversionchange=()=>db.close(); resolve(db); };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(Error('Close other player tabs and retry.'));
    });
  }
  function transaction(db, store, mode, action) {
    return new Promise((resolve,reject) => {
      const tx = db.transaction(store,mode); let result;
      try { const request=action(tx.objectStore(store)); request.onsuccess=()=>{result=request.result;}; }
      catch(error) { tx.abort(); reject(error); return; }
      tx.oncomplete=()=>resolve(result);
      tx.onabort=()=>reject(tx.error || Error('Storage transaction was interrupted.'));
      tx.onerror=()=>{};
    });
  }
  const get = (db,store,id) => transaction(db,store,'readonly',s=>s.get(id));
  const put = (db,store,value,id) => transaction(db,store,'readwrite',s=>id===undefined ? s.put(value) : s.put(value,id));
  async function list(db) {
    // Read metadata with a cursor so the whole audio library is never retained in memory.
    return new Promise((resolve,reject) => {
      const tx=db.transaction('audio'), result=[];
      const request=tx.objectStore('audio').openCursor();
      request.onsuccess=()=>{const cursor=request.result; if(cursor){const {id,book,chapter,name,size,type}=cursor.value; result.push({id,book,chapter,name,size,type}); cursor.continue();}};
      tx.oncomplete=()=>resolve(result); tx.onabort=()=>reject(tx.error); tx.onerror=()=>{};
    });
  }
  async function importFiles(db, files, config, progress = ()=>{}) {
    const candidates=new Map(), skipped=[];
    for (const file of files) {
      if (!/\.(mp3|m4a|wav|aac|ogg)$/i.test(file.name) || !file.size) { skipped.push(`${file.name}: not a nonempty audio file`); continue; }
      const chapter=identify(file,config);
      if (!chapter) { skipped.push(`${file.name}: no chapter mapping`); continue; }
      const id=key(chapter.book,chapter.chapter);
      if (candidates.has(id)) { candidates.set(id,null); skipped.push(`${id}: multiple selected recordings; none imported`); }
      else candidates.set(id,{file,...chapter});
    }
    let added=0, existing=0, processed=0;
    for (const [id,item] of candidates) {
      if (item) {
        const saved=await get(db,'audio',id);
        // A saved copy shorter than its source was cut off during an earlier import; replace it.
        if (saved && saved.blob && saved.blob.size===saved.size) existing++;
        else {
          const {file,book,chapter}=item;
          const type=file.type || (/\.mp3$/i.test(file.name)?'audio/mpeg':/\.m4a$/i.test(file.name)?'audio/mp4':'');
          // Copy every byte now. iOS can hand back lazily loaded Files whose later bytes never arrive.
          let data;
          try { data=await file.slice(0,file.size,type).arrayBuffer(); } catch(error) { data=null; }
          if (!data || data.byteLength!==file.size) { skipped.push(`${file.name}: could not read the whole file (download it in Files, then import again)`); progress({added,existing,processed:++processed,total:candidates.size}); continue; }
          try { await put(db,'audio',{id,book,chapter,name:file.name,size:file.size,type,blob:new Blob([data],{type})}); added++; }
          catch(error) { error.imported=added; throw error; }
        }
      }
      progress({added,existing,processed:++processed,total:candidates.size});
    }
    return {added,existing,skipped};
  }
  const api={key,validChapter,validateConfig,reading,identify,openDB,get,put,list,importFiles};
  if(typeof module!=='undefined') module.exports=api;
  root.Library=api;
})(globalThis);
