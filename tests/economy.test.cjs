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
  vm.runInContext(between('const GOAL_MIN=', '\n') + '\n' + between('function settleRoute(', '// ---- 卡牌三选一'), ctx);
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
    const ctx = vm.createContext({PT, M: {ch}});
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
  assert.match(html, /odds:\[72\.3,23,4\.5,\.2\]/);
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
  assert.match(html, /if\(M\.loadAuto\) applyLoad\(loadKind\(boss,opt\)\);[^\n]*\n  if\(chal&&chal\.eq\) ROUND_EQ=chal\.eq\(\);/);
  assert.match(html, /if\(!\['boss','special','farm'\]\.includes\(k\)/);
});
