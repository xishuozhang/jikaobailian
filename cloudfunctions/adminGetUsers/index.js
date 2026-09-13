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
    return { errCode: "NO_ADMIN_PERMISSION", errMsg: "无管理员权限", users: [] };
  }

  const keyword = `${event.keyword || ""}`.trim();
  const limit = Math.min(Number(event.limit) || 50, 100);
  const skip = Number(event.skip) || 0;

  try {
    const result = await db.collection("users")
      .orderBy("createdAt", "desc")
      .skip(skip)
      .limit(100)
      .get();
    const users = result.data
      .filter((user) => {
        const nickName = `${user.nickName || user.nickname || ""}`;
        const openid = `${user._openid || user.openid || ""}`;
        return !keyword || nickName.includes(keyword) || openid.includes(keyword);
      })
      .slice(0, limit);

    return { users };
  } catch (error) {
    if (isCollectionMissing(error)) {
      return { users: [] };
    }
    throw error;
  }
};
