# MiniApp 运维与发布手册

本文档记录当前阿里云 ECS 体验版环境，以及后续代码更新、发布、回滚、备份和故障排查方法。

本文档不保存微信 AppSecret、数据库密码、SSH 私钥、Bearer token 或真实用户 OpenID。

## 1. 当前环境

| 项目 | 当前值 |
| --- | --- |
| 云厂商 | 阿里云 ECS |
| 公网 IP | `47.122.104.205` |
| 系统 | Ubuntu 22.04.5 LTS |
| 规格 | 2 vCPU / 2 GiB RAM |
| 磁盘 / Swap | 40 GiB / 4 GiB |
| 项目目录 | `/opt/miniapp` |
| API 域名 | `api.whiteclooud.asia` |
| API 地址 | `https://api.whiteclooud.asia` |
| API 内部地址 | `127.0.0.1:3100` |
| 当前服务器提交 | `96dee27` |
| HTTPS | Caddy + Let's Encrypt |
| 数据库 | MySQL 8.4 Docker 容器 |

本机 SSH 已配置别名：

```bash
ssh miniapp-aliyun
```

查看现场状态：

```bash
ssh miniapp-aliyun 'git -C /opt/miniapp rev-parse HEAD'
ssh miniapp-aliyun 'cd /opt/miniapp && docker compose --env-file apps/api/.env.production -f infra/compose/api-production.compose.yml ps'
curl https://api.whiteclooud.asia/health
```

## 2. 部署拓扑

```text
微信小程序
    │ HTTPS 443
    ▼
Caddy（宿主机，自动证书）
    │ reverse_proxy 127.0.0.1:3100
    ▼
NestJS API 容器
    │ Docker 内网
    ▼
MySQL 8.4 容器
```

容器和数据卷：

- API：`compose-api-1`
- MySQL：`compose-mysql-1`
- 图片卷：`compose_miniapp_api_uploads`
- MySQL 数据卷：`compose_miniapp_api_mysql_data`

API 只绑定 `127.0.0.1:3100`，MySQL 不应开放公网。

## 3. 网络与安全组

阿里云安全组入方向只保留：

| 端口 | 用途 | 来源 |
| ---: | --- | --- |
| 22 | SSH | 建议限制为固定办公公网 IP |
| 80 | HTTP 跳转和 ACME 校验 | `0.0.0.0/0` |
| 443 | HTTPS API | `0.0.0.0/0` |

不要开放：

- 3100
- 3306、3307
- 2019（Caddy 管理端口）
- 3389（Ubuntu 不使用 RDP，建议删除）

服务器 UFW：

```bash
ssh miniapp-aliyun 'ufw status verbose'
```

修改 SSH 端口时，必须先放行新端口，再关闭旧端口，避免无法登录。

## 4. 生产环境变量

服务器文件：

```text
/opt/miniapp/apps/api/.env.production
```

权限应为 600：

```bash
ssh miniapp-aliyun 'stat -c "%a %n" /opt/miniapp/apps/api/.env.production'
```

变量结构如下，值只保存在服务器：

```env
NODE_ENV=production
PORT=3100
PUBLIC_BASE_URL=https://api.whiteclooud.asia
DATABASE_URL=mysql://miniapp:<数据库密码>@mysql:3306/miniapp_api

WECHAT_APP_ID=<正式小程序 AppID>
WECHAT_APP_SECRET=<正式小程序 AppSecret>
SYSTEM_ADMIN_OPEN_IDS=<可为空>
OWNER_OPEN_IDS=<可为空>

ALLOW_OPENID_HEADER_AUTH=0
ALLOW_DEMO_STAFF_OPENID=0
SESSION_EXPIRES_DAYS=30
UPLOAD_MAX_FILES=6
UPLOAD_MAX_FILE_SIZE_BYTES=5242880

MYSQL_ROOT_PASSWORD=<随机 root 密码>
MYSQL_DATABASE=miniapp_api
MYSQL_USER=miniapp
MYSQL_PASSWORD=<随机应用密码>
NPM_REGISTRY=https://registry.npmmirror.com
```

