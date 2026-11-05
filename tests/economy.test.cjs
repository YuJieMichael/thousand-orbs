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
