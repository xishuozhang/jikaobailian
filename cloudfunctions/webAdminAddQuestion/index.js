const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const INVALID_LOGIN_MESSAGE = "登录已失效，请重新登录";
const VALID_TYPES = ["single", "multiple", "judge"];
const VALID_DIFFICULTIES = ["easy", "medium", "hard"];

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

const normalizeBoolean = (value, defaultValue) => {
  if (value === true || value === "true" || value === 1 || value === "1") return true;
  if (value === false || value === "false" || value === 0 || value === "0") return false;
  return defaultValue;
};

const normalizeAnswerValue = (value) => {
  const text = String(value ?? "").trim();
  if (["正确", "true", "TRUE", "True", "A", "a"].includes(text)) return "true";
  if (["错误", "false", "FALSE", "False", "B", "b"].includes(text)) return "false";
  return text;
};

const validateQuestion = (input = {}) => {
  const title = String(input.title || "").trim();
  const type = String(input.type || "").trim();
  const analysis = String(input.analysis || "").trim();
  const category = String(input.category || "").trim();
  const difficulty = VALID_DIFFICULTIES.includes(input.difficulty) ? input.difficulty : "easy";
  const imageUrl = String(input.imageUrl || "").trim();
  const isMock = normalizeBoolean(input.isMock, true);
  let options = Array.isArray(input.options) ? input.options : [];
  let answer = Array.isArray(input.answer) ? input.answer.map((item) => String(item).trim()).filter(Boolean) : [];

  if (!title) throw new Error("题干不能为空");
  if (!VALID_TYPES.includes(type)) throw new Error("题型必须是 single、multiple 或 judge");
  if (!answer.length) throw new Error("答案不能为空");
  if (!analysis) throw new Error("答案解析不能为空");
  if (!category) throw new Error("分类不能为空");
  if (!Array.isArray(input.options)) throw new Error("选项必须是数组");

  if (type === "judge") {
    options = [
      { label: "true", text: "正确" },
      { label: "false", text: "错误" }
    ];
    answer = [normalizeAnswerValue(answer[0])];
    if (!["true", "false"].includes(answer[0])) throw new Error("判断题答案必须是 true 或 false");
  } else {
    options = options
      .map((item) => ({
        label: String(item.label || "").trim(),
        text: String(item.text || "").trim()
      }))
      .filter((item) => item.label);
    const labels = options.map((item) => item.label);
    if (!options.length) throw new Error("选项不能为空");
    if (type === "single" && answer.length !== 1) throw new Error("单选题答案只能有一个");
    answer.forEach((item) => {
      if (!labels.includes(item)) throw new Error(`答案 ${item} 不存在于选项中`);
    });
  }

  return {
    title,
    type,
    imageUrl,
    options,
    answer,
    analysis,
    category,
    difficulty,
    isMock
  };
};

exports.main = async (event = {}) => {
  try {
    const session = await checkSession(String(event.token || "").trim());
    if (!session) return { success: false, message: INVALID_LOGIN_MESSAGE };

    const question = validateQuestion(event);
    const now = new Date();
    const result = await db.collection("questions").add({
      data: {
        ...question,
        createdAt: now,
        updatedAt: now
      }
    });

    return {
      success: true,
      message: "新增成功",
      questionId: result._id
    };
  } catch (error) {
    console.error("webAdminAddQuestion failed:", error);
    return {
      success: false,
      message: error.message || "新增题目失败"
    };
  }
};
