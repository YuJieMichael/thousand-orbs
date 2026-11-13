-- 千珠落尽排行榜：每个玩家在每个榜上只留一条最好成绩
CREATE TABLE IF NOT EXISTS scores (
  board TEXT    NOT NULL,            -- progress / coins / streak / chain
  pid   TEXT    NOT NULL,            -- 浏览器本地随机生成的玩家 id
  name  TEXT    NOT NULL,            -- 公开显示的昵称
  value REAL    NOT NULL,            -- 成绩，越大越好
  tb    REAL    NOT NULL DEFAULT 0,  -- 同分时比这个，越小越好（进度榜：用了多少轮）
  ts    INTEGER NOT NULL,            -- 最后一次刷新成绩的时间（毫秒）
  PRIMARY KEY (board, pid)
);
CREATE INDEX IF NOT EXISTS scores_rank ON scores (board, value DESC, tb ASC);

-- 简单的按 IP 限流：每分钟最多 20 次提交
CREATE TABLE IF NOT EXISTS hits (
  ip  TEXT    PRIMARY KEY,
  win INTEGER NOT NULL,
  n   INTEGER NOT NULL
);

-- 匿名统计：每轮结算一条（只有随机玩家 id，不含昵称）
CREATE TABLE IF NOT EXISTS rounds (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  ts      INTEGER NOT NULL,          -- 毫秒
  day     TEXT    NOT NULL,          -- UTC 日期 YYYY-MM-DD
  pid     TEXT    NOT NULL,
  kind    TEXT    NOT NULL,          -- normal / elite / boss / chal
  ch      INTEGER NOT NULL,          -- 当前章节
  max_ch  INTEGER NOT NULL,          -- 最远章节
  round   INTEGER NOT NULL,          -- 这是玩家的第几轮
  win     INTEGER NOT NULL,          -- 普通/精英：目标达成；首领：击败；挑战：成功
  opened  INTEGER NOT NULL,
  coins   REAL    NOT NULL,
  dur     REAL    NOT NULL,          -- 这一轮多少秒
  main_sch TEXT,                     -- 装备最多的流派
  cards   TEXT,                      -- 装备的卡 id，逗号分隔
  chal    TEXT,                      -- 挑战关卡 id
  mobile  INTEGER NOT NULL DEFAULT 0,
  v       TEXT
);
CREATE INDEX IF NOT EXISTS rounds_day ON rounds (day);
CREATE INDEX IF NOT EXISTS rounds_pid ON rounds (pid);

-- 幽灵对战：每个榜只留榜首那一次的进度曲线（JSON 数组：每秒累计开了几包）
CREATE TABLE IF NOT EXISTS ghosts (
  board TEXT    PRIMARY KEY,
  pid   TEXT    NOT NULL,
  name  TEXT    NOT NULL,
  v     REAL    NOT NULL,
  tr    TEXT    NOT NULL,
  ts    INTEGER NOT NULL
);
