const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Run the actual single-file combat/reward entry points, with presentation stubbed.
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
function between(from, to) {
  const start = html.indexOf(from), end = html.indexOf(to, start);
  assert.ok(start >= 0 && end > start, `source boundary: ${from}`);
  return html.slice(start, end);
}
function fixture() {
  const context = vm.createContext({
    W: 540, H: 900, damage: 3, cards: [], timers: [], performance: {now: () => 0},
    M: {money: 0, life: 0, up: {stage: 0}, legacy: {rich: 0, start: 0},
      ch: 1, maxCh: 1, round: 8, goal: 10, chRounds: 3, bossTries: 0, best: {}, orbs: {}, shopN: {}},
    TS: {coin: 0, ks: {}}, PT: [{hp: 1, val: 1}, {hp: 4, val: 4}, {hp: 12, val: 15}],
    SFX: {play() {}}, CHAL: [], ORB_SPECIAL: [], BOONS: [], GOAL_MIN: 8, GOAL_REBORN: .3,
    $: () => ({classList: {remove() {}}}),
    buildLayout() {}, buildPockets() {}, rollSpecials() {}, renderSide() {}, guideTip() {}, hud() {},
    equipped: () => [], upLv: () => 0, ammoN: () => 8, packN: () => 3, unl: () => false,
    allSets: () => false, bossMechs: () => ['shield'],
    buzz() {}, shake() {}, toast() {}, bossIdx: ch => ch, chInfo: () => ({name: 'test', boss: 'test'}),
    urUnlocked: () => [], f: x => String(x), rnd: () => 0,
    recalcTree() {}, save() {}, soulGain: () => 0, checkAch() {}, showBetween() {},
    fresh: () => ({up: {stage: 0}}),
  });
  vm.runInContext(`let G=null, ROUND_EQ=null, running=false, tab='';
    const D=()=>damage;
    const setTimeout=(fn,delay)=>timers.push({fn,delay});
    const giveCard=(p,k)=>cards.push(k);
    const enterP2=p=>{p.p2=true;p.hp=p.max*.5;};
    const UR_BOSS=.5;`, context);
  vm.runInContext(between('const CH_HP=', 'const stageCap='), context);
  vm.runInContext(between('const BOSS_EASE=', 'const shieldCfg='), context);
  vm.runInContext(between('function startRound(', 'function freeSlots('), context);
  vm.runInContext(between('function openPack(', 'function giveCard('), context);
  vm.runInContext(between('function bossDown(', 'function refund('), context);
  vm.runInContext(between('function earn(', '// ---- 震动反馈'), context);
  vm.runInContext(between('function dmgPack(', 'function hitPack('), context);
  vm.runInContext(between('function prestige()', '// ================= 成就'), context);
  const run = code => vm.runInContext(code, context);
  return {run, start: () => run('startRound(true);G.boss.max'),
    state: () => JSON.parse(run('JSON.stringify({M,G,cards})'))};
}

test('boss kill pays its first-chapter reward once and advances with three cards', () => {
  const f = fixture(); f.start();
  f.run('var defeated=G.boss;openPack(defeated);openPack(defeated);');
  const {M, G, cards} = f.state();
  assert.equal(M.money, 540); assert.equal(G.earned, 540); assert.equal(M.life, 540);
  assert.equal(M.ch, 2); assert.equal(M.maxCh, 2); assert.equal(M.chRounds, 0);
  assert.equal(G.boss, null); assert.deepEqual(cards, ['SSR', 0, 2]);
});

test('boss payout uses the defeated chapter and the existing global economy multipliers', () => {
  const f = fixture();
  f.run('M.ch=3;M.maxCh=3;M.up.stage=2;M.legacy.rich=2;TS.coin=.25;TS.ks.greed=true;');
  f.start(); f.run('G.bo.coin=1.5;G.R.eight=8;G.fever=1;openPack(G.boss);');
  const expected = 540 * 4 * 1.6 ** 2 * 1.8 * 1.25 * 2.5 * 1.5 * 8 * 2;
  const {M, G} = f.state();
  assert.ok(Math.abs(M.money - expected) < 1e-7); assert.equal(G.earned, M.money);
  assert.equal(M.ch, 4);
});

test('ordinary group damage and legacy overkill averages never inflate a fresh boss', () => {
  const low = fixture(), high = fixture();
  low.run('M.dealtAvg=1;'); high.run('M.dealtAvg=1e12;');
  assert.equal(high.start(), low.start());
});

test('the first boss has a finite cap even with extreme single-shot damage or stale lastBossHp', () => {
  const f = fixture(); f.run('damage=1e9;M.lastBossHp=1e12;');
  assert.equal(f.start(), 42 * 12);
});

test('the cross-chapter cap bounds the entire HP calculation, including the base term', () => {
  const f = fixture(); f.run('M.ch=3;M.maxCh=3;M.up.stage=3;M.lastBossHp=100;damage=1e9;');
  assert.equal(f.start(), 1200);
});

test('retries keep HP stable after upgrades and normal rounds; a new chapter gets a new basis', () => {
  const f = fixture(); const hp = f.start();
  f.run('damage=100;M.up.stage=3;M.dealtAvg=1e9;');
  assert.equal(f.start(), hp);
  f.run('M.lastBossHp=G.boss.max;M.ch=2;M.maxCh=2;');
  assert.ok(f.start() > hp); assert.equal(f.state().M.bossD.ch, 2);
});

test('legacy first-attempt damage survives migration while its total-damage floor is discarded', () => {
  const f = fixture();
  f.run('M.bossD={ch:1,d:3,dealt:1e12};damage=100;');
  assert.equal(f.start(), 78); assert.equal(f.state().M.bossD.d, 3);
});

test('a saved current boss snapshot survives reload without recalculating stronger HP', () => {
  const original = fixture(); const hp = original.start();
  const restored = fixture();
  restored.run(`M.bossD=${JSON.stringify(original.state().M.bossD)};damage=100;M.up.stage=3;`);
  assert.equal(restored.start(), hp);
});

test('missing or zero previous-boss HP still yields a positive finite boss in later chapters', () => {
  for (const previous of ['undefined', '0']) {
    const f = fixture(); f.run(`M.ch=7;M.maxCh=7;M.lastBossHp=${previous};`);
    const hp = f.start(); assert.ok(Number.isFinite(hp) && hp > 0);
  }
});

test('normal damage accounting excludes overkill and cannot count a removed pack twice', () => {
  const f = fixture(); f.start();
  f.run('openPack=p=>G.packs.splice(G.packs.indexOf(p),1);var normal={hp:5,hit:0,acid:0};G.packs=[normal];G.dealt=0;dmgPack(normal,100);dmgPack(normal,100);');
  assert.equal(f.state().G.dealt, 5);
});

test('prestige clears the prior run boss basis, growth cap and normal-output history', () => {
  const f = fixture(); f.start(); f.run('M.soul=0;M.prestiges=0;M.lastBossHp=5000;M.dealtAvg=1e9;M.goal=400;prestige();'); const goalBefore = 400;
  const {M} = f.state();
  assert.equal(M.ch, 1); assert.equal(M.bossD, undefined);
  assert.equal(M.lastBossHp, undefined); assert.equal(M.dealtAvg, undefined);
  assert.equal(M.goal, Math.max(8, Math.round((goalBefore || 8) * 0.3))); assert.equal(M.streak, 0);   // 转生保留三成目标，连胜清零
});
