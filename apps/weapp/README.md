# WeChat Mini Program

这是当前项目的原生微信小程序前端。

## 当前页面

### 顾客端
- `pages/home`
- `pages/booking`
- `pages/my-bookings`

### 店员端
- `pages/staff/rules`
- `pages/staff/appointments`

## 当前能力

- 首页展示品牌氛围与返图案例
- 顾客查看可预约日期 / 时间段并提交预约申请
- 顾客按手机号查询预约状态
- 店员维护预约规则
- 店员审核预约申请

## 打开方式

使用微信开发者工具打开当前目录：

```text
apps/weapp
```

## 联调前准备

1. 确认本地后端已启动：`npm run dev:server`
2. 确认微信开发者工具已关闭本地域名校验
3. 若要进入店员页，请准备一个在 `STAFF_OPEN_IDS` 白名单内的 OpenID 作为联调输入
4. 验收步骤请参考 `docs/UAT_GUIDE.md`

## 说明

- 当前前端默认请求 `http://127.0.0.1:3000`
- 真实 `AppID`、合法域名、真机联调配置详见 `docs/ENV.md`
- 当前阶段重点是跑通预约闭环与 SQLite 持久化场景，不引入支付、多员工、多门店能力
