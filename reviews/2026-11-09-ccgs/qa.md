# 千珠落尽 / Thousand Orbs：QA 探索测试报告

- **角色 / 方法**：qa-tester（CCGS 的 smoke-check、playtest-report、bug-report 流程），Playwright 1.63 + Chromium headless 自动化探索测试
- **构建**：`/home/claude/thousand-orbs/index.html`，GAME_V `2026-11-09.7`；英文版 `en/index.html`
- **日期**：2026-11-09
- **时钟**：用假时钟，接管 `requestAnimationFrame` 和 `performance.now`，每步 1/30 秒，`Math.random` 带种子，可以复现。`setTimeout` 走真实时间，所以弹窗锁定、开场动画这些按真实时长测。
- **网络**：除了 `file:` 和 `data:`，所有请求都拦截，并带 `?dev=1`。整个测试期间只拦到 Google Fonts 的请求，没有发出任何统计或排行榜上传。
- **工作目录**：`/tmp/claude-0/-home-claude/1360015f-2c3c-51c2-bf42-078d0ae32e9f/scratchpad/review/qa/`
  - 脚本：`lib.cjs`、`driver.cjs`、`s1_fresh.cjs` 到 `s7.cjs`
  - 截图：`shots/`
- 没有修改 `/home/claude/thousand-orbs` 下的任何文件。

---

## 1. Smoke Check 结论

| 项目 | 结果 |
|---|---|
| 自动化测试 `node --test tests/*.cjs` | **48/48 通过**，0 失败，约 0.6 秒 |
| 启动（中文 / 英文） | 通过，没有 pageerror |
| 新玩家流程：选语言 → 开场（完整播放 / 跳过）→ 教学关 → 首次升级引导 | 通过 |
| 连续 45 个回合（普通、精英、首领、黑市、奇遇、深入金库），从第 2 章打到第 6 章，掉心直到本局结束 | 通过：没有卡死、没有 JS 报错，每回合后的存档都通过 `normalizeSave` 校验 |
| 存档 / 刷新 / 损坏恢复 | 功能正常，但**刷新可以规避惩罚**（BUG-003、BUG-004） |
| 熔金转生、每日挑战、语言切换、加速、手册、静音、提前结束、窗口缩放 | 基本正常，有小问题 |
| 控制台错误 | 只有 1 类：开场动画在后台继续跑时报 TypeError（BUG-006） |

**结论：PASS WITH WARNINGS（可以交给 QA，但建议先修 BUG-001 到 BUG-004）。** 没有 S1 级别的崩溃，也没有存档损坏。不过有 1 个 S2 的界面状态错乱：精英奖励弹窗与下一轮的竞态，会导致回合在后台运行、可以不结算就跳过。另外有 3 个可以被利用来规避惩罚的问题。

---

## 2. 缺陷列表（按严重度）

| ID | 标题 | 严重度 | 频率 |
|---|---|---|---|
| BUG-001 | 精英奖励「三选一」在下一轮开始后才弹出：回合在后台运行，结算页盖在进行中的回合上 | **S2** | 必现（在 350ms 内点路线） |
| BUG-002 | 深入金库每层的结算页显示「奖励 +∞（本轮金币的 NaN%）」「首领进度 +1」 | **S3** | 必现 |
| BUG-003 | 回合中刷新页面：这一轮作废，不掉心、不降目标，首领战也一样，可以用来躲过「本局结束」 | **S3** | 必现 |
| BUG-004 | 深入金库层中刷新后可以直接「撤离」，绕过「被困就全丢」的风险 | **S3** | 必现 |
| BUG-005 | 熔金转生后，上一世奇遇留下的诅咒和祝福仍然生效（`delete M.nextBoon` 被写进了注释） | **S3** | 必现 |
| BUG-006 | 开场动画在 250ms 内跳过，后台计时器继续翻页：约 20 秒后报 TypeError；如果期间重看开场，页面会被提前翻走 | **S4** | 必现（快速跳过时） |
| BUG-007 | 金币溢出成 Infinity 后，此后每次保存都失败，而且没有自动钳制 | **S4** | 只在极端数值下出现 |
| BUG-008 | 台面宝珠最多 61 颗，比 README 写的硬上限 60 多 1 颗 | **S4** | 偶发（压力测试） |
| OBS-1 | 路线、首领按钮没有防重入：同一按钮在一帧内收到两次 click 会连开两轮 | S4（观察） | 只能用程序触发 |

