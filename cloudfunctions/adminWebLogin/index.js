const cloud = require("wx-server-sdk");
const crypto = require("crypto");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

exports.main = async (event = {}) => {
  try {
    const username = String(event.username || "").trim();
    const password = String(event.password || "");

    if (!username || !password) {
      return {
        success: false,
        message: "请输入账号和密码"
      };
    }

    const accountResult = await db.collection("admin_accounts")
      .where({ username })
      .limit(1)
      .get();

    const account = accountResult.data[0];

    if (!account) {
      return {
        success: false,
        message: "账号不存在"
      };
    }

    if (account.enabled !== true) {
      return {
        success: false,
        message: "账号已被禁用"
      };
    }

    if (account.password !== password) {
      return {
        success: false,
        message: "密码错误"
      };
    }

    const token = crypto.randomBytes(32).toString("hex");
    const now = new Date();
    const expiredAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    await db.collection("admin_sessions").add({
      data: {
        token,
        username: account.username,
        role: account.role || "admin",
        expiredAt,
        createdAt: now
      }
    });

    return {
      success: true,
      token,
      username: account.username,
      role: account.role || "admin",
      realName: account.realName || account.username
    };
  } catch (error) {
    console.error("adminWebLogin failed:", error);
    return {
      success: false,
      message: error.message || "登录失败"
    };
  }
};
