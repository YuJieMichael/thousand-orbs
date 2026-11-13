const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// 2026-11-13：首页多条线（远征 / 金库 / 谜题 / 挑战 / 深渊 / 连战 / 收藏）
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
function between(from, to) {
  const start = html.indexOf(from), end = html.indexOf(to, start);
  assert.ok(start >= 0 && end > start, `source boundary: ${from}`);
  return html.slice(start, end);
}

test('谜题：30 关，宝珠和星级门槛合理，卡包都在台面里', () => {
  const ctx = vm.createContext({ W: 540 });
  vm.runInContext(between('const pgRow=', 'const puzStars=') + ';this.P=PUZZLES;', ctx);
  assert.equal(ctx.P.length, 30);
  ctx.P.forEach((p, i) => {
    assert.ok(p.name && p.tip, `关 ${i + 1} 要有名字和提示`);
    assert.ok(p.orbs >= 3 && p.orbs <= 10, `关 ${i + 1} 宝珠数`);
    assert.ok(p.s[0] > p.s[1] && p.s[1] >= 1 && p.s[0] < p.orbs, `关 ${i + 1} 星级门槛`);
    assert.ok(p.packs.length >= 1);
    p.packs.forEach(([x, y, n, k]) => { assert.ok(x >= 30 && x <= 510 && y >= 200 && y <= 740, `关 ${i + 1} 卡包位置 ${x},${y}`); assert.ok(n >= 1 && n <= 5); assert.ok(k === undefined || k === 'g' || k === 'm'); });
    p.pegs().forEach(g => assert.ok(Number.isFinite(g.x) && Number.isFinite(g.y) && g.r > 0));
  });
});

test('每周挑战：ISO 周编号；种子不会被英文版翻译掉', () => {
  const ctx = vm.createContext({});
  vm.runInContext(between('function weekKey(', 'const weekBoard=') + ';this.wk=weekKey;', ctx);
  assert.equal(ctx.wk(Date.UTC(2026, 10, 13)), '2026W46');
  assert.equal(ctx.wk(Date.UTC(2026, 10, 16)), '2026W47');   // 周一换周
  assert.equal(ctx.wk(Date.UTC(2027, 0, 1)), '2026W53');     // 2027-01-01 还算 2026 年第 53 周
  assert.match(html, /hashStr\(\/\*i18n-keep\*\/'千珠落尽·每周·'\+wk\)/);
  assert.match(html, /hashStr\(\/\*i18n-keep\*\/'千珠落尽·'\+day\)/);   // 每日挑战也一样：中英文同一天同一套
});

test('切线：远征和金库各存一份进度，金魂 / 传承分开，共享的东西都在 META_KEYS 里', () => {
  const keys = between('const META_KEYS=[', '];');
  for (const k of ['slots', 'active', 'eSoul', 'eLegacy', 'vSoul', 'vLegacy', 'puz', 'wk', 'abyssBest', 'rushBest', 'ghosts', 'vRate']) assert.ok(keys.includes(`'${k}'`), k);
  const sw = between('function switchMode(m){', 'function goHome(){');
  assert.match(sw, /if\(from==='vault'\)\{ M\.vSoul=M\.soul; M\.vLegacy=M\.legacy; M\.soul=M\.eSoul\|\|0;/);
  assert.match(sw, /if\(m==='vault'\)\{ M\.eSoul=M\.soul; M\.eLegacy=M\.legacy; M\.soul=M\.vSoul\|\|0;/);
  assert.match(html, /const SLOT_MODES=\['run','vault'\];/);
  assert.match(html, /const addESoul=n=>\{ if\(inVault\(\)\) M\.eSoul=\(M\.eSoul\|\|0\)\+n; else M\.soul\+=n; \};/); // 成就的金魂永远记到远征
});

test('各模式一轮结束走自己的结算，不进远征的结算', () => {
  const end = between('function endRound(){', '// ================= 🏆 排行榜');
  assert.ok(end.indexOf('if(modeEnd())') > 0 && end.indexOf('if(modeEnd())') < end.indexOf('settleRoute()'));
  const me = between('function modeEnd(){', '\n}');
  for (const k of ['abyss', 'rush', 'puzzle', 'weekly']) assert.ok(me.includes(`m==='${k}'`), k);
});

test('排行榜服务：新榜（深渊 / 连战 / 谜题 / 每周）和幽灵接口', () => {
  const w = fs.readFileSync(path.join(__dirname, '..', 'leaderboard', 'src', 'index.js'), 'utf8');
  for (const b of ['abyss:', 'rush:', 'puzzle:']) assert.ok(w.includes(b), b);
  assert.match(w, /\^w\(\\d\{4\}\)W\(\\d\{2\}\)\$/);
  assert.match(w, /url\.pathname === '\/ghost'/);
  const sql = fs.readFileSync(path.join(__dirname, '..', 'leaderboard', 'schema.sql'), 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS ghosts/);
});
