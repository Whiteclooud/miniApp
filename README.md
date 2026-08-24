# miniApp

美甲预约微信小程序，由 OpenClaw 团队协作开发。

## 当前产品范围（V1）

围绕“单店、单员工、审批制预约”打通最小业务闭环：

- 顾客查看门店氛围与返图案例
- 顾客按规则窗口选择日期 / 时间段并提交预约申请
- 顾客按微信 OpenID 查看自己的预约状态
- 店员配置预约规则
- 店员通过月历 / 明细工作台查看并审核预约申请（通过 / 拒绝）
- 店主可邀请、查看和停用普通店员；系统管理员可维护店主与系统级配置
- 后端以 `apps/api` 作为唯一运行基线

## 技术路线

- 前端：原生微信小程序（`apps/weapp`）
- 后端：NestJS + Prisma（`apps/api`）
- 存储：MySQL
- 协作：文档优先，架构 / 接口 / 任务先行

## 目录结构

```text
miniApp/
├── apps/
│   ├── api/            # 当前唯一后端 API 基线
│   └── weapp/          # 微信小程序前端
├── docs/
│   ├── PRD.md
│   ├── ARCHITECTURE.md
│   ├── API.md
│   ├── TASKS.md
│   ├── UAT_GUIDE.md
│   └── ...             # 仍对当前主线有价值的说明文档
└── tools/
    └── check-docs.mjs
```

## 当前状态

- `apps/api` 已完成唯一后端基线收口，并成为当前唯一后端基线
- 顾客预约页代码基线已支持未来日期窗口与卡片式时间段选择
- 店员预约页代码基线已支持月历常驻展示，并基于全量预约数据聚合
- 当前项目处于“唯一主线文档收口完成，等待微信开发者工具页面级回归 UAT”阶段

## 本地启动

### 1. 启动后端

```bash
npm run start:api
```

默认监听：`http://127.0.0.1:3100`

如需开发模式：

```bash
npm run dev:api
```

### 2. 构建与自测后端

```bash
npm run build:api
npm run test:api
```

### 3. 打开微信开发者工具

使用微信开发者工具打开目录：

```text
apps/weapp
```

联调与验收请参考：
- `docs/PRD.md`
- `docs/ARCHITECTURE.md`
- `docs/API.md`
- `docs/TASKS.md`
- `docs/UAT_GUIDE.md`

## 关键页面

### 顾客端
- `pages/home/index`
- `pages/gallery-detail/index`
- `pages/booking/index`
- `pages/my-bookings/index`

### 店员端
- `pages/staff/rules/index`
- `pages/staff/appointments/index`
- `pages/staff/members/index`

## 验收建议

- 后端运行级验证：先执行 `npm run test:api`
- 页面与交互验收：按 `docs/UAT_GUIDE.md` 在微信开发者工具中逐步验证

## 说明

- 本地开发默认请求 `http://127.0.0.1:3100`
- 真机调试和上线前，需要在微信公众平台配置合法域名
- 当前 `AppID` 仍为占位值，真机调试 / 发布前需替换
