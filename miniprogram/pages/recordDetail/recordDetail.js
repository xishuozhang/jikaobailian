const PRACTICE_TEXT = {
  random: "随机一练",
  mock: "模拟练习",
  category: "分类练习",
  wrong: "错题强化"
};

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

const formatTime = (value) => {
  if (!value) {
    return "";
  }

  const dateValue = value.$date || value;
  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hour = `${date.getHours()}`.padStart(2, "0");
  const minute = `${date.getMinutes()}`.padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}`;
};

const formatDuration = (seconds) => {
  const value = Math.max(Number(seconds) || 0, 0);
  const minutes = Math.floor(value / 60);
  const restSeconds = value % 60;
  return `${minutes}分${restSeconds}秒`;
};

const normalizeDetail = (record = {}) => {
  const questions = Array.isArray(record.questionsSnapshot) && record.questionsSnapshot.length
    ? record.questionsSnapshot
    : record.questionSnapshot
      ? [record.questionSnapshot]
      : [];
  const answers = Array.isArray(record.answers) && record.answers.length
    ? record.answers
    : [{
      questionId: record.questionId,
      userAnswer: record.selectedAnswer,
      selectedAnswer: record.selectedAnswer,
      correctAnswer: record.correctAnswer,
      isCorrect: record.isCorrect,
      analysis: record.analysis || ""
    }];
  const answerMap = answers.reduce((map, answer) => {
    map[answer.questionId] = answer;
    return map;
  }, {});
  const questionList = questions.map((question, index) => {
    const answer = answerMap[question.questionId] || answers[index] || {};
    const isCorrect = answer.isCorrect === true;

    return {
      ...question,
      index: index + 1,
      typeText: TYPE_TEXT[question.type] || "练习题",
      userAnswerText: formatAnswer(answer.userAnswer || answer.selectedAnswer),
      correctAnswerText: formatAnswer(answer.correctAnswer),
      analysis: answer.analysis || "暂无解析",
      resultText: isCorrect ? "正确" : "错误",
      resultClass: isCorrect ? "right" : "wrong"
    };
  });
  const total = record.total || questionList.length;
  const correctCount = typeof record.correctCount === "number"
    ? record.correctCount
    : questionList.filter((item) => item.resultClass === "right").length;
  const wrongCount = typeof record.wrongCount === "number" ? record.wrongCount : total - correctCount;
  const score = typeof record.score === "number" ? record.score : total ? Math.round((correctCount / total) * 100) : 0;

  return {
    score,
    practiceText: PRACTICE_TEXT[record.practiceType] || "练习记录",
    total,
    correctCount,
    wrongCount,
    dateText: formatTime(record.createdAt),
    durationText: record.duration ? formatDuration(record.duration) : "",
    questionList
  };
};

const findLocalRecord = (recordId) => {
  const records = wx.getStorageSync("answer_records_cache") || [];
  return records.find((record) => record._id === recordId) || null;
};

Page({
  data: {
    loading: true,
    detail: null,
    questionList: []
  },

  onLoad(options = {}) {
    this.recordId = options.id || "";
    this.loadDetail();
  },

  async loadDetail() {
    if (!this.recordId) {
      this.setData({ loading: false });
      wx.showToast({ title: "缺少记录参数", icon: "none" });
      return;
    }

    this.setData({ loading: true });

    try {
      const { result } = await wx.cloud.callFunction({
        name: "getAnswerRecordDetail",
        data: {
          recordId: this.recordId
        }
      });

      if (result && result.errCode) {
        throw new Error(result.errMsg || result.errCode);
      }

      if (!result.record) {
        const localRecord = findLocalRecord(this.recordId);

        if (!localRecord) {
          this.setData({ loading: false, detail: null, questionList: [] });
          return;
        }

        const detail = normalizeDetail(localRecord);

        this.setData({
          loading: false,
          detail,
          questionList: detail.questionList
        });
        return;
      }

      const detail = normalizeDetail(result.record);

      this.setData({
        loading: false,
        detail,
        questionList: detail.questionList
      });
    } catch (error) {
      const localRecord = findLocalRecord(this.recordId);

      if (localRecord) {
        const detail = normalizeDetail(localRecord);

        this.setData({
          loading: false,
          detail,
          questionList: detail.questionList
        });
        return;
      }

      this.setData({ loading: false });
      wx.showToast({ title: "记录加载失败", icon: "none" });
      console.error("getAnswerRecordDetail failed", error);
    }
  }
});