---

### BUG-001：精英奖励「三选一」与下一轮的竞态，回合在结算页底下继续运行

- **Severity**：S2-High · **Priority**：P1
- **Category**：Gameplay / UI · **System**：结算页 `showBetween` / `openPick`
- **Frequency**：Always（只要在结算页出现后 350ms 内点了下一轮的路线按钮）
- **Regression**：Unknown

**前置条件**：已开放路线和地图（`M.maxCh>=2`），刚达成一轮精英。

**复现步骤**
1. 打一轮精英并达成目标，进入结算页。这时 `G.pendingPick=1`，代码会在 350ms 后弹出「⚔️ 精英奖励 · 三选一」。
2. 在 350ms 内点底部的任意路线按钮，比如「普通 · 左 ▶」。连点发射的玩家在回合刚结束时很容易误点到这里。
3. 下一轮开始后，三选一弹窗出现在台面上方。这时 `G.paused=false`，物理和计时在后台继续走（实测弹窗期间 `G.time` 走了 2.1 秒）。
4. 选一张卡。`openPick` 的回调执行 `showBetween()`，结算页盖在正在进行的回合上（`running=true`，`#ov` 显示）。标题是「第 12 轮 · 结算」，还显示「目标没达成 0/14 包」，可实际上这一轮还没打完。
5. 在这个过期的结算页上再点一个路线：上一轮不经过 `endRound` / `settleRoute` 就被丢掉。不掉心、不算目标，地图前进一格（`M.map.r` 从 0 变成 1，`M.round` 加 1）。

**期望**：精英奖励只在结算页还在显示时弹出。如果已经离开结算页，奖励要么留到下次结算再给，要么开局前强制先选。选完卡不应该在回合进行中打开结算页。

**实际**：弹窗盖在运行中的回合上；选完卡后结算页盖住回合，可以借此跳过一轮而不受惩罚。

**证据**
- 截图：`shots/20_race_pick_over_round.png`（弹窗下面是新一轮台面，「目标 0/14 包」）
- 截图：`shots/22_stale_overlay_running.png`（回合在运行，结算页显示「目标没达成 0/14」）
- 日志：`after 500ms {"running":true,"paused":false,"ended":false,"ov":false,"pop":true,"popTitle":" 精英奖励 · 三选一"}`
- 日志：`stale: clicked route while previous round unfinished {"round":12,"mapr":0,"hearts":3} -> {"round":13,"mapr":1,"hearts":3,"running":true}`
- 代码：`index.html:2591`

  ```js
  if(G.pendingPick){ G.pendingPick=0; setTimeout(()=>openPick({minRar:'SR',title:'⚔️ 精英奖励 · 三选一'},()=>showBetween()),350); }
  ```

  这个 setTimeout 没有检查 `running`，也没有检查 `G` 是否已经换成新一轮；回调里无条件调用 `showBetween()`。
- **建议**：setTimeout 里先判断 `if(running||G!==g0) { /* 补发或延后 */ return; }`；回调改成 `()=>{ if(!running) showBetween(); }`。另外，弹窗显示期间应该暂停回合，或者禁用路线按钮。

---

### BUG-002：深入金库每层结算显示「奖励 +∞（本轮金币的 NaN%）」「首领进度 +1」

- **Severity**：S3-Medium · **Priority**：P2
- **Category**：UI · **System**：结算页文字（goalMsg）
- **Frequency**：Always

**复现步骤**
1. 地图上进入 🕳️「深入金库」节点（或调用 `delveStart()`）。
2. 达成第 1 层目标，回合结束。
3. 看结算页。

