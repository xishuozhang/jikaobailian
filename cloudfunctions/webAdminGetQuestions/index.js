const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;
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

const normalizeBooleanFilter = (value) => {
  if (value === true || value === "true") {
    return true;
  }
  if (value === false || value === "false") {
    return false;
  }
  return null;
};

const buildCondition = (event) => {
  const conditions = [];
  const keyword = String(event.keyword || "").trim();
  const category = String(event.category || "").trim();
  const type = String(event.type || "").trim();
  const difficulty = String(event.difficulty || "").trim();
  const isMock = normalizeBooleanFilter(event.isMock);

  if (keyword) {
    conditions.push({
      title: db.RegExp({
        regexp: keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        options: "i"
      })
    });
  }
  if (category) {
    conditions.push({ category });
  }
  if (["single", "multiple", "judge"].includes(type)) {
    conditions.push({ type });
  }
  if (["easy", "medium", "hard"].includes(difficulty)) {
    conditions.push({ difficulty });
  }
  if (isMock !== null) {
    conditions.push({ isMock });
  }

  if (conditions.length === 0) {
    return {};
  }
  if (conditions.length === 1) {
    return conditions[0];
  }
  return _.and(...conditions);
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

    const page = Math.max(Number(event.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(event.pageSize) || 10, 1), 100);
    const condition = buildCondition(event);
    const skip = (page - 1) * pageSize;
    const collection = db.collection("questions");

    const [countResult, listResult] = await Promise.all([
      collection.where(condition).count(),
      collection.where(condition)
        .field({
          _id: true,
          title: true,
          type: true,
          category: true,
          difficulty: true,
          isMock: true,
          imageUrl: true,
          createdAt: true,
          updatedAt: true
        })
        .orderBy("updatedAt", "desc")
        .skip(skip)
        .limit(pageSize)
        .get()
    ]);

    return {
      success: true,
      data: {
        list: listResult.data || [],
        total: countResult.total || 0,
        page,
        pageSize
      }
    };
  } catch (error) {
    console.error("webAdminGetQuestions failed:", error);
    if (isCollectionMissing(error)) {
      return {
        success: true,
        data: {
          list: [],
          total: 0,
          page: Math.max(Number(event.page) || 1, 1),
          pageSize: Math.min(Math.max(Number(event.pageSize) || 10, 1), 100)
        }
      };
    }
    return {
      success: false,
      message: error.message || "获取题库列表失败"
    };
  }
};
