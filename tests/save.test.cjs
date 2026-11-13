const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Exercise the production single-file save boundary, not a duplicate implementation.
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const source = html.slice(html.indexOf("const KEY='thousand-orbs-run-v1';"), html.indexOf('// ================= 升级 ================='));
const key = 'thousand-orbs-run-v1', backup = key + '-backup';
function fixture() {
  const values = new Map();
  const failures = { read: false, write: null, notices: 0 };
  const context = vm.createContext({
    byId: { heavy: {}, acid: {}, coin: {} },
    newPid: () => '0123456789abcdef01234567',
    showSaveFailure: () => { failures.notices++; },
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    localStorage: {
      getItem(k) { if (failures.read) throw new Error('storage denied'); return values.get(k) ?? null; },
      setItem(k, v) { if (failures.write === k) throw new Error('quota'); values.set(k, String(v)); },
    },
  });
  vm.runInContext(source, context);
  const run = code => vm.runInContext(code, context);
  const state = () => JSON.parse(run('JSON.stringify(M)'));
  const codeFor = changes => {
    const data = { ...state(), ...changes };
    const s = JSON.stringify(data); let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return 'JZMC1.' + Buffer.from(s).toString('base64') + '.' + (h >>> 0).toString(36);
  };
  const importCode = code => { context.inputCode = code; return run('importCode(inputCode)'); };
  return { values, failures, run, state, codeFor, importCode };
}

test('valid current save round-trips without losing progression or extensions', () => {
  const f = fixture();
  f.run("M.money=12345; M.owned.heavy=8; M.deck=['heavy']; M.bossD={ch:1,d:2,dealt:30}; M.ksOff={greed:1}; M.lastBossHp=1200; M.stats=false; save();");
  const code = f.run('exportCode()');
  f.run('M.money=0; M.deck=[];'); f.importCode(code);
  assert.equal(f.state().money, 12345); assert.deepEqual(f.state().deck, ['heavy']);
  assert.equal(f.state().owned.heavy, 8); assert.equal(f.state().bossD.dealt, 30); assert.equal(f.state().stats, false);
  assert.deepEqual(f.state().ksOff, { greed: 1 }); assert.equal(f.state().lastBossHp, 1200);
});

test('bad checksum and invalid structures leave live state and both slots untouched', () => {
  const f = fixture(); f.run("M.money=100; M.owned.heavy=2; M.deck=['heavy']; save();");
  const before = f.state(), slots = [...f.values];
  const bad = [{ deck: {} }, { owned: null }, { up: [] }, { money: -1 }, { money: '12' }, { up: { dmg: 1.5 } },
    { guide: { aim: {} } }, { stats: 'yes' }, { routes: ['unknown'] }, { lbSent: { coins: { value: -1 } } }, { saveV: 2 },
    { ksOff: 'greed' }, { ksOff: { greed: {} } }, { lastBossHp: -1 }];
  assert.throws(() => f.importCode(f.run('exportCode()') + 'bad'));
  for (const change of bad) assert.throws(() => f.importCode(f.codeFor(change)), JSON.stringify(change));
  assert.deepEqual(f.state(), before); assert.deepEqual([...f.values], slots);
});

test('boss HP snapshots survive export/import alongside legacy save compatibility', () => {
  const f = fixture();
  f.run('M.bossD={ch:2,d:8,hp:840,v:2};M.lastBossHp=120;save();');
  const code = f.run('exportCode()');
  f.run('delete M.bossD;delete M.lastBossHp;'); f.importCode(code);
  assert.deepEqual(f.state().bossD, {ch:2,d:8,hp:840,v:2});
  assert.equal(f.state().lastBossHp, 120);
});

test('nonfinite and prototype-bearing inputs are rejected before live adoption', () => {
  const f = fixture();
  assert.throws(() => f.run('adopt({...fresh(),money:Infinity})'));
  assert.throws(() => f.run('adopt(JSON.parse(\'{"owned":{},"up":{},"__proto__":{"x":1}}\'))'));
  assert.equal(f.state().money, 0);
});

test('malformed expedition data is dropped on import, valid runs are kept', () => {
  const f = fixture();
  for (const r of ['5', '"x"', '{}', '{squad:"zzz",danger:0,hearts:3}', '{squad:"std",danger:99,hearts:3,over:"win",score:1000}'])
    assert.equal(f.run(`normalizeSave({...fresh(),run:${r}}).run`), null, r);
  assert.ok(f.run('normalizeSave({...fresh(),run:{squad:"std",danger:0,hearts:3,score:10,over:null}}).run'));
  assert.ok(f.run('normalizeSave({...fresh(),run:{squad:"std",danger:1,hearts:3,daily:"20261109"}}).run'));
});
test('missing older fields get defaults while migration information is retained', () => {
  const f = fixture();
  f.run("adopt({owned:{heavy:4,removed:8},up:{dmg:3},deck:['heavy','removed','heavy'],round:3,treeV:1,treeSpent:100});");
  assert.equal(f.state().up.ammo, 0); assert.equal(f.state().legacy.pow, 0);
  assert.equal(f.state().treeV, 1); assert.equal(f.state().treeSpent, 100);
  assert.deepEqual(f.state().deck, ['heavy']); assert.deepEqual(f.state().guide, {});
});

