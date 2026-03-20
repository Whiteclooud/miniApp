# WeApp Refactor Boundary

## 目的

本文件用于把当前 `apps/weapp` 的**真实代码边界**落成后续可执行的前端增量迁移基线，避免 worker 只按理想目录做 TypeScript 改造，导致再次偏离当前仓库事实。

原则：
- 先基于当前真实代码结构定义边界，再做 TypeScript 迁移
- 先稳住现有页面行为，再逐步抽清 `types / auth / request / services`
- 不把“迁类型”误做成“重写页面”

---

## 一、当前真实前端边界

### 1. 页面层 `pages/**`

当前业务页面真实围绕以下冻结主链路：
- 顾客端：`home` / `gallery-detail` / `booking` / `my-bookings`
- 店员端：`staff/rules` / `staff/appointments`

页面复杂度分层：
- **低风险试点页**：`gallery-detail`、`my-bookings`
  - 展示逻辑相对集中
  - 状态分支较少
  - 适合作为首批页面级 TS 试点
- **中风险页**：`home`
  - 有接口加载、导航与展示组合，但状态机相对可控
- **高风险页**：`booking`、`staff/rules`、`staff/appointments`
  - 同时包含数据整形、页面状态、表单交互、提交逻辑
  - 当前不适合首批直接改为 `.ts`

### 2. 服务层 `services/appointment.js`

当前 `services/appointment.js` 实际承担的是**跨顾客端与店员端的 service facade**，而不是狭义的 appointment service。

当前覆盖的领域包括：
- gallery
- availability
- appointments
- my appointments
- staff booking-rules
- staff appointments review

结论：
- 短期把它当作稳定入口
- **不建议首轮就粗暴拆分为多个 service 文件**
- 先补类型与函数签名，再视重复度拆分模块

### 3. 请求层 `utils/request.js`

这是当前最关键的公共边界，负责：
- 注入 `X-Customer-OpenId` / `X-Staff-OpenId`
- 统一请求封装
- 统一错误识别 / 错误文案映射

结论：
- 它的优先级高于页面 TS 化
- 首轮应该先把 request 层的输入 / 输出 / 错误结构类型补齐
- 后续新旧登录链路切换时，也应优先收口在这里

### 4. 身份层 `utils/customer.js` / `utils/staff.js`

这两个文件当前并不是普通 util，而是**dev mock auth 边界**：
- 顾客身份开发态模拟
- 店员身份开发态模拟
- 本地存储读写
- 当前页面进入店员端 / 顾客端的 mock 依赖

结论：
- 后续应被视为 `auth adapter` 的一部分
- 首轮迁移重点不是改逻辑，而是补清类型与环境边界
- 必须明确 dev-only 身份模拟与未来生产登录链路的分隔

### 5. 应用入口 `app.js`

当前 `app.js` 主要承载：
- 全局 `globalData`
- 顾客身份入口能力
- API 基地址等运行时配置

结论：
- 首轮不建议直接改为 `app.ts`
- 更适合先补 `app.d.ts` 或全局类型声明
- 避免在同一阶段同时引入“入口改造 + 页面批量迁移”

### 6. 契约守卫 `scripts/contract-selfcheck.mjs`

当前它承担的是“无类型系统前的契约守卫”。

结论：
- 在 TS 迁移早期必须保留
- 它和未来类型系统不是替代关系，而是并行关系
- 在 `services / request / pages` 迁移期间，继续用它防止字段与接口回退

### 7. 组件层现状

当前仓库**还没有稳定共享组件层**：
- 现有页面基本直接写在 `pages/*`
- 当前未形成稳定 `components/` 复用体系
- 页面 `index.json` 也未呈现明确的共享组件依赖格局

结论：
- 组件抽离必须后置
- 不应假设当前已经存在成熟组件边界
- 应先等页面中出现明确重复 UI（如状态卡片、规则项、日历格）后再抽

---

## 二、当前主要问题

### 1. 文档与真实代码边界容易漂移

风险点：
- 如果只按抽象架构文档推进，容易忽视 `services/appointment.js` 的过载现实
- 容易把 `customer.js` / `staff.js` 误当作普通工具，而不是 auth 边界
- 容易在页面未拆纯函数前就直接 TS 化重页面

