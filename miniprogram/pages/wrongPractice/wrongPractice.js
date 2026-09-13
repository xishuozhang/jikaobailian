const TYPE_TEXT = {
  single: "单选题",
  multiple: "多选题",
  judge: "判断题"
};

const formatAnswer = (answer) => {
  if (Array.isArray(answer)) {
    return answer.length ? answer.join("、") : "未作答";
  }

  return answer || "未作答";
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

const stripQuestionNumber = (title = "") => String(title)
  .replace(/^\s*(?:第\s*)?\d+\s*(?:[\.．、:：]|题[\.．、:：]?)\s*/, "")
  .replace(/\s*[（(][^（）()]*?(?:单选|多选|判断|网页|css|html|图形|图像|摄影|摄像|美术)[^（）()]*?[）)]\s*$/i, "");

const normalizeQuestion = (question = {}) => ({
  ...question,
  displayTitle: stripQuestionNumber(question.title),
  typeText: TYPE_TEXT[question.type] || "练习题",
  options: question.type === "judge" && !(question.options || []).length
    ? [
      { key: "true", text: "正确" },
      { key: "false", text: "错误" }
    ]
    : (question.options || []).map(normalizeOption).filter((option) => option.key)
});

const saveLocalRecords = (questions, resultMap) => {
  const now = new Date().toISOString();
  const answerRecords = wx.getStorageSync("answer_records_cache") || [];
  const wrongRecords = wx.getStorageSync("wrong_records_cache") || [];
  const nextAnswerRecords = questions.map((question) => {
    const result = resultMap[question._id] || {};
    return {
      _id: `local-answer-wrong-${question._id}-${Date.now()}`,
      questionId: question._id,
      questionSnapshot: {
        questionId: question._id,
        title: question.title,
        type: question.type,
        imageUrl: question.imageUrl || "",
        options: question.options || [],
        category: question.category || "",
        difficulty: question.difficulty || ""
      },
      selectedAnswer: result.selectedAnswer,
      correctAnswer: result.correctAnswer,
      analysis: result.analysis || "",
      isCorrect: !!result.isCorrect,
      practiceType: "wrong",
      createdAt: now
    };
  });
  const nextWrongRecords = [...wrongRecords];

  nextAnswerRecords.forEach((record) => {
    if (record.isCorrect) {
      return;
    }

    const index = nextWrongRecords.findIndex((item) => item.questionId === record.questionId);
    const wrongRecord = {
      _id: `local-wrong-${record.questionId}`,
      questionId: record.questionId,
      questionSnapshot: record.questionSnapshot,
      selectedAnswer: record.selectedAnswer,
      correctAnswer: record.correctAnswer,
      analysis: record.analysis,
      wrongCount: 1,
      lastWrongAt: now,
      updatedAt: now,
      createdAt: now
    };

    if (index >= 0) {
      nextWrongRecords[index] = {
        ...nextWrongRecords[index],
        ...wrongRecord,
        wrongCount: (nextWrongRecords[index].wrongCount || 0) + 1,
        createdAt: nextWrongRecords[index].createdAt || now
      };
    } else {
      nextWrongRecords.unshift(wrongRecord);
    }
  });

  wx.setStorageSync("answer_records_cache", nextAnswerRecords.concat(answerRecords).slice(0, 100));
  wx.setStorageSync("wrong_records_cache", nextWrongRecords.slice(0, 100));
};

Page({
  data: {
    loading: true,
    submitting: false,
    questions: [],
    currentIndex: 0,
    currentQuestion: null,
    answers: {},
    currentSelected: [],
    prevDisabled: true,
    atLast: false,
    progressText: "0/0",
    progressPercent: 0,
    result: null,
    wrongResults: []
  },

  onLoad() {
    this.loadQuestions();
  },

  async loadQuestions() {
    this.setData({ loading: true, result: null });

    try {
      const { result } = await wx.cloud.callFunction({
        name: "getWrongPracticeQuestions",
        data: { limit: 10 }
      });

      if (result && result.errCode) {
        throw new Error(result.errMsg || result.errCode);
      }

      const questions = (result.questions || []).map(normalizeQuestion);

      this.setData({
        questions,
        currentIndex: 0,
        answers: {},
        loading: false
      });
      this.refreshCurrentQuestion();
    } catch (error) {
      this.setData({ loading: false });
      wx.showToast({ title: "错题加载失败", icon: "none" });
      console.error("getWrongPracticeQuestions failed", error);
    }
  },

  refreshCurrentQuestion() {
    const { questions, currentIndex, answers } = this.data;
    const rawQuestion = questions[currentIndex] || null;
    const savedAnswer = rawQuestion ? answers[rawQuestion._id] : null;
    const currentSelected = Array.isArray(savedAnswer)
      ? savedAnswer
      : savedAnswer
        ? [savedAnswer]
        : [];
    const currentQuestion = rawQuestion
      ? {
        ...rawQuestion,
        options: rawQuestion.options.map((option) => ({
          ...option,
          selected: currentSelected.includes(option.key)
        }))
      }
      : null;

    this.setData({
      currentQuestion,
      currentSelected,
      prevDisabled: currentIndex <= 0,
      atLast: currentIndex >= questions.length - 1,
      progressText: questions.length ? `${currentIndex + 1}/${questions.length}` : "0/0",
      progressPercent: questions.length ? Math.round(((currentIndex + 1) / questions.length) * 100) : 0
    });
  },

  selectOption(e) {
    const { key } = e.currentTarget.dataset;
    const { currentQuestion, answers, currentSelected } = this.data;

    if (!currentQuestion || !key) {
      return;
    }

    let selectedAnswer = key;

    if (currentQuestion.type === "multiple") {
      selectedAnswer = currentSelected.includes(key)
        ? currentSelected.filter((item) => item !== key)
        : currentSelected.concat(key);
    }

    this.setData({
      answers: {
        ...answers,
        [currentQuestion._id]: selectedAnswer
      }
    });
    this.refreshCurrentQuestion();
  },

  goPrev() {
    if (this.data.currentIndex <= 0) {
      return;
    }

    this.setData({ currentIndex: this.data.currentIndex - 1 });
    this.refreshCurrentQuestion();
  },

  goNext() {
    if (this.data.currentIndex >= this.data.questions.length - 1) {
      return;
    }

    this.setData({ currentIndex: this.data.currentIndex + 1 });
    this.refreshCurrentQuestion();
  },

  async submitPractice() {
    const { questions, answers, submitting } = this.data;

    if (submitting) {
      return;
    }

    const submitAnswers = questions.map((question) => ({
      questionId: question._id,
      selectedAnswer: answers[question._id] || (question.type === "multiple" ? [] : "")
    }));

    if (submitAnswers.some((item) => !item.selectedAnswer || !item.selectedAnswer.length)) {
      wx.showToast({ title: "请完成所有题目后提交", icon: "none" });
      return;
    }

    this.setData({ submitting: true });

    try {
      const { result } = await wx.cloud.callFunction({
        name: "submitPractice",
        data: {
          practiceType: "wrong",
          answers: submitAnswers
        }
      });

      if (result && result.errCode) {
        throw new Error(result.errMsg || result.errCode);
      }

      const resultMap = (result.results || []).reduce((map, item) => {
        map[item.questionId] = item;
        return map;
      }, {});
      saveLocalRecords(questions, resultMap);
      const wrongResults = questions
        .map((question, index) => ({
          ...question,
          index: index + 1,
          selectedText: formatAnswer(resultMap[question._id] && resultMap[question._id].selectedAnswer),
          correctText: formatAnswer(resultMap[question._id] && resultMap[question._id].correctAnswer),
          analysis: (resultMap[question._id] && resultMap[question._id].analysis) || "暂无解析",
          isCorrect: resultMap[question._id] && resultMap[question._id].isCorrect
        }))
        .filter((item) => !item.isCorrect);
      const total = result.total || questions.length;
      const correctCount = result.correctCount || 0;

      this.setData({
        submitting: false,
        result: {
          total,
          correctCount,
          wrongCount: total - correctCount,
          score: total ? Math.round((correctCount / total) * 100) : 0
        },
        wrongResults
      });
    } catch (error) {
      this.setData({ submitting: false });
      wx.showToast({ title: "提交失败，请重试", icon: "none" });
      console.error("submit wrong practice failed", error);
    }
  },

  restart() {
    this.loadQuestions();
  },

  goMistakes() {
    wx.navigateBack();
  }
});
