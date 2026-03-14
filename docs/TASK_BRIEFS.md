# TASK_BRIEFS

## 使用说明

本文件作为前后端执行级 handoff 文档。
字段口径、接口定义、范围边界，以 `docs/PRD.md`、`docs/ARCHITECTURE.md`、`docs/API.md` 为准。

---

## 当前代码基线（执行前先对齐）

### 前端现状
- 已存在页面：`apps/weapp/pages/home/index.*`、`apps/weapp/pages/booking/index.*`、`apps/weapp/pages/my-bookings/index.*`、`apps/weapp/pages/staff/rules/index.*`、`apps/weapp/pages/staff/appointments/index.*`
- 已存在服务层：`apps/weapp/services/appointment.js`
- 首页已切到 `gallery` 返图展示 + 预约 CTA 结构，不再以“服务项目 + 最近预约”旧模型为主视图。
- 预约页已改为 `availability -> appointmentDate/timeSlot` 提交流程，并在成功后跳转“我的预约”。
- `pages/my-bookings/index.*` 当前仍以手机号查询为主；本轮需切换为 OpenID 主键查询并保留手机号展示。
- `pages/staff/rules/index.*` 已支持店员 OpenID 输入、规则读取/保存、不可预约日期维护与时间段增删改。
- `pages/staff/appointments/index.*` 已支持店员 OpenID 输入、按状态查看预约、执行通过/拒绝并展示错误反馈。
- `app.json` 已注册 `pages/home/index`、`pages/booking/index`、`pages/my-bookings/index`、`pages/staff/rules/index`、`pages/staff/appointments/index`。
- 前端主链路已具备首版页面实现，后续重点转为配合 SQLite 落地后的联调修正与体验收口。

### 后端现状
- 当前实现位于 `apps/server/src/server.mjs`
- 已实现接口：`GET /health`、`GET /api/v1/gallery`、`GET /api/v1/availability`、`POST /api/v1/appointments`、`GET /api/v1/my/appointments`、`GET/PUT /api/v1/staff/booking-rules`、`GET /api/v1/staff/appointments`、`POST /api/v1/staff/appointments/:id/review`
- 当前数据模型已切到 `gallery + bookingRule + appointments` 新口径，并已包含默认种子数据、规则校验、审核冲突校验与 staff 白名单鉴权。
- CORS `Access-Control-Allow-Methods` 已补齐 `GET,POST,PUT,OPTIONS`，可支撑当前 V1 staff 接口调用。
- BE-005（SQLite 持久化）已完成；当前主要收口项为顾客身份主键切换（phone -> OpenID）与前后端接口口径防回退。
- staff 接口继续统一按 `X-Staff-OpenId` 请求头 + 后端白名单校验，禁止前后端各自发明新口径。

### 执行原则
- 以“替换旧骨架到新口径”为目标，而不是在旧字段上打补丁。
- 如为兼容调试临时保留旧接口，需明确标注为过渡，不得反向影响 `docs/API.md`。

### 旧骨架 -> 新口径迁移清单

#### Frontend

| 当前位置 | 旧实现 | 新目标 |
| --- | --- | --- |
| `pages/home/index.js` | `listServices()` + `listAppointments()` 同屏展示服务与最近预约 | 改为品牌区 + `gallery` 返图展示 + CTA，不再把预约列表放首页主视图 |
| `pages/booking/index.js` | 通过 `serviceId/serviceName/date/timeSlot` 直接提交旧版预约 | 改为 `availability` 驱动的 `appointmentDate/timeSlot` 提交，并明确“待审核”语义 |
| `services/appointment.js` | 仅封装 `/services`、旧版 `/appointments` | 按领域拆分或重写为 `gallery / availability / appointments / my / staff` 新接口封装 |
| `app.json` | 已注册 `home`、`booking`、`my-bookings`、`staff/rules`、`staff/appointments` | 继续保持页面注册与实际页面目录一致，不再遗漏 staff 页面 |

#### Backend

| 当前位置 | 旧实现 | 新目标 |
| --- | --- | --- |
| `apps/server/src/server.mjs` | 内存数据：`services` + 旧版 `appointments` | 迁移为 `gallery`、`booking_rules`、`appointments` 三类核心数据对象 |
| `/api/v1/appointments` | 直接创建预约，字段为 `serviceId/serviceName/date` | 改为审批制申请，字段为 `appointmentDate/timeSlot`，默认 `pending` |
| 路由层 | 仅 `GET/POST` | 需新增 `PUT /api/v1/staff/booking-rules`、staff review、my appointments、availability |
| CORS | `Access-Control-Allow-Methods` 仅 `GET,POST,OPTIONS` | 需补齐 `PUT,OPTIONS` 并覆盖新的 staff 接口调用 |
| staff 权限 | 无 | 统一按 `X-Staff-OpenId` + 白名单校验，不允许散落在单个 handler 内 |

