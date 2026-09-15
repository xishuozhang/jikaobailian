const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const paySuccess = () => ({
  errcode: 0,
  errmsg: "ok"
});

const payFail = (message) => ({
  errcode: 1,
  errmsg: message || "fail"
});

const normalizeDate = (value) => {
  if (!value) {
    return null;
  }

  const raw = value.$date || value;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatDateTime = (date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hour = `${date.getHours()}`.padStart(2, "0");
  const minute = `${date.getMinutes()}`.padStart(2, "0");
  const second = `${date.getSeconds()}`.padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
};

const addDays = (date, days) => {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + Number(days));
  return next;
};

const ensureCollection = async (name) => {
  if (typeof db.createCollection !== "function") {
    return;
  }

  try {
    await db.createCollection(name);
  } catch (error) {
    const message = `${error.errMsg || error.message || ""}`;
    if (!message.includes("already exists") && !message.includes("collection exists") && !message.includes("已存在")) {
      throw error;
    }
  }
};

exports.main = async (event = {}) => {
  const outTradeNo = event.outTradeNo || event.out_trade_no || event.data && (event.data.outTradeNo || event.data.out_trade_no);
  const transactionId = event.transactionId || event.transaction_id || event.wxOrderId || event.wx_order_id || event.data && (event.data.transactionId || event.data.transaction_id || event.data.wxOrderId || event.data.wx_order_id) || "";
  const totalFee = Number(event.totalFee || event.total_fee || event.paidFee || event.paid_fee || event.data && (event.data.totalFee || event.data.total_fee || event.data.paidFee || event.data.paid_fee));
  const openid = event.openid || event.openId || event.OPENID || event.data && (event.data.openid || event.data.openId);
  const resultCode = event.resultCode || event.result_code || event.returnCode || event.return_code || event.payStatus || event.pay_status || "SUCCESS";

  if (resultCode !== "SUCCESS") {
    return payFail("支付结果不是成功状态");
  }

  if (!outTradeNo) {
    return payFail("缺少商户订单号");
  }

  const orderQuery = await db.collection("payment_orders").where({ outTradeNo }).limit(1).get();
  const order = orderQuery.data[0];

  if (!order) {
    return payFail("订单不存在");
  }

  if (order.status === "paid") {
    return paySuccess();
  }

  if (Number.isFinite(totalFee) && totalFee > 0 && Number(order.totalFee) !== totalFee) {
    await db.collection("payment_orders").doc(order._id).update({
      data: {
        status: "failed",
        updatedAt: db.serverDate()
      }
    });
    return payFail("订单金额不一致");
  }

  if (openid && openid !== order._openid) {
    return payFail("支付用户与订单用户不一致");
  }

  const targetOpenid = order._openid;
  const userQuery = await db.collection("users").where({ _openid: targetOpenid }).limit(1).get();
  const user = userQuery.data[0];

  if (!user) {
    return payFail("用户不存在");
  }

  const now = new Date();
  const currentExpireAt = normalizeDate(user.memberExpireAt);
  const isRenew = user.isMember && currentExpireAt && currentExpireAt.getTime() > now.getTime();
  const baseDate = isRenew ? currentExpireAt : now;
  const newExpireAt = addDays(baseDate, order.days);
  const beforeText = currentExpireAt ? formatDateTime(currentExpireAt) : "";
  const afterText = formatDateTime(newExpireAt);

  const lockResult = await db.collection("payment_orders").where({
    outTradeNo,
    status: "pending",
    payProcessing: _.neq(true)
  }).update({
    data: {
      payProcessing: true,
      updatedAt: db.serverDate()
    }
  });

  if (!lockResult.stats || lockResult.stats.updated === 0) {
    return paySuccess();
  }

  await db.collection("users").doc(user._id).update({
    data: {
      memberStatus: "vip",
      memberExpireAt: afterText,
      isMember: true,
      updatedAt: db.serverDate()
    }
  });

  await db.collection("payment_orders").doc(order._id).update({
    data: {
      status: "paid",
      payProcessing: false,
      transactionId,
      wxOrderId: transactionId,
      paidAt: db.serverDate(),
      updatedAt: db.serverDate(),
      memberExpireAtBefore: beforeText,
      memberExpireAtAfter: afterText
    }
  });

  await ensureCollection("member_logs");
  await db.collection("member_logs").add({
    data: {
      targetOpenid,
      action: isRenew ? "pay_renew" : "pay_open",
      memberStatus: "vip",
      memberExpireAt: afterText,
      operatedBy: "wechat_pay",
      outTradeNo,
      createdAt: db.serverDate()
    }
  });

  return paySuccess();
};
