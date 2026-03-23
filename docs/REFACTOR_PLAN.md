# Incremental Refactor Plan

## 结论摘要

本项目**不应推倒重来**，而应采用“**前端稳住、后端并行替换**”的增量重构路线。

明确结论：

1. **前端不迁到 Taro / uni-app**
   - 当前仓库已经是原生微信小程序，页面数量少，且强依赖微信生态原生能力。
   - 现阶段迁框架会带来大面积返工，但对一店、低并发项目的业务价值不高。
   - 更合适的升级路径是：**保留原生小程序，逐步引入 TypeScript、类型定义、组件化、清晰的 services / types 分层**。

2. **后端应新建 `apps/api`，与旧 `apps/server` 并行一段时间**
   - 当前 `apps/server/src/server.mjs` 将 HTTP 路由、SQLite schema 迁移、SQL、种子数据、自测全部耦合在一个文件内，已不适合继续演进为真实生产结构。
   - 如果在原目录内直接“边写边改 NestJS”，新旧架构会混杂，回滚也会变得困难。
   - 因此推荐：**保留 `apps/server` 作为稳定旧基线；新增 `apps/api` 承载 NestJS + Prisma + MySQL 方案，走并行迁移与灰度切换。**

3. **现在就做的，是生产化骨架与边界治理；以后再做的，是复杂基础设施**
   - 现在就做：NestJS 单体、Prisma、MySQL 8、Docker 化、生产登录链路设计、前端类型化、契约冻结、迁移脚本。
   - 以后再做：Redis、消息队列、微服务、后台独立系统、多店模型、跨端框架。

4. **第一优先级不是改页面，而是冻结基线与搭新后端骨架**
   - 2026-03-20 18:4x：首轮 `apps/api` 并行骨架已真实落入当前 repo，包含 Nest health 模块、Prisma v1 schema 与 init migration；随后已完成依赖安装、`prisma generate` 与 Nest build，自此进入“本地可构建、待环境验证”阶段。
   - 2026-03-20 21:0x：首个业务模块 `gallery` 已迁入 `apps/api` 并通过再次 build，说明新后端已从“纯骨架”进入“可承载第一条冻结契约业务路由”的阶段。下一步转入 MySQL / Docker 环境补齐、`prisma migrate deploy`、`/health` 与 `/api/v1/gallery` 运行级验证。
   - 当前业务流程已跑通，最怕的是“边重构边把可用基线弄丢”。
   - 所以先做：**基线冻结、兼容契约、Nest 骨架、Prisma schema、MySQL / Docker、本地切换能力**。

## 已拍板决策（2026-03-20）

- 已确认采用 **`apps/api` 与现有 `apps/server` 并行** 的增量重构路径。
- 已确认在 **Phase 1 引入 `pnpm workspace`**，但不在同一阶段叠加重型 shared DTO / codegen 体系。
- 已确认当前主线从“讨论重构”切换为“Phase 0 / 1 首轮任务落地”。

---

## 一、当前架构诊断（基于代码事实）

### 1.1 当前前端真实技术栈

补充边界文档：详见 `docs/WEAPP_REFACTOR_BOUNDARY.md`，后续前端 TS 增量迁移与 worker brief 一律以该文档与本计划联合为准。

代码事实：
- 小程序入口与页面注册在 `apps/weapp/app.json`
- 应用启动与全局状态在 `apps/weapp/app.js`
- 当前页面包括：
  - `pages/home/index`
  - `pages/gallery-detail/index`
  - `pages/booking/index`
  - `pages/my-bookings/index`
  - `pages/staff/rules/index`
  - `pages/staff/appointments/index`
- 服务层在 `apps/weapp/services/appointment.js`
- 请求封装在 `apps/weapp/utils/request.js`
- 顾客身份处理在 `apps/weapp/utils/customer.js`
- 店员身份处理在 `apps/weapp/utils/staff.js`
- 契约自检脚本在 `apps/weapp/scripts/contract-selfcheck.mjs`

