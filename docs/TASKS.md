# TASKS

## 当前阶段

V1 需求重构：单店美甲预约小程序（返图展示 + 可配置预约规则 + 审批制预约）

## 任务列表

| ID | Owner | Task | Input | Output | Depends On | Done Definition | Risk |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ARCH-001 | architect | 重写 PRD / 架构 / API / TASKS 文档以匹配新业务目标 | 用户最新需求、现有 V0 文档 | `docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/API.md`, `docs/TASKS.md` | 无 | 文档可直接指导前后端开发 | 旧需求残留导致实现偏航 |
| FE-001 | frontend | 实现顾客端首页与返图展示 | `docs/PRD.md`, UI 方向, `docs/API.md` gallery 接口 | `apps/weapp/pages/home/*`, 相关组件/服务 | ARCH-001, BE-001 | 首页具备品牌氛围、返图展示、明确预约 CTA；接口失败时有空态/兜底 | UI 风格与品牌预期偏差 |
| FE-002 | frontend | 实现顾客端预约申请流程 | `docs/API.md` availability / appointments | `apps/weapp/pages/booking/*`, `services/*` | ARCH-001, BE-002 | 顾客只能选择可预约日期与时间段；可成功提交待审核申请；表单校验清晰 | 日期/时间规则与后端口径不一致 |
| FE-003 | frontend | 实现“我的预约”状态查看页 | `docs/API.md` my appointments | `apps/weapp/pages/my-bookings/*`, `services/*` | ARCH-001, BE-002 | 顾客可按当前 OpenID 查看预约记录，并清晰看到待审核/已通过/已拒绝状态 | 开发环境 OpenID 获取方式不统一 |
| FE-004 | frontend | 实现店员端规则配置页 | `docs/API.md` booking-rules | `apps/weapp/pages/staff/rules/*`, `services/*` | ARCH-001, BE-003 | 店员可配置提前开放天数、不可预约日期、每日时间段；前端校验时间段不重叠 | 日历/时间段交互复杂度较高 |
| FE-005 | frontend | 实现店员端预约审核页 | `docs/API.md` staff appointments / review | `apps/weapp/pages/staff/appointments/*`, `services/*` | ARCH-001, BE-004 | 店员可查看待审核列表并执行通过/拒绝，结果即时反馈 | 审核状态与冲突处理提示不清晰 |
| BE-001 | backend | 提供返图展示接口与数据结构 | `docs/API.md` gallery 定义 | `apps/server/src/*` | ARCH-001 | `GET /api/v1/gallery` 可用，仅返回 active 项，排序稳定 | 图片数据来源暂时简单 |
| BE-002 | backend | 提供顾客端可预约查询与预约申请接口 | `docs/API.md` availability / appointments / my appointments | `apps/server/src/*` | ARCH-001 | 可按规则计算可预约日历；创建预约默认 pending；顾客可查询自己的预约状态 | 时间计算与边界日期容易出错 |
| BE-003 | backend | 提供店员侧预约规则读写接口 | `docs/API.md` booking-rules | `apps/server/src/*` | ARCH-001 | 规则可读可写；参数校验完整；时间段不重叠 | 规则模型设计过松导致后续维护困难 |
| BE-004 | backend | 提供店员侧预约审核接口 | `docs/API.md` staff appointments / review | `apps/server/src/*` | ARCH-001, BE-002 | 可筛选待审核列表；审核通过时做时间段占用校验；不可重复审核 | 并发下 slot 冲突处理不严谨 |
| BE-005 | backend | 接入 SQLite 持久化 | `docs/ARCHITECTURE.md` | `apps/server/src/*`, 数据文件/初始化脚本 | ARCH-001 | 规则、预约、返图数据在重启后仍保留 | 迁移复杂度超过当前骨架能力 |
| ARCH-002 | architect | 向前后端下发明确 brief，并跟踪交付 | `docs/*.md` | brief / 评审意见 | FE-001~005, BE-001~005 | 前后端任务边界清晰，不把需求模糊点甩给 worker | worker 未按统一口径实现 |
| ARCH-003 | architect | 联调验收与范围守卫 | 前后端提交结果、测试结果 | 评审结论 / 更新任务状态 | FE-001~005, BE-001~005 | 流程闭环跑通，范围外功能未混入 V1 | 商品售卖等后续诉求提前侵入 |

## 新增收口任务（2026-03-14）

