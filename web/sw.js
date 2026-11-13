/* Bump this version when any shell asset changes. Audio lives separately in IndexedDB. */
const CACHE='daily-bible-shell-v3';
const ASSETS=['./','./index.html','./style.css','./plan.js','./library.js','./app.js','./config.json','./manifest.webmanifest','./icon.svg'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  for(const name of await caches.keys()) if(name.startsWith('daily-bible-shell-') && name!==CACHE) await caches.delete(name);
  await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET' || url.origin!==self.location.origin) return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    const cached=await cache.match(event.request,{ignoreSearch:true});
    if(cached) return cached;
    try{return await fetch(event.request);}catch(error){
      if(event.request.mode==='navigate') return cache.match('./index.html');
      throw error;
    }
  })());
});
