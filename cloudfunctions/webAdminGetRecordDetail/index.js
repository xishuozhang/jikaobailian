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

const getUserByOpenid = async (openid) => {
  if (!openid) return null;
  const result = await db.collection("users").where({ _openid: openid }).limit(1).get();
  return result.data[0] || null;
};

exports.main = async (event = {}) => {
  try {
    const session = await checkSession(String(event.token || "").trim());
    if (!session) return { success: false, message: INVALID_LOGIN_MESSAGE };

    const recordId = String(event.recordId || "").trim();
    if (!recordId) return { success: false, message: "请选择学习记录" };

    const result = await db.collection("answer_records").doc(recordId).get();
    if (!result.data) return { success: false, message: "学习记录不存在" };

    const user = await getUserByOpenid(result.data._openid);
    return {
      success: true,
      data: {
        ...result.data,
        nickName: user?.nickName || "",
        avatarUrl: user?.avatarUrl || ""
      }
    };
  } catch (error) {
    console.error("webAdminGetRecordDetail failed:", error);
    return { success: false, message: error.message || "获取学习记录详情失败" };
  }
};