| ID | Owner | Task | Input | Output | Depends On | Done Definition | Risk |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ARCH-004 | architect | 收口前后端接口口径并冻结验收基准 | 用户反馈（接口不对齐）+ `docs/API.md` | 接口对齐清单、回归验收要求 | ARCH-003 | 明确标注废弃接口、前端请求口径、验收必测接口 | 分支代码未同步导致“文档正确、运行错误” |
| FE-006 | frontend | 增加顾客/店员清晰入口与接口异常显性提示 | `docs/PRD.md`、`docs/API.md` | 首页入口与错误提示优化、请求失败可见性提升 | ARCH-004 | 用户可明确进入顾客端或店员端；接口失败时页面展示可理解提示 | 用户仍误判“页面能看就是功能可用” |
| FE-007 | frontend | 顾客身份改为 OpenID 主键（表单信息降级为补充） | `docs/API.md` 顾客身份约定 | 预约提交与我的预约页面按 OpenID 查询 | ARCH-004, BE-006 | 不再依赖手机号作为主查询键；姓名/手机号可选填 | 开发环境 OpenID 获取方式不统一 |
| BE-006 | backend | 预约数据模型升级为 customerOpenId 主键 | `docs/ARCHITECTURE.md`、`docs/API.md` | appointments 表结构与接口改造 | ARCH-004 | 创建预约与“我的预约”按 OpenID 关联，兼容 staff 审核列表展示 | 迁移已有测试数据需要一次性脚本 |
| QA-001 | frontend/backend | 新增首页返图与主链路测试用例 | 用户反馈第 5 点 + `docs/UAT_GUIDE.md` | 自动化用例/手测清单更新 | ARCH-004 | 覆盖“首页返图展示”“availability->提交->审核->回查”关键路径 | 仅测接口不测页面导致回归遗漏 |

## 本轮前端 handoff 要点

### FE-001 顾客端首页与返图展示
- 背景：首页要同时承担品牌感展示和预约入口转化
- 要改文件：`pages/home/*`、必要的公共组件与服务层
- 必须实现：
  - 品牌氛围区
  - 返图展示区
  - 明确预约 CTA
  - 空态 / 加载态 / 错误态
- 明确不做：
  - 商品售卖入口
  - 复杂动画特效
  - 顾客评论系统

### FE-002 顾客端预约申请流程
- 必须实现：
  - 日期选择
  - 可选时间段加载
  - 表单校验
  - 提交成功提示
- 明确不做：
  - 支付
  - 自动审批
  - 多员工选择

### FE-004 店员端规则配置页
- 必须实现：
  - 提前开放天数输入
  - 不可预约日期选择
  - 时间段增删改
  - 前端基础校验
- 明确不做：
  - 周期性复杂排班
  - 多门店共享规则

## 本轮后端 handoff 要点

### BE-002 顾客端预约申请
- 必须实现：
  - 基于规则生成 availability
  - 提交预约时校验 slot 合法性
  - 默认写入 `pending`
- 明确不做：
  - 支付状态
  - 自动消息通知
  - 多员工容量分配

### BE-004 店员端审核
- 必须实现：
  - 待审核列表
  - 审核动作
  - 审核通过时占用检查
  - 不可重复审核
- 明确不做：
  - 批量审核
  - 高级审批流

## 验收标准

### A. 顾客端
- 首页可展示返图内容与品牌信息
- 顾客可以进入预约页并看到可预约日期/时间段
- 顾客只能提交规则内的预约申请
- 提交后预约状态默认为 `pending`
- 顾客可查看自己的预约结果

### B. 店员端
- 店员可配置提前开放预约天数
- 店员可配置本月不可预约日期
- 店员可配置每日可预约时间段
- 店员可查看待审核申请并进行通过 / 拒绝
- 已审核记录状态正确展示

### C. 业务正确性
- 单员工同一时间段不能存在两条 `approved` 预约
- 已关闭日期不可预约
- 未开放日期不可预约
- 已审核预约不可重复审核

### D. 非功能要求
- V1 不引入商品售卖
- V1 不引入支付
- V1 不引入多员工排班
- 前后端字段命名与 `docs/API.md` 保持一致

## 当前状态

