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

const countCollection = async (name, where) => {
  try {
    const collection = db.collection(name);
    const result = where ? await collection.where(where).count() : await collection.count();
    return result.total || 0;
  } catch (error) {
    if (isCollectionMissing(error)) {
      return 0;
    }
    throw error;
  }
};

const scanCollection = async (name, predicate) => {
  try {
    const pageSize = 1000;
    let skip = 0;
    let count = 0;

    while (true) {
      const result = await db.collection(name).skip(skip).limit(pageSize).get();
      const list = result.data || [];
      count += list.filter(predicate).length;

      if (list.length < pageSize) {
        break;
      }
      skip += pageSize;
    }

    return count;
  } catch (error) {
    if (isCollectionMissing(error)) {
      return 0;
    }
    throw error;
  }
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

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStart = today.getTime();
    const todayEnd = todayStart + 24 * 60 * 60 * 1000;
    const now = Date.now();

    const [totalUsers, vipUsers, totalQuestions, totalRecords, totalWrongRecords, todayRecords] = await Promise.all([
      countCollection("users"),
      scanCollection("users", (user) => user.memberStatus === "vip" && parseTime(user.memberExpireAt) > now),
      countCollection("questions"),
      countCollection("answer_records"),
      countCollection("wrong_records"),
      scanCollection("answer_records", (record) => {
        const createdAt = parseTime(record.createdAt);
        return createdAt >= todayStart && createdAt < todayEnd;
      })
    ]);

    return {
      success: true,
      data: {
        totalUsers,
        vipUsers,
        totalQuestions,
        totalRecords,
        totalWrongRecords,
        todayRecords
      }
    };
  } catch (error) {
    console.error("webAdminGetStats failed:", error);
    return {
      success: false,
      message: error.message || "获取数据概览失败"
    };
  }
};
