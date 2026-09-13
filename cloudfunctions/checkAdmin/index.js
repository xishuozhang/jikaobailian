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

exports.main = async () => {
  const { OPENID } = cloud.getWXContext();

  try {
    const result = await db.collection("admin_config").limit(20).get();
    const isAdmin = result.data.some((item) => (
      Array.isArray(item.adminOpenids) && item.adminOpenids.includes(OPENID)
    ));

    return {
      openid: OPENID,
      isAdmin
    };
  } catch (error) {
    if (isCollectionMissing(error)) {
      return {
        openid: OPENID,
        isAdmin: false
      };
    }

    throw error;
  }
};
