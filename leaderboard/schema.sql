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