---

# Frontend Brief

## FE-001 首页与返图展示

- Owner: frontend
- 背景：首页承担品牌展示与预约转化双重职责
- 目标：实现温和、有品牌感的首页，并接入返图展示数据
- 相关页面：`apps/weapp/pages/home/index.*`
- 可能涉及：`apps/weapp/services/appointment.js`（建议按新领域拆分）、公共卡片组件、图片展示组件、请求服务层

### 必须完成
- 首页品牌欢迎区
- 返图列表展示
- 明确“立即预约”按钮
- “查看我的预约”次入口
- loading / empty / error 态

### 完成标准
- 页面视觉方向符合 `docs/PRD.md` 中 UI 关键词
- gallery 接口成功时能稳定展示数据
- 接口失败时不白屏
- 点击 CTA 能进入预约页

### 明确禁止
- 不加商品售卖入口
- 不引入重型动画库
- 不自行改接口字段

---

## FE-002 预约申请流程

- Owner: frontend
- 背景：顾客需要在清晰、低负担流程中完成预约申请
- 相关页面：`apps/weapp/pages/booking/index.*`
- 依赖接口：`GET /api/v1/availability`、`POST /api/v1/appointments`

### 必须完成
- 月份 / 日期选择
- 当日可预约时间段展示
- 姓名 / 手机号 / 备注表单
- 提交预约申请
- 成功提示与失败提示

### 完成标准
- 只能提交接口允许的日期 / 时间段
- 提交成功后状态文案明确为“待审核”
- 手机号、必填项、空状态校验完整

### 明确禁止
- 不做支付
- 不做自动审批文案
- 不做多员工选择

---

## FE-003 我的预约页

- Owner: frontend
- 背景：顾客需要查看预约审批状态
- 相关页面：`apps/weapp/pages/my-bookings/*`（新建）
- 依赖接口：`GET /api/v1/my/appointments`

### 必须完成
- 按当前顾客 OpenID 查询入口（开发环境可用模拟值）
- 预约记录列表
- 状态标签展示：待审核 / 已通过 / 已拒绝
- 空态 / 错误态

### 完成标准
- 顾客可按 OpenID 查到自己的预约记录
- 状态映射统一，不出现英文原值直出
- 若有 `reviewNote`，可展示给顾客

### 明确禁止
- 不做复杂筛选
- 不做账号体系扩展

---

## FE-004 店员规则配置页

- Owner: frontend
- 背景：店员需要独立配置预约开放规则
- 相关页面：`apps/weapp/pages/staff/rules/*`（新建）
- 依赖接口：`GET/PUT /api/v1/staff/booking-rules`

### 必须完成
- 提前开放天数输入
- 不可预约日期选择
- 时间段列表增删改
- 保存动作
- 基础校验：空值、非法时间、时间段重叠

### 完成标准
- 店员能读取当前规则并编辑保存
- 非法时间段在前端先被拦截
- 保存成功后有明确反馈

### 明确禁止
- 不做周期性复杂排班
- 不做多门店共享规则

---

## FE-005 店员预约审核页

- Owner: frontend
- 背景：店员需要高效处理待审核预约
- 相关页面：`apps/weapp/pages/staff/appointments/*`（新建）
- 依赖接口：`GET /api/v1/staff/appointments`、`POST /api/v1/staff/appointments/:id/review`

### 必须完成
- 默认展示 `pending` 列表
- 显示顾客信息 / 时间信息 / 备注
- 通过 / 拒绝动作
- 审核结果反馈

### 完成标准
- 单条审核操作可完成闭环
- 冲突错误、重复审核错误能展示给店员
- 审核完成后列表自动刷新或局部更新

### 明确禁止
- 不做批量审核
- 不做复杂筛选后台

---

# Backend Brief

## BE-001 返图展示接口

- Owner: backend
- 背景：首页需要真实可用的返图数据来源
- 相关模块：`apps/server/src/server.mjs` 及其拆分出的数据/存储模块
- 目标接口：`GET /api/v1/gallery`

### 必须完成
- 返回 active gallery item 列表
- 稳定排序
- 字段与 API 文档一致

### 完成标准
- 返回结构与 `docs/API.md` 完全一致
- 至少有默认种子数据，方便前端联调

### 明确禁止
- 不擅自改字段名
- 不把返图和预约数据混表

---

## BE-002 availability / 创建预约 / 我的预约

- Owner: backend
- 背景：顾客端预约闭环核心接口
- 目标接口：
  - `GET /api/v1/availability`
  - `POST /api/v1/appointments`
  - `GET /api/v1/my/appointments`

### 必须完成
- 基于规则计算可预约日期与时间段
- 校验关闭日期、提前开放天数、已占用时段
- 创建预约默认 `pending`
- 创建与查询均按 `customerOpenId` 作为身份主键

