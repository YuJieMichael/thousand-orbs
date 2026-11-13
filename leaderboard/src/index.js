import { CARD_NAMES, SCHOOL_NAMES } from './cards.js';
import ADMIN_HTML from './admin.html';
// 千珠落尽排行榜 Worker
// GET  /top?board=progress&limit=50&pid=xxx  → 前 N 名 + 自己的名次
// POST /submit {pid, name, scores:{progress:{value,tb}, coins:{value}, streak:{value}, chain:{value}, d20261105:{value}, w2026W46:{value}, abyss, rush, puzzle}}
// GET  /ghost?board=…  POST /ghost：每个榜榜首的进度曲线（幽灵对战用）
//
// 游戏完全跑在浏览器里，成绩没法真正防作弊；这里只做基本的格式、范围检查和限流。

const BOARDS = {
  progress: { max: 1000 },     // 到达的章节（6 起是无尽深渊），同章比用了多少轮
  coins:    { max: 1e300 },    // 单轮最高金币
  streak:   { max: 100000 },   // 最长连续达成目标
  chain:    { max: 100000 },   // 一颗宝珠落底前的最多命中
  abyss:    { max: 1e7, int: true },  // 无尽深渊：带出来的分数（tb = 打通的层数，越大越好时不用 tb，这里只当附加信息）
  rush:     { max: 1e6, int: true },  // 首领连战：首领数 × 100000 + (99999 - 用时×10)
  puzzle:   { max: 1000, int: true }, // 谜题：总星数
};
const WEEK_MS = 7 * 864e5;
// 每日挑战榜：d + UTC 日期（d20261105），值是开包数；只收前后两天以内的成绩
const DAY_MS = 864e5;
// 每周挑战榜：w + ISO 周（w2026W46），值是开包数；只收当前周和上一周的成绩
const weekStart = (y, w) => { const j4 = new Date(Date.UTC(y, 0, 4)); const mon = Date.UTC(y, 0, 4) - ((j4.getUTCDay() + 6) % 7) * 864e5; return mon + (w - 1) * WEEK_MS; };
const boardCfg = (b, forSubmit) => {
  if (BOARDS[b]) return BOARDS[b];
  const wm = /^w(\d{4})W(\d{2})$/.exec(String(b || ''));
  if (wm) { const t = weekStart(+wm[1], +wm[2]); if (!Number.isFinite(t) || +wm[2] < 1 || +wm[2] > 53 || (forSubmit && (Date.now() < t - 864e5 || Date.now() > t + 2 * WEEK_MS))) return null; return { max: 100000, int: true }; }
  const m = /^d(\d{4})(\d{2})(\d{2})$/.exec(String(b || ''));
  if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  if (!Number.isFinite(t) || (forSubmit && Math.abs(t - Date.now()) > 2 * DAY_MS)) return null;
  return { max: 100000, int: true };
};
const ORIGINS = ['https://yujiemichael.github.io', 'http://localhost:5180'];
const RATE = { win: 60_000, n: 60 }; // 每个 IP 每分钟最多 60 次（排行榜上传 + 每轮统计）

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
  if (!boardCfg(board)) return json(req, { error: 'unknown board' }, 400);
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

  const now = Date.now(), stmts = [], saved = [];
  for (const [board, s] of Object.entries(body.scores).slice(0, 8)) {
    const cfg = boardCfg(board, true);
    if (!cfg || !s || !okNum(s.value, cfg.max)) continue;
    if (cfg.int && !Number.isInteger(s.value)) continue;
    const tb = okNum(s.tb, 1e9) ? s.tb : 0;
    if (board === 'progress' && !Number.isInteger(s.value)) continue;
    saved.push(board);
    stmts.push(env.DB.prepare(
      `INSERT INTO scores (board, pid, name, value, tb, ts) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(board, pid) DO UPDATE SET value = excluded.value, tb = excluded.tb, ts = excluded.ts, name = excluded.name
       WHERE excluded.value > scores.value OR (excluded.value = scores.value AND excluded.tb < scores.tb)`
    ).bind(board, pid, name, s.value, tb, now));
  }
  // 改了昵称：所有榜上的名字一起改
  stmts.push(env.DB.prepare('UPDATE scores SET name = ? WHERE pid = ? AND name <> ?').bind(name, pid, name));
  await env.DB.batch(stmts);
  return json(req, { ok: true, saved });
}

