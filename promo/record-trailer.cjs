// 用假时钟逐帧推进游戏并截图，30fps，输出每个场景一个 mp4
const {chromium}=require('playwright'); const {spawn}=require('child_process'); const fs=require('fs');
const OUT=process.argv[3]||__dirname, FPS=30, ONLY=process.argv[2]||'';
const INIT=`(()=>{ let T=0; const cbs=[]; window.requestAnimationFrame=cb=>{cbs.push(cb);return cbs.length;}; window.cancelAnimationFrame=()=>{};
  performance.now=()=>T; window.__step=()=>{ T+=1000/${FPS}; if(window.__tick) try{window.__tick()}catch(e){}; const l=cbs.splice(0); for(const cb of l){ try{cb(T);}catch(e){ console.error(e); } } };
  try{ localStorage.setItem('thousand-orbs-lang','zh'); }catch(e){} })();`;
async function scene(page,name,frames,perFrame){ if(ONLY&&!name.startsWith(ONLY)) return; const tmp=`${OUT}/${name}.tmp.mp4`;
  const ff=spawn('ffmpeg',['-y','-loglevel','error','-f','image2pipe','-c:v','mjpeg','-framerate',String(FPS),'-i','-','-vf','scale=1080:1920,format=yuv420p','-c:v','libx264','-crf','18','-preset','veryfast','-r',String(FPS),tmp]);
  for(let i=0;i<frames;i++){ if(perFrame) await perFrame(i); await page.evaluate(()=>window.__step()); const buf=await page.screenshot({type:'jpeg',quality:92}); if(!ff.stdin.write(buf)) await new Promise(r=>ff.stdin.once('drain',r)); }
  ff.stdin.end(); await new Promise((res,rej)=>ff.on('exit',c=>c===0?res():rej(new Error('ffmpeg '+c)))); fs.renameSync(tmp,`${OUT}/${name}.mp4`); console.log('done',name,frames); }
const cap=(page,t,sub,top,tag)=>page.evaluate(([t,sub,top,tag])=>{ let d=document.getElementById('cap'); if(!d){ d=document.createElement('div'); d.id='cap'; d.style.cssText='position:fixed;left:0;right:0;z-index:999;text-align:center;pointer-events:none;padding:0 12px'; document.body.appendChild(d);
   const st=document.createElement('style'); st.textContent=`#cap .cw{display:inline-block;position:relative;padding:12px 20px 12px;border-radius:16px;background:linear-gradient(180deg,#1c140bf2,#0d0906f2);box-shadow:0 0 0 1px #d9b45a55,0 0 0 4px #00000066,0 10px 34px #000c}
   #cap .cw::before{content:'';position:absolute;left:18px;right:18px;top:0;height:2px;background:linear-gradient(90deg,transparent,#ffe08a,transparent)}
   #cap .tg{display:inline-block;font:800 11px/1 sans-serif;letter-spacing:3px;color:#1b1206;background:linear-gradient(180deg,#ffe7a3,#d9b45a);border-radius:999px;padding:5px 10px 4px;margin-bottom:8px}
   #cap .tt{font:900 27px/1.25 'Noto Serif CJK SC',serif;letter-spacing:2px;background:linear-gradient(180deg,#fff4c9,#ffd76a 45%,#d9a43a);-webkit-background-clip:text;color:transparent;filter:drop-shadow(0 2px 0 #3a2508)}
   #cap .sb{font:600 13.5px/1.5 sans-serif;color:#f1e2b8;margin-top:6px;opacity:.92}`; document.head.appendChild(st); }
  d.style.top=top||'68%';
  d.innerHTML=t?`<div class="cw">${tag?`<div class="tg">${tag}</div>`:''}<div class="tt">${t}</div>${sub?`<div class="sb">${sub}</div>`:''}</div>`:'';
  const w=d.firstElementChild; if(!w) return; let f=0; const prev=window.__tick; window.__tick=()=>{ f++; const k=Math.min(1,f/9), e=1-Math.pow(1-k,3); w.style.opacity=e; w.style.transform=`translateY(${(1-e)*18}px) scale(${.94+.06*e})`; const sb=w.querySelector('.sb'); if(sb){ const k2=Math.max(0,Math.min(1,(f-6)/9)); sb.style.opacity=k2*.92; } }; w.style.opacity=0; },[t,sub||'',top||'',tag||'']);