### 2. `services/appointment.js` 过载但短期不能贸然拆

风险点：
- 全量拆分会影响顾客端和店员端所有页面引用
- 若在首轮同时做“拆 service + 改页面 + 上 TS”，回归风险会明显升高

### 3. 重状态页面混写严重

特别是：
- `pages/booking`
- `pages/staff/rules`
- `pages/staff/appointments`

风险点：
- 当前页面里往往同时存在：
  - 接口返回整形
  - 交互状态维护
  - 表单校验
  - 提交逻辑
  - UI 映射
- 不先抽纯函数边界，直接 TS 化收益有限、成本很高

### 4. 组件层还不成熟

风险点：
- 过早组件化会脱离当前仓库事实
- 容易为了“看起来像架构升级”而做额外抽象

---

## 三、推荐迁移顺序

### Phase A：先补类型，不动页面行为

建议先新增：
- `apps/weapp/types/auth.d.ts`
- `apps/weapp/types/api.d.ts`
- `apps/weapp/types/app.d.ts`
- `apps/weapp/types/booking.d.ts`

目标：
- 把当前请求头身份、预约记录、规则模型、gallery 模型先固化成类型
- 先建立“类型词典”，再推进代码迁移

### Phase B：先迁 auth / request / service 边界

推荐顺序：
1. `utils/customer.js`
2. `utils/staff.js`
3. `utils/request.js`
4. `services/appointment.js`

理由：
- 这些文件是页面共享依赖
- 先把公共边界清楚，后续页面迁移会更稳

### Phase C：选择低风险页面做 TS 试点

推荐顺序：
1. `pages/gallery-detail/index.js`
2. `pages/my-bookings/index.js`
3. `pages/home/index.js`

理由：
- 页面职责更聚焦
- 接口与状态分支相对较少
- 更适合积累 TS 迁移样板

### Phase D：最后处理重状态页面

推荐顺序：
1. `pages/booking/index.js`
2. `pages/staff/rules/index.js`
3. `pages/staff/appointments/index.js`

前置条件：
- request/service/auth 已经类型化
- 页面内关键数据整形 / 校验逻辑已先抽为纯函数

### Phase E：最后再决定组件层抽离

只在以下条件满足时推进：
- 明确识别出重复 UI 片段
- 页面状态已较稳定
- 组件抽离不会反向放大回归范围

---

## 四、首批推荐落点文件

### 类型文件
- `apps/weapp/types/auth.d.ts`
- `apps/weapp/types/api.d.ts`
- `apps/weapp/types/app.d.ts`
- `apps/weapp/types/booking.d.ts`

### 低风险公共边界
- `apps/weapp/utils/customer.js`
- `apps/weapp/utils/staff.js`
- `apps/weapp/utils/request.js`
- `apps/weapp/services/appointment.js`

### 页面试点
- `apps/weapp/pages/gallery-detail/index.js`
- `apps/weapp/pages/my-bookings/index.js`
- `apps/weapp/pages/home/index.js`

---

## 五、执行约束

- 不直接大规模把 `pages/**` 全部改成 `.ts`
- 不在首轮同时做“拆 service + 抽组件 + 改页面”三件事
- 不把 dev mock auth 与生产登录链路混在一个阶段硬切
- 不因理想目录而忽略当前真实依赖关系
- 所有迁移都以“不破坏现有 UAT 通过基线”为硬约束

---

## 六、给后续 worker 的直接指令模板

后续若派发前端 TypeScript 增量迁移任务，必须遵守：

1. 先读：
   - `docs/REFACTOR_PLAN.md`
   - `docs/WEAPP_REFACTOR_BOUNDARY.md`
   - `docs/API.md`
2. 先动类型与公共边界，再动页面
3. 首批页面试点只允许从 `gallery-detail / my-bookings / home` 里挑
4. `booking / staff/rules / staff/appointments` 在未先抽纯函数前，不允许直接大面积 TS 化
5. 不能把 `services/appointment.js` 首轮拆散成多文件并同时要求所有页面适配