test('backup keeps the previous distinct valid state, including after import', () => {
  const f = fixture(); f.run('M.money=10; save(); M.money=20; save(); save();');
  assert.equal(JSON.parse(f.values.get(backup)).money, 10);
  f.run('restoreBackup(); save();');
  assert.equal(f.state().money, 10); assert.equal(JSON.parse(f.values.get(backup)).money, 20);
  f.importCode(f.codeFor({ money: 99 })); f.run('save();');
  assert.equal(f.state().money, 99); assert.equal(JSON.parse(f.values.get(backup)).money, 10);
});

test('failed import primary write preserves current state and recoverable progress', () => {
  const f = fixture(); f.run('M.money=10; save();');
  const old = f.state(), primary = f.values.get(key); f.failures.write = key;
  assert.throws(() => f.importCode(f.codeFor({ money: 99 })));
  assert.deepEqual(f.state(), old); assert.equal(f.values.get(key), primary);
  assert.equal(JSON.parse(f.values.get(backup)).money, 10); assert.ok(f.failures.notices > 0);
});

test('failed backup write prevents overwriting the primary', () => {
  const f = fixture(); f.run('M.money=10; save();'); const slots = [...f.values], old = f.state();
  f.failures.write = backup;
  assert.throws(() => f.importCode(f.codeFor({ money: 99 })));
  assert.deepEqual(f.state(), old); assert.deepEqual([...f.values], slots);
});

test('ordinary save failure retains live progress and can be retried', () => {
  const f = fixture(); f.run('M.money=10; save();'); f.failures.write = key;
  assert.equal(f.run('M.money=20; save();'), false); assert.equal(f.state().money, 20);
  assert.equal(JSON.parse(f.values.get(key)).money, 10);
  f.failures.write = null; assert.equal(f.run('save()'), true);
  assert.equal(JSON.parse(f.values.get(key)).money, 20);
});

test('corrupt primary without backup is retained, and automatic saves are blocked', () => {
  const f = fixture(); f.values.set(key, '{broken'); f.run('load();');
  assert.equal(f.run('saveBlocked'), true); assert.equal(f.run('saveIssue.kind'), 'corrupt');
  assert.equal(f.run('save()'), false); assert.equal(f.values.get(key), '{broken'); assert.equal(f.values.has(backup), false);
});

test('corrupt or missing primary offers backup without silently writing a fresh save', () => {
  for (const corrupt of [true, false]) {
    const f = fixture(); f.run('M.money=75; save();'); const valid = f.values.get(key);
    f.values.set(backup, valid); if (corrupt) f.values.set(key, '{broken'); else f.values.delete(key);
    f.run('M=fresh(); load();'); assert.equal(f.run('saveBlocked'), true);
    assert.equal(f.run('saveIssue.backup.money'), 75);
    if (corrupt) assert.equal(f.values.get(key), '{broken');
    f.run('restoreBackup(); save();'); assert.equal(f.state().money, 75); assert.equal(f.run('saveBlocked'), false);
    assert.equal(JSON.parse(f.values.get(key)).money, 75);
  }
});

test('unreadable storage never overwrites an unknown primary', () => {
  const f = fixture(); f.values.set(key, 'unknown-original'); f.failures.read = true; f.run('load();');
  assert.equal(f.run('saveIssue.kind'), 'storage'); assert.equal(f.run('save()'), false);
  assert.equal(f.values.get(key), 'unknown-original');
});

test('explicit reset replaces both slots with a valid fresh state', () => {
  const f = fixture(); f.run('M.money=75; save(); applySavedState(fresh(),true);');
  assert.equal(f.state().money, 0); assert.equal(JSON.parse(f.values.get(key)).money, 0);
  assert.equal(JSON.parse(f.values.get(backup)).money, 0);
});

test('existing expeditions fill new relic slots from the pending queue in order', () => {
  const f = fixture();
  f.run(html.slice(html.indexOf('const RELIC_MAX='), html.indexOf('const hasRelic=')));
  const active = ['magnet', 'dawn', 'chest', 'wall'];
  const queued = ['hammer', 'glass', 'compass', 'feather', 'gemini'];
  const run = {squad: 'std', danger: 0, hearts: 3};

  f.importCode(f.codeFor({run, relics: active, relicQ: queued}));
  assert.deepEqual(f.state().relics, [...active, ...queued.slice(0, 2)]);
  assert.deepEqual(f.state().relicQ, queued.slice(2));
  assert.equal(f.run('relicMax()'), 6);

  f.importCode(f.codeFor({run, relics: active, relicQ: queued, legacy: {relic: 2}}));
  assert.deepEqual(f.state().relics, [...active, ...queued.slice(0, 4)]);
  assert.deepEqual(f.state().relicQ, queued.slice(4));
  assert.equal(f.run('relicMax()'), 8);

  f.importCode(f.codeFor({run: {...run, daily: '20261113'}, relics: active, relicQ: queued, legacy: {relic: 2}}));
  assert.equal(f.run('relicMax()'), 6);
  assert.deepEqual(f.state().relicQ, queued.slice(2));
});