**期望**：只显示「深入金库 · 第 N 层打通」那一块。深入金库不算连胜、不给连胜奖励、不算首领进度（README 原文：「深入金库不改本章目标，也不算连胜和卡包强度」）。

**实际**：在金库那块下面，又多出一块普通轮的目标卡片：「🎯 目标达成 11/8 包 · 连胜 0 · 奖励 **+∞**（本轮金币的 **NaN%**，连胜越长越多）　首领进度 +1 · 下一轮目标 10 包」。长跑测试的第 21 回合也出现了同样的文字。

**证据**
- 截图：`shots/60_delve_settle_nan.png`
- 不变量检查日志：`INV[post21] text has NaN/undefined/Infinity: …奖励 +∞（本轮金币的 NaN%…`
- 代码：`index.html:2534`

  ```js
  const goalMsg=G.packs&&G.route?(G.goalOk?…+${f(G.goalBonus)}…${pct(G.goalK)}…
  ```

  `settleRoute`（约第 1470 行）在 `route==='delve'` 时，先设置了 `G.goalOk`，然后提前 `return`，所以 `goalBonus` 和 `goalK` 都没有赋值，是 undefined。
- **建议**：把条件改成 `G.packs&&G.route&&G.route!=='delve'`。

---

### BUG-003：回合中刷新页面，这一轮作废、不受惩罚（包括首领战），可以躲过「本局结束」

- **Severity**：S3-Medium（玩法漏洞，会影响路线 / 命数系统的意义）· **Priority**：P2
- **Category**：Gameplay / Save · **System**：存档与回合生命周期
- **Frequency**：Always

**复现步骤**
1. 在地图上只剩 1 颗 ❤️ 时进入首领战（或者任意普通 / 精英轮），打到明显会输的局面。
2. 刷新页面，或者关掉标签页再打开。
3. 回到「欢迎回来」页面。

**期望**：中途离开的回合要么能恢复，要么按失败结算（掉心、降目标）。

**实际**
- 首领战：刷新前后都是 `hearts 1`，「👑 挑战首领」按钮还在，没有掉心，`lastBossHp` 也没有记录。对照组：同样的局面点「提前结束」，会掉到 0 心，触发 `runOver`，地图重置。
- 普通轮：刷新前已开 46 包、ammo 0，刷新后 `M.round` 和 `M.map.r` 已经推进，但没有结算，也没有掉心。这一轮里赚到的金币已经保存了（运行中每 5 秒存一次，切到后台时也会存）。

**证据**
- 日志：`reload during boss (1 heart left) {"hearts":1,"tries":1,"round":11,"hp":0.5} -> {"hearts":1,"tries":1,"round":11,"boss":true}`
- 日志：`control: boss end early {"hearts":3,"runOver":true,"r":-1}`
- 截图：`shots/40_reload_midround.png`
- 代码：
  - `index.html:2712`：`setInterval(()=>{ if(running) save(); },5000)`，回合中会保存金币，但存档里没有「回合进行中」的标记。
  - `index.html:2705`：`finishLoad()` 遇到 `M.round>0` 就直接 `showBetween()`。
- **建议**：开局时在存档里写一个 `inRound:{route,map节点,isBoss}`；读档时如果发现有这个标记，就按失败调用 `settleRoute`（或 `loseHeart`）再显示结算页。

---

### BUG-004：深入金库层中刷新后，可以直接「撤离」带走背包

- **Severity**：S3-Medium · **Priority**：P2
- **Category**：Gameplay · **System**：深入金库（搜打撤）
- **Frequency**：Always

**复现步骤**
1. 深入金库打通第 1 层，点「🕳️ 继续」进入第 2 层。
2. 打到一半，眼看目标达不成。
3. 刷新页面。

**期望**：没打完的层按「被困」处理：背包全丢，并掉 1 颗 ❤️。

**实际**：刷新后 `M.delve` 还是 `{layer:2,…}`，结算页出现「🏃 撤离 / 🕳️ 继续」两个按钮，点「撤离」能安全带走背包。「被困就全丢」的风险被完全绕过。另外，这一层打到一半赚的金币已经直接进了余额，没有进背包。