真实结论：
- 当前前端是**原生微信小程序**，不是 Taro、不是 uni-app、也不是 React/Vue 封装层。
- 当前代码以 **JavaScript + Page() + wx.request + wx storage** 为主。
- 当前已经有基础分层：`pages / services / utils`，但**还没有 TypeScript、没有统一类型层、没有组件目录、没有更细的模块边界**。
- 当前顾客/店员联调身份依赖：
  - `X-Customer-OpenId`
  - `X-Staff-OpenId`
  由 `apps/weapp/utils/request.js` 注入。
- 当前开发态 mock 身份由客户端本地存储维护：
  - 顾客：`apps/weapp/utils/customer.js`
  - 店员：`apps/weapp/utils/staff.js`

### 1.2 当前后端真实技术栈

代码事实：
- 根脚本见根目录 `package.json`：
  - `dev:server`
  - `test:server`
  - `check:weapp-contract`
- 服务端脚本见 `apps/server/package.json`
- 当前主服务入口是 `apps/server/src/server.mjs`
- 当前数据库直接使用 `node:sqlite` 的 `DatabaseSync`
- 自测也内嵌在 `apps/server/src/server.mjs --self-test`
- 另有 `apps/server/src/storage/sqlite.mjs`，但当前启动脚本并不走这个文件

真实结论：
- 当前后端是 **Node.js 原生 http + SQLite + 手写 SQL + 单文件主服务**。
- 当前并不是 Express / Koa / NestJS。
- 当前数据库访问不是 ORM，而是**手写 SQL + schema/migration 逻辑混在服务文件中**。
- 当前后端存在一个明显的“生产感不足”问题：
  - `apps/server/src/server.mjs` 同时负责：
    - 路由
    - 请求解析
    - 权限校验
    - 数据校验
    - schema 创建 / 迁移
    - seed
    - 查询
    - 自测
  - 这使得模块边界、可测试性、可迁移性都较弱。

### 1.3 当前数据库 schema / 迁移逻辑 / 测试方式

代码事实：
- SQLite 初始化、建表、迁移在 `apps/server/src/server.mjs`
- 当前 `appointments` 表在迁移逻辑中保留了历史列：
  - `service_id`
  - `service_name`
  - `artist_id`
  - `artist_name`
  - `customer_open_id`
  - `date`
  - `time_slot`
- `gallery_items` 表仍保留：
  - `price_from`
  - `service_id`
  - `service_name`
  - `cta_text`
- 旧库兼容逻辑包括：
  - `appointment_date -> date` 迁移
  - 缺 `id` 的 appointments 表重建
  - 历史 `availability_slots` 推导 booking rules
  - approved 冲突去重
- 自测方式：`apps/server/src/server.mjs --self-test`
  - 使用内置 `assert`
  - 启临时 server + 临时 sqlite 文件
  - 覆盖 gallery / rules / availability / appointments / review / 迁移场景

真实结论：
- 当前服务端已经具备“能跑、能迁、能自测”的基础，但**schema 已被历史兼容逻辑污染**。
- 当前数据库模型仍夹带旧需求痕迹，不够干净。
- 当前测试不是独立测试工程，而是**主服务文件内嵌自测**，对后续 NestJS 演进不友好。

### 1.4 当前 API 契约与已可用能力

代码事实：
- 契约文档：`docs/API.md`
- 前端服务封装：`apps/weapp/services/appointment.js`
- 后端实际路由：`apps/server/src/server.mjs`

当前可用能力：
- `GET /health`
- `GET /api/v1/gallery`
- `GET /api/v1/availability`
- `POST /api/v1/appointments`
- `GET /api/v1/my/appointments`
- `GET /api/v1/staff/booking-rules`
- `PUT /api/v1/staff/booking-rules`
- `GET /api/v1/staff/appointments`
- `GET /api/v1/staff/appointments/:id`
- `POST/PATCH /api/v1/staff/appointments/:id/review`

当前已可用的业务能力：
- 顾客首页 / 返图 / 详情
- 顾客预约申请
- 我的预约
- 店员规则维护
- 店员审核
- 无权限拦截
- SQLite 持久化
- 契约自检与服务端自测

