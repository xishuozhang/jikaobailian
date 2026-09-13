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

const checkAdmin = async () => {
  const { OPENID } = cloud.getWXContext();
  try {
    const result = await db.collection("admin_config").limit(20).get();
    return result.data.some((item) => Array.isArray(item.adminOpenids) && item.adminOpenids.includes(OPENID));
  } catch (error) {
    if (isCollectionMissing(error)) {
      return false;
    }
    throw error;
  }
};

exports.main = async (event = {}) => {
  if (!await checkAdmin()) {
    return { errCode: "NO_ADMIN_PERMISSION", errMsg: "无管理员权限", questions: [] };
  }

  const keyword = `${event.keyword || ""}`.trim();
  const category = `${event.category || ""}`.trim();
  const limit = Math.min(Number(event.limit) || 50, 100);
  const skip = Number(event.skip) || 0;
  const condition = {};

  if (category) {
    condition.category = category;
  }

  try {
    const result = await db.collection("questions")
      .where(condition)
      .orderBy("updatedAt", "desc")
      .skip(skip)
      .limit(100)
      .get();
    const questions = result.data
      .filter((question) => !keyword || `${question.title || ""}`.includes(keyword))
      .slice(0, limit);
    const categoryMap = result.data.reduce((map, question) => {
      if (question.category) {
        map[question.category] = true;
      }
      return map;
    }, {});

    return {
      questions,
      categories: Object.keys(categoryMap).sort()
    };
  } catch (error) {
    if (isCollectionMissing(error)) {
      return { questions: [], categories: [] };
    }
    throw error;
  }
};
