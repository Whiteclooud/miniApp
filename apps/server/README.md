# Server

当前是一个零依赖的后端骨架，便于快速打通联调。

## 已提供接口

- `GET /health`
- `GET /api/v1/services`
- `GET /api/v1/appointments`
- `POST /api/v1/appointments`

## 启动

```bash
npm run dev:server
```

后续如需更强工程化，可迁移到 `NestJS + Prisma + MySQL`。
