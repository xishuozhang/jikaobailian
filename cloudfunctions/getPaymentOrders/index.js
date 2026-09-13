const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

const isCollectionMissing = (error) => {
  const message = `${error.errMsg || error.message || ""}`;
  return message.includes("collection not exists")
    || message.includes("collection doesn't exists")
    || message.includes("collection not exist")
    || message.includes("集合不存在");
};

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext();
  const limit = Math.min(Number(event.limit) || 20, 50);

  try {
    const result = await db.collection("payment_orders")
      .where({ _openid: OPENID })
      .orderBy("createdAt", "desc")
      .limit(limit)
      .get();

    return {
      orders: result.data.map((order) => ({
        _id: order._id,
        outTradeNo: order.outTradeNo,
        planName: order.planName,
        totalFee: order.totalFee,
        status: order.status,
        createdAt: order.createdAt,
        paidAt: order.paidAt
      }))
    };
  } catch (error) {
    if (isCollectionMissing(error)) {
      return { orders: [] };
    }

    throw error;
  }
};
