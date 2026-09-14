const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

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

const isCollectionMissing = (error) => {
  const message = `${error.errMsg || error.message || ""}`;
  return message.includes("collection not exists")
    || message.includes("collection doesn't exists")
    || message.includes("collection not exist")
    || message.includes("集合不存在");
};

const normalizeDate = (value) => {
  if (!value) {
    return null;
  }

  const raw = value.$date || value;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
};

const percent = (correct, total) => (total ? Math.round((correct / total) * 100) : 0);

const getRecordTotal = (record = {}) => {
  if (typeof record.total === "number") {
    return record.total;
  }

  if (Array.isArray(record.answers)) {
    return record.answers.length;
  }

  return record.questionId ? 1 : 0;
};

const getRecordCorrect = (record = {}) => {
  if (typeof record.correctCount === "number") {
    return record.correctCount;
  }

  if (Array.isArray(record.answers)) {
    return record.answers.filter((answer) => answer.isCorrect === true).length;
  }

  return record.isCorrect === true ? 1 : 0;
};

const getRecordScore = (record = {}) => {
  if (typeof record.score === "number") {
    return record.score;
  }

  return percent(getRecordCorrect(record), getRecordTotal(record));
};

const addCategoryRecord = (categoryMap, record) => {
  const add = (category, total, correct) => {
    const stats = categoryMap[normalizeMainCategory(category)];
    stats.totalQuestionCount += total;
    stats.correctCount += correct;
  };
  const questions = Array.isArray(record.questionsSnapshot) ? record.questionsSnapshot : [];
  if (Array.isArray(record.answers) && record.answers.length) {
    const questionMap = new Map(questions.map((question) => [question.questionId || question._id, question]));
    record.answers.forEach((answer, index) => {
      // Match IDs first: missing or deleted questions can leave snapshots out of sequence.
      const question = answer.questionId ? questionMap.get(answer.questionId) : questions[index];
      if (question || record.category) {
        add(question ? question.category : record.category, 1, answer.isCorrect === true ? 1 : 0);
      }
    });
    return;
  }
  if (record.questionSnapshot || record.category) {
    add(record.questionSnapshot ? record.questionSnapshot.category : record.category,
      getRecordTotal(record), getRecordCorrect(record));
  }
};

exports.main = async () => {
  const { OPENID } = cloud.getWXContext();
  let answerRecords = [];
  let wrongRecords = [];

  try {
    const answerResult = await db.collection("answer_records")
      .where({ _openid: OPENID })
      .orderBy("createdAt", "desc")
      .limit(1000)
      .get();
    answerRecords = answerResult.data || [];
  } catch (error) {
    if (!isCollectionMissing(error)) {
      throw error;
    }
  }

  try {
    const wrongResult = await db.collection("wrong_records")
      .where({ _openid: OPENID })
      .limit(1000)
      .get();
    wrongRecords = wrongResult.data || [];
  } catch (error) {
    if (!isCollectionMissing(error)) {
      throw error;
    }
  }

  const totalPracticeCount = answerRecords.length;
  let totalQuestionCount = 0;
  let totalCorrectCount = 0;
  let recent7DaysCount = 0;
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const categoryMap = Object.fromEntries(CATEGORY_ORDER.map((category) => [category, {
    category,
    totalQuestionCount: 0,
    correctCount: 0
  }]));
  const mockRecords = [];

  answerRecords.forEach((record) => {
    const total = getRecordTotal(record);
    const correct = getRecordCorrect(record);
    const createdAt = normalizeDate(record.createdAt);

    totalQuestionCount += total;
    totalCorrectCount += correct;

    if (createdAt && createdAt.getTime() >= sevenDaysAgo) {
      recent7DaysCount += 1;
    }

    if (record.practiceType === "mock") {
      mockRecords.push(record);
    }

    addCategoryRecord(categoryMap, record);
  });

  const categoryStats = CATEGORY_ORDER
    .map((key) => ({
      ...categoryMap[key],
      accuracyRate: percent(categoryMap[key].correctCount, categoryMap[key].totalQuestionCount)
    }));

  const wrongQuestionCount = wrongRecords.length;
  const masteredWrongCount = wrongRecords.filter((record) => record.mastered === true).length;
  const unmasteredWrongCount = wrongRecords.filter((record) => record.mastered !== true).length;
  const latestPractice = answerRecords[0] || null;
  const latestMock = mockRecords[0] || null;
  const mockScores = mockRecords.map(getRecordScore);

  return {
    stats: {
      totalPracticeCount,
      totalQuestionCount,
      totalCorrectCount,
      accuracyRate: percent(totalCorrectCount, totalQuestionCount),
      wrongQuestionCount,
      masteredWrongCount,
      unmasteredWrongCount,
      mockPracticeCount: mockRecords.length,
      bestMockScore: mockScores.length ? Math.max(...mockScores) : 0,
      latestMockScore: latestMock ? getRecordScore(latestMock) : 0,
      latestPractice,
      recent7DaysCount,
      categoryStats
    }
  };
};
