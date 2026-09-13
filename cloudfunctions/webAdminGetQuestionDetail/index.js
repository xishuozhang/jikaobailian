const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const INVALID_LOGIN_MESSAGE = "登录已失效，请重新登录";

const parseTime = (value) => {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const time = new Date(value.includes("T") ? value : value.replace(/-/g, "/")).getTime();
    return Number.isNaN(time) ? 0 : time;
  }
  if (typeof value === "object" && value.$date) return parseTime(value.$date);
  return 0;
};

const checkSession = async (token) => {
  if (!token) return null;
  const result = await db.collection("admin_sessions").where({ token }).limit(1).get();
  const session = result.data[0];
  if (!session || parseTime(session.expiredAt) <= Date.now()) {
    if (session) await db.collection("admin_sessions").where({ token }).remove();
    return null;
  }
  return session;
};

exports.main = async (event = {}) => {
  try {
    const session = await checkSession(String(event.token || "").trim());
    if (!session) return { success: false, message: INVALID_LOGIN_MESSAGE };

    const questionId = String(event.questionId || "").trim();
    if (!questionId) return { success: false, message: "请选择题目" };

    const result = await db.collection("questions").doc(questionId).get();
    if (!result.data) return { success: false, message: "题目不存在或已被删除" };

    return {
      success: true,
      data: result.data
    };
  } catch (error) {
    console.error("webAdminGetQuestionDetail failed:", error);
    return {
      success: false,
      message: error.message || "获取题目详情失败"
    };
  }
};
