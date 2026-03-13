# TASKS

## 当前阶段

V1 需求重构：单店美甲预约小程序（返图展示 + 可配置预约规则 + 审批制预约）

## 任务列表

| ID | Owner | Task | Input | Output | Depends On | Done Definition | Risk |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ARCH-001 | architect | 重写 PRD / 架构 / API / TASKS 文档以匹配新业务目标 | 用户最新需求、现有 V0 文档 | `docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/API.md`, `docs/TASKS.md` | 无 | 文档可直接指导前后端开发 | 旧需求残留导致实现偏航 |
| FE-001 | frontend | 实现顾客端首页与返图展示 | `docs/PRD.md`, UI 方向, `docs/API.md` gallery 接口 | `apps/weapp/pages/home/*`, 相关组件/服务 | ARCH-001, BE-001 | 首页具备品牌氛围、返图展示、明确预约 CTA；接口失败时有空态/兜底 | UI 风格与品牌预期偏差 |
| FE-002 | frontend | 实现顾客端预约申请流程 | `docs/API.md` availability / appointments | `apps/weapp/pages/booking/*`, `services/*` | ARCH-001, BE-002 | 顾客只能选择可预约日期与时间段；可成功提交待审核申请；表单校验清晰 | 日期/时间规则与后端口径不一致 |
| FE-003 | frontend | 实现“我的预约”状态查看页 | `docs/API.md` my appointments | `apps/weapp/pages/my-bookings/*`, `services/*` | ARCH-001, BE-002 | 顾客可按手机号查看预约记录，并清晰看到待审核/已通过/已拒绝状态 | 身份最小方案带来的体验限制 |
| FE-004 | frontend | 实现店员端规则配置页 | `docs/API.md` booking-rules | `apps/weapp/pages/staff/rules/*`, `services/*` | ARCH-001, BE-003 | 店员可配置提前开放天数、不可预约日期、每日时间段；前端校验时间段不重叠 | 日历/时间段交互复杂度较高 |
| FE-005 | frontend | 实现店员端预约审核页 | `docs/API.md` staff appointments / review | `apps/weapp/pages/staff/appointments/*`, `services/*` | ARCH-001, BE-004 | 店员可查看待审核列表并执行通过/拒绝，结果即时反馈 | 审核状态与冲突处理提示不清晰 |
| BE-001 | backend | 提供返图展示接口与数据结构 | `docs/API.md` gallery 定义 | `apps/server/src/*` | ARCH-001 | `GET /api/v1/gallery` 可用，仅返回 active 项，排序稳定 | 图片数据来源暂时简单 |
| BE-002 | backend | 提供顾客端可预约查询与预约申请接口 | `docs/API.md` availability / appointments / my appointments | `apps/server/src/*` | ARCH-001 | 可按规则计算可预约日历；创建预约默认 pending；顾客可查询自己的预约状态 | 时间计算与边界日期容易出错 |
| BE-003 | backend | 提供店员侧预约规则读写接口 | `docs/API.md` booking-rules | `apps/server/src/*` | ARCH-001 | 规则可读可写；参数校验完整；时间段不重叠 | 规则模型设计过松导致后续维护困难 |
| BE-004 | backend | 提供店员侧预约审核接口 | `docs/API.md` staff appointments / review | `apps/server/src/*` | ARCH-001, BE-002 | 可筛选待审核列表；审核通过时做时间段占用校验；不可重复审核 | 并发下 slot 冲突处理不严谨 |
| BE-005 | backend | 接入 SQLite 持久化 | `docs/ARCHITECTURE.md` | `apps/server/src/*`, 数据文件/初始化脚本 | ARCH-001 | 规则、预约、返图数据在重启后仍保留 | 迁移复杂度超过当前骨架能力 |
| ARCH-002 | architect | 向前后端下发明确 brief，并跟踪交付 | `docs/*.md` | brief / 评审意见 | FE-001~005, BE-001~005 | 前后端任务边界清晰，不把需求模糊点甩给 worker | worker 未按统一口径实现 |
| ARCH-003 | architect | 联调验收与范围守卫 | 前后端提交结果、测试结果 | 评审结论 / 更新任务状态 | FE-001~005, BE-001~005 | 流程闭环跑通，范围外功能未混入 V1 | 商品售卖等后续诉求提前侵入 |

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
- FE-003：首版已落地，`pages/my-bookings/index.*` 已接入手机号查询与状态映射展示。
- FE-004：首版已落地，`pages/staff/rules/index.*` 已支持店员 OpenID 输入、规则读取/保存、不可预约日期维护与时间段增删改。
- FE-005：首版已落地，`pages/staff/appointments/index.*` 已支持店员 OpenID 输入、按状态查看预约、执行通过/拒绝并展示错误反馈。
- BE-001：首版已落地，`GET /api/v1/gallery` 已提供默认种子数据并按 active + sortOrder 返回。
- BE-002：首版已落地，`GET /api/v1/availability`、`POST /api/v1/appointments`、`GET /api/v1/my/appointments` 已按审批制申请口径实现。
- BE-003：首版已落地，`GET/PUT /api/v1/staff/booking-rules` 已支持基础规则校验与更新。
- BE-004：首版已落地，`GET /api/v1/staff/appointments`、`POST /api/v1/staff/appointments/:id/review` 已支持状态筛选、重复审核拦截和 slot 冲突校验。
- BE-005：已完成，后端已接入 SQLite 存储模块，`gallery_items`、`booking_rules`、`appointments` 三类数据已改为数据库读写；默认种子仅在空表时初始化，服务重启后规则、预约与审核结果可保留。
- ARCH-003：已完成首轮后端联调验收。`npm run test:server` 已通过，覆盖健康检查、规则读写、预约创建、审核通过、重启后数据保留、availability 占用回放等关键链路；下一步待 Lan 按 `docs/UAT_GUIDE.md` 完成微信开发者工具侧人工验收。

## 推荐实施顺序

### 当前阶段第一优先级：Lan 人工验收
1. 按 `docs/UAT_GUIDE.md` 在微信开发者工具执行顾客端 / 店员端验收用例
2. 记录页面交互、文案、错误提示、刷新体验方面的问题

目标：补齐我这边无法替代的真实页面人工验收，确认小程序端体验与接口行为一致。

### 当前阶段第二优先级：根据 UAT 结果收口
1. FE / BE：根据 Lan 反馈修正页面提示、空态、错误处理与数据一致性问题
2. ARCH-003：更新验收结论与发布建议

目标：验证“展示 -> 申请 -> 审核 -> 查看状态”与“规则修改 -> availability 变化”两条主链路在 SQLite 场景下稳定可用，并形成可交付结论。

## 实施约束补充

### 前后端联调口径

- 前端以 `docs/API.md` 为唯一字段口径，不根据页面文案自行改字段名。
- `availability` 接口中的 `days[*].slots[*].value` 作为预约提交时的 `timeSlot` 原值使用，不再二次拼装。
- 顾客端“我的预约”V1 先以手机号查询承载，前端需明确提示这是查询条件。
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
- 操作：顾客选择可预约日期、可预约时间段，填写姓名/手机号后提交
- 期望：
  - 创建接口成功
  - 新记录状态为 `pending`
  - “我的预约”页可查到该记录

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
