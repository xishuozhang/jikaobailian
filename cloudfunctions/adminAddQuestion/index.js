const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

const isCollectionMissing = (error) => {
  const message = `${error.errMsg || error.message || ""}`;
  return message.includes("collection not exists")
    || message.includes("collection doesn't exists")
    || message.includes("collection not exist")
    || message.includes("集合不存在");
};

const checkAdmin = async () => {
  const { OPENID } = cloud.getWXContext();
  try {
    const result = await db.collection("admin_config").limit(20).get();
    return result.data.some((item) => Array.isArray(item.adminOpenids) && item.adminOpenids.includes(OPENID));
  } catch (error) {
    if (isCollectionMissing(error)) {
      return false;
    }
    throw error;
  }
};

const normalizeQuestion = (data = {}) => ({
  title: `${data.title || ""}`.trim(),
  type: `${data.type || ""}`.trim(),
  imageUrl: `${data.imageUrl || ""}`.trim(),
  options: Array.isArray(data.options) ? data.options : [],
  answer: data.type === "multiple" && Array.isArray(data.answer) ? data.answer : data.answer,
  analysis: `${data.analysis || ""}`.trim(),
  category: `${data.category || ""}`.trim(),
  difficulty: `${data.difficulty || "easy"}`.trim(),
  isMock: data.isMock === true,
  status: data.status || "active",
  updatedAt: db.serverDate()
});

const validateQuestion = (question) => {
  if (!question.title) return "题干不能为空";
  if (!question.type) return "题型不能为空";
  if (!question.answer || Array.isArray(question.answer) && !question.answer.length) return "答案不能为空";
  if (!question.analysis) return "解析不能为空";
  if (!question.category) return "分类不能为空";
  return "";
};

exports.main = async (event = {}) => {
  if (!await checkAdmin()) {
    return { errCode: "NO_ADMIN_PERMISSION", errMsg: "无管理员权限" };
  }

  const question = normalizeQuestion(event.question || {});
  const errorMsg = validateQuestion(question);

  if (errorMsg) {
    return { errCode: "INVALID_QUESTION", errMsg: errorMsg };
  }

  const result = await db.collection("questions").add({
    data: {
      ...question,
      createdAt: db.serverDate()
    }
  });

  return { id: result._id };
};