- ARCH-001：已完成，最新 PRD / ARCHITECTURE / API / TASKS 已切换到“单店、单员工、审批制预约”口径。
- 产品决策已确认：V1 采用“顾客端 + 店员端同一小程序”方案；返图展示 V1 接受静态配置 / 轻量维护方案。
- ARCH-002：已完成第一版派工准备，`docs/IA.md`、`docs/TASK_BRIEFS.md`、`docs/STAFF_AUTH.md` 已生成；本轮已补充代码基线核对，可继续按文档推进。
- FE-001：首版已落地，`pages/home/index.*` 已切到品牌区 + gallery 返图展示 + 预约 CTA 结构。
- FE-002：首版已落地，`pages/booking/index.*` 已切到 `availability -> appointmentDate/timeSlot` 提交流程，并明确“待审核”语义。
- FE-003：首版旧基线曾按手机号查询与状态映射展示；在当前冻结契约下，已不再按“已完成可验收”计，需以后续 OpenID 收口结果合入与回归为准。
- FE-004：首版已落地，`pages/staff/rules/index.*` 已支持店员 OpenID 输入、规则读取/保存、不可预约日期维护与时间段增删改。
- FE-005：首版已落地，`pages/staff/appointments/index.*` 已支持店员 OpenID 输入、按状态查看预约、执行通过/拒绝并展示错误反馈。
- BE-001：首版已落地，`GET /api/v1/gallery` 已提供默认种子数据并按 active + sortOrder 返回。
- BE-002：首版已落地，`GET /api/v1/availability`、`POST /api/v1/appointments`、`GET /api/v1/my/appointments` 已按审批制申请口径实现。
- BE-003：首版已落地，`GET/PUT /api/v1/staff/booking-rules` 已支持基础规则校验与更新。
- BE-004：首版已落地，`GET /api/v1/staff/appointments`、`POST /api/v1/staff/appointments/:id/review` 已支持状态筛选、重复审核拦截和 slot 冲突校验。
- BE-005：已完成，后端已接入 SQLite 存储模块，`gallery_items`、`booking_rules`、`appointments` 三类数据已改为数据库读写；默认种子仅在空表时初始化，服务重启后规则、预约与审核结果可保留。
- ARCH-003：已完成首轮后端联调验收。`npm run test:server` 已通过，覆盖健康检查、规则读写、预约创建、审核通过、重启后数据保留、availability 占用回放等关键链路。
- 状态更新（2026-03-14）：根据 Lan 的最新反馈，联调进入“收口修正”阶段，重点处理接口口径误判、顾客身份主键切换（phone -> OpenID）与首页返图相关测试补齐。ARCH-004 / FE-006 / FE-007 / BE-006 / QA-001 已加入执行清单。
- ARCH-004：已完成，`docs/PRD.md`、`docs/ARCHITECTURE.md`、`docs/API.md`、`docs/TASKS.md` 已冻结 OpenID 新口径，并明确废弃旧接口与回归验收基准。
- FE-006：文档口径已明确，但 2026-03-15 在 architect repo 抽查时，需以实际代码是否已出现“顾客入口 / 店员入口”分流与页面显性错误态为准；在完成基线核对、提交与联调前，暂不按“已完成可验收”计。
- FE-007：当前 architect repo 抽查发现顾客链路仍可见手机号主查询/跳转口径（如 `apps/weapp/pages/booking/index.js`、`apps/weapp/pages/my-bookings/index.js`），说明 OpenID 主键改造尚未在当前验收基线上闭环；状态下调为待合入 / 待回归。
- BE-006：当前 architect repo 抽查发现 `apps/server/src/server.mjs` 仍是旧口径：CORS 未放行 `X-Customer-OpenId`、创建预约仍要求 `customerName`/`phone`、`GET /api/v1/my/appointments` 仍按 `phone` 查询；状态下调为待合入 / 待自测 / 待联调。
- QA-001：文档侧验收用例已补齐（首页返图、OpenID 主链路、接口口径防回退）；因当前验收基线仍存在 phone 旧口径，真实跑测暂不能判定通过，待代码口径修正后再形成最终验收结论。
- 状态审计更新（2026-03-15）：本次以 architect repo 为验收基线抽查，发现 `docs/API.md` 与当前代码实现仍存在显著偏差；在 FE-007 / BE-006 合并到当前仓库并完成 self-test + UAT 之前，不建议给出“可验收 / 可推远程”结论。
- 执行推进（2026-03-15）：已按当前审计结论向 `miniapp-frontend` / `miniapp-backend` 派发本轮收口任务，frontend 聚焦 FE-007 + FE-006 防回退，backend 聚焦 BE-006 + QA-001 后端回归覆盖；architect 后续按“代码结果 -> 自测结果 -> UAT 主链路”顺序审阅，不在门槛满足前建议 pull 或 push 验收基线。
- Heartbeat 推进（2026-03-15 09:19 Asia/Shanghai）：确认当前无活跃 worker 在跑，已重新派发 frontend / backend 收口 run；前端目标为“首页入口分流 + 错误态显性化 + 顾客 OpenID 主键查询”，后端目标为“customerOpenId 数据模型收口 + CORS/header 修正 + OpenID 回归测试补齐”。
- Worker 回报（2026-03-15 09:34 Asia/Shanghai）：frontend 已在其 workspace 完成 FE-006 / FE-007 收口，包含首页顾客/店员入口分流、关键页面错误态显性化、`X-Customer-OpenId` 主链路、开发环境 mock OpenID 与“我的预约”按 OpenID 自动查询；backend 已在其 workspace 完成 BE-006 / QA-001（后端侧）收口，包含 `customerOpenId` 数据模型、`X-Customer-OpenId` 鉴权与查询、CORS 放行、历史表最小迁移兼容与 OpenID 回归用例补强。两侧当前共同剩余门槛：尚未由 architect 在统一验收基线完成代码审阅、实际自测执行与 commit/pull 收口，因此暂不下“可推远程 / 可最终验收”结论。
- Heartbeat 推进（2026-03-15 09:35 Asia/Shanghai）：为进入统一验收基线审阅，architect 已追加派发两条短任务，要求 frontend/backend 分别补交 review handoff（改动位置、口径变更点、复核清单、残余风险）；待 handoff 回收后，再决定是否进入合入审阅或继续补充验证。
- 状态跟进（2026-03-15 09:24 Asia/Shanghai）：backend 收口 run 已结束，frontend 收口 run 仍在执行；architect 下一步按“backend 结果核验 -> frontend 结果核验 -> 当前仓库验收基线复核”顺序继续收口，在两侧结果都确认前暂不对外给出可验收结论。
- Heartbeat 跟进（2026-03-15 15:35 Asia/Shanghai）：backend 已补交极短 review handoff，指出当前统一验收基线应优先抽查 `apps/server/src/server.mjs` 中的迁移逻辑（旧 appointments 表补 `id` / `customer_open_id`）与顾客身份入口逻辑（header 鉴权 + payload 忽略 body 伪造身份）；frontend 极短 handoff 仍在运行，architect 继续等待其回收后再做统一审阅，不提前给出 milestone / release 结论。
- 基线抽查更新（2026-03-15 15:36 Asia/Shanghai）：frontend/backend handoff 已齐，但 architect repo 当前代码基线仍与 handoff 描述不一致：`apps/weapp/utils/request.js` 仍只注入 `X-Staff-OpenId`、未注入 `X-Customer-OpenId`；`apps/weapp/services/appointment.js` 与 `pages/my-bookings/index.js` 仍按手机号查询；`pages/booking/index.js` 仍要求姓名+手机号并在提交后跳转手机号查询；`apps/server/src/server.mjs` 仍未放行 `X-Customer-OpenId`，且 `POST /api/v1/appointments` / `GET /api/v1/my/appointments` 仍是 phone 旧口径。判定：当前统一验收基线仍不可作为 OpenID 收口版本验收，属于严重基线偏差，需先解决“worker 结果未合入 architect repo”问题后再做最终 self-test / UAT。
- 合入路径确认（2026-03-15 16:09 Asia/Shanghai）：frontend / backend 两侧均确认其 OpenID 收口结果目前只存在各自 workspace 的 `main` 分支 working tree，HEAD 仍停留在 `57265ad feat: bootstrap miniapp workspace`；前端未提交文件覆盖 `apps/weapp/*` 顾客链路、staff 页面、request/customer/staff 工具与 app 配置，后端未提交文件包括 `apps/server/src/server.mjs`、`docs/API.md`、`docs/ARCHITECTURE.md`。结论：当前不存在可供 architect cherry-pick 的 worker commit，这就是 architect repo 仍为旧基线的直接原因；下一步必须先让 frontend/backend 各自补独立 commit（建议按 FE-006/FE-007、BE-006/QA-001 分别提交），再进入统一验收基线合入与 self-test / UAT。
- 合入就绪（2026-03-15 16:40 Asia/Shanghai）：backend 已将 BE-006 / QA-001 固化为本地 commit `3804405 fix: harden customer openid appointment contract`，并说明 `node apps/server/src/server.mjs --self-test` 已通过；frontend 已将 FE-006 / FE-007 固化为本地 commit `0595d4a feat(weapp): solidify FE-006 FE-007 entry and identity flows`。当前已具备进入统一验收基线的最小合入条件，推荐 architect 下一步分别 cherry-pick 两个 commit；已知残留仅前端未跟踪历史目录 `apps/weapp/pages/my/`，worker 已明确将其排除在本轮验收基线之外。
- Heartbeat 推进（2026-03-15 16:43 Asia/Shanghai）：因 frontend workspace 仍残留未跟踪 `apps/weapp/pages/my/*`，architect 已追加派发一次“残留清理”短任务，要求 frontend 仅处理该历史目录并把 workspace 收口到可安全合入状态；在收到“git status 干净 / 可直接 cherry-pick 0595d4a”确认前，统一验收基线仍暂缓合入 frontend commit。
- 残留复核（2026-03-15 16:45 Asia/Shanghai）：frontend 已再次确认 `apps/weapp/pages/my/*` 为未注册的历史未跟踪残留，虽因当前执行审批未能在其 workspace 实际删除，但该目录不包含在 `0595d4a feat(weapp): solidify FE-006 FE-007 entry and identity flows` 内，也不会影响 architect 直接 cherry-pick 该 commit；据此，统一验收基线已解除“前端残留阻塞”，可继续按 backend `3804405` + frontend `0595d4a` 顺序进入合入审阅。
- 基线合入进展（2026-03-15 17:06 Asia/Shanghai）：backend 已成功将 `3804405 fix: harden customer openid appointment contract` 的文件快照与 patch 落到 architect 工作区 `.integration/backend-3804405/`；architect 已据此把 `apps/server/src/server.mjs`、`docs/API.md`、`docs/ARCHITECTURE.md` 覆盖进当前验收基线，并执行 `node apps/server/src/server.mjs --self-test`，结果通过。frontend 侧仍在等待可落地的 patch / 文件交接产物进入 architect 工作区，之后再继续顾客端统一基线合入与联调验收。
- Patch 交接进展（2026-03-15 16:59 Asia/Shanghai）：backend 已在 architect workspace 落出 `.integration/backend-3804405/3804405.patch` 与 `MANIFEST.md`，清单确认文件范围仅含 `apps/server/src/server.mjs`、`docs/API.md`、`docs/ARCHITECTURE.md`；frontend 的 patch 导出仍在执行中，统一验收基线暂按“后端 patch 已就绪、前端 patch 待落出”状态继续推进。
- Heartbeat 跟进（2026-03-15 16:57 Asia/Shanghai）：backend 单提交 patch 已成功导出到 architect 工作区 `.integration/backend-3804405/`，包含 `3804405.patch` 与 `MANIFEST.md`，文件范围已核对为 `apps/server/src/server.mjs`、`docs/API.md`、`docs/ARCHITECTURE.md`；frontend patch 导出仍在进行中，统一验收基线下一步仍按“前端 patch 就绪 -> 应用两侧 patch -> self-test / UAT”推进。
- 风险升级（2026-03-15 17:09 Asia/Shanghai）：architect 在合入 backend patch 并复读当前 `docs/API.md` / `docs/ARCHITECTURE.md` 后，发现其口径已明显偏离当前冻结中的 PRD/TASKS：当前基线被写成 `services/hot-styles/artists` 与 staff 审核旧链路，而非 V1 约定的 `booking-rules + availability(月/日历) + my appointments + staff/rules + staff/appointments` 闭环。判定：这不是单纯“未合入 frontend patch”的问题，而是已合入 backend patch 本身与当前项目冻结范围存在实现偏航风险；在重新核清 frontend patch 内容与两侧契约一致性前，不应继续推进“统一 patch 合入后直接 UAT”的路径，更不能给出可验收/可发布结论。
- 风险复核（2026-03-15 17:11 Asia/Shanghai）：frontend patch `0595d4a` 抽查同样确认偏航：首页明确改为依赖 `hot-styles` 概念与 `pages/staff/index` 单页，而非当前冻结的 `gallery + booking-rules + staff/rules + staff/appointments` 结构；`pages/my-bookings` 与 `booking` 口径也引入 `serviceId/serviceName/artistId/artistName` 这套非当前冻结主链路字段。结论升级：frontend/backend 两侧 patch 都不应直接作为当前 V1 冻结基线合入继续验收，当前属于“实现整体偏向另一版需求”的严重范围偏航，需先重新对齐团队冻结契约后再决定是回退 patch、重派工，还是切换文档基线。
- Heartbeat 跟进（2026-03-15 17:41 Asia/Shanghai）：architect 试图直接撤回已临时合入的 backend 偏航 commit，以恢复当前验收基线，但 `git revert` 受当前策略限制无法执行；因此本轮 heartbeat 不再继续冒险做手工大回退，而是将问题明确上收为“需求/基线方向待拍板 + 当前仓库存在偏航污染风险”。在 Lan 拍板前，不继续推进 patch 合入、统一 UAT、push 或 release。
- Heartbeat 推进（2026-03-15 16:56 Asia/Shanghai）：因 architect 会话无法直接基于不可见对象执行 cherry-pick，已改走 patch 交接路径，并重新向 frontend/backend 派发“导出单提交 patch 到 architect 挂载工作区 `.integration/patches/`”任务；待 patch 回收后，将直接在 architect 基线应用并进入统一 self-test / UAT。
- Heartbeat 推进（2026-03-15 16:55 Asia/Shanghai）：因 architect repo 侧无法直接按 hash cherry-pick worker commit，已改走 patch 交接路径；frontend / backend patch 导出任务均已派发并正在执行。当前等待 patch 文件落地后，再进入 architect 基线应用与统一 self-test / UAT，不在此节点对外宣告里程碑完成。
- Heartbeat 推进（2026-03-15 16:53 Asia/Shanghai）：由于 architect 会话内直接 `git cherry-pick` / 跨 workspace 合入路径受限，已继续向 frontend/backend 追加派发 patch 交接任务，目标是把 `0595d4a` 与 `3804405` 分别导出为可落到 architect workspace `.integration/` 的单提交 patch + manifest，再由 architect 侧继续统一验收基线落库与复核。
- Heartbeat 推进（2026-03-15 16:51 Asia/Shanghai）：为解决“worker 本地 commit 对 architect repo 的对象可见性”这一剩余合入路径问题，architect 已分别向 frontend/backend 派发合入支撑短任务，要求给出在不 push 前提下的最短可执行交接方式（直接 cherry-pick 是否可行；若不可行则给出 patch/bundle 等替代方案）。在拿到可执行交接路径前，统一验收基线尚未真正开始合入，但当前不依赖 Lan 决策。
- Heartbeat 推进（2026-03-15 16:47 Asia/Shanghai）：architect 在实际执行时确认 `git cherry-pick` 被当前策略拦截，无法直接把 worker commit 合入本仓；已改走“挂载 architect workspace -> 由 frontend/backend 把已提交文件完整导出到 `.integration/` 目录”的替代路径。待两侧导出完成后，architect 将在当前仓库手工覆写目标文件、提交统一验收基线，并继续 self-test / UAT。
- Heartbeat 推进（2026-03-15 16:06 Asia/Shanghai）：在未要求 Lan 介入的前提下，architect 已向 frontend/backend 追加派发“合入路径确认”短任务，要求分别回报各自 workspace 中的 branch / HEAD commit / git status / 推荐合入方式，用于定位为何 worker 已完成但 architect repo 仍停留在旧口径基线；待两侧返回后，再决定采用 cherry-pick、分支拉取还是要求补 commit。
- Heartbeat 推进（2026-03-15 16:36 Asia/Shanghai）：基于两侧“仅存在 working tree、尚无可 cherry-pick commit”的确认，architect 已重新向 frontend/backend 派发“固化本地改动并提交 commit”任务；目标是先产出可合入的 FE-006/FE-007、BE-006/QA-001 提交，再进入统一验收基线合入与 self-test / UAT，期间继续维持“暂不建议最终验收 / push / release”的判断。
- Heartbeat 推进（2026-03-15 16:40 Asia/Shanghai）：backend 已确认产出本地可 cherry-pick commit `3804405 fix: harden customer openid appointment contract`，并完成 self-test；frontend 的提交结果尚未在 architect 会话内落盘，因此已追加一次极短结果回收任务，只要求返回 branch / commit / git status / 推荐合入方式，待其回收后再决定统一验收基线的实际合入动作。
- 审阅风险记录（2026-03-15 12:48 Asia/Shanghai）：frontend/backend 两条 review handoff 回收尝试均未形成可用结论，返回内容分别出现旧页面片段与过期骨架说明，不能作为统一验收基线审阅依据；architect 已将该现象视为“handoff 质量失真”风险，后续改用更短约束任务重新回收关键信息，并在获得稳定 handoff 或完成其他等效复核前，继续维持“不建议 push / 不建议最终验收”的状态判断。
- Heartbeat 推进（2026-03-15 12:32 Asia/Shanghai）：当前无活跃 worker，但统一验收基线审阅仍有明确可执行工作；architect 已追加向 frontend/backend 派发纯文本 review handoff 任务，用于收集“改动文件 -> 风险点 -> 抽查重点 -> 已知联调边界”复核清单，收齐后进入统一验收基线审阅与下一轮验收结论判断。

