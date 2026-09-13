const TYPE_TEXT = {
  single: "单选题",
  multiple: "多选题",
  judge: "判断题"
};

const examDuration = 30 * 60;

const formatAnswer = (answer) => {
  if (Array.isArray(answer)) {
    return answer.length ? answer.join("、") : "未作答";
  }

  return answer || "未作答";
};

const formatDuration = (seconds) => {
  const value = Math.max(Number(seconds) || 0, 0);
  const minutes = Math.floor(value / 60);
  const restSeconds = value % 60;
  return `${minutes}分${restSeconds}秒`;
};

const formatCountdown = (seconds) => {
  const value = Math.max(Number(seconds) || 0, 0);
  const minutes = `${Math.floor(value / 60)}`.padStart(2, "0");
  const restSeconds = `${value % 60}`.padStart(2, "0");
  return `${minutes}:${restSeconds}`;
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

const saveLocalRecords = (questions, resultMap, practiceType, duration) => {
  const now = new Date().toISOString();
  const answerRecords = wx.getStorageSync("answer_records_cache") || [];
  const wrongRecords = wx.getStorageSync("wrong_records_cache") || [];
  const nextAnswerRecords = questions.map((question) => {
    const result = resultMap[question._id] || {};
    return {
      _id: `local-answer-${question._id}-${Date.now()}`,
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
      practiceType,
      duration: Number(duration) || 0,
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
    checking: true,
    loading: false,
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
    loadingText: "正在检查会员状态...",
    memberBlocked: false,
    result: null,
    wrongResults: [],
    examDuration,
    remainingSeconds: examDuration,
    timeText: formatCountdown(examDuration),
    timeWarning: false,
    answeredCount: 0,
    unansweredCount: 0,
    answerSheetVisible: false,
    answerSheetItems: [],
    isSubmitting: false
  },

  onLoad() {
    this.checkMemberAndLoad();
  },

  onUnload() {
    this.clearTimer();
  },

  async checkMemberAndLoad() {
    this.setData({ checking: true, loadingText: "正在检查会员状态..." });

    try {
      const { result } = await wx.cloud.callFunction({ name: "checkMember" });

      if (!result.isMember) {
        this.setData({
          checking: false,
          memberBlocked: true
        });
        return;
      }

      this.setData({ checking: false, memberBlocked: false });
      this.loadQuestions();
    } catch (error) {
      this.setData({ checking: false });
      wx.showToast({ title: "会员校验失败", icon: "none" });
      console.error("checkMember failed", error);
    }
  },

  async loadQuestions() {
    this.setData({ loading: true, result: null, memberBlocked: false, loadingText: "正在加载模拟练习..." });

    try {
      const { result } = await wx.cloud.callFunction({
        name: "getMockQuestions",
        data: { limit: 20 }
      });

      if (result.errCode) {
        wx.showToast({ title: result.errMsg || "无法加载模拟题", icon: "none" });
        this.setData({ loading: false });
        return;
      }

      const questions = (result.questions || []).map(normalizeQuestion);

      this.setData({
        questions,
        currentIndex: 0,
        answers: {},
        remainingSeconds: examDuration,
        timeText: formatCountdown(examDuration),
        timeWarning: false,
        answeredCount: 0,
        unansweredCount: questions.length,
        answerSheetVisible: false,
        answerSheetItems: [],
        isSubmitting: false,
        loading: false
      });
      this.refreshCurrentQuestion();
      this.startTimer();
    } catch (error) {
      this.setData({ loading: false });
      wx.showToast({ title: "模拟题加载失败", icon: "none" });
      console.error("getMockQuestions failed", error);
    }
  },

  startTimer() {
    this.clearTimer();

    if (!this.data.questions.length) {
      return;
    }

    this.timer = setInterval(() => {
      const nextSeconds = Math.max(this.data.remainingSeconds - 1, 0);

      this.setData({
        remainingSeconds: nextSeconds,
        timeText: formatCountdown(nextSeconds),
        timeWarning: nextSeconds <= 5 * 60
      });

      if (nextSeconds <= 0) {
        this.clearTimer();
        this.autoSubmit();
      }
    }, 1000);
  },

  clearTimer() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
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

    const answeredCount = questions.filter((question) => {
      const answer = answers[question._id];
      return Array.isArray(answer) ? answer.length > 0 : !!answer;
    }).length;
    const answerSheetItems = questions.map((question, index) => {
      const answer = answers[question._id];
      const answered = Array.isArray(answer) ? answer.length > 0 : !!answer;

      return {
        id: question._id,
        number: index + 1,
        answered,
        current: index === currentIndex,
        statusClass: `${answered ? "answered" : "unanswered"} ${index === currentIndex ? "current" : ""}`
      };
    });

    this.setData({
      currentQuestion,
      currentSelected,
      prevDisabled: currentIndex <= 0,
      atLast: currentIndex >= questions.length - 1,
      progressText: questions.length ? `${currentIndex + 1}/${questions.length}` : "0/0",
      progressPercent: questions.length ? Math.round(((currentIndex + 1) / questions.length) * 100) : 0,
      answeredCount,
      unansweredCount: Math.max(questions.length - answeredCount, 0),
      answerSheetItems
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

  openAnswerSheet() {
    if (!this.data.currentQuestion || this.data.isSubmitting) {
      return;
    }

    this.setData({ answerSheetVisible: true });
  },

  closeAnswerSheet() {
    this.setData({ answerSheetVisible: false });
  },

  noop() {},

  jumpToQuestion(e) {
    const index = Number(e.currentTarget.dataset.index);

    if (Number.isNaN(index) || index < 0 || index >= this.data.questions.length || this.data.isSubmitting) {
      return;
    }

    this.setData({
      currentIndex: index,
      answerSheetVisible: false
    });
    this.refreshCurrentQuestion();
  },

  confirmSubmit() {
    if (this.data.isSubmitting) {
      return;
    }

    const { unansweredCount } = this.data;
    const content = unansweredCount > 0
      ? `还有 ${unansweredCount} 道题未作答，确定交卷吗？`
      : "确认提交本次模拟考试吗？";

    wx.showModal({
      title: "确认交卷",
      content,
      success: (res) => {
        if (res.confirm) {
          this.submitPractice(false);
        }
      }
    });
  },

  autoSubmit() {
    if (this.data.isSubmitting || this.data.result) {
      return;
    }

    wx.showModal({
      title: "考试结束",
      content: "考试时间已到，系统已自动交卷。",
      showCancel: false
    });
    this.submitPractice(true);
  },

  async submitPractice(isAutoSubmit = false) {
    const { questions, answers, isSubmitting, remainingSeconds } = this.data;

    if (isSubmitting) {
      return;
    }

    const submitAnswers = questions.map((question) => ({
      questionId: question._id,
      selectedAnswer: answers[question._id] || (question.type === "multiple" ? [] : "")
    }));
    const duration = Math.min(examDuration, Math.max(examDuration - remainingSeconds, 0));

    this.clearTimer();
    this.setData({ submitting: true, isSubmitting: true, answerSheetVisible: false });

    try {
      const { result } = await wx.cloud.callFunction({
        name: "submitPractice",
        data: {
          practiceType: "mock",
          duration,
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
      saveLocalRecords(questions, resultMap, "mock", duration);
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
        isSubmitting: false,
        result: {
          total,
          correctCount,
          wrongCount: total - correctCount,
          score: total ? Math.round((correctCount / total) * 100) : 0,
          duration,
          durationText: formatDuration(duration),
          submitText: isAutoSubmit ? "已自动交卷" : "手动交卷"
        },
        wrongResults
      });
    } catch (error) {
      this.setData({ submitting: false, isSubmitting: false });
      if (!this.data.result) {
        this.startTimer();
      }
      wx.showToast({ title: "提交失败，请重试", icon: "none" });
      console.error("submitPractice mock failed", {
        errCode: error.errCode,
        errMsg: error.errMsg,
        message: error.message,
        error
      });
    }
  },

  restart() {
    this.clearTimer();
    this.loadQuestions();
  },

  goHome() {
    wx.navigateBack();
  },

  goMistakes() {
    wx.navigateTo({ url: "/pages/mistakes/index" });
  },

  goMember() {
    wx.navigateTo({ url: "/pages/member/index" });
  }
});
