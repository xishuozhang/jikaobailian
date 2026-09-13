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

const getRecordCategory = (record = {}) => {
  if (record.category) {
    return record.category;
  }

  if (Array.isArray(record.questionsSnapshot) && record.questionsSnapshot.length) {
    return "";
  }

  return record.questionSnapshot && record.questionSnapshot.category || "";
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
  const categoryMap = {};
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

    const category = getRecordCategory(record);
    if (category) {
      if (!categoryMap[category]) {
        categoryMap[category] = {
          category,
          totalQuestionCount: 0,
          correctCount: 0,
          accuracyRate: 0
        };
      }
      categoryMap[category].totalQuestionCount += total;
      categoryMap[category].correctCount += correct;
    }
  });

  const categoryStats = Object.keys(categoryMap)
    .map((key) => ({
      ...categoryMap[key],
      accuracyRate: percent(categoryMap[key].correctCount, categoryMap[key].totalQuestionCount)
    }))
    .sort((a, b) => b.totalQuestionCount - a.totalQuestionCount)
    .slice(0, 8);

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