注意：

- `DATABASE_URL` 主机必须为 `mysql`，不是 `127.0.0.1`。
- 生产环境必须关闭两个 OpenID header fallback。
- 修改 AppSecret、角色白名单或数据库配置后必须重建 API 容器。
- `.env.production` 不提交 Git。

## 5. 首次部署

```bash
sudo mkdir -p /opt/miniapp
sudo chown -R "$USER":"$USER" /opt/miniapp
git clone https://github.com/Whiteclooud/miniApp.git /opt/miniapp
cd /opt/miniapp
git checkout --detach <已验收提交>
```

创建并填写 `apps/api/.env.production` 后：

```bash
cd /opt/miniapp
docker compose --env-file apps/api/.env.production -f infra/compose/api-production.compose.yml config >/dev/null
docker compose --env-file apps/api/.env.production -f infra/compose/api-production.compose.yml up -d --build
```

容器启动会自动执行 Prisma migration 和 API healthcheck。

空库首次初始化返图：

```bash
docker compose --env-file apps/api/.env.production -f infra/compose/api-production.compose.yml run --rm api node scripts/seed-gallery.mjs
```

不要频繁执行 seed，也不要删除数据卷。

## 6. Caddy 与 HTTPS

配置文件：

```text
/etc/caddy/Caddyfile
```

当前配置：

```text
api.whiteclooud.asia {
    encode zstd gzip
    reverse_proxy 127.0.0.1:3100
}
```

检查和重载：

```bash
ssh miniapp-aliyun 'caddy validate --config /etc/caddy/Caddyfile'
ssh miniapp-aliyun 'systemctl reload caddy'
ssh miniapp-aliyun 'systemctl status caddy --no-pager'
curl -v https://api.whiteclooud.asia/health
```

