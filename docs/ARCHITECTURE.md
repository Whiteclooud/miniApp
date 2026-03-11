# ARCHITECTURE

## 当前架构决策

V0 采用低依赖架构，优先打通业务闭环：

- 前端：原生微信小程序
- 后端：Node.js 模块化 HTTP API
- 数据：当前以内存数据为主，后续切换 SQLite / MySQL

## 为什么先这样做

- 微信单端项目中，原生小程序是最直接、调试成本最低的方案
- 当前团队通过飞书 + agent 协作，先减少脚手架和依赖问题
- 待需求稳定后，可演进为：
  - 前端：`Taro + React + TypeScript`
  - 后端：`NestJS + Prisma + MySQL`

## 目录说明

- `apps/weapp`: 微信小程序前端
- `apps/server`: 后端 API
- `docs`: 需求、架构、接口、任务、环境配置

## 逻辑模块

### 前端模块

- 首页 `pages/home`
- 预约页 `pages/booking`
- 服务调用 `services/appointment.js`
- 请求封装 `utils/request.js`

### 本次需求新增前端模块职责

- 首页新增热门款式推荐区块展示
- 预约页新增美甲师选择器
- 预约提交时携带美甲师字段
- 最近预约展示中补充美甲师信息（如已选择）

### 后端模块

- 健康检查 `/health`
- 服务列表 `/api/v1/services`
- 热门款式列表 `/api/v1/hot-styles`
- 美甲师列表 `/api/v1/artists`
- 预约列表 `/api/v1/appointments`
- 预约创建 `/api/v1/appointments`

## 数据模型

### Service

- `id`
- `name`
- `durationMinutes`
- `price`
- `description`

### HotStyle

- `id`
- `title`
- `imageUrl`
- `tags`
- `priceFrom`
- `serviceId`
- `serviceName`
- `ctaText`
- `sortOrder`
- `status`

说明：
- `HotStyle` 是首页内容实体，用于承载热门款式推荐，不等价于服务项目。
- `serviceId` / `serviceName` 用于和预约流程联动。

### NailArtist

- `id`
- `name`
- `avatarUrl`
- `title`
- `specialties`
- `status`
- `sortOrder`

说明：
- V1 仅维护“可预约 / 不可预约”基础状态，不做排班和产能管理。

### Appointment

- `id`
- `customerName`
- `phone`
- `serviceId`
- `serviceName`
- `artistId`
- `artistName`
- `date`
- `timeSlot`
- `note`
- `status`
- `createdAt`

说明：
- `artistId` / `artistName` 在 V1 表示用户偏好选择，可为空，代表“无偏好/到店安排”。
- 当前不根据 `artistId` 动态过滤 `timeSlot`，后续如接入排班需扩展预约能力模型。

## 接口边界与兼容策略

- 保持现有 `/api/v1/services` 不变，避免影响现有首页服务项目展示与预约页服务选择。
- 通过新增 `/api/v1/hot-styles` 支持首页热门款式展示，避免把内容推荐与服务目录强耦合。
- 通过新增 `/api/v1/artists` 提供预约页美甲师列表。
- 通过扩展 `/api/v1/appointments` 的请求/响应字段承载美甲师信息。
- 预约创建接口对 `artistId` / `artistName` 采用向后兼容策略：旧客户端不传仍可成功提交。

## 演进路线

### V1

- 打通预约闭环
- 定义稳定 API
- 支持首页热门款式展示
- 支持预约时记录美甲师偏好
- 确立任务拆解与协作规范

### V2

- 接入持久化数据库
- 增加登录与身份体系
- 支持商家侧预约管理
- 支持热门款式后台配置
- 支持美甲师上下架与基础资料维护

### V3

- 迁移到更强工程化框架
- 接入支付、订阅消息、后台管理台
- 增加技师排班、时间段库存与冲突校验
- 支持更细粒度推荐与转化分析