当前仍属于开发态 / 模拟态的部分：
- 顾客身份来自 `customer-openid-demo` 或自定义 mock OpenID，本质是开发联调方案
- 店员身份仍由前端手输 OpenID，本质是开发态权限模拟
- `apiBaseUrl` 当前在 `apps/weapp/app.js` 中写死本地 `http://127.0.0.1:3000`
- 生产登录链路（`wx.login -> 服务端换身份`）尚未落地
- 生产部署能力（Docker / MySQL / env 分层）尚未落地

### 1.5 当前最不像生产的部分

最不像生产的部分，按优先级排序：

1. **后端单文件大一统**
   - `apps/server/src/server.mjs`
2. **数据库 schema 与迁移逻辑直接耦合在业务入口**
3. **开发 mock 身份与生产身份没有真正分离**
4. **前端无 TypeScript、无共享类型、服务层边界偏薄**
5. **仓库虽已是 monorepo 形态，但还没有真正的 workspace / package 级协作能力**
6. **存在旧实现残留与死代码风险**
   - 如 `apps/server/src/storage/sqlite.mjs` 与当前主实现并行存在
   - gallery / appointment schema 仍有历史字段残留

### 1.6 可以保留 vs 必须重构

#### 可以保留的部分

- 原生微信小程序框架本身
- 当前页面信息架构与业务流程
- 当前 API 路径设计（至少过渡期保持兼容）
- 当前开发态 mock OpenID 联调方式（但要改成 dev-only 能力）
- 当前 UAT 基线、契约文档、自测口径
- 当前“顾客端 + 店员端同一小程序”的产品方案

#### 必须重构的部分

- 后端实现架构：从单文件 Node http 升级为模块化 NestJS
- 数据访问：从手写 SQL 迁移到 Prisma
- 数据库：从 SQLite 迁移到 MySQL 8（保留 SQLite 只作为旧系统回滚基线，不再作为目标生产栈）
- 生产鉴权：从前端手输 OpenID / header 联调，升级为 `wx.login + 服务端登录换身份`
- 前端服务边界：增加 TypeScript、types、清晰的 auth / services 分层
- 部署方式：增加 Docker 化与环境分层

---

## 二、目标架构方案

## 2.1 目标目录结构

推荐目标结构：

```text
repo/miniApp
├─ apps/
│  ├─ weapp/                 # 原生微信小程序（保留）
│  │  ├─ components/
│  │  ├─ pages/
│  │  ├─ services/
│  │  ├─ types/
│  │  ├─ utils/
│  │  ├─ app.ts / app.js
│  │  └─ scripts/
│  ├─ server/                # 旧 Node + SQLite 服务（过渡期保留，最终归档）
│  └─ api/                   # 新 NestJS 单体服务
│     ├─ src/
│     │  ├─ main.ts
│     │  ├─ app.module.ts
│     │  ├─ common/
│     │  ├─ modules/
│     │  │  ├─ health/
│     │  │  ├─ auth/
│     │  │  ├─ gallery/
│     │  │  ├─ booking-rules/
│     │  │  ├─ appointments/
│     │  │  └─ staff/
│     │  └─ infra/
│     │     ├─ prisma/
│     │     └─ config/
│     ├─ prisma/
│     │  ├─ schema.prisma
│     │  └─ migrations/
│     ├─ test/
│     ├─ Dockerfile
│     └─ package.json
├─ docs/
│  ├─ API.md
│  ├─ ARCHITECTURE.md
│  ├─ TASKS.md
│  ├─ UAT_GUIDE.md
│  └─ REFACTOR_PLAN.md
├─ infra/
│  ├─ docker/
│  └─ compose/
├─ tools/
│  ├─ migrate-sqlite-to-mysql.mjs
│  └─ check-docs.mjs
└─ package.json
```

## 2.2 前端推荐方案

### 保留什么
- 继续使用**原生微信小程序**
- 继续保留 `pages/home`、`pages/booking`、`pages/my-bookings`、`pages/staff/*`
- 继续保留微信原生 API 能力（登录、存储、导航、图片预览等）

