const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

const isCollectionMissing = (error) => {
  const message = `${error.errMsg || error.message || ""}`;
  return message.includes("collection not exists")
    || message.includes("collection doesn't exists")
    || message.includes("collection not exist")
    || message.includes("集合不存在");
};

const isSnapshotComplete = (snapshot = {}) => (
  snapshot.questionId
  && snapshot.title
  && snapshot.type
  && Array.isArray(snapshot.options)
);

const normalizeOption = (option = {}) => {
  const key = `${option.key || option.label || ""}`.trim();
  const rawText = `${option.text || ""}`.trim();
  return {
    key,
    text: rawText === "correct" ? "\u6b63\u786e" : rawText === "wrong" ? "\u9519\u8bef" : rawText
  };
};

const normalizeQuestion = (question = {}, questionId = "") => ({
  _id: question._id || question.questionId || questionId,
  title: question.title || "",
  type: question.type || "single",
  imageUrl: question.imageUrl || "",
  options: Array.isArray(question.options) ? question.options.map(normalizeOption).filter((option) => option.key) : [],
  category: question.category || "",
  difficulty: question.difficulty || ""
});

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext();
  const limit = Math.min(Number(event.limit) || 10, 50);

  let wrongRecords = [];

  try {
    const result = await db.collection("wrong_records")
      .where({
        _openid: OPENID,
        mastered: _.neq(true)
      })
      .orderBy("lastWrongAt", "desc")
      .limit(limit)
      .get();
    wrongRecords = result.data || [];
  } catch (error) {
    if (isCollectionMissing(error)) {
      return { questions: [] };
    }

    throw error;
  }

  const fallbackIds = wrongRecords
    .filter((record) => !isSnapshotComplete(record.questionSnapshot) && record.questionId)
    .map((record) => record.questionId);
  let questionMap = {};

  if (fallbackIds.length) {
    const questionResult = await db.collection("questions").where({
      _id: _.in(fallbackIds)
    }).get();
    questionMap = questionResult.data.reduce((map, question) => {
      map[question._id] = question;
      return map;
    }, {});
  }

  const questions = wrongRecords
    .map((record) => {
      const snapshot = record.questionSnapshot || {};
      const source = isSnapshotComplete(snapshot) ? snapshot : questionMap[record.questionId];
      return source ? normalizeQuestion(source, record.questionId) : null;
    })
    .filter((question) => question && question._id && question.title);

  return {
    questions
  };
};
