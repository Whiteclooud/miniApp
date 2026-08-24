# 体验版部署运行手册

本手册针对当前 `apps/api` 唯一后端基线，目标是把候选版本部署到一台腾讯云 Lighthouse / CVM 服务器，供微信小程序体验版使用。

## 部署拓扑

第一阶段可以使用单台服务器：

- API：NestJS 容器，监听容器内 `3100`
- MySQL：`mysql:8.4` 容器，只加入 Docker 内网
- 图片：`miniapp_api_uploads` 持久化卷
- HTTPS：宿主机 Caddy 或 Nginx 反向代理到 `127.0.0.1:3100`
- 公网：只开放 `80/443`，不开放 `3100/3306`

正式商用后建议把 MySQL 迁移到 TencentDB，把图片迁移到 COS；当前 API 的本地上传目录在迁移前必须使用持久化磁盘或对象存储，不能依赖容器可写层。

## 服务器准备

建议 Ubuntu 22.04/24.04、2 核 4GB 起步。安装 Docker Engine 与 Compose Plugin 后，将仓库检出到服务器，并切换到已经通过验收的 tag 或提交。

```bash
git clone https://github.com/Whiteclooud/miniApp.git
cd miniApp
git checkout feat/launch-readiness
```

体验版阶段可直接使用当前分支；正式发布前应使用经过体验版 UAT 的固定 tag。

## 生产环境变量

在服务器创建 `apps/api/.env.production`。该文件不会进入镜像，也不应提交 Git：

```env
NODE_ENV=production
PORT=3100
PUBLIC_BASE_URL=https://api.example.com
DATABASE_URL=mysql://miniapp:change-this-password@mysql:3306/miniapp_api
WECHAT_APP_ID=wx...
WECHAT_APP_SECRET=...
SYSTEM_ADMIN_OPEN_IDS=...
OWNER_OPEN_IDS=...
ALLOW_OPENID_HEADER_AUTH=0
ALLOW_DEMO_STAFF_OPENID=0
SESSION_EXPIRES_DAYS=30
UPLOAD_MAX_FILES=6
UPLOAD_MAX_FILE_SIZE_BYTES=5242880

MYSQL_ROOT_PASSWORD=change-this-root-password
MYSQL_DATABASE=miniapp_api
MYSQL_USER=miniapp
MYSQL_PASSWORD=change-this-password
```

`DATABASE_URL` 中的主机必须是 `mysql`，不是 `127.0.0.1`。`SYSTEM_ADMIN_OPEN_IDS` 与 `OWNER_OPEN_IDS` 只填写真实微信账号对应的 OpenID；AppSecret 只保存在服务器环境变量中。

## 启动 API 与数据库

从仓库根目录执行：

```bash
docker compose \
  --env-file apps/api/.env.production \
  -f infra/compose/api-production.compose.yml \
  up -d --build
```

检查状态：

```bash
docker compose --env-file apps/api/.env.production \
  -f infra/compose/api-production.compose.yml ps
curl http://127.0.0.1:3100/health
```

首次启动会自动执行 Prisma migration。返图样例数据初始化一次：

```bash
docker compose --env-file apps/api/.env.production \
  -f infra/compose/api-production.compose.yml \
  run --rm api node scripts/seed-gallery.mjs
```

## HTTPS 反向代理

在宿主机安装 Caddy，并将域名 A 记录指向服务器公网 IP。Caddyfile 示例：

```text
api.example.com {
  reverse_proxy 127.0.0.1:3100
}
```

Caddy 自动申请和续期证书。确认以下地址返回 200 后，再把该域名配置到微信公众平台的合法 request、uploadFile 和 downloadFile 域名：

```text
https://api.example.com/health
```

## 更新与回滚

更新前先备份数据库和上传目录，再切换到目标提交：

```bash
git fetch origin
git checkout <verified-commit-or-tag>
docker compose --env-file apps/api/.env.production \
  -f infra/compose/api-production.compose.yml \
  up -d --build
```

回滚时切换到上一份已验收提交后重新执行同一条 `up -d --build` 命令。不要删除 MySQL 或上传数据卷。

## 备份最低要求

- 每日备份 MySQL，至少保留 7 天。
- 每日备份 `/var/lib/docker/volumes/miniapp_api_uploads/_data`，或迁移到 COS。
- 每月至少做一次恢复演练：恢复到临时数据库和临时上传目录，验证 `/health`、返图、预约和图片访问。
- 服务器安全组只开放 `22`（限制来源）、`80`、`443`。

## 发布门槛

体验版提交前必须同时满足：

1. `https://api.example.com/health` 可访问。
2. 微信合法域名配置完成。
3. `NODE_ENV=production`、header fallback 和 demo staff 均关闭。
4. 四角色真实微信登录、成员邀请和停用即时撤权 UAT 通过。
5. 数据库迁移、备份、恢复和图片持久化验证通过。