### 增量升级什么
- 引入 **TypeScript**（先 services / utils / types，后 pages）
- 增加：
  - `services/http.ts`
  - `services/modules/*.ts`
  - `types/api.ts`
  - `types/domain.ts`
  - `types/auth.ts`
- 增加 `components/` 用于规则页、日历、状态卡片等可复用 UI
- 将当前 `utils/request.js` 逐步收口为更清晰的：
  - auth adapter
  - http client
  - error mapper

### 为什么不迁 Taro / uni-app
- 当前页面和业务规模不大，且微信生态原生能力是主要场景。
- 迁框架不会直接解决当前核心问题（后端架构、鉴权、部署、数据建模）。
- 迁框架会引入新的构建层和新的学习成本，反而削弱“低风险增量重构”。

## 2.3 后端推荐方案

### 推荐：新增 `apps/api`（NestJS 单体）

理由：
- 当前 `apps/server` 已经是可运行基线，直接在原目录内“换引擎”风险高。
- 新建 `apps/api` 可以：
  - 并行开发
  - 并行联调
  - 并行压测/自测
  - 随时回退到旧 `apps/server`
- 这更符合“增量重构、可回滚”的要求。

### NestJS 模块建议
- `health`：健康检查
- `auth`：`wx.login` 换身份、dev mock 登录
- `gallery`：首页返图 / 详情
- `booking-rules`：规则读写
- `appointments`：顾客预约与我的预约
- `staff`：店员审核与列表
- `common`：异常过滤器、DTO、guards、interceptors、config
- `infra/prisma`：PrismaService、repo 实现

## 2.4 数据库推荐方案

### 目标数据库：MySQL 8

原因：
- 比 SQLite 更接近常见生产环境
- Prisma 支持成熟
- 后续若迁云托管 / 容器平台更自然
- 对当前体量已经足够，不需要更复杂方案

### 建模原则
- **优先贴合当前契约，不追求一次建成“完美模型”**
- 第一版模型可保持：
  - `GalleryItem`
  - `BookingRule`（单店单行或 singleton 配置）
  - `User`
  - `Appointment`
- 不急于引入 `Store`、`StaffSchedule`、`ServiceCatalog` 等复杂对象

推荐第一版核心模型：
- `User`
  - `id`
  - `wechatOpenId` (unique)
  - `role` (`CUSTOMER` / `STAFF`)
  - `displayName`
  - `phone`
  - `createdAt`
- `Appointment`
  - `id`
  - `customerId`
  - `customerNameSnapshot`
  - `phoneSnapshot`
  - `date`
  - `timeSlot`
  - `note`
  - `status`
  - `reviewedAt`
  - `reviewedByUserId`
  - `reviewNote`
  - `createdAt`
- `BookingRule`
  - `id`
  - `advanceOpenDays`
  - `closedDatesJson`
  - `dailySlotsJson`
  - `updatedAt`
- `GalleryItem`
  - `id`
  - `title`
  - `coverImageUrl`
  - `imageUrlsJson`
  - `tagsJson`
  - `sortOrder`
  - `status`

## 2.5 鉴权方案

### 生产链路
- 小程序端：`wx.login()` 获取 `code`
- 服务端：调用微信接口换 `openid`
- 服务端本地建立/查找 `User`
- 服务端发放登录态（推荐短期使用**签名 token / JWT**）
- 前端后续调用带 `Authorization: Bearer <token>`

### 开发链路
- 保留当前 mock OpenID 联调模式
- 但必须明确改成 **dev-only**：
  - 仅在开发环境开启
  - 可通过显式 env 控制
  - 不进入生产配置
- 过渡期允许：
  - 新 API 支持 dev mock 登录
  - 旧 `X-Customer-OpenId / X-Staff-OpenId` 仅用于兼容联调

## 2.6 部署方案

### 现在就做
- `apps/api` Dockerfile
- MySQL 8 docker compose
- `.env.example`
- 本地 / 测试环境容器化启动

### 以后再做
- 云托管 / K8s / 自动扩缩容
- Redis session / cache
- 多环境自动发布流水线

## 2.7 关于 pnpm workspace / shared package / OpenAPI / Swagger / shared DTO