- 状态复核（2026-03-16 09:xx Asia/Shanghai）：architect 已将 `docs/ARCHITECTURE.md` 与 `docs/API.md` 按当前冻结范围重新对齐到 `gallery + booking-rules + appointments + customerOpenId` 口径，移除昨天偏航到 `services / hot-styles / artists` 的契约描述；后续代码审阅与验收以本次复核后的文档为准。
- Heartbeat 推进（2026-03-16 09:xx Asia/Shanghai）：当前无活跃 worker，architect 已按重新冻结后的契约重新派发 frontend / backend 收口 run；frontend 聚焦 FE-006 + FE-007（入口分流、错误态显性化、顾客 OpenID 主链路），backend 聚焦 BE-006 + QA-001 后端侧（OpenID 主键、booking-rules / availability / appointments 冻结口径、自测补齐）。在两侧回收 commit 与自测结论前，仍不下“可验收 / 可 push / 可 release”结论。
- Worker 回收（2026-03-16 09:31 Asia/Shanghai）：frontend 已交付本地 commit `5a5f31f`，覆盖首页分流、顾客 `X-Customer-OpenId` 主链路、我的预约按 OpenID 自动查询、关键页面错误态显性化与旧接口静态自检；architect 在结果审阅时发现店员规则接口口径疑似写成 `/api/v1/staff/rules`，与冻结契约 `/api/v1/staff/booking-rules` 不一致，因此已继续派发一次极短前端修正任务，优先消除这处前后端分歧后再进入统一基线合入。
- Frontend 纠偏回收（2026-03-16 09:37 Asia/Shanghai）：frontend 已追加本地 commit `67dc857 fix(weapp): align staff booking rules endpoint`，明确把店员规则请求统一为 `GET/PUT /api/v1/staff/booking-rules`，并更新 `apps/weapp/scripts/contract-selfcheck.mjs` 拦截旧 `/api/v1/staff/rules`；前端当前主要剩余工作已转为“导出 patch / 文件快照供 architect 合入审阅”。
- 风险复核（2026-03-16 09:39 Asia/Shanghai）：architect 读取 backend 导出物 `.integration/backend-ae4bc90/` 后，确认 backend commit `ae4bc90` 虽已修正 OpenID、旧接口 404 与 SQLite 迁移，但又把 `booking-rules` 对外契约改成了 `items[{date,timeSlot,status}]` 全量替换模型；这与当前冻结 PRD / TASKS / UAT 中的 `advanceOpenDays + closedDates + dailySlots + updatedAt` 模型不一致，属于新的实质偏航，当前 backend patch 不可直接并入统一验收基线。
- 补救动作（2026-03-16 09:39 Asia/Shanghai）：architect 已向 backend 重新派发 `be-rules-model-fix-20260316`，只纠正规则数据模型偏差并要求保留已修好的 OpenID 主链路、旧接口 404、自测与 SQLite 最小迁移能力；在该轮结果回收前，仍不下“可联调验收 / 可 push / 可 release”结论。
- 前端抽查更新（2026-03-16 10:xx Asia/Shanghai）：architect 抽查 `.integration/frontend-67dc857/5a5f31f.patch` 后，确认前端除已修复的 `/api/v1/staff/booking-rules` 路径外，仍存在两处冻结契约偏差：`pages/staff/rules/*` 还按 `bookingEnabled / bookingNotice / timeSlots / closedDates` 模型实现，而非 `advanceOpenDays / closedDates / dailySlots / updatedAt`；`services/appointment.js` 的 `getAvailability()` query key 仍写成 `appointmentDate`，而非当前契约要求的 `date`。判定：frontend `5a5f31f + 67dc857` 当前同样不可直接并入统一验收基线。
- 补救动作（2026-03-16 10:xx Asia/Shanghai）：architect 已继续派发 `fe-rules-model-fix-20260316`，要求前端仅修正 staff rules 数据模型与 availability query 参数，同时保留已完成的首页分流、OpenID 主链路、我的预约按 OpenID 查询与旧接口静态自检能力。
- 前端纠偏回收（2026-03-16 11:17 Asia/Shanghai）：frontend 已新增本地 commit `327a1c6`，将店员规则页主模型收口为 `advanceOpenDays / closedDates / dailySlots / updatedAt`，并把 `getAvailability()` query key 从 `appointmentDate` 改为 `date`；前端契约自检已通过。当前前端剩余工作主要转为“补导出最新 commit 供 architect 统一审阅”，不再是已知字段模型偏差。
- Heartbeat 跟进（2026-03-16 11:00 Asia/Shanghai）：`fe-rules-model-fix-20260316` 在执行自检阶段超时，`be-export-6a8fe8d-20260316` / `be-export-6a8fe8d-retry-20260316` 虽生成导出物但未能稳定落入 architect 工作区，说明当前剩余阻塞已从“代码偏差”转为“结果回收路径不稳”。architect 已改为两条更短路径继续推进：frontend 重试一次仅收口 commit 结果（`fe-rules-model-fix-retry-20260316`），backend 放弃 patch 交接、改收纯文本 review handoff（`be-6a8fe8d-text-handoff-20260316`），以便先完成统一审阅判断。
- Backend 纠偏回收（2026-03-16 11:23 Asia/Shanghai）：backend 文本 handoff 已确认 `6a8fe8d fix(server): restore booking rules contract` 的关键结论：`GET/PUT /api/v1/staff/booking-rules` 已恢复为 `advanceOpenDays + closedDates + dailySlots + updatedAt`，`GET /api/v1/availability` query key 为 `date`，当前占用口径为 `pending + approved`，`npm run test:server` 已通过；因此 backend 当前主要剩余问题已从“实现偏差”转为“导出/合入材料路径不稳”。
- Frontend 纠偏回收（2026-03-16 11:29 Asia/Shanghai）：frontend 已新增本地 commit `327a1c6`，将店员规则页主模型改回 `advanceOpenDays / closedDates / dailySlots / updatedAt`，并把 `getAvailability()` query 参数从 `appointmentDate` 修正为 `date`；`node apps/weapp/scripts/contract-selfcheck.mjs` 已通过。当前 frontend 已重新进入“等待导出物供 architect 统一审阅”的状态。
- Heartbeat 推进（2026-03-16 12:01 Asia/Shanghai）：frontend 最新导出任务 `fe-export-327a1c6-20260316` 正在执行；在导出回收前，architect 继续维持“未到可联调验收 / 可 push / 可 release 门槛”的判断，但当前无需 Lan 介入。

