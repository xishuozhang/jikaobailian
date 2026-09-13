const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

const normalizeOption = (option = {}) => {
  const key = `${option.key || option.label || ""}`.trim();
  const rawText = `${option.text || ""}`.trim();
  return {
    ...option,
    key,
    label: `${option.label || key}`.trim(),
    text: rawText === "correct" ? "\u6b63\u786e" : rawText === "wrong" ? "\u9519\u8bef" : rawText
  };
};

const sanitizeQuestion = (question) => {
  const { answer, analysis, ...safeQuestion } = question;
  safeQuestion.options = Array.isArray(safeQuestion.options)
    ? safeQuestion.options.map(normalizeOption).filter((option) => option.key)
    : [];
  return safeQuestion;
};

const isCollectionMissing = (error) => {
  const message = `${error.errMsg || error.message || ""}`;
  return message.includes("collection not exists")
    || message.includes("collection doesn't exists")
    || message.includes("collection not exist")
    || message.includes("集合不存在");
};

const isAdminUser = async (openid) => {
  try {
    const result = await db.collection("admin_config").limit(20).get();
    return result.data.some((item) => (
      Array.isArray(item.adminOpenids) && item.adminOpenids.includes(openid)
    ));
  } catch (error) {
    if (isCollectionMissing(error)) {
      return false;
    }

    throw error;
  }
};

const isValidMember = (user) => {
  if (!user || !user.isMember) {
    return false;
  }

  if (!user.memberExpireAt) {
    return true;
  }

  return new Date(user.memberExpireAt).getTime() > Date.now();
};

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext();
  const isAdmin = await isAdminUser(OPENID);
  const userQuery = await db.collection("users").where({ _openid: OPENID }).limit(1).get();
  const user = userQuery.data[0] || null;

  if (!isAdmin && !isValidMember(user)) {
    return {
      errCode: "MEMBER_REQUIRED",
      errMsg: "模拟练习为会员功能，请先开通会员。",
      questions: []
    };
  }

  const limit = Math.min(Number(event.limit) || 20, 100);
  const condition = {
    isMock: true
  };

  if (event.mockGroup) {
    condition.mockGroup = event.mockGroup;
  }

  const result = await db.collection("questions").where(condition).limit(100).get();
  const questions = result.data
    .filter((question) => question.status !== "disabled")
    .slice(0, limit);

  return {
    questions: questions.map(sanitizeQuestion)
  };
};