前端边界补充：详见 `docs/WEAPP_REFACTOR_BOUNDARY.md`。
该文档基于当前真实 `apps/weapp` 代码，而不是理想目录，定义了 TypeScript 首批落点、mock auth / request / services 的迁移顺序，以及为什么 `booking` / `staff/*` 不应作为首批 TS 化页面。  



### pnpm workspace
**建议引入，但放在 Phase 1，作为轻量基础设施升级。**

收益：
- 当前仓库本质已是 monorepo 形态（`apps/* + docs + tools`）
- 新增 `apps/api` 后，依赖管理会明显更复杂
- 对后续 `packages/contracts` 或 shared types 有帮助

复杂度：
- 低到中等
- 主要成本是切换包管理与 scripts 调整

结论：
- **建议引入 `pnpm workspace`，但不要在同一阶段同时做太多共享包设计。**

### shared package / shared DTO
**不建议一上来就做完整 shared DTO 体系。**

收益：
- 统一类型
- 减少前后端字段漂移

复杂度：
- 对原生小程序 + NestJS 来说，构建链会明显更复杂
- 容易把“类型共享”做成“构建共享”问题

结论：
- 先用：
  - `docs/API.md` + Nest DTO + 前端手写 `types/api.ts`
- 等前端 TypeScript 化稳定后，再考虑抽出 `packages/contracts`

### Swagger / OpenAPI
**建议在 NestJS 上开启 Swagger，但先用于文档与调试，不做前端自动代码生成。**

收益：
- 很符合学习价值
- 有真实生产感
- 便于联调和回归

复杂度：
- 低

结论：
- **建议启用 Swagger**
- **暂不建议做 OpenAPI client codegen**

---

## 三、重构分阶段计划

## Phase 0：冻结现有契约与基线验证

### 目标
- 冻结当前 API 路径与业务基线
- 固化当前 UAT / 自测通过状态
- 明确旧系统作为回滚基线

### 不做什么
- 不改业务流程
- 不改前端页面结构
- 不开始迁 Nest 业务逻辑

### 完成标志
- `docs/API.md`、`docs/UAT_GUIDE.md`、`docs/UAT_RESULTS.md` 可作为切换前基线
- 当前 `apps/server` 与 `apps/weapp` 在本地可重新联调
- 留存 SQLite 基线数据库样例与关键回归用例

### 风险
- 边重构边改业务，导致无法判断问题来自旧逻辑还是新逻辑

### 回滚策略
- 这一阶段无切换，只要保持 `apps/server` + `apps/weapp` 当前可运行即可

## Phase 1：后端新架构脚手架与数据库建模

### 目标
- 新建 `apps/api`
- 初始化 NestJS、Prisma、MySQL、Docker、本地 env
- 建立第一版 Prisma schema
- 跑通 `/health` 与基础数据库连接

### 不做什么
- 不迁完整业务接口
- 不切掉旧 `apps/server`
- 不改前端页面逻辑

### 完成标志
- `apps/api` 可独立启动
- MySQL 容器可启动
- Prisma migration 可执行
- `/health` 与 Swagger 可访问
- 有 SQLite -> MySQL 数据导入脚本雏形

### 风险
- 仓库结构和依赖管理调整过大
- Prisma schema 与当前契约脱节

### 回滚策略
- `apps/server` 仍是唯一联调服务
- `apps/api` 仅作为并行新栈，不参与线上/联调切换

## Phase 2：业务模块迁移与新旧接口并行

### 目标
- 将 `gallery / booking-rules / appointments / staff review` 迁入 `apps/api`
- 保持旧 API 路径兼容
- 增加 dev mock 登录兼容层
- 引入 SQLite -> MySQL 数据迁移脚本

### 不做什么
- 不强制前端一次切全部新鉴权
- 不删旧 `apps/server`
- 不做多店 / 多员工扩展

### 完成标志
- `apps/api` 在兼容旧 API 路径下可独立支撑当前业务闭环
- 核心接口在新旧服务下返回口径一致
- 关键 UAT 在 `apps/api` 上通过

