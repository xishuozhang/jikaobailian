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

  if (!recordId) {
    return {
      errCode: "EMPTY_RECORD_ID",
      errMsg: "recordId 不能为空"
    };
  }

  try {
    const result = await db.collection("answer_records").doc(recordId).get();
    const record = result.data || null;

    return {
      record: record && record._openid === OPENID ? record : null
    };
  } catch (error) {
    if (isCollectionMissing(error)) {
      return { record: null };
    }

    throw error;
  }
};
