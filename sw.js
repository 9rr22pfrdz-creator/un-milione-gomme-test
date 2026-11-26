const V='umdg-v12';
const A=['./','index.html','style.css','manifest.webmanifest','js/main.js','js/config.js','js/braid.js','js/mountain.js','js/save.js','js/audio.js','js/gfx.js','js/workers.js','js/trolley-icon.js','js/yard.js','js/helpers.js','js/beltlogic.js','js/belts3d.js','js/arms.js','js/trucks.js','js/depot.js','js/contracts.js','js/fase5.js','js/pulley.js','js/shredder.js','js/fascioni3d.js','js/drones.js','js/spider.js','js/ending.js','vendor/three.module.js','icons/icon-180.png','icons/icon-192.png','icons/icon-512.png'];
// Network first, cache as fallback. Only old umdg- caches are dropped; localStorage (the save) is never touched.
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(A)));self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x.startsWith('umdg-')&&x!==V).map(x=>caches.delete(x)))));self.clients.claim();});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;e.respondWith(fetch(e.request).then(res=>{const c=res.clone();caches.open(V).then(x=>x.put(e.request,c));return res;}).catch(()=>caches.match(e.request,{ignoreSearch:true})));});
