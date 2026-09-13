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
  const result = await db.collection("users").where({ _openid: openid }).limit(1).get();
  return result.data[0] || null;
};

const resolveExpireAt = (user, action, days, memberExpireAt) => {
  if (action === "cancel") return null;
  if (memberExpireAt) {
    const time = parseTime(memberExpireAt);
    if (!time) throw new Error("指定到期时间不合法");
    return new Date(time);
  }
  const validDays = Number(days);
  if (!Number.isFinite(validDays) || validDays <= 0) throw new Error("请选择有效的开通或续期天数");
  const now = Date.now();
  const base = action === "renew" && user.memberStatus === "vip" && parseTime(user.memberExpireAt) > now
    ? parseTime(user.memberExpireAt)
    : now;
  return new Date(base + validDays * 24 * 60 * 60 * 1000);
};

exports.main = async (event = {}) => {
  try {
    const session = await checkSession(String(event.token || "").trim());
    if (!session) return { success: false, message: INVALID_LOGIN_MESSAGE };

    const targetOpenid = String(event.targetOpenid || "").trim();
    const action = String(event.action || "").trim();
    if (!targetOpenid) return { success: false, message: "请选择用户" };
    if (!["open", "renew", "cancel"].includes(action)) return { success: false, message: "会员操作类型不合法" };

    const user = await getUserByOpenid(targetOpenid);
    if (!user) return { success: false, message: "用户不存在" };

    const memberExpireAt = resolveExpireAt(user, action, event.days, event.memberExpireAt);
    const memberStatus = action === "cancel" ? "normal" : "vip";
    const now = new Date();

    await db.collection("users").doc(user._id).update({
      data: {
        memberStatus,
        isMember: memberStatus === "vip",
        memberExpireAt,
        updatedAt: now
      }
    });

    await db.collection("member_logs").add({
      data: {
        targetOpenid,
        action,
        memberStatus,
        memberExpireAt,
        operatedBy: session.username || "",
        operatorUsername: session.username || "",
        createdAt: now
      }
    });

    return {
      success: true,
      message: "会员状态已更新",
      data: {
        _openid: targetOpenid,
        memberStatus,
        memberExpireAt,
        updatedAt: now
      }
    };
  } catch (error) {
    console.error("webAdminUpdateMember failed:", error);
    return { success: false, message: error.message || "更新会员失败" };
  }
};
