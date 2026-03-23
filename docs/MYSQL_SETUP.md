# MySQL Setup Guide for `apps/api`

## 目的

本文件用于说明 MiniApp Phase 0 / Phase 1 中，`apps/api` 所需的 MySQL 环境要求、推荐版本、Docker 启动方式、本机直装方式，以及最小验收步骤。

当前原则：
- **推荐优先使用 Docker 启动 MySQL**，与仓库现有 compose 配置保持一致
- 如果你更习惯本机直接安装，也可以，但请尽量对齐本文档中的版本、端口、库名、账号与密码
- 当前 `apps/server` 仍使用 SQLite；MySQL 仅服务于新的 `apps/api`

---

## 1. 推荐版本

### 推荐基线
- **MySQL 8.4 LTS**

原因：
- 当前仓库 `infra/compose/api-mysql.compose.yml` 明确使用：`mysql:8.4`
- 新后端 `apps/api` 的 Prisma datasource 目标是 `mysql`
- 用 8.4 可以最大程度避免“本机版本和仓库默认环境不一致”带来的问题

### 可接受范围
- **MySQL 8.x** 一般都可兼容
- 但如果你想减少排查成本，**直接按 8.4 执行** 最稳妥

### 当前不建议
- 不建议先用 MariaDB 代替
- 不建议混用系统里已经存在但版本不明的旧 MySQL 实例
- 不建议直接占用本机默认 `3306` 并修改一堆配置；当前仓库默认约定是 **宿主机 `3307` -> 容器 `3306`**

---

## 2. 当前仓库约定

### Docker Compose 文件
- 路径：`infra/compose/api-mysql.compose.yml`

### 当前默认数据库连接
`apps/api/.env.example` 中当前默认值为：

```env
PORT=3100
DATABASE_URL="mysql://miniapp:miniapp@127.0.0.1:3307/miniapp_api"
```

### 当前统一约定
- MySQL Host：`127.0.0.1`
- MySQL Port：`3307`
- Database：`miniapp_api`
- Username：`miniapp`
- Password：`miniapp`
- Root Password：`root`

如果你本机直装 MySQL，也建议尽量保持以上参数一致。

---

## 3. 方式 A：使用 Docker 启动（推荐）

### 3.1 前置要求
请先确认本机已安装以下任一环境：
- Docker Desktop
- 或 Docker Engine + Docker Compose Plugin

### 3.2 启动命令
在仓库根目录执行：

```bash
docker compose -f infra/compose/api-mysql.compose.yml up -d
```

### 3.3 当前 compose 配置（仓库事实）

- Image：`mysql:8.4`
- Container Name：`miniapp-api-mysql`
- Host Port：`3307`
- Container Port：`3306`
- Database：`miniapp_api`
- User：`miniapp`
- Password：`miniapp`
- Root Password：`root`

### 3.4 验证容器是否启动成功
可执行：

```bash
docker compose -f infra/compose/api-mysql.compose.yml ps
```

或者：

```bash
docker ps
```

期望看到类似：
- 容器名：`miniapp-api-mysql`
- 状态：`Up` / `healthy`

### 3.5 如果要查看日志

```bash
docker logs miniapp-api-mysql
```

### 3.6 如果要停止容器

```bash
docker compose -f infra/compose/api-mysql.compose.yml down
```

### 3.7 如果要连同数据卷一起清掉（谨慎）

```bash
docker compose -f infra/compose/api-mysql.compose.yml down -v
```

> 注意：`-v` 会删除 MySQL 数据卷，仅在你确认不需要保留当前 MySQL 数据时使用。

---

## 4. 方式 B：本机直接安装 MySQL

如果你不想用 Docker，也可以直接安装：

### 4.1 建议安装版本
- **MySQL Community Server 8.4**

### 4.2 建议配置目标
安装完成后，请确保你能提供与仓库默认一致的连接：
- Host：`127.0.0.1`
- Port：`3307`
- Database：`miniapp_api`
- User：`miniapp`
- Password：`miniapp`

### 4.3 如果你的 MySQL 默认跑在 3306
有两种选择：