**证据**
- 日志：`reload mid delve L2: {"layer":2,…} -> {"layer":2,…} ["dvOut","dvGo"]`，随后 `extract ok {"delve":null,"h2":"深入金库 · 撤离成功"}`
- 截图：`shots/41_reload_delve.png`
- 代码：
  - `index.html:972`：`delveNext()` 先保存 `layer++` 再开局。
  - `index.html:974`：`delveSettle()` 只在 `endRound` 时调用。
- **建议**：和 BUG-003 一起修，用同一个回合进行中标记；读档时发现 `route==='delve'`，就调用 `delveSettle(false)`。

---

### BUG-005：熔金转生后，上一世的奇遇诅咒 / 祝福仍然生效

- **Severity**：S3-Medium · **Priority**：P3
- **Category**：Gameplay · **System**：熔金转生 `prestige()`
- **Frequency**：Always

**复现步骤**
1. 在奇遇里拿到下一轮生效的诅咒（比如「诅咒宝箱 → 加固」，设置 `M.nextCurse='tough'`）或祝福（「流浪工匠」或「许愿泉」，设置 `M.nextBoon`）。
2. 不打下一轮，直接去「更多 → 传承」，点两次「🔥 熔金转生」。
3. 开始转生后的第一轮。

**期望**：转生是重新开始，上一世留下的一次性效果应该清掉。

**实际**：转生后 `nextCurse:"tough"`、`nextBoon:"ammo"` 仍然存在，第一轮开局提示「诅咒：加固」，祝福 `["ammo"]` 也生效了。

**证据**
- 日志：`prestige … -> {"soul":13,"ch":1,…,"nextCurse":"tough","nextBoon":"ammo",…}` 和 `first round after prestige {"curse":"加固","boons":["ammo"]}`
- 截图：`shots/91_after_prestige.png`
- 代码：`index.html:759`（`en/index.html` 第 759 行也一样），`delete M.nextBoon;` 写在行尾的 `//` 注释后面，所以永远不会执行；也没有任何地方清理 `M.nextCurse`：

  ```js
  … M.streak=0; // 转生保留三成目标：卡牌和传承都还在，实力比新号强得多 delete M.nextBoon;
  ```

- **建议**：把 `delete M.nextBoon; M.nextCurse=null;` 移到注释前面。可以在 `tests/save.test.cjs` 的转生清理测试里加一条断言。

---

### BUG-006：开场动画快速跳过后，后台计时器继续翻页（报 TypeError，并干扰重看开场）

- **Severity**：S4-Low · **Priority**：P3
- **Category**：UI / Script error · **System**：开场 `playStory`
- **Frequency**：Always（在开场出现后 250ms 内点「跳过 ›」时）

**复现步骤**
1. 新档选完语言后，开场一出现就立刻点「跳过 ›」（250ms 内）。
2. 等大约 20 秒，看控制台。
3. 也可以在第 1 步之后的 20 秒内，在开始界面点「▶ 开场」重看。

**期望**：跳过后开场的所有计时器都停掉。

**实际**
- 第 2 步：大约 20 秒后出现 `TypeError: Cannot read properties of null (reading 'style') at show (index.html:2503)`。这时 `#story` 的内容已经清空，旧的翻页链还在执行 `el.querySelector('.sh').style.display='none'`。
- 第 3 步：旧的翻页链在新开场的 DOM 上切换 `.on`，并隐藏 `.sh` / `.dots`，导致重看的开场被提前翻到最后一页（实测比正常快约 1 秒）。

**证据**
- 错误堆栈：`at show (index.html?dev=1:2503:50)`，`at index.html?dev=1:2504:117`
- 日志：`replay page sequence (500ms) 1 1 1 2 2 … 4 4 4`
- 代码：`index.html:2509`，`setTimeout(()=>show(0),250)` 没有放进 `timers` 数组，所以 `finish()` 里的 `clear()` 清不掉它；`show()` 开头也没有判断 `ended`。
- **建议**：改成 `timers.push(setTimeout(()=>show(0),250))`，并在 `show` 开头加 `if(ended) return;`。

