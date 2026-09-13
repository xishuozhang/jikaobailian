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
  const recordId = `${event.recordId || ""}`.trim();
  const questionId = `${event.questionId || ""}`.trim();

  if (!recordId && !questionId) {
    return {
      errCode: "EMPTY_TARGET",
      errMsg: "recordId 或 questionId 不能为空"
    };
  }

  const query = recordId
    ? { _id: recordId, _openid: OPENID }
    : { questionId, _openid: OPENID };

  try {
    const result = await db.collection("wrong_records")
      .where(query)
      .update({
        data: {
          mastered: false,
          updatedAt: db.serverDate()
        }
      });

    return {
      updated: result.stats ? result.stats.updated : 0
    };
  } catch (error) {
    if (isCollectionMissing(error)) {
      return { updated: 0 };
    }

    throw error;
  }
};