### 风险
- 新旧接口返回细节不一致
- 数据迁移脚本漏映射历史字段

### 回滚策略
- 通过端口 / env 切回 `apps/server`
- 前端仍可继续调用旧服务
- 并行环境与回滚操作细则见 `docs/API_PARALLEL_RUNBOOK.md`

## Phase 3：前端类型化与适配新登录链路

### 目标
- 前端逐步引入 TypeScript
- 抽清 auth adapter、http client、services、types
- 接入新登录链路，同时保留 dev mock 模式

### 不做什么
- 不迁 Taro / uni-app
- 不全面重写页面
- 不把所有页面一次性改成 TS

### 完成标志
- `services` / `types` / `auth` 边界清晰
- 登录链路可在 dev / prod 两种模式下切换
- 页面仍保持稳定，联调成本可控

### 风险
- 原生小程序 TS 构建链与现有 JS 文件混用带来组织复杂度
- 一次性改太多页面导致回归

### 回滚策略
- 保持旧 request 层兼容一段时间
- 页面层可继续走现有 JS 实现，分批替换

## Phase 4：部署、测试、切换与清理

### 目标
- Docker 化交付
- 建立环境样例、启动说明、切换说明
- 完成 `apps/server -> apps/api` 主切换
- 清理或归档旧服务与死代码

### 不做什么
- 不做微服务化
- 不上 Redis / MQ
- 不做复杂观测平台

### 完成标志
- `apps/api + MySQL` 可容器化运行
- 前后端均切到新登录与新服务
- 旧 `apps/server` 进入只读回滚基线或归档状态

### 风险
- 切换窗口内数据不一致
- 文档未同步导致环境误用

### 回滚策略
- 保留旧 `apps/server` 与 SQLite 数据快照
- 保留旧启动方式和接口路径兼容说明

---

## 四、agent 任务拆解

> 说明：以下按 `architect / coordination`、`backend`、`frontend`、`shared-contract`、`test/devops` 拆解。当前系统实际可派发的 worker 主要是 `miniapp-backend` 与 `miniapp-frontend`；其余任务默认由 architect 协调或在 docs 中落地。

