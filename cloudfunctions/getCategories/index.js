const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;
const $ = db.command.aggregate;

const CATEGORY_ORDER = [
  "网页设计",
  "数字摄影摄像",
  "图形图像处理知识",
  "实用美术基础"
];

const includesAny = (text, keywords) => keywords.some((keyword) => text.includes(keyword.toLowerCase()));

const normalizeMainCategory = (category) => {
  const text = `${category || ""}`.trim().toLowerCase();

  if (includesAny(text, [
    "网页", "网站", "web", "html", "css", "javascript", "js", "盒子模型", "超链接", "表单", "浏览器", "响应式"
  ])) {
    return "网页设计";
  }

  if (includesAny(text, [
    "摄影", "摄像", "拍摄", "相机", "照相", "镜头", "光圈", "快门", "曝光", "感光度", "白平衡", "焦距", "景别", "机位"
  ])) {
    return "数字摄影摄像";
  }

  if (includesAny(text, [
    "图形图像", "图形", "图像", "photoshop", "ps", "illustrator", "ai", "位图", "矢量", "像素", "图层", "蒙版", "通道", "路径", "rgb", "cmyk"
  ])) {
    return "图形图像处理知识";
  }

  return "实用美术基础";
};

const hasAnswer = (answer) => Array.isArray(answer)
  ? answer.some((value) => value !== null && value !== undefined && String(value).trim() !== "")
  : answer !== null && answer !== undefined && String(answer).trim() !== "";

const getPracticedCounts = async (openid) => {
  const questionIds = new Set();
  const pageSize = 100;

  // Read every submitted record, including the legacy single-question format.
  for (let offset = 0; ; offset += pageSize) {
    let result;
    try {
      result = await db.collection("answer_records")
        .where({ _openid: openid })
        .field({ answers: true, questionId: true, questionSnapshot: true, selectedAnswer: true, userAnswer: true })
        .orderBy("_id", "asc")
        .skip(offset)
        .limit(pageSize)
        .get();
    } catch (error) {
      const message = `${error.errMsg || error.message || ""}`;
      if (message.includes("collection not exist")
        || message.includes("collection doesn't exists")
        || message.includes("集合不存在")) {
        break;
      }
      throw error;
    }

    for (const record of result.data) {
      const answers = Array.isArray(record.answers) && record.answers.length
        ? record.answers
        : [{
          questionId: record.questionId || (record.questionSnapshot && record.questionSnapshot.questionId),
          selectedAnswer: record.selectedAnswer,
          userAnswer: record.userAnswer
        }];
      for (const answer of answers) {
        if (answer.questionId && (hasAnswer(answer.userAnswer) || hasAnswer(answer.selectedAnswer))) {
          questionIds.add(answer.questionId);
        }
      }
    }
    if (result.data.length < pageSize) {
      break;
    }
  }

  const counts = {};
  const ids = [...questionIds];
  // Use the current question bank so deleted, disabled or recategorized items stay consistent with totals.
  for (let offset = 0; offset < ids.length; offset += 20) {
    const result = await db.collection("questions")
      .where({ _id: _.in(ids.slice(offset, offset + 20)), status: _.neq("disabled") })
      .field({ category: true })
      .limit(20)
      .get();
    for (const question of result.data) {
      const name = normalizeMainCategory(question.category);
      counts[name] = (counts[name] || 0) + 1;
    }
  }
  return counts;
};

exports.main = async () => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) {
    return { errCode: "UNAUTHORIZED", errMsg: "Missing user identity", categories: [] };
  }
  const result = await db.collection("questions")
    .aggregate()
    .match({
      status: _.neq("disabled")
    })
    .group({
      _id: "$category",
      count: $.sum(1)
    })
    .limit(1000)
    .end();

  const categoryMap = CATEGORY_ORDER.reduce((map, name) => {
    map[name] = 0;
    return map;
  }, {});

  (result.list || []).forEach((item) => {
    const name = normalizeMainCategory(item._id);
    categoryMap[name] = (categoryMap[name] || 0) + Number(item.count || 0);
  });

  const practicedCounts = await getPracticedCounts(OPENID);

  return {
    categories: CATEGORY_ORDER.map((name) => ({
      name,
      count: categoryMap[name] || 0,
      practicedCount: Math.min(practicedCounts[name] || 0, categoryMap[name] || 0)
    })).filter((item) => item.count > 0)
  };
};
