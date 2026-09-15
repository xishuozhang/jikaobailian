# 个人主体小程序虚拟支付接入

本项目会员套餐使用微信个人主体虚拟支付（道具直购），不再使用普通商户号支付。前端调用 `wx.requestVirtualPayment`，云函数负责生成双签名，支付结果通过虚拟支付回调发货。

## 云函数环境变量

在云开发控制台为 `createMemberOrder` 配置：

- `VIRTUAL_PAYMENT_OFFER_ID`：虚拟支付基本配置中的 OfferID。
- `VIRTUAL_PAYMENT_APP_KEY`：现网 AppKey。
- `VIRTUAL_PAYMENT_SANDBOX_APP_KEY`：沙箱 AppKey（可选）。
- `VIRTUAL_PAYMENT_ENV`：`0` 现网，`1` 沙箱；上线前必须为 `0`。

不要把 AppKey、AppSecret 或签名写入小程序代码或 Git。

## 道具与套餐

在虚拟支付后台创建并发布 `member_monthly`、`member_quarterly`、`member_yearly` 道具，价格分别与 `member_plans.price`（单位：分）一致。也可以在 `member_plans` 文档中填写对应的 `productId`。

## 部署前检查清单

- [ ] 个人主体虚拟支付已审核通过，OfferID、现网 AppKey 已取得。
- [ ] 虚拟商品已创建、价格与套餐一致并已发布。
- [ ] `createMemberOrder` 已配置环境变量并部署。
- [ ] `payCallback` 已部署，并在虚拟支付后台配置为支付结果/发货回调云函数。
- [ ] `payment_orders`、`member_logs`、`users` 集合已创建；客户端权限不能直接写订单和会员字段。
- [ ] 小程序基础库不低于 2.19.2，并在真机验证 `wx.requestVirtualPayment`。
- [ ] 沙箱支付成功后，回调能按 `outTradeNo` 幂等开通会员；重复回调不会重复延长有效期。
- [ ] 支付取消、签名错误、道具未发布、网络中断均能提示且不会开通会员。
- [ ] 上线前将 `VIRTUAL_PAYMENT_ENV` 切换为 `0`，重新部署云函数并重新编译小程序。

支付成功只代表客户端支付流程完成，会员状态以 `payCallback` 的服务端发货结果为准。
