const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

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

const scanCollection = async (name) => {
  try {
    const pageSize = 1000;
    const list = [];
    let skip = 0;
    while (true) {
      const result = await db.collection(name).skip(skip).limit(pageSize).get();
      const rows = result.data || [];
      list.push(...rows);
      if (rows.length < pageSize) break;
      skip += pageSize;
    }
    return list;
  } catch (error) {
    if (isCollectionMissing(error)) return [];
    throw error;
  }
};

exports.main = async (event = {}) => {
  try {
    const session = await checkSession(String(event.token || "").trim());
    if (!session) return { success: false, message: INVALID_LOGIN_MESSAGE };

    const page = Math.max(Number(event.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(event.pageSize) || 10, 1), 100);
    const keyword = String(event.keyword || "").trim().toLowerCase();
    const practiceType = String(event.practiceType || "").trim();
    const startTime = parseTime(event.startDate);
    const endTime = parseTime(event.endDate) ? parseTime(event.endDate) + 24 * 60 * 60 * 1000 - 1 : 0;

    const [records, users] = await Promise.all([
      scanCollection("answer_records"),
      scanCollection("users")
    ]);
    const userMap = users.reduce((map, user) => {
      if (user._openid) map[user._openid] = user;
      return map;
    }, {});

    const matchedOpenids = keyword
      ? users
        .filter((user) => String(user.nickName || "").toLowerCase().includes(keyword)
          || String(user._openid || "").toLowerCase().includes(keyword))
        .map((user) => user._openid)
      : [];

    const filtered = records.filter((record) => {
      const createdAt = parseTime(record.createdAt);
      const matchedKeyword = !keyword
        || String(record._openid || "").toLowerCase().includes(keyword)
        || matchedOpenids.includes(record._openid);
      const matchedType = !practiceType || record.practiceType === practiceType;
      const matchedStart = !startTime || createdAt >= startTime;
      const matchedEnd = !endTime || createdAt <= endTime;
      return matchedKeyword && matchedType && matchedStart && matchedEnd;
    });

    filtered.sort((a, b) => parseTime(b.createdAt) - parseTime(a.createdAt));
    const start = (page - 1) * pageSize;
    const list = filtered.slice(start, start + pageSize).map((record) => {
      const user = userMap[record._openid] || {};
      const total = record.total || record.totalCount || record.questionCount || 0;
      const correctCount = record.correctCount || 0;
      const wrongCount = record.wrongCount !== undefined ? record.wrongCount : Math.max(Number(total) - Number(correctCount), 0);
      return {
        _id: record._id,
        _openid: record._openid || "",
        nickName: user.nickName || "",
        avatarUrl: user.avatarUrl || "",
        practiceType: record.practiceType || "",
        category: record.category || "",
        score: record.score ?? "",
        total,
        correctCount,
        wrongCount,
        duration: record.duration || 0,
        createdAt: record.createdAt || null
      };
    });

    return {
      success: true,
      data: {
        list,
        total: filtered.length,
        page,
        pageSize
      }
    };
  } catch (error) {
    console.error("webAdminGetRecords failed:", error);
    return { success: false, message: error.message || "获取学习记录失败" };
  }
};
