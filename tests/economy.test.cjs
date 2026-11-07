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

function settle(goal, opened, route = 'normal') {
  const ctx = vm.createContext({
    G: {route, opened, goal, earned: 0}, M: {goal, streak: 0, bestStreak: 0, chRounds: 0, money: 0, life: 0, orbs: {}},
    ORB_SPECIAL: ['fire'], Math,
  });
  vm.runInContext(between('const GOAL_MIN=', '\n') + '\n' + between('const goalAfterMiss=', '// ---- 卡牌三选一'), ctx);
  vm.runInContext('settleRoute()', ctx);
  return ctx.M.goal;
}

test('目标每轮最多涨 max(6, 目标的一半)：后期开几千包时目标能追上来', () => {
  assert.equal(settle(10, 12), 12);           // 小幅超额：按 80% 跟上
  assert.equal(settle(10, 100), 16);          // 早期：最多 +6
  assert.equal(settle(100, 1000), 150);       // 后期：最多 +50%
  assert.equal(settle(100, 90), 98);          // 没达成：-2
});

test('开发者模式：不上传统计、不上排行榜，存档里是布尔值', () => {
  assert.match(between('function statSend(', '\n'), /M\.dev/);
  assert.match(between('async function lbSubmit(', '\n'), /M\.dev/);
  assert.match(html, /for\(const k of \['stats','vibe','dev'\]\)/);
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
  assert.match(html, /if\(r<\(\.002\+\.002\*s\)\*lk\) t=3;/);
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

test('本章越打越硬：每轮血量和金币 ×1.15，最多 10 轮，进下一章和转生时重置，每日挑战不受影响', () => {
  const ctx = vm.createContext({M: {chAge: 0}, DAILY: null, Math});
  vm.runInContext(between('const AGE_G=', 'const packHp=') + ';this.a=ageMult;', ctx);
  assert.equal(ctx.a(), 1);
  ctx.M.chAge = 4; assert.ok(Math.abs(ctx.a() - 1.15 ** 4) < 1e-9);
  ctx.M.chAge = 30; assert.ok(Math.abs(ctx.a() - 1.15 ** 10) < 1e-9);
  ctx.DAILY = {}; assert.equal(ctx.a(), 1);
  assert.match(html, /\*Math\.pow\(CH_HP,\(DAILY\?1:M\.ch\)-1\)\*ageMult\(\)/);
  assert.match(html, /\*Math\.pow\(CH_VAL,\(DAILY\?1:M\.ch\)-1\)\*ageMult\(\)/);
  assert.match(html, /M\.chRounds=0; M\.chAge=0;/);
  assert.match(html, /G\.goalOk=ok; M\.chAge=\(M\.chAge\|\|0\)\+1;/);
});
