const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

const normalizeAnswer = (answer) => {
  if (Array.isArray(answer)) {
    return answer.map(String).sort().join(",");
  }
  return String(answer || "").trim();
};

const snapshotQuestion = (question) => ({
  questionId: question._id,
  title: question.title,
  type: question.type,
  imageUrl: question.imageUrl || "",
  options: question.options || [],
  category: question.category || "",
  difficulty: question.difficulty || ""
});

const ensureCollection = async (name) => {
  if (typeof db.createCollection !== "function") {
    return;
  }

  try {
    await db.createCollection(name);
  } catch (error) {
    const message = `${error.errMsg || error.message || ""}`;

    if (
      !message.includes("already exists")
      && !message.includes("collection exists")
      && !message.includes("已存在")
    ) {
      throw error;
    }
  }
};

const isCollectionMissing = (error) => {
  const message = `${error.errMsg || error.message || ""}`;
  return message.includes("collection not exists")
    || message.includes("collection doesn't exists")
    || message.includes("collection not exist")
    || message.includes("集合不存在");
};

const withCollectionRetry = async (collectionName, action) => {
  try {
    return await action();
  } catch (error) {
    if (!isCollectionMissing(error)) {
      throw error;
    }

    await ensureCollection(collectionName);
    return action();
  }
};

const saveAnswerRecord = async (record) => {
  await withCollectionRetry("answer_records", () => (
    db.collection("answer_records").add({ data: record })
  ));
};

const buildPracticeRecord = ({
  openid,
  practiceType,
  category,
  questions,
  results,
  duration,
  now
}) => {
  const total = results.length;
  const correctList = results.filter((item) => item.isCorrect);
  const wrongList = results.filter((item) => !item.isCorrect);

  return {
    _openid: openid,
    practiceType,
    category: category || "",
    questionsSnapshot: questions.map((question) => snapshotQuestion(question)),
    answers: results.map((item) => ({
      questionId: item.questionId,
      userAnswer: item.selectedAnswer,
      selectedAnswer: item.selectedAnswer,
      correctAnswer: item.correctAnswer,
      isCorrect: item.isCorrect,
      analysis: item.analysis || ""
    })),
    wrongList,
    correctList,
    score: total ? Math.round((correctList.length / total) * 100) : 0,
    total,
    correctCount: correctList.length,
    wrongCount: wrongList.length,
    duration: Number(duration) || 0,
    createdAt: now
  };
};

const saveWrongRecord = async ({
  openid,
  question,
  questionSnapshot,
  selectedAnswer,
  now
}) => {
  const wrongRecordData = {
    questionSnapshot,
    userAnswer: selectedAnswer,
    selectedAnswer,
    correctAnswer: question.answer,
    analysis: question.analysis || "",
    mastered: false,
    lastWrongAt: now,
    updatedAt: now
  };

  const wrongQuery = await withCollectionRetry("wrong_records", () => (
    db.collection("wrong_records").where({
      _openid: openid,
      questionId: question._id
    }).limit(1).get()
  ));

  if (wrongQuery.data.length) {
    await withCollectionRetry("wrong_records", () => (
      db.collection("wrong_records").doc(wrongQuery.data[0]._id).update({
        data: {
          ...wrongRecordData,
          wrongCount: _.inc(1),
        }
      })
    ));
    return;
  }

  await withCollectionRetry("wrong_records", () => (
    db.collection("wrong_records").add({
      data: {
        _openid: openid,
        questionId: question._id,
        ...wrongRecordData,
        wrongCount: 1,
        createdAt: now,
      }
    })
  ));
};

const getWrongFallbackQuestion = async (openid, questionId) => {
  const result = await withCollectionRetry("wrong_records", () => (
    db.collection("wrong_records").where({
      _openid: openid,
      questionId
    }).limit(1).get()
  ));
  const record = result.data[0];

  if (!record) {
    return null;
  }

  const snapshot = record.questionSnapshot || {};
  return {
    _id: questionId,
    title: snapshot.title || "",
    type: snapshot.type || "single",
    imageUrl: snapshot.imageUrl || "",
    options: snapshot.options || [],
    category: snapshot.category || "",
    difficulty: snapshot.difficulty || "",
    answer: record.correctAnswer,
    analysis: record.analysis || ""
  };
};

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext();
  const answers = Array.isArray(event.answers) ? event.answers : [];
  const practiceType = event.practiceType || "random";
  const category = `${event.category || ""}`.trim();
  const duration = event.duration;

  if (!answers.length) {
    return {
      errCode: "EMPTY_ANSWERS",
      errMsg: "answers 不能为空",
      results: []
    };
  }

  const questionIds = answers.map((item) => item.questionId).filter(Boolean);
  const questionResult = await db.collection("questions").where({
    _id: _.in(questionIds)
  }).get();
  const questionMap = questionResult.data.reduce((map, question) => {
    map[question._id] = question;
    return map;
  }, {});

  const now = db.serverDate();
  const results = [];
  const submittedQuestions = [];
  const warnings = [];

  for (const item of answers) {
    let question = questionMap[item.questionId];

    if (!question && practiceType === "wrong") {
      question = await getWrongFallbackQuestion(OPENID, item.questionId);
    }

    if (!question) {
      results.push({
        questionId: item.questionId,
        isCorrect: false,
        errMsg: "题目不存在"
      });
      continue;
    }

    const selectedAnswer = item.selectedAnswer;
    const isCorrect = normalizeAnswer(selectedAnswer) === normalizeAnswer(question.answer);
    const questionSnapshot = snapshotQuestion(question);
    submittedQuestions.push(question);

    if (!isCorrect) {
      try {
        await saveWrongRecord({
          openid: OPENID,
          question,
          questionSnapshot,
          selectedAnswer,
          now
        });
      } catch (error) {
        warnings.push({
          type: "SAVE_WRONG_RECORD_FAILED",
          questionId: question._id,
          errCode: error.errCode,
          errMsg: error.errMsg || error.message
        });
        console.warn("save wrong record failed", error);
      }
    }

    results.push({
      questionId: question._id,
      selectedAnswer,
      correctAnswer: question.answer,
      analysis: question.analysis || "",
      isCorrect
    });
  }

  try {
    await saveAnswerRecord(buildPracticeRecord({
      openid: OPENID,
      practiceType,
      category: practiceType === "category" ? category || (submittedQuestions[0] && submittedQuestions[0].category) || "" : "",
      questions: submittedQuestions,
      results,
      duration,
      now
    }));
  } catch (error) {
    warnings.push({
      type: "SAVE_ANSWER_RECORD_FAILED",
      errCode: error.errCode,
      errMsg: error.errMsg || error.message
    });
    console.warn("save answer record failed", error);
  }

  return {
    total: results.length,
    correctCount: results.filter((item) => item.isCorrect).length,
    wrongCount: results.filter((item) => !item.isCorrect).length,
    score: results.length ? Math.round((results.filter((item) => item.isCorrect).length / results.length) * 100) : 0,
    results,
    warnings
  };
};
