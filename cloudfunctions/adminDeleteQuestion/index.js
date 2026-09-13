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
    return { errCode: "NO_ADMIN_PERMISSION", errMsg: "无管理员权限" };
  }

  const id = `${event.id || ""}`.trim();

  if (!id) {
    return { errCode: "EMPTY_ID", errMsg: "题目 id 不能为空" };
  }

  await db.collection("questions").doc(id).remove();

  return { deleted: true };
};
