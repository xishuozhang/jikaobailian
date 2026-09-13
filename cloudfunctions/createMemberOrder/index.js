const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

const DEFAULT_PLANS = [
  {
    _id: "monthly",
    name: "月度会员",
    days: 30,
    price: 990,
    priceText: "9.90元",
    enabled: true,
    sort: 1
  },
  {
    _id: "quarterly",
    name: "季度会员",
    days: 90,
    price: 1990,
    priceText: "19.90元",
    enabled: true,
    sort: 2
  },
  {
    _id: "yearly",
    name: "年度会员",
    days: 365,
    price: 5990,
    priceText: "59.90元",
    enabled: true,
    sort: 3
  }
];

const isCollectionMissing = (error) => {
  const message = `${error.errMsg || error.message || ""}`;
  return message.includes("collection not exists")
    || message.includes("collection doesn't exists")
    || message.includes("collection not exist")
    || message.includes("集合不存在");
};

const getPlan = async (planId) => {
  try {
    const result = await db.collection("member_plans").doc(planId).get();
    return result.data || null;
  } catch (error) {
    if (isCollectionMissing(error) || `${error.errMsg || error.message || ""}`.includes("document.get")) {
      return DEFAULT_PLANS.find((plan) => plan._id === planId) || null;
    }

    throw error;
  }
};

const createOutTradeNo = () => {
  const random = Math.random().toString(36).slice(2, 8);
  return `member_${Date.now()}_${random}`;
};

exports.main = async (event = {}) => {
  const { OPENID, ENV } = cloud.getWXContext();
  const planId = `${event.planId || ""}`.trim();

  if (!planId) {
    return { errCode: "EMPTY_PLAN_ID", errMsg: "请选择会员套餐" };
  }

  const plan = await getPlan(planId);

  if (!plan || plan.enabled === false) {
    return { errCode: "PLAN_NOT_FOUND", errMsg: "会员套餐不存在或已下架" };
  }

  const outTradeNo = createOutTradeNo();
  const now = db.serverDate();

  try {
    await db.collection("payment_orders").add({
      data: {
        _openid: OPENID,
        outTradeNo,
        planId: plan._id || planId,
        planName: plan.name,
        days: Number(plan.days),
        totalFee: Number(plan.price),
        status: "pending",
        transactionId: "",
        memberExpireAtBefore: "",
        memberExpireAtAfter: "",
        createdAt: now,
        paidAt: null,
        updatedAt: now
      }
    });
  } catch (error) {
    if (isCollectionMissing(error)) {
      return { errCode: "PAYMENT_COLLECTION_MISSING", errMsg: "请先创建 payment_orders 集合" };
    }

    throw error;
  }

  try {
    const payResult = await cloud.cloudPay.unifiedOrder({
      body: `中职数字媒体题库会员-${plan.name}`,
      outTradeNo,
      spbillCreateIp: "127.0.0.1",
      totalFee: Number(plan.price),
      tradeType: "JSAPI",
      // TODO: 请在微信云开发支付配置中确认并替换为当前小程序绑定的微信支付子商户号。
      subMchId: "请替换为你的微信支付子商户号",
      // TODO: 请确认 envId 为当前云开发环境 ID。默认使用调用上下文 ENV，必要时替换为固定环境 ID。
      envId: ENV,
      // TODO: 支付回调云函数名称必须与部署名称一致。
      functionName: "payCallback"
    });

    return {
      outTradeNo,
      payment: payResult.payment || payResult
    };
  } catch (error) {
    await db.collection("payment_orders").where({ outTradeNo }).update({
      data: {
        status: "failed",
        updatedAt: db.serverDate()
      }
    });

    const message = `${error.errMsg || error.message || ""}`;
    if (message.includes("sub_mch_id") || message.includes("mch") || message.includes("cloudPay") || message.includes("payment")) {
      return {
        errCode: "PAY_NOT_CONFIGURED",
        errMsg: "请先配置微信支付商户号，并确认云函数中的 subMchId、envId、functionName。"
      };
    }

    return {
      errCode: "CREATE_PAY_ORDER_FAILED",
      errMsg: message || "创建支付订单失败，请稍后重试"
    };
  }
};
