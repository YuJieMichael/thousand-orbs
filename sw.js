// 千珠落尽 · 离线缓存
// 网页优先联网拿最新版（3 秒拿不到就用缓存），断网也能玩；排行榜等跨站请求不经过这里
const CACHE='thousand-orbs-v1';
self.addEventListener('install',e=>{ self.skipWaiting(); });
self.addEventListener('activate',e=>{ e.waitUntil((async()=>{ for(const k of await caches.keys()) if(k!==CACHE) await caches.delete(k); await self.clients.claim(); })()); });
self.addEventListener('fetch',e=>{
  const r=e.request; if(r.method!=='GET') return;
  const u=new URL(r.url); if(u.origin!==location.origin) return;
  e.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    const net=fetch(r).then(res=>{ if(res&&res.ok&&res.type==='basic') cache.put(r,res.clone()); return res; });
    const timeout=new Promise(ok=>setTimeout(ok,3000));
    try{ const res=await Promise.race([net,timeout.then(()=>null)]); if(res) return res; }catch(err){}
    const hit=await cache.match(r,{ignoreSearch:true}); if(hit) return hit;
    return net;
  })());
});