## 推荐实施顺序

### 当前阶段第一优先级：接口与身份口径收口
1. FE / BE 统一按 `docs/API.md` 对齐，确认不再依赖旧 `/api/v1/services` 与旧版预约查询口径
2. 完成顾客身份主键切换：`phone -> customerOpenId`
3. 修复并显性化页面接口失败提示，避免“壳子可见但数据不可用”的误判

目标：先消除“页面能打开但流程跑不通”的联调噪音。

### 当前阶段第二优先级：补齐回归与人工验收
1. 按更新后的 `docs/UAT_GUIDE.md` 重新执行顾客端 / 店员端用例
2. 增加首页返图展示、预约主链路、审核后回查三类回归验证
3. ARCH 侧输出二次验收结论与发布建议

目标：验证“展示 -> 申请 -> 审核 -> 查看状态”与“规则修改 -> availability 变化”两条主链路在 SQLite 场景下稳定可用，并形成可交付结论。

## 实施约束补充

### 前后端联调口径

- 前端以 `docs/API.md` 为唯一字段口径，不根据页面文案自行改字段名。
- `availability` 接口中的 `days[*].slots[*].value` 作为预约提交时的 `timeSlot` 原值使用，不再二次拼装。
- 顾客端“我的预约”V1 先以 OpenID 查询承载，手机号仅作为联系信息展示。
- 店员端审核页默认先聚焦 `status=pending`，已审核筛选可后补，不作为首阶段阻塞项。
- 所有状态展示统一使用：`pending=待审核`、`approved=已通过`、`rejected=已拒绝`。

