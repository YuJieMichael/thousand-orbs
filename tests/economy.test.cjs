const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// 2026-11-05.1 平衡：开包速度上限、大量开包后金币递减、目标跟得上火力、开发者模式不上传。
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
function between(from, to) {
  const start = html.indexOf(from), end = html.indexOf(to, start);
  assert.ok(start >= 0 && end > start, `source boundary: ${from}`);
  return html.slice(start, end);
}

test('一轮开到 200 包以内金币不打折，之后按 √(200/已开) 递减', () => {
  const ctx = vm.createContext({});
  vm.runInContext(between('const REFILL_MIN=', 'const GOAL_MIN=') + ';this.f=packFatigue;this.soft=PACK_SOFT;this.min=REFILL_MIN;', ctx);
  assert.equal(ctx.f(1), 1);
  assert.equal(ctx.f(ctx.soft), 1);
  assert.equal(ctx.f(800), 0.5);
  assert.ok(ctx.f(5000) < 0.21 && ctx.f(5000) > 0.19);
  assert.equal(ctx.min, 0.45);
});

test('卡包补充最快 0.45 秒，补货节点再多也不会更快', () => {
  const body = between('function openPack(', 'function giveCard(');
  assert.match(body, /G\.refill\.push\(\{slot:p\.slot,t:Math\.max\(REFILL_MIN,/);
});

test('固定目标曲线：只看章节和地图第几站，不再追着开包数涨', () => {
  let worth = 1;
  const ctx = vm.createContext({M: {ch: 1, chRounds: 0, map: null, up: {cnt: 0}}, DAILY: null, MAP_ROWS: 6, mapOn: () => true, packWorth: () => worth, CNT_STEP: .04, DANGER: {goal: .15}, dangerLv: () => 0, runSquad: () => null, Math});
  vm.runInContext(between('const GOAL_MIN=', 'const ROUTES={') + ';this.g=goalFor;this.s=syncGoal;', ctx);
  assert.equal(ctx.g(1, 0), 10); assert.equal(ctx.g(1, 5), 16);
  assert.equal(ctx.g(2, 0), 35); assert.equal(ctx.g(3, 0), 55); assert.equal(ctx.g(3, 5), 88);
  assert.equal(ctx.g(6, 0), 105); assert.equal(ctx.g(7, 0), 118);
  worth = 4; assert.equal(ctx.g(1, 0), 20); worth = 1;                       // 一包算 4 包时目标只 ×√4
  ctx.M.map = {ch: 1, r: 2}; ctx.s(); assert.equal(ctx.M.goal, 14);          // 下一站是第 3 排（r+1）
  ctx.s(true); assert.equal(ctx.M.goal, 12);                                 // 正在打第 2 排
  const settle = between('function settleRoute(){', '// ---- 卡牌三选一');
  assert.doesNotMatch(settle, /M\.goal\+=/); assert.doesNotMatch(settle, /goalAfterMiss\(/);
  assert.match(settle, /syncGoal\(\)/);
});

test('开发者模式：不上传统计、不上排行榜，存档里是布尔值', () => {
  assert.match(between('function statSend(', '\n'), /M\.dev/);
  assert.match(between('async function lbSubmit(', '\n'), /M\.dev/);
  assert.match(html, /for\(const k of \['stats','vibe','dev','calm','music'\]\)/);
});

test('秘卡门槛：无尽回响 50 次命中，奇点 20 颗宝珠', () => {
  assert.match(html, /if\(b\.hn>=50\) grantMyth\('echo'\)/);
  assert.match(html, /if\(G\.balls\.length>=20\) grantMyth\('sing'\)/);
});

test('普通卡包：金币和血量同步成长，开出好卡的概率随章节提高（第 5 章封顶）', () => {
  assert.match(html, /const CH_HP=1\.6, CH_VAL=1\.6;/);
  const PT = [{odds: [72.3, 23, 4.5, .2]}, {odds: [0, 65, 30, 5]}, {odds: [0, 0, 75, 25]}, {odds: [0, 0, 0, 100]}];
  const odds = ch => {
    const ctx = vm.createContext({PT, M: {ch}, DAILY: null});
    vm.runInContext(between('const ODDS_STEP=', 'const packHp') + ';this.o=JSON.stringify([0,1,2,3].map(t=>packOdds(t)));', ctx);
    return JSON.parse(ctx.o);
  };
  for (const ch of [1, 2, 3, 4, 5, 9]) for (const o of odds(ch)) assert.ok(Math.abs(o.reduce((a, b) => a + b, 0) - 100) < 1e-6);
  assert.deepEqual(odds(1)[0], [72.3, 23, 4.5, .2]);
  assert.ok(odds(5)[0][3] > odds(3)[0][3] && odds(3)[0][3] > odds(1)[0][3]);   // 青铜包的 SSR 越往后越多
  assert.deepEqual(odds(9), odds(5));                                            // 深渊沿用第 5 章
  assert.deepEqual(odds(5)[3], [0, 0, 0, 100]);                                  // 黑金秘藏不变
});

test('SSR 不再太好拿：保底 100 张（黑金之约点满 50），黑金秘藏自然出现率减半，青铜包第 1 章 SSR 0.2%', () => {
  assert.match(html, /const PITY_BASE=100, PITY_STEP=10;/);
  assert.match(html, /if\(r<\(\.002\+\.002\*s\)\*lk\*\(1\+BLACK_PACT\*upLv\('pityup'\)\)\*\(hasRelic\('compass'\)\?2:1\)\) t=3;/);
  assert.match(html, /Math\.min\(STAGE_ODDS_MAX,M\.up\.stage\)/);
  assert.match(html, /odds:\[80,17\.5,2\.4,\.1\]/);
});

test('提前配装：存三套，开打前按关卡自动换上，存档校验', () => {
  const ctx = vm.createContext({M: {owned: {a: 1, b: 1, c: 1}, deck: ['a', 'b'], ksOff: {}}, ROUND_EQ: null, toast() {}, save() {}, recalcTree() {}, JSON});
  vm.runInContext('const maxSlots=()=>2;' + between('function equipped(', 'function loadBar(') + ';this.api={saveLoad,applyLoad,loadKind,equipped:()=>JSON.stringify(equipped())};', ctx);
  const {api, M} = ctx;
  assert.equal(api.loadKind(true), 'boss');
  assert.equal(api.loadKind(false, {route: 'elite'}), 'special');
  assert.equal(api.loadKind(false, {chal: 'one'}), 'special');
  assert.equal(api.loadKind(false, {route: 'normal'}), 'farm');
  api.saveLoad('boss'); assert.equal(M.loadAuto, true);
  M.deck = ['c']; M.ksOff = {greed: 1}; api.saveLoad('farm');
  assert.equal(api.applyLoad('boss', true), true); assert.equal(api.equipped(), '["a","b"]'); assert.equal(JSON.stringify(M.ksOff), '{}');
  assert.equal(api.applyLoad('boss', true), false);                 // 已经是这一套：不重复换
  api.applyLoad('farm', true); assert.equal(api.equipped(), '["c"]'); assert.equal(M.ksOff.greed, 1);
  assert.equal(api.applyLoad('special', true), false);              // 没存的不换
  assert.match(html, /if\(M\.loadAuto&&!daily\) applyLoad\(loadKind\(boss,opt\)\);[^\n]*\n  if\(daily\) ROUND_EQ=daily\.deck\.slice\(\);\n  if\(chal&&chal\.eq\) ROUND_EQ=chal\.eq\(\);/);
  assert.match(html, /if\(!\['boss','special','farm'\]\.includes\(k\)/);
});

test('宝珠再大也塞得进最窄的金袋：直径上限 44，巨珠到顶后不再出现', () => {
  assert.match(html, /const BALL_RMAX=22, MINI_RMAX=15/);
  assert.match(html, /const POCKET_DEF=\[1,2,1,5,1,2,1\], POCKET_W=\{1:80,2:75,5:52\}/);
  assert.ok(22 * 2 < 52);
  assert.equal((html.match(/b\.r\*=/g) || []).length, 0);           // 所有放大都走 capR
  assert.match(html, /b\.id==='big'&&9\*G\.R\.size\*1\.35>BALL_RMAX/);
});

test('台面宝珠上限：复制 / 分裂最多 40 颗，多出来的折算成伤害；连发排队到少于 60 颗；飘字和粒子有上限', () => {
  assert.match(html, /const BALL_MAX=40, BALL_HARD=60, OV_FULL=\.008, OV_MINI=\.004, OV_MAX=3, FX_MAX=40, PARTS_MAX=400;/);
  const ctx = vm.createContext({G: {balls: [], fx: [], R: {size: 1}}, W: 540, H: 800, Math});
  vm.runInContext('let ballId=0;' + between('const BALL_MAX=', 'function fire(') + ';this.sp=spawnBall;', ctx);
  for (let i = 0; i < 50; i++) ctx.sp(0, 0, 0, 0, {mini: i % 2 === 1});
  assert.equal(ctx.G.balls.length, 40);
  assert.ok(Math.abs(ctx.G.ovX - (1 + 5 * .008 + 5 * .004)) < 1e-9);
  ctx.sp(0, 0, 0, 0, {main: true}); assert.equal(ctx.G.balls.length, 41);       // 玩家自己射的不会被吞
  for (let i = 0; i < 1000; i++) ctx.sp(0, 0, 0, 0); assert.equal(ctx.G.ovX, 3);
  assert.match(html, /function D\(\)\{ return \(G\.ovX\|\|1\)\*/);
  assert.match(html, /G\.balls\.length<BALL_HARD\)\{ G\.qT-=gap; shoot\(\); \}/);
});

function dailyCtx() {
  const CARDS = [];
  const m = html.match(/const CARDS=\[[\s\S]*?\n\];/); assert.ok(m, 'CARDS');
  const ctx = vm.createContext({Math, Date, JSON});
  vm.runInContext('const pct=x=>x,echoP=x=>x,refund=()=>0,spawnBall=()=>({}),zap=()=>0,dmgPack=()=>0,shake=()=>0,D=()=>1,SFX={play(){}};' + m[0] + ';' + between('const DAILY_LV=', 'const blankTS=') + ';this.api={dailyOf,dayKey,dailyBoard,RULES:DAILY_RULES,CARDS};', ctx);
  return ctx.api;
}

test('每日挑战：同一天同一套（6 张、至少 3 张同流派），换一天就变；榜名 d+日期', () => {
  const api = dailyCtx();
  const a = api.dailyOf('2026-11-05'), b = api.dailyOf('2026-11-05'), c = api.dailyOf('2026-11-06');
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.notEqual(JSON.stringify(a), JSON.stringify(c));
  for (const day of ['2026-11-05', '2026-11-06', '2026-12-31', '2027-02-14']) {
    const d = api.dailyOf(day);
    assert.equal(new Set(d.deck).size, 6);
    const cards = d.deck.map(id => api.CARDS.find(x => x.id === id));
    assert.ok(cards.every(x => x && x.rar !== 'UR'));
    assert.ok(cards.filter(x => x.sch === d.main || x.sch2 === d.main).length >= 3);
    assert.ok(d.ch >= 1 && d.ch <= 5 && api.RULES.some(r => r.id === d.rule));
  }
  assert.equal(api.dailyBoard('2026-11-05'), 'd20261105');
  assert.equal(api.dayKey(Date.UTC(2026, 10, 5, 23, 59)), '2026-11-05');
});

test('每日挑战不吃个人养成：升级、星盘、传承、秘藏等级、章节全部归零', () => {
  assert.match(html, /const upLv=id=>DAILY\?0:/);
  assert.match(html, /orbDmg\(DAILY\?0:M\.up\.dmg\)\*G\.R\.dmg\*\(DAILY\?1:1\+\.3\*M\.legacy\.pow\)/);
  assert.match(html, /function cardP\(id\)\{ if\(DAILY\)\{/);
  assert.match(html, /Math\.pow\(1\.6,DAILY\?0:M\.up\.stage\)/);
  assert.match(html, /if\(daily\)\{ recalcTree\(\); DAILY=daily; TS=blankTS\(\); \}/);
  assert.match(html, /function dailyEnd\(\)\{ DAILY=null; recalcTree\(\);/);
});

test('秘卡：过半提示，解锁给金币和金魂', () => {
  assert.match(html, /const MYTH_COINS=100, MYTH_SOUL=3;/);
  assert.match(html, /if\(M\.owned\[id\]\|\|v<n\*\.5\) return;/);
  assert.match(html, /M\.money\+=gold; M\.life\+=gold; if\(live\) G\.earned\+=gold; M\.soul\+=MYTH_SOUL;/);
});

test('秘藏等级：血量 ×1.6^等级，一个卡包也算 round(1.6^等级) 包；祝福节奏和金币递减按真实包数', () => {
  const ctx = vm.createContext({M: {up: {stage: 0}}, DAILY: null, Math});
  vm.runInContext(between('const PACK_WORTH_MAX=', 'const packValue=') + ';this.w=packWorth;', ctx);
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(l => ctx.w(l)), [1, 2, 3, 4, 7, 10]);
  assert.equal(ctx.w(30), 10); assert.equal(ctx.w(60), 10);                   // 后期秘藏等级几十级：封顶 10，不会一包算上亿包
  ctx.DAILY = {}; assert.equal(ctx.w(5), 1);                                    // 每日挑战不吃养成
  assert.match(html, /G\.opened\+=packCount\(\)\+\(G\.R\.vip&&p\.t>=1\?1:0\); G\.realOpened=/);
  assert.match(html, /coins\*=packFatigue\(G\.realOpened\)/);
  assert.match(html, /G\.realOpened>=G\.boonNext/);
});

test('开包计数倍率：清点术每级 +4%、清点祝福 +15%，小数按概率；每日挑战固定 1', () => {
  const ctx = vm.createContext({M: {up: {stage: 0, cnt: 5}}, G: {bo: {cnt: .15}}, DAILY: null, Math});
  vm.runInContext(between('const PACK_WORTH_MAX=', 'const packValue=') + ';this.m=cntMult;this.c=packCount;', ctx);
  assert.ok(Math.abs(ctx.m() - 1.35) < 1e-9);
  let n = 0; for (let i = 0; i < 20000; i++) n += ctx.c();
  assert.ok(n / 20000 > 1.32 && n / 20000 < 1.38);
  ctx.M.up.stage = 3; let k = 0; for (let i = 0; i < 2000; i++) k += ctx.c(); assert.ok(k / 2000 > 5.2 && k / 2000 < 5.6);   // 4 × 1.35
  ctx.DAILY = {}; assert.ok(Math.abs(ctx.m() - 1.15) < 1e-9);                   // 每日挑战不吃清点术，只吃本轮祝福
  ctx.G.bo.cnt = 0; assert.equal(ctx.m(), 1); assert.equal(ctx.c(), 1);
  assert.match(html, /\{id:'cnt',ico:'🧾',name:'清点术'/);
  assert.match(html, /\{id:'tally',ico:'🧾',name:'清点',w:3/);
});

test('星盘节点价格：30 × 1.5^已点数 × 1.6^(最高章-1) × 类型倍率；黑金之约写清楚是减多少张', () => {
  const ctx = vm.createContext({M: {maxCh: 1}, CH_VAL: 1.6, Math, tCount: () => 0});
  vm.runInContext(between('const TREE_BASE=', 'function effText(') .split('\n').slice(0, 2).join('\n') + ';this.c=tCost;', ctx);
  assert.equal(ctx.c({t: 's'}), 30);
  ctx.tCount = () => 10; vm.runInContext('tCount=()=>10', ctx);
  assert.equal(ctx.c({t: 's'}), Math.ceil(30 * 1.5 ** 10));
  ctx.M.maxCh = 4; assert.equal(ctx.c({t: 'k'}), Math.ceil(30 * 1.5 ** 10 * 1.6 ** 3 * 3));
  assert.match(html, /pityup:n=>`黑金保底 -\$\{10\*n\} 张/);
});

test('没达成目标：目标降到实际开包 ×1.15 附近（最多减半），小幅没达成仍然只 -2', () => {
  const ctx = vm.createContext({GOAL_MIN: 8, Math});
  vm.runInContext(between('const goalAfterMiss=', '\n') + ';this.g=goalAfterMiss;', ctx);
  assert.equal(ctx.g(100, 95), 98);
  assert.equal(ctx.g(5000, 373), 2500);
  assert.equal(ctx.g(800, 373), 429);
  assert.equal(ctx.g(10, 0), 8);
});

test('统计调整：首领第 2 章起 +25%，灼烧加强，财富能加开包数', () => {
  assert.match(html, /BOSS_HARD=1\.25/);
  assert.match(html, /\*\(M\.ch>=2\?BOSS_HARD:1\),previous\*BOSS_STEP/);
  assert.match(html, /R\.burn\+=\.6\*p/);
  assert.match(html, /R\.cnt\+=\.1\*Math\.sqrt\(p\)/);
  assert.match(html, /\(G\.R\.vip&&p\.t>=1\?1:0\)/);
});

test('本章轮数只让金币小幅上涨（×1.07/轮，最多 10 轮）；卡包血量不再越打越硬', () => {
  const ctx = vm.createContext({M: {chAge: 0}, DAILY: null, Math});
  vm.runInContext(between('const AGE_G=', 'const packHp=') + ';this.a=ageMult;', ctx);
  assert.equal(ctx.a(), 1);
  ctx.M.chAge = 4; assert.ok(Math.abs(ctx.a() - 1.07 ** 4) < 1e-9);
  ctx.M.chAge = 30; assert.ok(Math.abs(ctx.a() - 1.07 ** 10) < 1e-9);
  ctx.DAILY = {}; assert.equal(ctx.a(), 1);
  assert.doesNotMatch(between('const packHp=', '\n'), /ageMult/);
  assert.match(html, /\*Math\.pow\(CH_VAL,\(DAILY\?1:M\.ch\)-1\)\*ageMult\(\)/);
  assert.match(html, /M\.chRounds=0; M\.chAge=0; M\.sigils=\[\]; M\.sigQ=\[\]; syncGoal\(\);/);
});

test('章节地图：5 站，每站 2~3 个点，每个点都走得到，至少一个精英；首站只有普通', () => {
  const src = between('const MAP_ROWS=', 'function ensureMap(');
  for (let k = 0; k < 200; k++) {
    const ctx = vm.createContext({M: {ch: 2}, Math, unl: () => true});
    vm.runInContext(src + ';this.m=genMap();', ctx);
    const m = ctx.m;
    assert.equal(m.rows.length, 5); assert.equal(m.next.length, 4); assert.equal(m.hearts, 3); assert.equal(m.r, -1);
    assert.ok(m.rows[0].every(o => o.t === 'normal'));
    assert.ok(m.rows.flat().some(o => o.t === 'elite'));
    assert.ok(m.rows.flat().some(o => o.t === 'shop' || o.t === 'event'));   // 每张图至少一个黑市或奇遇
    assert.ok(!m.rows[1].some(o => o.t === 'shop'));
    for (let r = 0; r < 4; r++) {
      assert.ok(m.next[r].every(l => l.length >= 1));
      const hit = new Set(m.next[r].flat()); assert.equal(hit.size, m.rows[r + 1].length);   // 下一站每个点都有路
    }
  }
  assert.match(html, /function settleRoute\(\)\{ if\(G\.isBoss&&!G\.bossWin\) loseHeart\('首领战失败'\);/);
  assert.match(html, /if\(!ok\) loseHeart\('目标没达成'\);/);
});

test('深入金库：每层血量 ×1.3^层、目标逐层提高；失败背包全丢并掉心，地图里每张最多一个', () => {
  assert.match(html, /const DELVE_HP=1\.3, DELVE_COIN=\.35, DELVE_GOAL=1, DELVE_GOAL_STEP=\.2;/);
  assert.match(html, /G\.mut=\{hpX:Math\.pow\(DELVE_HP,L\)\}/);
  assert.match(html, /else \{ G\.delveLost=\{\.\.\.d\}; M\.delve=null; loseHeart\('被困在金库深处'\); \}/);
  assert.match(html, /if\(G\.route==='delve'\)\{ M\.chAge=\(M\.chAge\|\|0\)\+1; delveSettle\(ok\); return; \}/);
  const src = between('const MAP_ROWS=', 'function ensureMap(');
  for (let k = 0; k < 300; k++) {
    const ctx = vm.createContext({M: {ch: 2}, Math, unl: () => true});
    vm.runInContext(src + ';this.m=genMap();', ctx);
    const rows = ctx.m.rows;
    assert.ok(rows.flat().filter(o => o.t === 'delve').length <= 1);
    assert.ok(!rows[0].concat(rows[1]).some(o => o.t === 'delve'));
  }
});

test('火力补货：场上宝珠越多卡包补得越快，最多 ×5；连发每级再加快', () => {
  const lv = { rapid: 0 };
  const ctx = vm.createContext({ upLv: id => lv[id] || 0 });
  vm.runInContext(between('const REFILL_MIN=', 'const GOAL_MIN=') + ';this.fr=fireRefill;', ctx);
  assert.equal(ctx.fr(0), 1);
  assert.equal(ctx.fr(1), 1);
  assert.equal(ctx.fr(3), 2);
  assert.equal(ctx.fr(40), 5);
  lv.rapid = 4;
  assert.ok(Math.abs(ctx.fr(3) - 3.2) < 1e-9);
  const body = between('G.clrCd=Math.max(0,', 'function ');
  assert.match(body, /G\.refill\.forEach\(r=>r\.t-=dt\*fr\)/);
});

test('秘符：三个品级都至少有 3 个可选；遗珍三种稀有度都有；精英必掉遗珍并给秘符', () => {
  const src = between('const SIGIL_MAX=', 'const sigilOf=');
  const ctx = vm.createContext({});
  vm.runInContext(src + ';this.S=SIGILS;this.O=SIGIL_ODDS;', ctx);
  for (const t of ['s', 'g', 'p']) assert.ok(ctx.S.filter(c => c.t === t).length >= 3, `tier ${t}`);
  for (const k of ['start', 'mid', 'elite']) assert.equal(ctx.O[k].length, 3);
  const rsrc = between('const RELIC_MAX=', 'const relicOf=');
  const rc = vm.createContext({}); vm.runInContext(rsrc + ';this.R=RELICS;this.RA=RARE;', rc);
  for (const r of ['c', 'r', 'l']) assert.ok(rc.R.some(x => x.r === r));
  assert.match(html, /if\(G\.route==='elite'\)\{ dropRelic\('elite'\); M\.sigQ\.push\('elite'\);/);
  assert.match(html, /if\(!\(M\.run&&M\.run\.over\)\) dropRelic\('boss',p\.x,p\.y\);/);
  assert.match(html, /if\(false&&G\.boonNext/);   // 局内祝福已取消
});