#### 方案 1：把本机 MySQL 改到 3307
优点：与仓库默认文档完全一致

#### 方案 2：保留 3306，但同步修改 `apps/api/.env`
例如：

```env
DATABASE_URL="mysql://miniapp:miniapp@127.0.0.1:3306/miniapp_api"
```

如果你走方案 2，请明确告诉我，我后续运行验证会按你的端口来。

### 4.4 初始化数据库与账号
进入 MySQL 后执行：

```sql
CREATE DATABASE IF NOT EXISTS miniapp_api CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

CREATE USER IF NOT EXISTS 'miniapp'@'%' IDENTIFIED BY 'miniapp';
ALTER USER 'miniapp'@'%' IDENTIFIED BY 'miniapp';

GRANT ALL PRIVILEGES ON miniapp_api.* TO 'miniapp'@'%';
FLUSH PRIVILEGES;
```

如果你只允许本机连接，也可以把 `'%'` 换成 `'localhost'` 或 `'127.0.0.1'`，但为减少排查成本，当前更推荐先按上面方式初始化。

---

## 5. `apps/api` 的最小配套操作

无论你用 Docker 还是本机直装，只要 MySQL 可访问，接下来都需要：

### 5.1 准备 `.env`
在仓库根目录下执行：

```bash
cp apps/api/.env.example apps/api/.env
```

如需修改端口，再编辑 `apps/api/.env` 中的 `DATABASE_URL`。

### 5.2 生成 Prisma Client

```bash
cd apps/api
npm install
npm run prisma:generate
```

### 5.3 应用 migration

```bash
npm run prisma:migrate:deploy
```

### 5.4 启动新 API

```bash
npm run start:dev
```

### 5.5 健康检查
浏览器或命令行访问：

```text
http://127.0.0.1:3100/health
```

预期返回：
- `ok: true`
- `service: miniapp-api`

---

## 6. 最小验收清单

如果你把 MySQL 环境准备好了，至少请确认下面几项：

### MySQL 侧
- [ ] MySQL 版本为 **8.4**（或至少为 8.x）
- [ ] 可以通过 `127.0.0.1:<port>` 访问
- [ ] 已存在数据库 `miniapp_api`
- [ ] 已存在用户 `miniapp`
- [ ] 账号密码可用

### `apps/api` 侧
- [ ] `apps/api/.env` 已配置正确
- [ ] `npm run prisma:generate` 成功
- [ ] `npm run prisma:migrate:deploy` 成功
- [ ] `npm run start:dev` 成功
- [ ] `GET /health` 可访问

---

## 7. 常见问题

### Q1：为什么现在推荐 MySQL 8.4？
因为仓库当前 compose 明确使用 `mysql:8.4`，直接对齐默认环境，排查成本最低。

### Q2：能不能用 8.0？
大概率可以，但当前项目最稳的做法仍然是先按 8.4 起环境。

### Q3：能不能继续只用 SQLite？
可以继续用 SQLite 跑旧的 `apps/server`；但新的 `apps/api` Phase 1/2 运行验证需要 MySQL。

### Q4：如果我已经装了本机 MySQL，但端口不是 3307，怎么办？
可以继续用你的端口，但请同步修改 `apps/api/.env` 的 `DATABASE_URL`，并告诉我最终端口。

### Q5：如果 Docker 起不来怎么办？
把以下信息发我即可：
- `docker compose -f infra/compose/api-mysql.compose.yml up -d` 的报错
- `docker ps` 输出
- `docker logs miniapp-api-mysql` 输出

---

## 8. 当前建议

对当前项目，推荐优先级如下：

1. **首选：Docker + `mysql:8.4`**
2. 次选：本机直装 **MySQL 8.4**
3. 若已有本机 MySQL 8.x，也可复用，但要把端口 / 用户 / 库名对齐到 `apps/api/.env`

如果你只想要一句最短结论：

> **直接用 Docker 起 `mysql:8.4`，端口映射 `3307:3306`，库名 `miniapp_api`，账号密码 `miniapp/miniapp`，然后把 `apps/api/.env` 保持默认即可。**
