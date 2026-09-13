const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

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
  const limit = Math.min(Number(event.limit) || 50, 100);
  const skip = Number(event.skip) || 0;

  try {
    const result = await db.collection("answer_records")
      .where({ _openid: OPENID })
      .orderBy("createdAt", "desc")
      .skip(skip)
      .limit(limit)
      .get();

    return {
      records: result.data
    };
  } catch (error) {
    if (isCollectionMissing(error)) {
      return { records: [] };
    }

    throw error;
  }
};
