# ARCHITECTURE

## 当前架构决策

V1 采用低依赖、可快速联调的单体式实现，优先打通“展示 -> 申请 -> 审核 -> 回查”主链路：

- 前端：原生微信小程序
- 后端：Node.js 模块化 HTTP API
- 数据：SQLite 持久化（当前已落地）

## 本轮 UAT / 集成补充（2026-03-19）

- 当前 UAT 暴露出一类环境一致性风险：文档约定与页面输入使用 `staff-openid-demo`，但统一验收基线里的服务默认白名单仍可见 `staff-openid-v1`，导致 staff 接口出现 401。
- 当前 UAT 还暴露出 SQLite 旧库兼容风险：历史 `appointments` 表仍可能保留 `appointment_date` 旧列，若未做启动迁移，则 `npm run dev:server` 与临时自测库表现不一致。
- 新增前台体验要求：首页返图改为“封面卡片 -> 详情多图”两层展示，避免首页信息过长。

## 二次 UAT 补充（2026-03-20）

- 店员审核、顾客侧审核结果回查、无权限拦截与 SQLite 持久化已在真实页面 UAT 中再次跑通，当前主链路阻塞已从“接口/鉴权故障”转为“规则编辑体验与可约时段可理解性”。
- `pages/staff/rules` 当前虽然已对接冻结契约，但仍采用数字输入 + 多行文本维护 `advanceOpenDays` / `dailySlots` / `closedDates`。下一轮前端收口要求改为结构化表单控件，不再要求用户手工编辑原始文本。
- 顾客预约页出现“当前仅 1 个 active 时间段可选”的 UAT 现象；架构侧需先核清这是 booking rules / approved-only 占用的正常结果，还是 availability 归一化 / 页面渲染遗漏，再决定是否需要改后端口径。
- 驳回备注 `reviewNote` 继续沿用现有数据模型，不新增字段；若店员填写，顾客侧可直接复用现有预约详情/列表渲染展示。
- 新增店员侧体验要求：`pages/staff/appointments` 需支持“月历 / 月视图”总览当月日程。默认优先复用现有 staff appointments 数据在前端做月历聚合；若现有接口不足以支撑月视图，再由 architect 单独补 backend 契约，不允许前端自行发明接口。

## 为什么当前这样做

- 微信单端项目中，原生小程序调试路径最短，适合当前 V1 收口阶段。
- 当前团队通过飞书 + agent 协作，先保证需求边界、接口契约、联调效率稳定，再考虑大规模工程化迁移。
- SQLite 已能满足当前单店、单员工、审批制预约的持久化需求，避免过早引入更重依赖。
- 待需求稳定后，可再演进为：
  - 前端：`Taro + React + TypeScript`
  - 后端：`NestJS + Prisma + MySQL`

## 目录说明

- `apps/weapp`: 微信小程序前端
- `apps/server`: 后端 API
- `docs`: 需求、架构、接口、任务、环境配置与验收文档

## 逻辑模块

### 前端模块

- 首页 `pages/home`
- 返图详情页 `pages/gallery-detail`
- 预约页 `pages/booking`
- 我的预约 `pages/my-bookings`
- 店员规则配置 `pages/staff/rules`
- 店员预约审核 `pages/staff/appointments`
- 请求封装 `utils/request.js`
- 顾客预约相关服务 `services/appointment.js`

### 后端模块

- 健康检查 `/health`
- 首页图库 `/api/v1/gallery`
- 返图详情仍复用 `/api/v1/gallery` 返回的案例明细（V1 不新增独立详情接口）
- 可预约时段 `/api/v1/availability`
- 顾客创建预约 `POST /api/v1/appointments`
- 顾客查询我的预约 `GET /api/v1/my/appointments`
- 店员规则读写 `GET/PUT /api/v1/staff/booking-rules`
- 店员预约列表 `/api/v1/staff/appointments`
- 店员预约详情 `/api/v1/staff/appointments/:id`
- 店员审核预约 `POST/PATCH /api/v1/staff/appointments/:id/review`

## 接口冻结说明（2026-03-16 复核）

- 当前顾客身份主键固定为 `customerOpenId`。
- 顾客侧身份统一从请求头 `X-Customer-OpenId` 读取。
- 店员侧身份统一从请求头 `X-Staff-OpenId` 读取。
- 顾客预约页以“可预约日期 + 时间段”为核心，不再要求先选服务项目。
- 首页展示实体固定为 `gallery`，不再引入 `hot-styles`、`artists`、`services` 作为当前 V1 主链路接口。
- `GET /api/v1/gallery` 可直接承载首页封面图与详情多图字段（`imageUrl` + `imageUrls`），V1 不新增独立详情接口。
- `GET /api/v1/availability?date=...` 需要返回该日应展示的全部时段，并同时携带 `status`、`reasonCode`、`reasonText` 供前端做卡片化禁用提示。
- 本地 UAT 默认店员身份固定包含 `staff-openid-demo`，避免文档环境与服务默认白名单漂移。
- 旧接口 `GET /api/v1/services`、`GET /api/v1/hot-styles`、`GET /api/v1/artists`、旧版 `GET /api/v1/appointments` 不再属于当前冻结契约。