// ================= 幽灵：每个榜只留榜首那一次的进度曲线（每秒开了几包） =================
// GET /ghost?board=w2026W46 → {name, v, tr}；POST /ghost {pid, name, board, v, tr}，只有分数不低于这个榜的榜首才收
async function ghostGet(req, env, url) {
  const board = url.searchParams.get('board');
  if (!boardCfg(board)) return json(req, { error: 'unknown board' }, 400);
  const r = await env.DB.prepare('SELECT name, v, tr FROM ghosts WHERE board = ?').bind(board).first();
  if (!r) return json(req, { error: 'none' }, 404, { 'Cache-Control': 'public, max-age=30' });
  return json(req, { name: r.name, v: r.v, tr: JSON.parse(r.tr) }, 200, { 'Cache-Control': 'public, max-age=30' });
}
async function ghostPut(req, env) {
  if (Number(req.headers.get('Content-Length') || 0) > 8000) return json(req, { error: 'too large' }, 413);
  let b; try { b = await req.json(); } catch { return json(req, { error: 'bad json' }, 400); }
  const name = cleanName(b && b.name), cfg = b && boardCfg(b.board, true);
  if (!b || !okPid(b.pid) || !name || !cfg || !okNum(b.v, cfg.max) || !Array.isArray(b.tr) || b.tr.length > 600 || !b.tr.every((x) => okNum(x, cfg.max))) return json(req, { error: 'bad request' }, 400);
  const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
  if (await limited(env, ip)) return json(req, { error: 'slow down' }, 429);
  // 只认排行榜上已经有的成绩：幽灵的分数不能比这个人在榜上的成绩高
  const sc = await env.DB.prepare('SELECT value FROM scores WHERE board = ? AND pid = ?').bind(b.board, b.pid).first();
  if (!sc || b.v > sc.value) return json(req, { error: 'not on board' }, 409);
  await env.DB.prepare(`INSERT INTO ghosts (board, pid, name, v, tr, ts) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(board) DO UPDATE SET pid = excluded.pid, name = excluded.name, v = excluded.v, tr = excluded.tr, ts = excluded.ts WHERE excluded.v > ghosts.v`)
    .bind(b.board, b.pid, name, b.v, JSON.stringify(b.tr), Date.now()).run();
  return json(req, { ok: true });
}

