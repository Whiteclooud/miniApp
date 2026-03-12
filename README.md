# miniApp

美甲预约微信小程序，由 OpenClaw 开发团队协作开发。

## V0 技术路线

当前仓库初始化采用低摩擦方案，方便通过飞书 + agent 直接推进开发：

- 前端：原生微信小程序目录结构
- 后端：Node.js 模块化 API 骨架
- 协作：文档优先，架构师先写清需求、接口和任务，再由前后端执行

这样做的原因：

1. 先把微信小程序单端跑通，减少构建链复杂度
2. 降低 agent 在早期阶段的依赖安装和脚手架失败风险
3. 后续如果需要跨端或更强工程化，再升级到 `Taro + React + TypeScript` 与 `NestJS`

## 目录结构

```text
miniApp/
├── apps/
│   ├── weapp/          # 微信小程序前端
│   └── server/         # 后端 API 骨架
├── docs/
│   ├── PRD.md
│   ├── ARCHITECTURE.md
│   ├── API.md
│   ├── TASKS.md
│   ├── ENV.md
│   └── WORKFLOW.md
└── tools/
    └── check-docs.mjs
```

## 当前状态

- 已初始化 V0 前后端骨架
- 已创建项目文档
- 已配置 OpenClaw 多 agent 协作工作流

## 本地启动

### 后端

```bash
npm run dev:server
```

默认监听 `http://127.0.0.1:3000`

### 前端

使用微信开发者工具打开目录：

```text
apps/weapp
```

注意：

- 本地开发默认请求 `http://127.0.0.1:3000`
- 真机调试和上线前，需要在微信公众平台配置合法域名
- 真实 `AppID` 与环境变量要求见 `docs/ENV.md`
