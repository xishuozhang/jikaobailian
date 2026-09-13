const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

exports.main = async (event = {}) => {
  const token = String(event.token || "").trim();

  if (!token) {
    return {
      isLogin: false
    };
  }

  const sessionResult = await db.collection("admin_sessions")
    .where({ token })
    .limit(1)
    .get();

  const session = sessionResult.data[0];

  if (!session) {
    return {
      isLogin: false
    };
  }

  if (new Date(session.expiredAt).getTime() <= Date.now()) {
    await db.collection("admin_sessions")
      .where({ token })
      .remove();

    return {
      isLogin: false
    };
  }

  return {
    isLogin: true,
    username: session.username,
    role: session.role || "admin"
  };
};
