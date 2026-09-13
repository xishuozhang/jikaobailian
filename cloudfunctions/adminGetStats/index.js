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

const checkAdmin = async () => {
  const { OPENID } = cloud.getWXContext();

  try {
    const result = await db.collection("admin_config").limit(20).get();
    const isAdmin = result.data.some((item) => (
      Array.isArray(item.adminOpenids) && item.adminOpenids.includes(OPENID)
    ));
    return { isAdmin, openid: OPENID };
  } catch (error) {
    if (isCollectionMissing(error)) {
      return { isAdmin: false, openid: OPENID };
    }
    throw error;
  }
};

const countCollection = async (name) => {
  try {
    const result = await db.collection(name).count();
    return result.total || 0;
  } catch (error) {
    if (isCollectionMissing(error)) {
      return 0;
    }
    throw error;
  }
};

const countVipUsers = async () => {
  try {
    const now = Date.now();
    const result = await db.collection("users").limit(1000).get();
    return result.data.filter((user) => (
      user.memberStatus === "vip"
      && user.memberExpireAt
      && new Date(user.memberExpireAt).getTime() > now
    )).length;
  } catch (error) {
    if (isCollectionMissing(error)) {
      return 0;
    }
    throw error;
  }
};

exports.main = async () => {
  const admin = await checkAdmin();

  if (!admin.isAdmin) {
    return {
      errCode: "NO_ADMIN_PERMISSION",
      errMsg: "无管理员权限"
    };
  }

  const [totalUsers, vipUsers, totalQuestions, totalAnswerRecords, totalWrongRecords] = await Promise.all([
    countCollection("users"),
    countVipUsers(),
    countCollection("questions"),
    countCollection("answer_records"),
    countCollection("wrong_records")
  ]);

  return {
    stats: {
      totalUsers,
      vipUsers,
      totalQuestions,
      totalAnswerRecords,
      totalWrongRecords
    }
  };
};
