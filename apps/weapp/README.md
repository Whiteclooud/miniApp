# WeChat Mini Program

这是当前项目的原生微信小程序前端。

## 当前页面

### 顾客端
- `pages/home`
- `pages/gallery-list`
- `pages/gallery-detail`
- `pages/booking`
- `pages/my-bookings`
- `pages/my-inspirations`

“查看我的灵感”页面已接入顾客灵感列表、详情、备注修改和删除；返图详情页可保存当前返图并填写备注。

### 店员端
- `pages/staff/rules`
- `pages/staff/gallery`
- `pages/staff/appointments`
- `pages/staff/members`

默认首屏为 `pages/home`。应用启动时会完成微信登录、校验缓存 session，
并按 `customer / staff / owner / system_admin` 自动进入顾客首页或店员预约工作台。
体验版 / 正式版首页提供协议勾选后的手机号授权入口：按钮通过 `wx.getPhoneNumber`
拿到一次性凭证，随 `wx.login` code 发送到服务端；拒绝手机号授权时仍可使用普通微信
登录，手机号不是账号主键。

## 当前能力

- 首页展示品牌氛围与返图案例
- 顾客浏览、筛选返图并从详情发起“预约同款”
- 顾客查看可预约日期 / 时间段，新增、预览或删除参考图并提交预约申请
- 顾客按当前微信 OpenID 查询预约状态与参考图
- 顾客灵感接口请求封装：列表、详情、保存、备注修改、删除
- 店员维护预约规则
- 店员审核预约申请、协助改期并查看操作日志
- 店主创建一次性店员邀请、查看和移除店员；系统管理员还可邀请或移除店主

## 打开方式

使用微信开发者工具打开当前目录：

```text
apps/weapp
```

## 联调前准备

1. 在仓库根目录确认当前后端已启动：`npm run dev:api`
2. 确认微信开发者工具已关闭本地域名校验
3. develop 联调可继续使用 `staff-openid-demo`；体验版 / 正式版使用微信 Bearer 会话和数据库成员关系
4. 验收步骤请参考 `docs/UAT_GUIDE.md`

## 说明

- 当前后端基线为 `apps/api`；开发者工具模拟器默认请求 `http://127.0.0.1:3100`，真机调试、trial/release 使用 `https://api.whiteclooud.asia`
- 微信开发者工具出现 `net::ERR_CONNECTION_REFUSED` 时，先在仓库根目录执行 `npm run dev:api`，并确认 `http://127.0.0.1:3100/health` 返回 200
- develop 环境的本地 HTTP 图片可能产生协议提示；体验版和正式版必须配置真实 HTTPS API 域名，不能使用 `127.0.0.1` 或占位域名
- 真实 `AppID`、合法域名、真机联调配置详见 `docs/ENV.md`
- 当前阶段重点是跑通 NestJS + Prisma + MySQL 预约闭环，不引入支付、多员工、多门店能力
