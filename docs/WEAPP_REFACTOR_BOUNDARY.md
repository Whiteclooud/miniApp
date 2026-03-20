# WeApp Refactor Boundary

## 目的

本文件用于承接 `FE-013`：基于当前真实 `apps/weapp` 代码，明确原生微信小程序在 **不破坏现有页面稳定性** 前提下，如何逐步引入 TypeScript、清晰边界与更稳定的前端分层。

本文件不是理想化目录提案，而是当前代码事实的增量迁移说明。

---

## 1. 当前真实边界（基于代码事实）

### 1.1 页面层 `pages/**`

当前页面主要分为两组：

- 顾客端
  - `pages/home/index`
  - `pages/gallery-detail/index`
  - `pages/booking/index`
  - `pages/my-bookings/index`
- 店员端
  - `pages/staff/rules/index`
  - `pages/staff/appointments/index`

当前事实：
- 页面内同时承担了 UI、接口调用后的数据整形、状态维护、交互反馈。
- `booking`、`staff/rules`、`staff/appointments` 状态机最重，不适合作为首批 TypeScript 化试点。
- `gallery-detail`、`my-bookings` 页面职责相对单一，更适合作为页面级试点。

### 1.2 服务层 `services/appointment.js`

当前事实：
- 该文件并不是“纯 appointment service”，而是当前前端面向后端冻结契约的 **总入口 facade**。
- 已同时承载：
  - gallery
  - availability
  - appointments
  - my appointments
  - staff booking-rules
  - staff appointments / review

结论：
- 短期不应先粗暴拆分该文件；否则会同时波及顾客端、店员端全部页面。
- Phase 1 更适合先补类型与签名，再逐步向更细 service module 演进。

### 1.3 请求边界 `utils/request.js`

当前事实：
- 该文件是最关键的公共边界：
  - base URL
  - header 注入
  - `X-Customer-OpenId` / `X-Staff-OpenId`
  - 错误映射
  - 请求封装
- 它比页面更适合作为 TypeScript 首批落点。

结论：
- `utils/request.js` 的类型化优先级高于页面 TS 化。
- 后续应逐步收口为更清晰的 request / auth / error mapping 边界。

### 1.4 mock 身份边界 `utils/customer.js` / `utils/staff.js`

当前事实：
- 这两个文件本质上不是普通 util，而是 **开发态 mock auth adapter**。
- 当前承担：
  - 本地 mock OpenID
  - 开发环境身份读写
  - 页面调用时的身份兜底逻辑

结论：
- 它们应被视为 auth 层，而不是随意归类为工具函数。
- 迁移早期应优先补类型与职责注释，但不应立即做大规模行为重写。

### 1.5 应用入口 `app.js`

当前事实：
- `app.js` 当前主要承接：
  - 小程序启动配置
  - 顾客身份入口
  - 少量 `globalData`
- 它与 mock auth、request header 注入存在隐式边界关系。

结论：
- 首批只建议补类型声明与全局数据边界说明。
- 不建议在第一轮就强制改成 `.ts`，避免影响小程序入口稳定性。

### 1.6 契约守卫 `scripts/contract-selfcheck.mjs`

当前事实：
- 当前仓库在缺少类型系统的前提下，依赖该脚本做接口/页面契约守卫。

结论：
- 在 TypeScript 迁移早期，这个脚本应保留。
- TypeScript 不是它的替代品；两者应并行一段时间。

### 1.7 组件层缺口

当前事实：
- 目前没有稳定共享组件层。
- 页面 `index.json` 中也没有形成成熟的 `usingComponents` 结构。

结论：
- 组件抽取应后置。
- 不能假设当前已经有可直接 TypeScript 化的组件边界。
- 只有在重复 UI 结构稳定后，才适合抽组件并补类型。

---

## 2. 当前主要问题

### 2.1 文档与真实代码边界存在漂移风险

风险点：
- worker 如果只按旧文档印象推进，而不先读真实 `apps/weapp`，容易把边界误判为旧的 `services / hot-styles / artists` 模式。

结论：
- 后续前端重构任务必须以当前真实代码为准，而不是只靠旧描述。

