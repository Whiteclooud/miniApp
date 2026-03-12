# ENV

## 小程序侧

正式开发前需要补齐：

- 微信小程序 `AppID`
- 合法 request 域名
- 合法 uploadFile / downloadFile 域名
- 如需登录，准备 `AppSecret`

## 服务端

当前 V0 默认值：

- `PORT=3000`

后续建议增加：

- `DATABASE_URL`
- `JWT_SECRET`
- `WECHAT_APP_ID`
- `WECHAT_APP_SECRET`
- `SMS_PROVIDER_KEY`（如果接短信）

## 开发说明

- 本地开发时，小程序前端默认请求 `http://127.0.0.1:3000`
- 真机环境和上线环境需切换为 HTTPS 域名
- 生产环境密钥不写入仓库，只提供 `.env.example`