## 数据模型

### GalleryItem

- `id`
- `title`
- `imageUrl`
- `imageUrls`
- `tags`
- `sortOrder`
- `status`

说明：
- `GalleryItem` 用于首页返图 / 案例展示。
- `imageUrl` 作为首页封面图；`imageUrls` 作为详情页多图数组，若缺失则前端以前台封面图兜底。
- V1 先支持静态种子或轻量维护，不扩展为复杂内容管理系统。

### BookingRule

- `advanceOpenDays`
- `closedDates`
- `dailySlots`
- `updatedAt`

说明：
- `advanceOpenDays` 表示提前开放预约天数。
- `closedDates` 表示不可预约日期列表。
- `dailySlots` 表示每日可预约时间段配置，例如 `10:00-11:00`。
- V1 仅覆盖单店、单员工场景，不支持排班、多员工产能与多门店规则。

### Appointment

- `id`
- `customerOpenId`
- `customerName`
- `phone`
- `date`
- `timeSlot`
- `note`
- `status`
- `createdAt`
- `reviewedAt`
- `reviewedBy`
- `reviewNote`

说明：
- `id` 是预约主键；`customerOpenId` 是顾客身份键，一个顾客可有多条预约记录。
- `customerName` / `phone` 仅作联系补充信息，不再作为“我的预约”主查询条件。
- `status` 仅允许：`pending`、`approved`、`rejected`。
- 单员工模式下，同一 `date + timeSlot` 最多只能有 1 条 `approved` 预约。

## 接口边界与兼容策略

- 顾客侧只保留 `POST /api/v1/appointments` 与 `GET /api/v1/my/appointments` 两个预约相关接口。
- 顾客身份只从请求头 `X-Customer-OpenId` 读取并持久化为 `customerOpenId`。
- `customerOpenId` 不放入 body，也不再使用手机号作为“我的预约”主查询键。
- 店员侧统一使用 `/api/v1/staff/*` 前缀，并统一做 `X-Staff-OpenId` 白名单校验。
- 店员侧继续返回 `customerName` / `phone` 字段，便于识别顾客。
- 对历史 SQLite 数据做最小迁移：补齐 `customer_open_id` 等字段，并兼容旧 `appointment_date -> date` 字段迁移，避免因旧表结构导致启动失败。
- 历史记录若缺失 `customerOpenId`，可保留店员侧可见，但不再回退到手机号主查。
- 对旧路由不做兼容回退，防止前端继续依赖冻结前契约。

## 主链路约束

### 顾客侧

1. 首页只承载品牌展示、返图封面展示、顾客入口 / 店员入口分流与预约 CTA。
2. 预约页只承载“选择日期 -> 以时段卡片展示可选/不可选时间段 -> 填写补充联系信息 -> 提交申请”。
3. “我的预约”只按当前顾客 OpenID 查询。
4. 页面必须对 loading / empty / error / unauthorized 给出显性反馈。
5. 返图卡片支持点击进入详情页查看多图，不在首页直接展开全部明细图。
6. 预约页的日期选择采用横向日期条：每个日期单元至少展示“日期 + 星期 + 状态文案”；当前选中日期需高亮并有明显选中态（如下划线/主题色）。
7. 预约页的时间段以卡片/按钮式网格展示，优先两列布局：卡片主文案为 `timeSlot`，副文案为可预约说明或不可预约原因。
8. `status=active` 的时间段卡片可点选；非可约状态灰显、不可点击，并展示原因文案（如 `满`、`剩余0`、`未开放`、`当日关闭`）。
9. 参考图只约束预约页的信息结构与交互反馈，不约束整体视觉皮肤；前端应继续沿用当前项目既有配色、圆角、留白与品牌感样式。

### 店员侧

1. 规则页负责维护 `advanceOpenDays`、`closedDates`、`dailySlots`。
2. 规则页前端交互使用结构化控件完成配置：开放天数用选择控件，闭店日期用日期选择 / 已选列表，时间段用可增删的独立项；不直接暴露原始文本编辑作为主交互。
3. 审核页默认聚焦 `pending` 列表，并支持 approve / reject。
4. 审核页补充月历 / 月视图能力：按月展示日期格、日程摘要、状态标记，并支持点击日期联动当日预约明细；V1 不做拖拽排期、周视图 / 日视图 / 多资源排班。
5. 若店员填写 `reviewNote`，顾客侧允许直接展示该审核说明 / 驳回原因。
6. 店员端不暴露给普通顾客作为常规 tab；通过首页受控入口进入。

## 演进路线

### V1（当前）

- 打通预约闭环
- 固定 `gallery + booking-rules + appointments` 三类核心数据模型
- 顾客身份切换为 `customerOpenId`
- 完成首页返图展示、预约申请、店员规则配置、审批与回查
- 形成稳定 UAT 基线

### V2

- 增加最小登录与身份体系
- 支持更轻量的返图内容维护
- 补充操作日志、更多店员角色或基础管理能力

### V3

- 迁移到更强工程化框架
- 接入订阅消息、支付或更复杂后台能力
- 若业务升级为多员工 / 多门店，再扩展排班与库存模型