| 任务名称 | 目标 | 输入 | 输出 | 依赖 | 涉及目录/文件 | 建议负责人 | 验收标准 | 风险点 | 可并行 | 优先级 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Freeze current contract baseline | 冻结当前 API / UAT / 回滚基线 | 现有 `docs/API.md`、`UAT_*`、当前代码 | 基线清单、回滚说明、接口快照 | 无 | `docs/API.md`, `docs/UAT_GUIDE.md`, `docs/UAT_RESULTS.md`, `docs/REFACTOR_PLAN.md` | architect / coordination | 当前基线、通过项、回滚路径明确 | 边重构边漂移 | 是 | P0 |
| Audit current backend to target module map | 把当前 `server.mjs` 按未来 Nest 模块拆图 | `apps/server/src/server.mjs` | 模块映射表、迁移顺序、兼容清单 | 无 | `docs/REFACTOR_PLAN.md`, 补充 docs | architect / backend | 清楚列出 health/auth/gallery/rules/appointments/staff 模块边界 | 抽象过度 | 是 | P0 |
| Scaffold Nest app in parallel | 新建 `apps/api` NestJS 骨架，不影响旧服务 | 当前 repo、目标技术栈 | `apps/api` 可启动骨架、health、config、Swagger | Freeze current contract baseline | `apps/api/**` | backend | `apps/api` 可启动，`/health` 可访问，不影响 `apps/server` | 新旧目录混用 | 是 | P0 |
| Create Prisma schema v1 | 设计与当前契约兼容的 Prisma 模型 | 当前 sqlite schema、API 契约 | `prisma/schema.prisma`、migration 初稿 | Scaffold Nest app in parallel | `apps/api/prisma/**` | backend | Prisma schema 覆盖 gallery / booking rules / users / appointments | 建模过度或遗漏兼容字段 | 否（与 scaffold 有轻微重叠） | P0 |
| Add MySQL dockerized dev env | 提供 MySQL 8 本地/测试环境与 env 样例 | 目标部署约束 | `docker-compose`、`.env.example`、启动说明 | Scaffold Nest app in parallel | `infra/**`, `apps/api/Dockerfile`, docs | test/devops | MySQL 一键启动，Nest 可连接 | 环境变量口径不统一 | 是 | P0 |
| Design SQLite to MySQL import path | 定义旧库迁移脚本与字段映射 | `apps/server/data/*.sqlite`, `server.mjs` | 字段映射表、导入脚本方案 | Create Prisma schema v1 | `tools/**`, docs | backend | 能说明每张表如何迁入 MySQL | 历史脏数据处理不完整 | 是 | P1 |
| Frontend architecture inventory | 审查当前 pages/services/utils，定义 TS 迁移边界 | `apps/weapp/**` | 迁移清单、模块边界、改造顺序 | Freeze current contract baseline | `docs/REFACTOR_PLAN.md` 或独立 brief | frontend | 给出 pages/components/services/types 边界，不改页面行为 | 只谈理想不贴现状 | 是 | P0 |
| Introduce typed service boundary | 在不改页面行为前提下，为前端建立 types / http / auth 分层入口 | 当前 weapp 代码、兼容 API 契约 | `types/*`, `services/http.*`, `services/modules/*` 方案或首批代码 | Frontend architecture inventory | `apps/weapp/services/**`, `apps/weapp/types/**`, `apps/weapp/utils/**` | frontend | 页面可继续运行，services/types 边界更清晰 | 动到页面太多 | 是 | P1 |
| Define production auth transition | 设计 `wx.login -> server auth` 过渡方案，保留 mock 联调 | 当前 mock OpenID 方案、目标生产链路 | 登录时序图、前后端兼容规则、env 控制策略 | Freeze current contract baseline | `docs/ARCHITECTURE.md`, `docs/REFACTOR_PLAN.md`, maybe `docs/API.md` | shared-contract / architect | 开发态与生产态边界清晰 | 设计过早、实现过晚 | 是 | P0 |
| Add API compatibility tests | 为新旧服务建立兼容断言 | 当前 self-test 与 API 契约 | 兼容性用例清单 / 初版脚本 | Scaffold Nest app in parallel | `apps/api/test/**`, `tools/**`, docs | test/devops / backend | 能比对关键接口旧新口径 | 测试覆盖不足 | 是 | P1 |
| Plan cutover and rollback playbook | 定义切换到 `apps/api` 的步骤、回滚条件、数据保护方式 | 当前运行方式、目标部署方式 | 切换手册、回滚手册 | Phase 1/2 基础完成 | `docs/REFACTOR_PLAN.md`, `docs/WORKFLOW.md` | architect / coordination | 任一阶段都能切回旧服务 | 回滚路径文档化不足 | 是 | P1 |

---

## 五、首轮执行建议（第一批最值得启动的任务）

建议第一轮启动 **5 个任务**，且尽量并行：

1. **P0 / architect：Freeze current contract baseline**
2. **P0 / backend：Scaffold Nest app in parallel**
3. **P0 / backend：Create Prisma schema v1**（可在 scaffold 基本成型后紧接）
4. **P0 / frontend：Frontend architecture inventory**
5. **P0 / test-devops：Add MySQL dockerized dev env**

### 为什么先做这些

#### 不先全量迁移页面
- 因为前端当前已经能跑，页面不是当前最脆弱的部分。
- 真正的架构风险在后端实现方式、鉴权链路和数据库演进能力。

#### 不先重写旧后端
- 因为旧后端是唯一稳定回滚基线。
- 直接在旧目录重写，会把“稳定基线”和“新架构实验”混到一起。

#### 不先做复杂共享包 / DTO / 代码生成
- 因为项目规模还不需要。
- 先把新后端骨架、数据库模型、部署环境搭起来，收益最高。

### 为什么这 5 个任务可以并行
- baseline 冻结：主要写 docs，不碰代码运行时
- Nest scaffold：主要写 `apps/api/**`
- MySQL Docker env：主要写 `infra/**`、Docker 配置
- 前端架构 inventory：主要读代码、写方案，不改页面行为
- Prisma schema：与 scaffold 有依赖，但可在骨架完成后马上接续，不影响 frontend / docs / infra 并行

