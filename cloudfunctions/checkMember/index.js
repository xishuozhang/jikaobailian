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

const isAdminUser = async (openid) => {
  try {
    const result = await db.collection("admin_config").limit(20).get();
    return result.data.some((item) => (
      Array.isArray(item.adminOpenids) && item.adminOpenids.includes(openid)
    ));
  } catch (error) {
    if (isCollectionMissing(error)) {
      return false;
    }

    throw error;
  }
};

const isValidMember = (user) => {
  if (!user || !user.isMember) {
    return false;
  }

  if (!user.memberExpireAt) {
    return true;
  }

  return new Date(user.memberExpireAt).getTime() > Date.now();
};

exports.main = async () => {
  const { OPENID } = cloud.getWXContext();
  const isAdmin = await isAdminUser(OPENID);

  if (isAdmin) {
    return {
      isMember: true,
      isAdmin: true,
      memberExpireAt: null
    };
  }

  const userQuery = await db.collection("users").where({ _openid: OPENID }).limit(1).get();
  const user = userQuery.data[0] || null;

  return {
    isMember: isValidMember(user),
    isAdmin: false,
    memberExpireAt: user ? user.memberExpireAt || null : null
  };
};
