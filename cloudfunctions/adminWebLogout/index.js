const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

exports.main = async (event = {}) => {
  const token = String(event.token || "").trim();

  if (token) {
    await db.collection("admin_sessions")
      .where({ token })
      .remove();
  }

  return {
    success: true,
    message: "退出成功"
  };
};