### Backend 开发优先检查清单

1. 先固定 `BookingRule` 的默认数据结构与校验逻辑。
2. 再实现 `availability` 计算，确保关闭日期、提前开放天数、已占用时间段三类规则同时生效。
3. 再实现预约创建与“我的预约”查询，确保新建记录默认 `pending`。
4. 最后接入 staff review，并在 `approve` 时做最终占用校验。
5. SQLite 落地时至少保证：gallery、booking_rules、appointments 三类数据重启后不丢失。

### Frontend 开发优先检查清单

1. 先打通首页静态结构，再接 gallery 接口，避免 UI 与接口联动耦合过早。
2. 预约页先按“选择日期 -> 拉取/展示当天可选 slot -> 填表提交”顺序实现，减少状态管理复杂度。
3. “我的预约”页先完成最小查询与状态展示，再补空态和异常提示。
4. 店员规则页先完成字段录入与本地校验，再接保存接口。
5. 店员审核页先完成 pending 列表与单条审核动作，再补筛选与刷新体验。

## 风险与待确认

- 店员身份校验默认按 `docs/STAFF_AUTH.md` 的方案 A（OpenID 白名单）推进；如无新决策，不再视为当前阻塞项
- 返图内容管理方式（静态维护 or 简单后台）需在开发中尽早定口径
- 若后续很快引入商品售卖，首页信息架构需要预留扩展区
- SQLite 接入若超出当前骨架承载能力，可先以文件型最小实现落地，但不能回退为纯内存方案