证书由 Caddy 自动申请和续期。域名必须解析到 `47.122.104.205)，安全组允许 80/443，且 ICP 备案状态满足中国大陆访问要求。

## 7. 代码更新流程

### 7.1 本机验证

```powershell
npm run check:docs
npm run check:weapp-contract
npm run build:api
npm run test:api
```

前端改动还应在开发者工具/真机调试验证。确认通过后：

```powershell
git add <相关文件>
git commit -m "<变更说明>"
git push origin feat/launch-readiness
```

正式部署使用已验收 commit，不直接使用未验证的工作区。

### 7.2 更新服务器

先记录当前版本：

```bash
ssh miniapp-aliyun 'git -C /opt/miniapp rev-parse HEAD | tee /root/miniapp-before-update.txt'
```

更新并重建：

```bash
ssh miniapp-aliyun
cd /opt/miniapp
git fetch origin feat/launch-readiness
git checkout --detach <新的已验收提交>
docker compose --env-file apps/api/.env.production -f infra/compose/api-production.compose.yml up -d --build
docker compose --env-file apps/api/.env.production -f infra/compose/api-production.compose.yml ps
curl https://api.whiteclooud.asia/health
```

如果只是小程序前端改动，通常不需要更新服务器 API；上传新的小程序体验版即可。

### 7.3 修改环境变量

```bash
ssh miniapp-aliyun
sudoedit /opt/miniapp/apps/api/.env.production
chmod 600 /opt/miniapp/apps/api/.env.production
cd /opt/miniapp
docker compose --env-file apps/api/.env.production -f infra/compose/api-production.compose.yml up -d --force-recreate api
```

## 8. 回滚流程

代码回滚：

```bash
cd /opt/miniapp
git checkout --detach <上一份已验收提交>
docker compose --env-file apps/api/.env.production -f infra/compose/api-production.compose.yml up -d --build
curl https://api.whiteclooud.asia/health
```

代码回滚不会自动回滚数据库 migration。若新 migration 已执行，应先在备份恢复库演练补偿 migration，再操作生产库。

小程序版本回滚在微信公众平台“版本管理”中选择上一份已验收版本。

## 9. 日志与故障排查

```bash
cd /opt/miniapp
docker compose --env-file apps/api/.env.production -f infra/compose/api-production.compose.yml ps
docker compose --env-file apps/api/.env.production -f infra/compose/api-production.compose.yml logs --tail=200 api
docker compose --env-file apps/api/.env.production -f infra/compose/api-production.compose.yml logs --tail=200 mysql
systemctl status caddy --no-pager
journalctl -u caddy --since "30 minutes ago" --no-pager
curl -v https://api.whiteclooud.asia/health
```

| 现象 | 优先检查 |
| --- | --- |
| `ERR_CONNECTION_REFUSED` 指向 127.0.0.1 | 真机不能访问电脑本地 API；确认使用 HTTPS trial 配置 |
| `ERR_CONNECTION_RESET` 且 Caddy 无日志 | ICP 备案、安全组 443、DNS、运营商链路 |
| Network 没有 `auth/wechat-login` | 旧版本、启动 JS 异常或请求前崩溃 |
| `WECHAT_LOGIN_FAILED` | 正式 AppID/AppSecret 不匹配 |
| 401 | session 无效或账号未获得对应成员权限 |
| 图片 404 | 图片卷丢失或 `PUBLIC_BASE_URL` 错误 |
| API healthy 但页面空态 | 检查 gallery 数据和接口响应 |

## 10. 数据备份

体验版阶段至少每日备份 MySQL 和图片卷。

MySQL 备份示例（不要把密码写入 shell 历史）：

```bash
mkdir -p /opt/backups/miniapp
chmod 700 /opt/backups/miniapp
docker exec compose-mysql-1 sh -c 'exec mysqldump -u root -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines --triggers miniapp_api' | gzip > /opt/backups/miniapp/mysql-$(date +%F-%H%M).sql.gz
chmod 600 /opt/backups/miniapp/mysql-*.sql.gz
```

图片卷备份：

```bash
docker run --rm -v compose_miniapp_api_uploads:/source:ro -v /opt/backups/miniapp:/backup alpine tar czf /backup/uploads-$(date +%F-%H%M).tar.gz -C /source .
chmod 600 /opt/backups/miniapp/uploads-*.tar.gz
```

正式商用建议迁移 MySQL 到阿里云 RDS、图片到阿里云 OSS，并增加云监控和告警。

## 11. 真实微信角色初始化

生产环境不使用 mock OpenID。

建议顺序：

1. 普通顾客微信登录，确认首页、gallery 和 availability。
2. 自由职业者店主微信登录。
3. 将店主 OpenID 写入服务器 `OWNER_OPEN_IDS`。
4. 系统管理员微信登录。
5. 将系统管理员 OpenID 写入服务器 `SYSTEM_ADMIN_OPEN_IDS`。
6. 重启 API。
7. 店主创建普通店员邀请码，另一个微信兑换。
8. 验证停用店员后旧 session 立即失去 staff 权限。

修改白名单后：

```bash
docker compose --env-file apps/api/.env.production -f infra/compose/api-production.compose.yml up -d --force-recreate api
```

不要把真实 OpenID 发到聊天中。

## 12. 微信后台发布清单

正式小程序后台配置：

```text
request 合法域名：    https://api.whiteclooud.asia
uploadFile 合法域名： https://api.whiteclooud.asia
downloadFile 合法域名：https://api.whiteclooud.asia
```

当前项目不使用 web-view，不需要业务域名，也不需要 socket、udp、tcp 域名。

发布前确认：

- 域名已完成 ICP 备案。
- 服务器域名绑定的是正式小程序 AppID，不是测试号。
- 体验版使用最新上传版本。
- Network 请求地址为 HTTPS API。
- 生产环境不出现 `X-Customer-OpenId` 或 `X-Staff-OpenId`。
- 四类角色和成员撤权 UAT 已完成。
