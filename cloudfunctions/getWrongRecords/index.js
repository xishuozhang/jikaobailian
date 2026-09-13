const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

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
  const status = ["mastered", "all"].includes(event.status) ? event.status : "unmastered";
  const query = {
    _openid: OPENID
  };

  if (status === "unmastered") {
    query.mastered = _.neq(true);
  }

  if (status === "mastered") {
    query.mastered = true;
  }

  try {
    const result = await db.collection("wrong_records")
      .where(query)
      .orderBy("updatedAt", "desc")
      .skip(skip)
      .limit(limit)
      .get();

    return {
      status,
      records: result.data
    };
  } catch (error) {
    if (isCollectionMissing(error)) {
      return { records: [] };
    }

    throw error;
  }
};
