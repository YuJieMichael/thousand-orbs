# 千珠落尽 · Thousand Orbs

一款在浏览器里玩的弹珠开包游戏：瞄准、发射宝珠，让它在铆钉和卡包之间弹跳，撞破封印开出卡牌，用卡牌技能组合出自己的流派。

## 怎么玩

在线试玩：<https://yujiemichael.github.io/thousand-orbs/>

也可以直接用浏览器打开 `index.html`，不需要安装任何东西。进度保存在浏览器本地，可以在「更多 → 设置」里导出存档码，换设备时再导入。

## 主要内容

- **5 个流派、37 张卡牌**：连击、灼烧、腐蚀、财富、引力，同流派装备越多共鸣越强。
- **6 张秘卡**：卡包里开不出来，要先按图鉴里的谜语触发彩蛋解锁。
- **星盘**：像 POE 一样从中心向外点亮的天赋树，五个方向尽头各有一块有代价的基石。
- **连锁倍率**：宝珠每撞一下倍率就涨一点，撞金钉、爆钉、分裂钉有额外效果；落底时按底部口袋（×1 / ×2 / ×5）兑现一路攒下的珠金；连撞够多进入狂热。
- **每轮目标**：开够指定数量的卡包才算数，连胜越长奖励越多，没达成就断连胜。
- **路线与珠袋**（打过第一个首领后开放）：每轮结束后选下一轮去普通、精英、黑市还是奇遇；宝珠分火珠、重珠、裂珠等类型，能看到下一颗、可以暂存。
- **五章首领**：每个首领有专属技能，半血进入第二阶段（有特写镜头）并追加技能；之后是无尽深渊。
- **排行榜**（「目标 → 排行榜」）：最远进度、单轮金币、最长连胜、单珠连锁四个榜；起个昵称就能上榜，每轮结算自动上传刷新的成绩。
- **局内三选一祝福、挑战关卡、熔金转生**。

## 文件

| 文件 | 说明 |
|---|---|
| `index.html` | 游戏本体（单文件，美术素材已压缩内嵌） |
| `feedback.html` | 独立的反馈页，需要在 claude.ai 上以 Artifact 形式运行才能保存留言 |
| `docs/card-art-prompts.txt` | 卡面插画与流派徽章的生成提示词 |
| `leaderboard/` | 排行榜后端：Cloudflare Worker + D1 数据库 |

## 排行榜后端

- Worker `thousand-orbs-board`：<https://thousand-orbs-board.achat-vente-garderie.workers.dev>
- 数据库：D1 `thousand-orbs-board`，表结构在 `leaderboard/schema.sql`
- 接口：`GET /top?board=progress|coins|streak|chain&limit=50&pid=…`，`POST /submit`
- 部署是手动的，在 `leaderboard/` 文件夹里运行 `npx wrangler@4.151.1 deploy`（改表时先跑 `npx wrangler@4.151.1 d1 execute thousand-orbs-board --remote --file schema.sql`）
- 游戏在浏览器里跑，成绩没法真正防作弊；后端只做格式、范围检查和按 IP 限流（每分钟 20 次）。如果有人刷榜，可以直接在 D1 里删那一行

## 致谢

- 界面图标来自 [Lucide](https://lucide.dev)（ISC 协议，见 `docs/LUCIDE-LICENSE`）。
- 首领立绘、卡包、卡背和主视觉由 ChatGPT 图像生成。
