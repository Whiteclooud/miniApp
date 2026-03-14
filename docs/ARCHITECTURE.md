# ARCHITECTURE

## 当前架构决策

V1 围绕“单门店、单员工、预约审批制”设计，优先保证规则可配置、状态可持久化、流程可闭环。

- 前端：原生微信小程序
- 后端：Node.js 模块化 HTTP API
- 数据存储：SQLite（V1 推荐落地），避免预约规则和审核数据因重启丢失

## 为什么这次不再只靠内存数据

本轮需求新增了：
- 预约规则配置
- 每月不可预约日期
- 预约申请审核
- 预约状态持久化

如果继续只用内存：
- 服务重启后规则丢失
- 已审核预约无法稳定保存
- 单员工时间冲突控制不可靠

因此建议 V1 直接使用 SQLite，控制复杂度同时满足稳定性。

## 目录说明

- `apps/weapp`: 微信小程序前端
- `apps/server`: 后端 API
- `docs`: 产品、架构、接口、任务文档

## 前端模块

### 顾客端
- 首页 `pages/home`
  - 门店介绍
  - 返图展示
  - 顾客预约入口 + 店员管理入口（角色分流）
- 预约页 `pages/booking`
  - 日期选择
  - 时间段选择
  - 联系信息填写
  - 预约申请提交
- 我的预约页 `pages/my-bookings`
  - 展示预约状态：`pending` / `approved` / `rejected`

### 店员端
- 规则配置页 `pages/staff/rules`
  - 提前开放预约天数
  - 每月不可预约日期
  - 每日时间段配置
- 预约审核页 `pages/staff/appointments`
  - 待审核列表
  - 通过 / 拒绝操作

### 通用模块
- `services/*`：接口调用封装
- `utils/request.js`：请求封装
- 可选组件：日期格子、时间段选择器、案例卡片、状态标签

## 后端模块

- 健康检查 `/health`
- 首页返图接口 `/api/v1/gallery`
- 顾客可预约日历/时间段接口 `/api/v1/availability`
- 顾客预约创建接口 `/api/v1/appointments`
- 顾客预约查询接口 `/api/v1/my/appointments`
- 店员规则读取/更新接口 `/api/v1/staff/booking-rules`
- 店员预约审核列表接口 `/api/v1/staff/appointments`
- 店员审核操作接口 `/api/v1/staff/appointments/:id/review`

## 核心数据对象

### GalleryItem
- `id`
- `imageUrl`
- `title`
- `tags`
- `description`
- `sortOrder`
- `status`
- `createdAt`

说明：
- 用于顾客返图 / 案例展示。
- V1 可先由后台静态数据或轻量管理维护，不强制做完整 CMS。

### BookingRule
- `id`
- `advanceOpenDays`
- `closedDates`
- `dailySlots`
- `updatedAt`

字段说明：
- `advanceOpenDays`：提前多少天开放预约
- `closedDates`：当月不可预约日期数组，格式 `YYYY-MM-DD`
- `dailySlots`：每日可预约时间段数组，例如 `[{"start":"10:00","end":"11:30"}]`

### Appointment
- `id`
- `customerOpenId`
- `customerName`
- `phone`
- `appointmentDate`
- `timeSlot`
- `note`
- `status`
- `reviewNote`
- `createdAt`
- `reviewedAt`

字段说明：
- `customerOpenId` 为顾客身份主键（来自微信登录态）。
- `customerName`、`phone` 为联系补充信息，V1 可选。

状态说明：
- `pending`：待审核
- `approved`：已通过
- `rejected`：已拒绝

## 规则与业务约束

### 1. 日期可预约判断
某日期可预约，需同时满足：
- 不早于“今天 + advanceOpenDays”
- 不在 `closedDates` 内
- 存在可预约时间段

### 2. 时间段可预约判断
某时间段可展示给顾客，需同时满足：
- 属于 `dailySlots`
- 当前尚未存在同日期同时间段的 `approved` 预约

### 3. 审核约束
- 顾客提交申请后状态固定为 `pending`
- 只有店员可将其变为 `approved` 或 `rejected`
- 审核通过前，不视为正式预约
- 同一时间段若已有 `approved` 记录，后续待审核申请不得再审批通过

## 接口边界

- 顾客端只感知：返图展示、可预约日期/时间段、预约申请、我的预约状态（按当前微信身份）
- 店员端只感知：规则维护、待审核列表、审核动作
- “是否可选”由后端统一计算，前端不自行拼业务规则，避免口径不一致

## 权限边界（V1 暂定）

V1 采用“同一小程序承载顾客端与店员端”的结构，但保留清晰边界：
- 顾客端接口无需复杂角色体系
- 店员端接口统一走 `/api/v1/staff/*`
- 小程序页面层统一使用 `pages/staff/*` 承载店员功能
- V1 店员身份采用 OpenID 白名单校验，作为最小可行鉴权方案