(async()=>{ const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:360,height:640},deviceScaleFactor:3,isMobile:true,hasTouch:true});
 await ctx.addInitScript(INIT); let page=await ctx.newPage(); page.on('pageerror',e=>console.log('ERR',e.message)); page.on('console',m=>{ if(m.type()==='error') console.log('CONSOLE',m.text()); });
 const URL='file:///home/claude/thousand-orbs/index.html?dev=1';
 const aimFire=(every)=>async i=>{ await page.evaluate(([i,every])=>{ if(!G||!G.packs||G.ended) return; if(G.paused){ const x=document.querySelector('#exOk:not([disabled])')||document.querySelector('#boonPop .bc:not([disabled])'); if(x&&i%6===0) x.click(); return; }
   G.boonNext=0;
   G.aim={x:W/2+Math.sin(i/22)*W*.36,y:H*.55,t:performance.now()}; if(i%every===0){ G.cool=0; fire(); } },[i,every]); };
 // ---- 场景 1：后期满屏爆金币 ----
 await page.goto(URL); for(let i=0;i<20;i++) await page.evaluate(()=>window.__step());
 await page.evaluate(()=>{ CARDS.forEach(c=>M.owned[c.id]=c.rar==='UR'?30:200); M.deck=['chain','thor','split','mirror','orbit','rain','echo','sing']; M.keep={slot:5,ammo:6,volley:3,packs:4}; M.round=40; M.maxCh=5; M.ch=5; M.unl={routes:1}; M.guide.tut=1; M.guide.fever=1; M.up.dmg=40; M.up.stage=3; M.money=8.8e9; M.speed=1; recalcTree(); save(); startRound(false,{route:'normal'}); G.ammo=G.maxAmmo=60; });
 await page.evaluate(()=>{ const d=document.createElement('div'); d.id='opener'; d.style.cssText='position:fixed;inset:0;z-index:1000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;text-align:center;pointer-events:none;background:radial-gradient(circle at 50% 45%,#2a1d0cdd,#060403f2 72%)';
   d.innerHTML=`<div style="font:800 12px/1 sans-serif;letter-spacing:6px;color:#d9b45a">独立游戏 · 测试版</div><div id="opT" style="font:900 62px/1.15 'Noto Serif CJK SC',serif;letter-spacing:10px;background:linear-gradient(180deg,#fff6d2,#ffd76a 45%,#c8902e);-webkit-background-clip:text;color:transparent;filter:drop-shadow(0 4px 0 #3a2508) drop-shadow(0 0 30px #ffb84a66)">千珠落尽</div><div style="width:140px;height:2px;background:linear-gradient(90deg,transparent,#ffe08a,transparent)"></div><div style="font:700 16px/1.4 sans-serif;color:#f3dc9a;letter-spacing:4px">弹珠 × 开卡包 × 肉鸽</div>`;
   document.body.appendChild(d); let f=0; const t=document.getElementById('opT'); const prev=window.__tick; window.__tick=()=>{ f++; const k=Math.min(1,f/14),e=1-Math.pow(1-k,3); t.style.transform=`scale(${1.35-.35*e})`; d.style.opacity= f<52?Math.min(1,f/6):Math.max(0,1-(f-52)/10); if(f>62){ d.remove(); window.__tick=null; window.__capLater&&window.__capLater(); } }; });
 await scene(page,'s1_chaos',420,async i=>{ await aimFire(9)(i); if(i===63) await cap(page,'一发宝珠，满屏爆金币','后期：闪电连锁 + 星轨复制 + 奇点重生',null,'BUILD · 后期流派'); });
 // ---- 场景 2：新手第一轮（教学关） ----
 const ctx2=await b.newContext({viewport:{width:360,height:640},deviceScaleFactor:3,isMobile:true,hasTouch:true}); await ctx2.addInitScript(INIT);
 const p2=await ctx2.newPage(); p2.on('pageerror',e=>console.log('ERR',e.message)); await page.close(); page=p2;
 await page.goto(URL); for(let i=0;i<20;i++) await page.evaluate(()=>window.__step());
 await page.evaluate(()=>{ showIntro(); });
 await scene(page,'s2_intro',75);
 await page.evaluate(()=>$('go').click()); await cap(page,'第一轮是教学关','瞄准 → 发射 → 撞破卡包拿金币和卡','17%','STEP 1 · 上手');
 await scene(page,'s3_tut',330,aimFire(26));
 await cap(page,'');
 // ---- 场景 3：地图 ----
 await page.evaluate(()=>{ CARDS.forEach(c=>{ if(c.rar!=='UR') M.owned[c.id]=10; }); M.deck=['chain','thor','heavy']; M.round=14; M.maxCh=3; M.ch=3; M.unl={routes:1}; M.guide.tut=1; running=false; G={loot:{}}; tab='loot'; save(); showBetween(); const m=M.map; m.rows[2][0].t='delve'; m.r=1; m.i=0; showBetween(); setTimeout(()=>{ const el=document.querySelector('.map'); if(el) el.scrollIntoView({block:'center'}); },50); });
 await page.waitForTimeout(150); await cap(page,'每章一张分岔地图','精英 · 黑市 · 奇遇 · 首领，失败掉心，3 条命','4%','STEP 2 · 选路');
 await scene(page,'s4_map',150);
 // ---- 场景 4：深入金库 ----
 await page.evaluate(()=>{ M.delve={layer:2,coins:3.6e6,cards:{thor:1,orbit:1,split:2,chain:3},orbs:{fire:1},soul:0}; G={loot:{},packs:[],delveOk:true,delveLayer:2,opened:31,goal:24,earned:1.2e6,hits:180,boons:[],newIds:{},upIds:{}}; tab='loot'; showBetween(); $('ov').scrollTop=0; });
 await cap(page,'深入金库：撤，还是继续？','越深奖励越多，失败背包全丢','46%','STEP 3 · 搜打撤');
 await scene(page,'s5_delve',120);
 // ---- 结尾 ----
 await page.evaluate(()=>{ $('ov').classList.remove('show'); });
 await page.evaluate(()=>{ const d=document.createElement('div'); d.id='endcard'; d.style.cssText='position:fixed;inset:0;z-index:998;background:radial-gradient(circle at 50% 40%,#3a2a12,#0b0805 70%);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;text-align:center';
   d.innerHTML=`<img src="${ART.hero}" style="width:150px;border-radius:16px;box-shadow:0 10px 40px #000"><div style="font:900 44px/1.2 'Noto Serif SC','Noto Serif CJK SC',serif;color:#ffd76a;letter-spacing:6px">千珠落尽</div><div style="font:600 16px sans-serif;color:#f3dc9a">测试版 · 手机电脑浏览器直接玩</div><div style="font:700 18px sans-serif;color:#fff;background:#d9b45a33;border:1px solid #d9b45a;border-radius:10px;padding:8px 16px">链接在简介 · 欢迎评论区反馈</div>`; document.body.appendChild(d); [...d.children].forEach(c=>c.style.opacity=0); let f=0; window.__tick=()=>{ f++; [...d.children].forEach((c,j)=>{ const k=Math.max(0,Math.min(1,(f-j*5)/10)),e=1-Math.pow(1-k,3); c.style.opacity=e; c.style.transform=`translateY(${(1-e)*20}px)`; }); }; });
 await cap(page,''); await scene(page,'s6_end',120);
 await b.close(); })();