// ================= 匿名统计 =================
// POST /event：每轮结算一条。GET /stats：汇总（要带 Authorization: Bearer <STATS_KEY>）。GET /admin：统计页面
const KINDS = ['normal', 'elite', 'boss', 'chal'];
const clampInt = (v, lo, hi) => Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : lo;
async function event(req, env) {
  if (Number(req.headers.get('Content-Length') || 0) > 2000) return json(req, { error: 'too large' }, 413);
  let b; try { b = await req.json(); } catch { return json(req, { error: 'bad json' }, 400); }
  if (!b || !okPid(b.pid) || !KINDS.includes(b.kind)) return json(req, { error: 'bad request' }, 400);
  const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
  if (await limited(env, ip)) return json(req, { error: 'slow down' }, 429);
  const cards = Array.isArray(b.cards) ? b.cards.filter((x) => typeof x === 'string' && CARD_NAMES[x]).slice(0, 12) : [];
  const cnt = {}; cards.forEach((id) => { const s = CARD_NAMES[id][1]; cnt[s] = (cnt[s] || 0) + 1; });
  const main = Object.entries(cnt).sort((a, z) => z[1] - a[1])[0];
  const now = Date.now();
  await env.DB.prepare(
    'INSERT INTO rounds (ts, day, pid, kind, ch, max_ch, round, win, opened, coins, dur, main_sch, cards, chal, mobile, v) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
  ).bind(now, new Date(now).toISOString().slice(0, 10), b.pid, b.kind, clampInt(b.ch, 1, 1000), clampInt(b.maxCh, 1, 1000), clampInt(b.round, 0, 1e7),
    b.win ? 1 : 0, clampInt(b.opened, 0, 1e6), okNum(b.coins, 1e300) ? b.coins : 0, okNum(b.dur, 3600) ? b.dur : 0,
    main ? main[0] : 'none', cards.join(','), typeof b.chal === 'string' ? b.chal.slice(0, 16) : null, b.mobile ? 1 : 0, typeof b.v === 'string' ? b.v.slice(0, 16) : null).run();
  return json(req, { ok: true });
}
const authed = (req, env) => {
  const h = req.headers.get('Authorization') || '', k = h.startsWith('Bearer ') ? h.slice(7) : '';
  const want = env.STATS_KEY || ''; if (!want || k.length !== want.length) return false;
  let d = 0; for (let i = 0; i < k.length; i++) d |= k.charCodeAt(i) ^ want.charCodeAt(i); return d === 0;
};
async function stats(req, env, url) {
  if (!authed(req, env)) return json(req, { error: 'unauthorized' }, 401);
  const days = Math.max(1, Math.min(3650, parseInt(url.searchParams.get('days') || '30', 10) || 30));
  const since = Date.now() - days * 864e5, sinceDay = new Date(since).toISOString().slice(0, 10);
  // ?v=2026-11-05.1：只统计这个版本及以后（版本号是日期格式，按字符串比较）
  const vmin = (url.searchParams.get('v') || '').slice(0, 16) || null;
  const q = (sql, ...a) => env.DB.prepare(sql).bind(...a).all().then((r) => r.results);
  const [tot, perDay, newPer, sch, prog, boss, goal, chal, mob, lb, cardRows] = await Promise.all([
    q('SELECT COUNT(*) AS rounds, COUNT(DISTINCT pid) AS players, AVG(dur) AS dur FROM rounds WHERE ts >= ? AND (? IS NULL OR v >= ?)', since, vmin, vmin),
    q('SELECT day, COUNT(*) AS rounds, COUNT(DISTINCT pid) AS players FROM rounds WHERE ts >= ? AND (? IS NULL OR v >= ?) GROUP BY day ORDER BY day', since, vmin, vmin),
    q('SELECT d AS day, COUNT(*) AS n FROM (SELECT pid, MIN(day) AS d FROM rounds WHERE (? IS NULL OR v >= ?) GROUP BY pid) WHERE d >= ? GROUP BY d ORDER BY d', vmin, vmin, sinceDay),
    q('SELECT main_sch AS sch, COUNT(*) AS rounds, COUNT(DISTINCT pid) AS players FROM rounds WHERE ts >= ? AND (? IS NULL OR v >= ?) GROUP BY main_sch ORDER BY rounds DESC', since, vmin, vmin),
    q('SELECT mc AS ch, COUNT(*) AS players FROM (SELECT pid, MAX(max_ch) AS mc FROM rounds WHERE ts >= ? AND (? IS NULL OR v >= ?) GROUP BY pid) GROUP BY mc ORDER BY mc', since, vmin, vmin),
    q("SELECT ch, COUNT(*) AS n, SUM(win) AS w FROM rounds WHERE kind = 'boss' AND ts >= ? AND (? IS NULL OR v >= ?) GROUP BY ch ORDER BY ch", since, vmin, vmin),
    q("SELECT ch, kind, COUNT(*) AS n, SUM(win) AS w, AVG(opened) AS opened FROM rounds WHERE kind IN ('normal','elite') AND ts >= ? AND (? IS NULL OR v >= ?) GROUP BY ch, kind ORDER BY ch, kind", since, vmin, vmin),
    q("SELECT chal, COUNT(*) AS n, SUM(win) AS w, COUNT(DISTINCT pid) AS players, AVG(ch) AS act, AVG(round) AS rounds, AVG(opened) AS score, AVG(dur) AS dur FROM rounds WHERE kind = 'chal' AND ts >= ? AND (? IS NULL OR v >= ?) GROUP BY chal ORDER BY n DESC", since, vmin, vmin),
    q('SELECT mobile, COUNT(DISTINCT pid) AS players FROM rounds WHERE ts >= ? AND (? IS NULL OR v >= ?) GROUP BY mobile', since, vmin, vmin),
    q('SELECT COUNT(DISTINCT pid) AS n FROM scores'),
    q('SELECT cards FROM rounds WHERE ts >= ? AND (? IS NULL OR v >= ?) AND cards <> \'\' ORDER BY id DESC LIMIT 20000', since, vmin, vmin),
  ]);
  const cc = {}; cardRows.forEach((r) => r.cards.split(',').forEach((id) => { cc[id] = (cc[id] || 0) + 1; }));
  const cards = Object.entries(cc).sort((a, z) => z[1] - a[1]).map(([id, n]) => ({ id, name: (CARD_NAMES[id] || [id])[0], sch: (CARD_NAMES[id] || [])[1], rar: (CARD_NAMES[id] || [])[2], rounds: n }));
  return json(req, { days, vmin, total: tot[0], perDay, newPerDay: newPer, schools: sch.map((x) => ({ ...x, name: SCHOOL_NAMES[x.sch] || x.sch })), progress: prog, boss, goal, chal, mobile: mob, leaderboardPlayers: lb[0].n, cards, cardRoundsSampled: cardRows.length }, 200, { 'Cache-Control': 'no-store' });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
    try {
      if (req.method === 'GET' && url.pathname === '/top') return await top(req, env, url);
      if (req.method === 'POST' && url.pathname === '/submit') return await submit(req, env);
      if (req.method === 'POST' && url.pathname === '/event') return await event(req, env);
      if (req.method === 'GET' && url.pathname === '/ghost') return await ghostGet(req, env, url);
      if (req.method === 'POST' && url.pathname === '/ghost') return await ghostPut(req, env);
      if (req.method === 'GET' && url.pathname === '/stats') return await stats(req, env, url);
      if (req.method === 'GET' && url.pathname === '/admin') return new Response(ADMIN_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
      return json(req, { error: 'not found' }, 404);
    } catch (e) {
      return json(req, { error: 'server error' }, 500);
    }
  },
};