### 这批任务完成后能得到什么
- 旧系统仍能运行
- 新系统已有骨架
- 数据模型有了方向
- 环境有了落地方式
- 前端知道未来怎么增量升级，而不是被动等后端“推倒重来”

补充状态（2026-03-20 19:1x）：`DEV-001` 已有第一版实物——`infra/compose/docker-compose.api.yml` 与 `docs/API_ENV_AND_CUTOVER.md`。当前环境方案已从“仅文档占位”推进到“可按手册启动 MySQL、并指导新旧服务切换/回滚”的阶段。

---

## 六、重构触发阈值

以下阈值是**贴合本项目**的，而不是泛泛的“企业级模板”。

### 6.1 什么时候需要 Redis

**当前不需要。**

建议触发阈值：
- 预约时段冲突明显增多，单机 MySQL + 行级约束已不足以应对峰值写入
- 开始需要：
  - 高频验证码 / 登录态缓存
  - 热门 availability 结果缓存
  - 限流 / 黑名单 / 临时会话存储
- 并发明显高于现在的“一店低并发”水平，例如同时数十到上百请求争抢同一时间段

### 6.2 什么时候需要拆分后台管理系统

**当前不需要。**

建议触发阈值：
- 店员功能明显膨胀到超过顾客端两倍以上
- 出现复杂报表、内容管理、员工管理、营业设置等后台式功能
- 店员页面在小程序内已经明显影响顾客端导航和心智
- 出现多角色协作（老板、店长、店员）

### 6.3 什么时候需要考虑多店模型

**当前不建议做。**

建议触发阈值：
- 明确出现第二家门店，且需要独立规则 / 员工 / 预约池
- 需要跨门店查看预约与统计
- 当前“单店 singleton booking rules”已无法承载业务事实

### 6.4 什么时候需要考虑跨端方案 / 迁 Taro/uni-app

**当前不建议。**

建议触发阈值：
- 确认未来 6~12 个月内要同时维护 H5、支付宝、字节、App 等多个前端目标
- 同一业务页面需要多端共享超过 70% UI / 逻辑
- 团队已能接受额外构建链复杂度，并确认迁移收益高于风险

### 6.5 什么时候需要考虑拆服务 / 微服务

**当前明确不建议。**

建议触发阈值：
- 出现独立扩容边界（如内容、预约、消息、支付完全不同流量模型）
- 团队已有独立运维与服务治理能力
- 单体发布频繁互相牵连，且已出现真实组织性瓶颈

---

## 七、风险与非目标

## 7.1 当前阶段主要风险

1. **为了“像生产”而过度设计**
   - 典型错误：一上来就 Redis / MQ / DDD / 微服务
2. **重构期丢失当前可运行基线**
   - 典型错误：直接把 `apps/server` 改成半 Nest 半旧逻辑
3. **前端大面积返工**
   - 典型错误：先迁框架、再补登录、再补类型
4. **新旧服务契约不兼容**
   - 典型错误：路径不变但字段悄悄变了
5. **数据库建模脱离当前业务规模**
   - 典型错误：为了未来多店、多员工而提前上复杂模型

## 7.2 当前阶段明确不建议做的事情

- **不建议迁 Taro / uni-app**
- **不建议直接微服务化**
- **不建议一次性把前端和后端全部重写**
- **不建议在旧 `apps/server` 里直接硬改成 NestJS**
- **不建议现在就上 Redis / MQ / 复杂 DDD 分层**
- **不建议为了类型共享立刻引入重型 shared DTO / 代码生成体系**
- **不建议先改页面皮肤或大规模 UI 重构**

## 7.3 当前阶段建议坚持的原则

- **后端先重构，前端只做配套升级**
- **新旧并行，随时可回滚**
- **路径兼容优先于“架构洁癖”**
- **先把生产骨架搭起来，再谈进阶复杂度**
- **所有任务都要有清晰写集、依赖与验收标准，方便多 agent 并行协作**
