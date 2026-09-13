const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const INVALID_LOGIN_MESSAGE = "登录已失效，请重新登录";

const isCollectionMissing = (error) => {
  const message = `${error.errMsg || error.message || ""}`;
  return message.includes("collection not exists")
    || message.includes("collection doesn't exists")
    || message.includes("collection not exist")
    || message.includes("集合不存在");
};

const parseTime = (value) => {
  if (!value) {
    return 0;
  }
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.includes("T") ? value : value.replace(/-/g, "/");
    const time = new Date(normalized).getTime();
    return Number.isNaN(time) ? 0 : time;
  }
  if (typeof value === "object" && value.$date) {
    return parseTime(value.$date);
  }
  return 0;
};

const checkSession = async (token) => {
  if (!token) {
    return null;
  }

  const result = await db.collection("admin_sessions")
    .where({ token })
    .limit(1)
    .get();
  const session = result.data[0];

  if (!session || parseTime(session.expiredAt) <= Date.now()) {
    if (session) {
      await db.collection("admin_sessions").where({ token }).remove();
    }
    return null;
  }

  return session;
};

exports.main = async (event = {}) => {
  try {
    const token = String(event.token || "").trim();
    const session = await checkSession(token);

    if (!session) {
      return {
        success: false,
        message: INVALID_LOGIN_MESSAGE
      };
    }

    const questionId = String(event.questionId || "").trim();
    if (!questionId) {
      return {
        success: false,
        message: "请选择要删除的题目"
      };
    }

    const docRef = db.collection("questions").doc(questionId);
    const questionResult = await docRef.get();

    if (!questionResult.data) {
      return {
        success: false,
        message: "题目不存在或已被删除"
      };
    }

    await docRef.remove();

    return {
      success: true,
      message: "删除成功"
    };
  } catch (error) {
    console.error("webAdminDeleteQuestion failed:", error);
    if (isCollectionMissing(error)) {
      return {
        success: false,
        message: "题目不存在或已被删除"
      };
    }
    return {
      success: false,
      message: error.message || "删除题目失败"
    };
  }
};