说明：
- 当前不把完整登录体系作为阻塞项，但前后端结构要预留 staff / customer 边界。
- 为了降低 V1 落地复杂度，店员请求链路先约定由前端在 staff 请求中附带 `X-Staff-OpenId` 请求头；后端按白名单校验。
- 顾客请求链路约定携带 `X-Customer-OpenId`（开发环境可先用本地模拟值），后端按该身份关联预约数据。
- 该约定仅作为 V1 最小实现，后续若接入正式登录态，可平滑替换为 session / token 方案，而不改变 `/api/v1/staff/*` 及 `/api/v1/my/*` 接口语义。

## 同一小程序承载店员与顾客的架构影响

### 为什么 V1 推荐这样做
- 当前只有 1 名员工，管理端能力很轻
- 店员功能仅包含“规则配置 + 预约审核”，尚不足以支撑独立后台成本
- 同端实现能更快打通 MVP，并降低前端工程拆分成本

### 架构约束
- 页面目录分离：顾客页与店员页不能混放
- 接口前缀分离：staff 能力必须独立前缀
- 状态与文案分离：顾客视角不展示管理术语，店员视角不复用顾客动作文案
- 后续若拆后台，前端页面与后端接口命名仍可平滑迁移

### V1 最小身份方案建议
- 小程序内提供固定店员入口（例如隐藏入口、指定页面入口或受控跳转）
- 店员进入后需经过最小身份校验
- 即使前端页面被访问，后端 staff 接口也必须再次校验，不能只靠前端隐藏页面

## SQLite 落地建议（V1）

为降低后端实现歧义，V1 推荐直接按以下三类表落地：

运行时约定：
- 默认 SQLite 文件路径：`apps/server/data/miniapp.sqlite`
- 可通过环境变量 `SQLITE_PATH` 覆盖默认路径
- 存储实现可放在 `apps/server/src/storage/*`，但 `apps/server/src/server.mjs` 继续作为 HTTP 入口

### 1. `gallery_items`
- `id` TEXT PRIMARY KEY
- `image_url` TEXT NOT NULL
- `title` TEXT NOT NULL
- `tags_json` TEXT NOT NULL
- `description` TEXT DEFAULT ''
- `sort_order` INTEGER NOT NULL DEFAULT 0
- `status` TEXT NOT NULL DEFAULT 'active'
- `created_at` TEXT NOT NULL

说明：
- `tags` 允许以 JSON 字符串存储，先满足轻量实现。
- 查询首页返图时按 `status='active'` 且 `sort_order ASC, created_at DESC` 返回。

### 2. `booking_rules`
- `id` TEXT PRIMARY KEY
- `advance_open_days` INTEGER NOT NULL DEFAULT 0
- `closed_dates_json` TEXT NOT NULL
- `daily_slots_json` TEXT NOT NULL
- `updated_at` TEXT NOT NULL

说明：
- V1 可固定只维护一条 `rule-default` 记录。
- `closedDates`、`dailySlots` 先用 JSON 字符串存储，减少拆表复杂度。

### 3. `appointments`
- `id` TEXT PRIMARY KEY
- `customer_open_id` TEXT NOT NULL
- `customer_name` TEXT DEFAULT ''
- `phone` TEXT DEFAULT ''
- `appointment_date` TEXT NOT NULL
- `time_slot` TEXT NOT NULL
- `note` TEXT DEFAULT ''
- `status` TEXT NOT NULL
- `review_note` TEXT DEFAULT ''
- `created_at` TEXT NOT NULL
- `reviewed_at` TEXT DEFAULT NULL

建议索引：
- `idx_appointments_customer_open_id`：`(customer_open_id)`
- `idx_appointments_date_status`：`(appointment_date, status)`
- `idx_appointments_pending`：`(status, created_at)`

说明：
- 业务唯一性不要仅靠数据库唯一索引硬编码死锁定，V1 先以审核通过时的业务校验为主。
- 若后续并发冲突增多，可再补“同日期同时间段 approved 唯一约束”策略。

## 后端实现建议顺序

1. 先抽出 SQLite 初始化模块，负责建表、默认种子数据、基础查询封装。
2. 优先让 `booking_rules` 与 `gallery_items` 能被稳定读取，确保首页与规则页有数据来源。
3. 再实现 `availability` 计算逻辑，统一复用在“顾客查看”和“预约创建校验”两个入口。
4. `approve` 审核动作必须复用同一套 slot 占用校验，避免顾客端和店员端口径分裂。
5. 所有时间字段继续使用字符串（`YYYY-MM-DD` / `HH:mm-HH:mm` / ISO 时间）即可，不必在 V1 提前引入复杂时区库。

## 演进路线

### V1
- 打通返图展示
- 打通规则配置
- 打通预约申请与审批
- 确保状态持久化

### V2
- 增加返图可视化上传/管理
- 增加顾客消息提醒
- 增加更细的营业日/特殊节假日规则
- 增加简单数据统计

### V3
- 增加商品售卖（手串、咖啡等）
- 增加支付能力
- 增加会员与营销功能
- 如门店扩张，再升级为多员工 / 多门店调度模型
