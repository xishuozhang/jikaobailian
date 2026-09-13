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
const CATEGORY_CHUNK_SIZE = 20;

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

const shuffle = (items) => {
  const list = [...items];
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
};

const chunkArray = (items, size) => {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const getRawCategories = async (mainCategory) => {
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

  return (result.list || [])
    .map((item) => `${item._id || ""}`.trim())
    .filter((name) => normalizeMainCategory(name) === mainCategory);
};

const getSampleQuestions = async (rawCategories, limit) => {
  const questions = [];
  const chunks = chunkArray(rawCategories, CATEGORY_CHUNK_SIZE);

  for (const chunk of chunks) {
    const result = await db.collection("questions")
      .aggregate()
      .match({
        category: _.in(chunk),
        status: _.neq("disabled")
      })
      .sample({
        size: limit
      })
      .end();

    questions.push(...(result.list || []));
  }

  return shuffle(questions).slice(0, limit);
};

exports.main = async (event = {}) => {
  const category = `${event.category || ""}`.trim();
  const mainCategory = CATEGORY_ORDER.includes(category) ? category : normalizeMainCategory(category);
  const limit = Math.min(Number(event.limit) || 10, 20);

  if (!category) {
    return {
      errCode: "EMPTY_CATEGORY",
      errMsg: "category cannot be empty",
      questions: []
    };
  }

  const rawCategories = await getRawCategories(mainCategory);

  if (!rawCategories.length) {
    return {
      category: mainCategory,
      questions: []
    };
  }

  const questions = await getSampleQuestions(rawCategories, limit);

  return {
    category: mainCategory,
    questions: questions.map(sanitizeQuestion)
  };
};