### 完成标准
- 顾客不能绕过规则提交非法预约
- 状态默认正确
- 时间段 value 与前端提交口径一致
- `GET /api/v1/my/appointments` 不再依赖手机号作为主查询条件

### 明确禁止
- 不做支付状态
- 不做自动提醒
- 不做多员工容量模型

---

## BE-003 店员预约规则读写

- Owner: backend
- 背景：店员需要维护可预约规则
- 相关模块：`apps/server/src/server.mjs`，并预留后续拆分 `booking-rules` 校验逻辑
- 目标接口：
  - `GET /api/v1/staff/booking-rules`
  - `PUT /api/v1/staff/booking-rules`

### 必须完成
- 提供默认规则
- 校验 `advanceOpenDays`
- 校验 `closedDates`
- 校验 `dailySlots` 时间格式与重叠关系
- 对所有 `/api/v1/staff/*` 请求统一校验 `X-Staff-OpenId`

### 完成标准
- 读写一致
- 非法规则被拒绝
- 更新时间正确写入

### 明确禁止
- 不提前做复杂排班系统
- 不引入多员工规则对象

---

## BE-004 店员预约审核

- Owner: backend
- 背景：审批制预约的核心闭环
- 相关模块：`apps/server/src/server.mjs`，并复用 availability / slot 占用判断逻辑
- 目标接口：
  - `GET /api/v1/staff/appointments`
  - `POST /api/v1/staff/appointments/:id/review`

### 必须完成
- 支持按状态拉取预约列表
- 支持 approve / reject
- approve 时再次校验 slot 是否已被占用
- 已审核记录禁止重复审核
- staff 接口未通过鉴权时返回 `STAFF_UNAUTHORIZED`

### 完成标准
- `approved` / `rejected` 状态写入正确
- 冲突时返回明确错误码
- `reviewedAt` 正确写入

### 明确禁止
- 不做批量审批
- 不做复杂审批流

---

## BE-005 SQLite 持久化

- Owner: backend
- 背景：规则、预约、返图数据不能因服务重启丢失
- 相关模块：数据库初始化、数据访问层、种子数据；当前后端入口为 `apps/server/src/server.mjs`

### 必须完成
- 建立 gallery / booking_rules / appointments 三类数据持久化
- 初始化默认规则与返图种子数据
- 服务重启后数据仍可读取

### 完成标准
- 通过 `docs/TASKS.md` 中持久化验收 case
- 不回退为纯内存唯一存储

### 建议实现形态
- 优先保持 `apps/server/src/server.mjs` 作为 HTTP 入口，不在本轮顺手大拆框架。
- 可新增轻量存储模块（如 `src/storage/*`），承接：SQLite 初始化、默认种子、读写封装、JSON 字段序列化/反序列化。
- `gallery_items.tags_json`、`booking_rules.closed_dates_json`、`booking_rules.daily_slots_json` 允许先以 JSON 字符串落库，对外 API 仍返回数组对象。
- 服务启动时先做建表与默认种子检查：仅当表为空时写入默认 gallery / rule 数据，避免重启覆盖已有数据。
- `PUT /api/v1/staff/booking-rules`、`POST /api/v1/appointments`、`POST /api/v1/staff/appointments/:id/review` 完成后应立即持久化，不能只写内存镜像。
- 若保留进程内缓存，缓存必须以数据库为唯一真实来源；重启后应能完整恢复。

### 自测最低要求
- 启动服务后读取 `GET /api/v1/gallery`、`GET /api/v1/staff/booking-rules` 正常。
- 创建一条预约、审核通过、重启服务后，再查询“我的预约”仍能看到同一状态。
- 修改 booking rule 后重启服务，`availability` 结果仍按新规则返回。

### 明确禁止
- 不引入超出项目骨架承受力的重 ORM 复杂方案（如无必要）
- 不为了接 SQLite 而顺手改动既有 API 字段或路径

---

# 交付顺序建议

## 当前建议优先级（基于最新代码基线）

### 第一优先级：接口与身份口径收口
- FE-007 / BE-006：顾客身份主键切换（phone -> OpenID）
- ARCH-004：接口口径防回退（禁用旧 `/api/v1/services` 与旧预约查询路径）

目标：避免“页面可见但数据链路未跑通”的假通过。

### 第二优先级：完整联调验收
- ARCH-003：按更新后的 `docs/UAT_GUIDE.md` 执行验收（含首页返图、接口口径一致性）

目标：验证“顾客申请 -> 店员审核 -> 顾客查看状态”与“规则修改 -> 可预约结果变化”两条主链路均可跑通。

### 第三优先级：体验收口
- FE：基于真实联调结果修正文案、空态、错误提示与入口分流

目标：让顾客端/店员端切换路径清晰，降低误操作和误判。