### 2.2 页面内“数据整形 + 状态管理 + 提交逻辑”混写

风险点：
- `booking`、`staff/rules`、`staff/appointments` 当前都存在一定程度的混写。

结论：
- 在做 TS 化前，应优先抽纯函数边界或整理数据整形逻辑。
- 否则只会把复杂 JS 变成复杂 TS。

### 2.3 `services/appointment.js` 过载但短期不能硬拆

风险点：
- 该文件已经成为事实上的稳定对外入口。

结论：
- 先补类型、再拆模块；不要先拆再补类型。

### 2.4 组件层尚不成熟

风险点：
- 过早做组件化 / 组件 TS 化，会脱离当前代码现实。

结论：
- 当前应先建立 types / auth / request / services 边界，再考虑组件抽取。

---

## 3. TypeScript 首批落点建议

### 3.1 新增类型目录

推荐先补：

- `apps/weapp/types/auth.d.ts`
- `apps/weapp/types/api.d.ts`
- `apps/weapp/types/app.d.ts`
- `apps/weapp/types/booking.d.ts`

作用：
- 先把当前冻结契约、身份结构、全局数据结构显式化。
- 为后续 request / services / pages 提供最小类型支撑。

### 3.2 首批低风险试点文件

建议顺序：

1. `apps/weapp/utils/customer.js`
2. `apps/weapp/utils/staff.js`
3. `apps/weapp/utils/request.js`
4. `apps/weapp/services/appointment.js`

说明：
- 这是从“边界最清晰、复用最广”的地方开始，而不是先改页面。
- `gallery.js` 这类独立 util 若未来出现，也适合作为低风险试点。

### 3.3 页面试点顺序

建议顺序：

1. `pages/gallery-detail/index.js`
2. `pages/my-bookings/index.js`
3. `pages/home/index.js`
4. `pages/booking/index.js`
5. `pages/staff/rules/index.js`
6. `pages/staff/appointments/index.js`

原因：
- 前两者状态更轻，适合试点。
- `booking` / `staff/*` 当前状态复杂，必须放在后面。

---

## 4. 推荐迁移顺序

推荐按以下顺序推进：

1. `types`
2. `dev mock auth`（`customer.js` / `staff.js` / `app.js` 类型边界）
3. `request` 封装
4. `services`
5. `components`（仅在重复 UI 稳定后再抽）
6. `pages`

原则：
- 先稳定基础边界，再处理页面。
- 先做低风险高复用，再做高状态复杂度页面。

---

## 5. Phase 1 可直接执行的前端任务建议

### FE-014
为 `utils/customer.js` / `utils/staff.js` / `app.js` 补最小类型声明与职责注释，不改行为。

### FE-015
为 `utils/request.js` 补类型与错误结构定义，明确 request / auth header / error mapping 边界。

### FE-016
为 `services/appointment.js` 补 API 类型与函数签名，先保持单文件稳定入口，不先拆模块。

### FE-017
选 `pages/gallery-detail` 或 `pages/my-bookings` 做页面级 TS 化试点，验证最小迁移链路。

### FE-018
在前述任务稳定后，再评估 `booking` / `staff/rules` / `staff/appointments` 的纯函数抽取与页面重构。

---

## 6. 当前残余风险

1. 最大风险仍是：**文档与真实代码边界漂移**。
2. `services/appointment.js` 过载，但短期不能贸然拆分。
3. `booking` / `staff/*` 页面当前“数据整形 + 页面状态 + 提交逻辑”混写较重，必须先抽纯函数边界。
4. 当前没有成熟组件层，过早组件化会脱离代码现实。

---

## 7. 结论

前端增量重构的正确顺序，不是“先页面 TS 化”，而是：

- 先 **types**
- 再 **mock auth / request**
- 再 **services**
- 最后才是 **pages / components**

同时必须坚持：
- 以当前真实 `apps/weapp` 代码为准
- 不破坏现有 UAT 已通过基线
- 不在首轮就同时叠加组件化、TS 化、service 拆分三件大事

这份边界说明将作为后续前端 worker 任务的直接输入。