## 联调验收清单（供 ARCH-003 / FE / BE 共用）

### Case 1：首页返图展示
- 前置条件：`GET /api/v1/gallery` 返回至少 3 条 `active` 数据
- 操作：进入首页
- 期望：
  - 品牌氛围区、返图区、预约 CTA 可见
  - 返图按 `sortOrder` 稳定展示
  - 接口失败时页面出现空态或错误提示，但不白屏

### Case 2：顾客提交合法预约申请
- 前置条件：已存在有效 booking rule，且所选日期不在 `closedDates` 内
- 操作：顾客在已识别 OpenID 身份下选择可预约日期、可预约时间段，按需填写姓名/手机号后提交
- 期望：
  - 创建接口成功
  - 新记录状态为 `pending`
  - “我的预约”页可按同一 OpenID 查到该记录

### Case 3：顾客提交非法日期或时间段
- 操作：构造未开放日期、关闭日期或不存在的 `timeSlot` 提交
- 期望：
  - 后端拒绝写入
  - 返回明确错误码（如 `INVALID_SLOT`）
  - 前端展示可理解提示，不误报成功

### Case 4：店员修改预约规则
- 操作：修改 `advanceOpenDays`、`closedDates`、`dailySlots` 并保存
- 期望：
  - 规则读写一致
  - 重叠时间段、非法时间格式被拦截
  - 顾客端可预约结果随规则变化同步更新

