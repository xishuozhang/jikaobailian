const crypto = require("crypto");
const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const DEFAULT_PLANS = [
  { _id: "monthly", name: "月度会员", days: 30, price: 990, priceText: "9.90元", productId: "member_monthly", enabled: true, sort: 1 },
  { _id: "quarterly", name: "季度会员", days: 90, price: 1990, priceText: "19.90元", productId: "member_quarterly", enabled: true, sort: 2 },
  { _id: "yearly", name: "年度会员", days: 365, price: 5990, priceText: "59.90元", productId: "member_yearly", enabled: true, sort: 3 }
];
const isCollectionMissing = (error) => /collection (not exists|doesn't exists|not exist)/i.test(`${error.errMsg || error.message || ""}`) || `${error.errMsg || error.message || ""}`.includes("集合不存在");
const getPlan = async (id) => {
  try { return (await db.collection("member_plans").doc(id).get()).data || null; }
  catch (error) {
    if (isCollectionMissing(error) || `${error.errMsg || error.message || ""}`.includes("document.get")) return DEFAULT_PLANS.find((item) => item._id === id) || null;
    throw error;
  }
};
const hmac = (key, value) => crypto.createHmac("sha256", key).update(value, "utf8").digest("hex");
const createOutTradeNo = () => `member${Date.now()}${crypto.randomBytes(5).toString("hex")}`.slice(0, 32);
const config = () => ({
  offerId: `${process.env.VIRTUAL_PAYMENT_OFFER_ID || ""}`.trim(),
  appKey: `${process.env.VIRTUAL_PAYMENT_APP_KEY || ""}`.trim(),
  sandboxAppKey: `${process.env.VIRTUAL_PAYMENT_SANDBOX_APP_KEY || ""}`.trim(),
  env: Number(process.env.VIRTUAL_PAYMENT_ENV || 0) === 1 ? 1 : 0
});

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext();
  const planId = `${event.planId || ""}`.trim();
  const code = `${event.code || ""}`.trim();
  const settings = config();
  if (!planId) return { errCode: "EMPTY_PLAN_ID", errMsg: "请选择会员套餐" };
  if (!code) return { errCode: "LOGIN_REQUIRED", errMsg: "支付前请重新登录" };
  if (!settings.offerId || !settings.appKey) return { errCode: "VIRTUAL_PAYMENT_NOT_CONFIGURED", errMsg: "请先配置虚拟支付 OfferID 和现网 AppKey" };
  const plan = await getPlan(planId);
  if (!plan || plan.enabled === false) return { errCode: "PLAN_NOT_FOUND", errMsg: "会员套餐不存在或已下架" };
  const productId = `${plan.productId || plan.virtualProductId || `member_${planId}`}`.trim();
  const totalFee = Number(plan.price);
  if (!productId || !Number.isInteger(totalFee) || totalFee <= 0) return { errCode: "PLAN_INVALID", errMsg: "会员套餐缺少有效的虚拟商品配置" };
  let session;
  try { session = await cloud.openapi.auth.code2Session({ jsCode: code }); }
  catch (error) { return { errCode: "CODE2SESSION_FAILED", errMsg: "登录凭证失效，请重试" }; }
  if (!session || session.openid !== OPENID || !session.session_key) return { errCode: "OPENID_MISMATCH", errMsg: "登录状态校验失败，请重试" };
  const outTradeNo = createOutTradeNo();
  const signData = JSON.stringify({ offerId: settings.offerId, buyQuantity: 1, env: settings.env, currencyType: "CNY", productId, goodsPrice: totalFee, outTradeNo, attach: `member-${plan._id || planId}` });
  const appKey = settings.env === 1 && settings.sandboxAppKey ? settings.sandboxAppKey : settings.appKey;
  const payment = { signData, paySig: hmac(appKey, `requestVirtualPayment&${signData}`), signature: hmac(session.session_key, signData), mode: "short_series_goods" };
  try {
    await db.collection("payment_orders").add({ data: { _openid: OPENID, outTradeNo, planId: plan._id || planId, planName: plan.name, productId, days: Number(plan.days), totalFee, status: "pending", transactionId: "", wxOrderId: "", paidAt: null, createdAt: db.serverDate(), updatedAt: db.serverDate() } });
  } catch (error) {
    if (isCollectionMissing(error)) return { errCode: "PAYMENT_COLLECTION_MISSING", errMsg: "请先创建 payment_orders 集合" };
    throw error;
  }
  return { outTradeNo, payment };
};
