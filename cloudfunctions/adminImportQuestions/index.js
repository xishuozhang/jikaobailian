const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

const VALID_TYPES = ["single", "multiple", "judge"];

const trim = (value) => `${value || ""}`.trim();

const normalizeBoolean = (value, defaultValue) => {
  if (typeof value === "boolean") {
    return value;
  }

  const text = trim(value).toLowerCase();

  if (!text) {
    return defaultValue;
  }

  return ["true", "1", "yes", "是"].includes(text);
};

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

const normalizeJudgeAnswer = (answer) => {
  const value = trim(answer).toLowerCase();
  const trueValues = ["true", "正确", "a"];
  const falseValues = ["false", "错误", "b"];

  if (trueValues.includes(value)) {
    return "true";
  }

  if (falseValues.includes(value)) {
    return "false";
  }

  return trim(answer);
};

const normalizeOption = (option = {}) => {
  const label = trim(option.label || option.key);

  return {
    label,
    key: label,
    text: trim(option.text)
  };
};

const normalizeQuestion = (data = {}) => {
  const type = trim(data.type);
  const rawAnswer = Array.isArray(data.answer) ? data.answer : [];
  const answer = type === "judge"
    ? rawAnswer.map(normalizeJudgeAnswer).filter(Boolean)
    : rawAnswer.map((item) => trim(item)).filter(Boolean);

  return {
    title: trim(data.title),
    type,
    imageUrl: trim(data.imageUrl),
    options: Array.isArray(data.options) ? data.options.map(normalizeOption).filter((option) => option.label || option.text) : data.options,
    answer,
    analysis: trim(data.analysis),
    category: trim(data.category),
    difficulty: trim(data.difficulty) || "easy",
    isMock: data.isMock === undefined || data.isMock === null || data.isMock === "" ? true : normalizeBoolean(data.isMock, true),
    status: data.status || "active"
  };
};

const validateQuestion = (rawQuestion, index) => {
  const errors = [];
  const prefix = `第${index + 1}题`;

  if (!rawQuestion || typeof rawQuestion !== "object" || Array.isArray(rawQuestion)) {
    return {
      question: null,
      errors: [`${prefix}：不是有效对象`]
    };
  }

  const question = normalizeQuestion(rawQuestion);

  if (!question.title) errors.push(`${prefix}：缺少 title 字段`);
  if (!question.type) errors.push(`${prefix}：缺少 type 字段`);
  if (question.type && !VALID_TYPES.includes(question.type)) errors.push(`${prefix}：type 必须为 single / multiple / judge`);
  if (!Array.isArray(rawQuestion.answer)) errors.push(`${prefix}：answer 必须是数组`);
  if (!question.answer.length) errors.push(`${prefix}：answer 不能为空`);
  if (!question.analysis) errors.push(`${prefix}：缺少 analysis 字段`);
  if (!question.category) errors.push(`${prefix}：缺少 category 字段`);
  if (!Array.isArray(rawQuestion.options)) errors.push(`${prefix}：options 必须是数组`);

  if (!VALID_TYPES.includes(question.type) || !Array.isArray(rawQuestion.answer) || !Array.isArray(rawQuestion.options)) {
    return { question, errors };
  }

  if (question.type === "single" && question.answer.length !== 1) {
    errors.push(`${prefix}：单选题 answer 只能有一个`);
  }

  if (question.type === "multiple" && question.answer.length < 1) {
    errors.push(`${prefix}：多选题 answer 至少有一个`);
  }

  if (question.type === "judge") {
    if (question.answer.length !== 1 || !["true", "false"].includes(question.answer[0])) {
      errors.push(`${prefix}：判断题答案必须能识别为 true / false / 正确 / 错误 / A / B`);
    }
    return { question, errors };
  }

  const optionLabels = question.options.map((option) => option.label).filter(Boolean);
  question.answer.forEach((answer) => {
    if (!optionLabels.includes(answer)) {
      errors.push(`${prefix}：答案 ${answer} 不存在于 options 的 label 中`);
    }
  });

  return { question, errors };
};

exports.main = async (event = {}) => {
  if (!await checkAdmin()) {
    return { errCode: "NO_ADMIN_PERMISSION", errMsg: "无管理员权限" };
  }

  const questions = Array.isArray(event.questions) ? event.questions : [];
  const errors = [];
  const skippedItems = [];
  let successCount = 0;
  let failCount = 0;

  if (!questions.length) {
    return {
      total: 0,
      successCount: 0,
      failCount: 1,
      skippedCount: 0,
      errors: ["questions 必须为非空数组"],
      skippedItems: []
    };
  }

  for (let index = 0; index < questions.length; index += 1) {
    const { question, errors: validateErrors } = validateQuestion(questions[index], index);

    if (validateErrors.length) {
      errors.push(...validateErrors);
      failCount += 1;
      continue;
    }

    try {
      const exists = await db.collection("questions")
        .where({
          title: question.title,
          category: question.category
        })
        .limit(1)
        .get();

      if (exists.data.length) {
        skippedItems.push({
          title: question.title,
          category: question.category
        });
        continue;
      }
    } catch (error) {
      errors.push(`第${index + 1}题：重复题检查失败：${error.errMsg || error.message || "未知错误"}`);
      failCount += 1;
      continue;
    }

    try {
      const now = db.serverDate();
      await db.collection("questions").add({
        data: {
          ...question,
          createdAt: now,
          updatedAt: now
        }
      });
      successCount += 1;
    } catch (error) {
      errors.push(`第${index + 1}题：导入失败：${error.errMsg || error.message || "未知错误"}`);
      failCount += 1;
    }
  }

  return {
    total: questions.length,
    successCount,
    failCount,
    skippedCount: skippedItems.length,
    errors,
    skippedItems
  };
};
