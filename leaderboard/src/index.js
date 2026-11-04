// 千珠落尽排行榜 Worker
// GET  /top?board=progress&limit=50&pid=xxx  → 前 N 名 + 自己的名次
// POST /submit {pid, name, scores:{progress:{value,tb}, coins:{value}, streak:{value}, chain:{value}}}
//
// 游戏完全跑在浏览器里，成绩没法真正防作弊；这里只做基本的格式、范围检查和限流。

const BOARDS = {
  progress: { max: 1000 },     // 到达的章节（6 起是无尽深渊），同章比用了多少轮
  coins:    { max: 1e300 },    // 单轮最高金币
  streak:   { max: 100000 },   // 最长连续达成目标
  chain:    { max: 100000 },   // 一颗宝珠落底前的最多命中
};
const ORIGINS = ['https://yujiemichael.github.io', 'http://localhost:5180'];
const RATE = { win: 60_000, n: 20 };

const cors = (req) => {
  const o = req.headers.get('Origin');
  return {
    'Access-Control-Allow-Origin': ORIGINS.includes(o) ? o : ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
};
const json = (req, data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors(req), ...extra } });

// 昵称：去掉控制字符和尖括号，最多 12 个字
const cleanName = (s) => {
  const t = Array.from(String(s || '').replace(/[\u0000-\u001f\u007f-\u009f<>&"'`\\]/g, '').replace(/\s+/g, ' ').trim()).slice(0, 12).join('');
  return t.length ? t : null;
};
const okPid = (p) => typeof p === 'string' && /^[a-f0-9]{24}$/.test(p);
const okNum = (v, max) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max;

async function limited(env, ip) {
  const now = Date.now();
  const row = await env.DB.prepare('SELECT win, n FROM hits WHERE ip = ?').bind(ip).first();
  if (!row || now - row.win > RATE.win) {
    await env.DB.prepare('INSERT INTO hits (ip, win, n) VALUES (?, ?, 1) ON CONFLICT(ip) DO UPDATE SET win = excluded.win, n = 1').bind(ip, now).run();
    return false;
  }
  if (row.n >= RATE.n) return true;
  await env.DB.prepare('UPDATE hits SET n = n + 1 WHERE ip = ?').bind(ip).run();
  return false;
}

async function top(req, env, url) {
  const board = url.searchParams.get('board');
  if (!BOARDS[board]) return json(req, { error: 'unknown board' }, 400);
  const limit = Math.max(1, Math.min(100, parseInt(url.searchParams.get('limit') || '50', 10) || 50));
  const { results } = await env.DB.prepare(
    'SELECT pid, name, value, tb, ts FROM scores WHERE board = ? ORDER BY value DESC, tb ASC, ts ASC LIMIT ?'
  ).bind(board, limit).all();
  const total = (await env.DB.prepare('SELECT COUNT(*) AS c FROM scores WHERE board = ?').bind(board).first()).c;
  let me = null;
  const pid = url.searchParams.get('pid');
  if (okPid(pid)) {
    const r = await env.DB.prepare('SELECT value, tb, ts FROM scores WHERE board = ? AND pid = ?').bind(board, pid).first();
    if (r) {
      const ahead = await env.DB.prepare(
        'SELECT COUNT(*) AS c FROM scores WHERE board = ? AND (value > ? OR (value = ? AND (tb < ? OR (tb = ? AND ts < ?))))'
      ).bind(board, r.value, r.value, r.tb, r.tb, r.ts).first();
      me = { rank: ahead.c + 1, value: r.value, tb: r.tb };
    }
  }
  // 不把别人的 pid 发出去，只告诉调用者哪一行是自己
  const rows = results.map((x) => ({ name: x.name, value: x.value, tb: x.tb, me: okPid(pid) && x.pid === pid }));
  return json(req, { board, total, top: rows, me }, 200, { 'Cache-Control': 'public, max-age=15' });
}

async function submit(req, env) {
  if (Number(req.headers.get('Content-Length') || 0) > 2000) return json(req, { error: 'too large' }, 413);
  let body;
  try { body = await req.json(); } catch { return json(req, { error: 'bad json' }, 400); }
  const pid = body && body.pid, name = cleanName(body && body.name);
  if (!okPid(pid) || !name || typeof body.scores !== 'object' || !body.scores) return json(req, { error: 'bad request' }, 400);
  const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
  if (await limited(env, ip)) return json(req, { error: 'slow down' }, 429);

  const now = Date.now(), stmts = [];
  for (const [board, s] of Object.entries(body.scores)) {
    const cfg = BOARDS[board];
    if (!cfg || !s || !okNum(s.value, cfg.max)) continue;
    const tb = okNum(s.tb, 1e9) ? s.tb : 0;
    if (board === 'progress' && !Number.isInteger(s.value)) continue;
    stmts.push(env.DB.prepare(
      `INSERT INTO scores (board, pid, name, value, tb, ts) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(board, pid) DO UPDATE SET value = excluded.value, tb = excluded.tb, ts = excluded.ts, name = excluded.name
       WHERE excluded.value > scores.value OR (excluded.value = scores.value AND excluded.tb < scores.tb)`
    ).bind(board, pid, name, s.value, tb, now));
  }
  // 改了昵称：所有榜上的名字一起改
  stmts.push(env.DB.prepare('UPDATE scores SET name = ? WHERE pid = ? AND name <> ?').bind(name, pid, name));
  await env.DB.batch(stmts);
  return json(req, { ok: true });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
    try {
      if (req.method === 'GET' && url.pathname === '/top') return await top(req, env, url);
      if (req.method === 'POST' && url.pathname === '/submit') return await submit(req, env);
      return json(req, { error: 'not found' }, 404);
    } catch (e) {
      return json(req, { error: 'server error' }, 500);
    }
  },
};