---

### BUG-007：金币溢出成 Infinity 后，此后每次保存都失败

- **Severity**：S4-Low · **Priority**：P4（只在极端数值下出现）
- **Category**：Save · **System**：经济 / 存档

**复现步骤**：`M.money=1.7e308; M.money*=10; save();`，或者在后期某个乘法溢出时出现同样情况。

**期望**：金币钳制在 `Number.MAX_VALUE` 以内，存档继续能写。

**实际**：`normalizeSave` 拒绝 Infinity，顶部一直显示保存失败的警告（`#saveWarning`），之后的所有进度都存不进去，直到金币被改回有限值。好处是不会损坏已有的存档。另外，1e300 级别的金币显示为 `1.00e+300`，买升级正常。

**证据**
- 日志：`money overflow -> {"money":null,"warn":true,"blocked":false}`
- 截图：`shots/71_money_infinity.png`
- **建议**：在 `earn()` 和 `spend()` 里钳制 `M.money=Math.min(M.money,Number.MAX_VALUE)`。

---

### BUG-008：台面宝珠最多 61 颗，比硬上限 60 多 1 颗

- **Severity**：S4-Low · **Priority**：P4
- **Category**：Performance · **System**：宝珠上限

**复现步骤**：后期构筑（星轨、分裂、镜像、倾泻 + 回响），倾泻 88 发，再加分裂祝福，持续发射。

**期望**：README 写的是「连发、倾泻在台面满 60 颗时会排队等待」。

**实际**：最多 61 颗（主珠 50 颗）。原因是 `shoot()` 里的发射卡 `launch` 钩子会额外生成主珠，`o.main` 主珠不受 `BALL_MAX` 限制，所以队列检查过后还会多出 1 颗。影响很小：飘字最多 40 条，粒子最多 390 个，都在限制以内；压力测试大约 7ms 一帧。

**证据**
- 日志：`CAP realistic: maxBalls 61 maxMain 50 maxFx 40 maxParts 390`
- 截图：`shots/72_ball_cap.png`
- 代码：`index.html:1619` 和 `index.html:1273`

---

### OBS-1（观察）：路线 / 首领按钮没有防重入

用程序在同一帧里对同一个 `[data-route]` 连续 `click()` 两次，会调用两次 `startRound`（`M.round` 从 1 变成 3）。真实鼠标双击时，第一下之后遮罩已经隐藏，第二下落在画布上，所以**真人基本触发不了**：实测真实 `dblclick` 首领按钮，`bossTries` 只加 1。建议在 `startRound` 开头加 `if(running) return;`，顺便也能挡住 BUG-001 第 5 步那种过期按钮。

---

## 3. 测试覆盖

### 已测试（通过，或问题已在上面记录）

**新玩家流程**
- 双语选语言界面，推荐按钮会高亮。
- 选「中文」后进入开场：完整自动播放约 23.8 秒，每页约 4–5 秒，结束后设置 `guide.story=1`。
- 跳过开场、点击开场加速、开始界面「▶ 开场」重看、「📖 游戏手册」按钮。
- 选「English」后跳到 `en/index.html`。英文开始界面除了切换按钮「中文」，没有其他中文。
- 教学关：画布真实点击 3 次后进到 `step:2`；整轮结束后设置 `guide.tut=1`。
- 首次升级引导 `#learnUpgrade` 能跳到升级页。
- 双击「开启秘藏」只开一轮。

**连续 45 个回合（真实点击 `.foot` 按钮）**
- 普通、精英（含 SR+ 三选一）、首领（第 2→6 章，4 次胜利、1 次失败）。
- 黑市：10 连买两次、流派三选一、封印。
- 奇遇：铸珠匠、迷雾等，选项用双击。
- 深入金库：继续到第 2 层被困、撤离。
- 掉心 3 次触发「本局结束」，一共 3 次；本局结束后地图和心数重置正确。
- 每个回合后都检查不变量：存档能过 `normalizeSave`、余额是有限值、心数在 0–3 之间、卡组不重复且不超过技能槽、没有「运行中但遮罩显示」、没有卡死、页面文字里没有 NaN / undefined / Infinity。只在深入金库那一回合查出 BUG-002。