### Case 5：店员审核通过预约
- 前置条件：存在一条 `pending` 预约，且对应 slot 未被占用
- 操作：店员执行 `approve`
- 期望：
  - 记录状态更新为 `approved`
  - `reviewedAt` 写入
  - 顾客在“我的预约”看到状态变更

### Case 6：同一时间段重复审批冲突
- 前置条件：同日期同时间段已存在一条 `approved` 预约，另有一条 `pending` 申请
- 操作：店员尝试再次 `approve`
- 期望：
  - 返回冲突错误（如 `SLOT_OCCUPIED`）
  - 第二条记录不应变为 `approved`
  - 前端给出冲突提示

### Case 7：已审核记录重复审核
- 前置条件：目标预约已是 `approved` 或 `rejected`
- 操作：再次提交 review 请求
- 期望：
  - 后端拒绝重复审核
  - 前端不允许继续操作或收到失败提示后刷新状态

### Case 8：服务重启后的持久化验证
- 前置条件：已创建返图、规则、预约数据
- 操作：重启服务后重新读取 gallery / rules / appointments
- 期望：
  - 数据仍存在
  - 已审核状态、关闭日期、时间段配置不丢失
  - 不出现回退为默认空数据的情况

### Case 9：接口口径防回退验证
- 前置条件：前后端已完成本轮收口改造
- 操作：在微信开发者工具 Network 面板完整跑一轮首页->预约->我的预约->店员审核
- 期望：
  - 只出现本轮契约接口：`/api/v1/gallery`、`/api/v1/availability`、`POST /api/v1/appointments`、`GET /api/v1/my/appointments`、`/api/v1/staff/*`
  - 不出现旧接口：`/api/v1/services`、旧版 `GET /api/v1/appointments`
  - 若出现旧接口调用，判定为回归问题