**提前结束按钮**
- 点一下变成「确认结束？」，再点一下才结束；超过 3 秒自动复原。
- 结束后正确掉心、降目标。

**刷新与存档**
- 回合中、结算页、深入金库、首领战、每日挑战中途刷新，状态都能保留并通过校验（发现了 BUG-003、BUG-004）。
- 写入损坏的存档：显示「找回你的进度」恢复界面，点「恢复这份备份」能回到第 10 轮。

**熔金转生**
- 需要点两次确认。转生后回到第 1 章、地图重建、目标按三成保留、标题显示「熔金转生完成」（发现了 BUG-005）。

**每日挑战**
- 固定 6 张 Lv6 卡、30 颗宝珠；结算记录 best、tries，第一次完成 +2 金魂。
- 「再来一次」可以用，提前结束只增加 tries。
- 刷新后 `TS` 和 `DAILY` 能复原，个人升级没有受影响。

**中英文切换**
- 在设置里切换中→英→中，进度共享（round 和 money 一致）。
- 英文版遍历了 13 个页签，以及一轮完整结算页，都没有残留中文。

**加速**
- 按钮在 ×1、×2、×3 之间循环，快捷键 F 也能切换。
- ×3 时每 30 帧游戏时间走 2.97 秒，符合预期。

**手册**
- 回合中打开会暂停，H 和 Esc 能切换 / 关闭，关闭后继续。
- 在祝福弹窗上用 H 打开、再关闭，回合仍保持暂停，祝福弹窗还在。
- 手册打开时按空格不会发射。

**静音**：按钮和快捷键 M 都能切换。

**窗口缩放**
- 回合中和结算页分别在 1280×800、320×568、800×360、390×760 下测试，都没有横向滚动条。
- 底部路线栏在 320 宽时不溢出（`foot [19,301]`）。

**极端数值**
- 1e300 金币：显示和购买都正常。
- Infinity 金币：见 BUG-007。
- 目标 9e15：按钮显示「开 9000000000000000 包」，没有千分位，属于外观问题。
- 宝珠上限压力测试：见 BUG-008。

**故意破坏**
- 路线按钮真实双击、首领按钮双击、事件选项双击、两次点「跳过」、结算页上按空格、在 350ms 内点路线（发现 BUG-001）。

**自动化测试**：48/48 通过。

### 没有覆盖 / 受限

- **真实触屏**：没有测 touchstart、touchend、按住连发（TS.hold）、手机上点金币彩蛋，只测了鼠标和键盘。
- **音频**：只测了 `M.mute` 状态和按钮，没有验证真实的 WebAudio 输出；headless 环境下没有声音。
- **排行榜和统计上传**：网络全部拦截，又开着 dev 模式，所以 `lbAskGo` 上榜、`dailySubmit` 补传、断网重试都没有测。
- **挑战关卡**：7 个关卡、秘卡彩蛋（Konami、敲门、888）、星盘点亮的具体效果、基石开关、配装自动换装，都只顺带经过，没有逐个验证。
- **导出 / 导入存档码**：自动化测试已经覆盖，这次没有在界面上操作。
- **首领二阶段**：特写镜头（`G.cine`）期间点击，没有专门测。
- **PWA / 添加到主屏幕**、`file:` 以外的语言自动跳转（代码在 `file:` 协议下不会生效）都没有测。
- **假时钟的局限**：rAF 和 `performance.now` 是假的，`setTimeout` 是真实的。和时间有关的竞态（比如 BUG-001）是按真实毫秒复现的，但真实浏览器里每帧的耗时可能不同。
- **用时**：总共约 15 分钟（长跑约 6 分钟，其余是专项测试）。
