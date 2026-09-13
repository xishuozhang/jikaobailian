const TYPE_TEXT = {
  single: "单选题",
  multiple: "多选题",
  judge: "判断题"
};

const PRACTICE_TEXT = {
  random: "随机一练",
  category: "分类练习",
  mock: "模拟考试",
  wrong: "错题练习"
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

  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hour = `${date.getHours()}`.padStart(2, "0");
  const minute = `${date.getMinutes()}`.padStart(2, "0");
  return `${month}-${day} ${hour}:${minute}`;
};

const formatPercent = (value) => `${Number(value || 0)}%`;

const normalizeUserStats = (stats = {}) => ({
  totalPracticeCount: stats.totalPracticeCount || 0,
  totalQuestionCount: stats.totalQuestionCount || 0,
  totalCorrectCount: stats.totalCorrectCount || 0,
  accuracyRate: stats.accuracyRate || 0,
  accuracyText: formatPercent(stats.accuracyRate),
  wrongQuestionCount: stats.wrongQuestionCount || 0,
  masteredWrongCount: stats.masteredWrongCount || 0,
  unmasteredWrongCount: stats.unmasteredWrongCount || 0,
  mockPracticeCount: stats.mockPracticeCount || 0,
  bestMockScore: stats.bestMockScore || 0,
  latestMockScore: stats.latestMockScore || 0,
  recent7DaysCount: stats.recent7DaysCount || 0,
  latestPracticeScore: stats.latestPractice && typeof stats.latestPractice.score === "number" ? stats.latestPractice.score : 0,
  hasData: (stats.totalPracticeCount || 0) > 0 || (stats.totalQuestionCount || 0) > 0,
  categoryStats: (stats.categoryStats || []).map((item) => ({
    ...item,
    accuracyText: formatPercent(item.accuracyRate),
    progressStyle: `width: ${Math.max(Math.min(Number(item.accuracyRate) || 0, 100), 0)}%;`
  }))
});

const normalizeRecords = (records = []) => records.map((record) => {
  const question = record.questionSnapshot || {};
  const practiceText = PRACTICE_TEXT[record.practiceType] || "练习记录";
  const isPracticeRecord = Array.isArray(record.answers);
  const total = record.total || record.answers && record.answers.length || 1;
  const correctCount = typeof record.correctCount === "number"
    ? record.correctCount
    : record.isCorrect
      ? 1
      : 0;
  const score = typeof record.score === "number"
    ? record.score
    : record.isCorrect
      ? 100
      : 0;

  return {
    ...record,
    title: isPracticeRecord ? `${practiceText} · ${total}题` : question.title || "未命名题目",
    typeText: TYPE_TEXT[question.type] || "练习题",
    practiceText,
    scoreText: isPracticeRecord ? `${score}分 · 正确 ${correctCount}/${total}` : record.isCorrect ? "本题正确" : "本题错误",
    selectedText: formatAnswer(record.selectedAnswer),
    correctText: formatAnswer(record.correctAnswer),
    dateText: formatTime(record.createdAt),
    resultText: isPracticeRecord ? `${score}分` : record.isCorrect ? "正确" : "错误",
    resultClass: isPracticeRecord ? (score >= 60 ? "right" : "wrong") : record.isCorrect ? "right" : "wrong"
  };
});

Page({
  data: {
    loading: true,
    statsLoading: true,
    records: [],
    userStats: normalizeUserStats(),
    entryList: [
      { title: "做题记录", desc: "查看最近练习情况", action: "records" },
      { title: "错题本", desc: "复习薄弱题目", url: "/pages/mistakes/index" },
      { title: "未掌握错题练习", desc: "只练未掌握错题", url: "/pages/wrongPractice/wrongPractice" },
      { title: "分类练习", desc: "按分类专项巩固", url: "/pages/category/category" }
    ]
  },

  onShow() {
    this.loadUserStats();
    this.loadAnswerRecords();
  },

  onPullDownRefresh() {
    Promise.all([
      this.loadUserStats(),
      this.loadAnswerRecords()
    ]).finally(() => wx.stopPullDownRefresh());
  },

  async loadUserStats() {
    this.setData({ statsLoading: true });

    try {
      const { result } = await wx.cloud.callFunction({ name: "getUserStats" });
      this.setData({
        userStats: normalizeUserStats(result.stats || {}),
        statsLoading: false
      });
    } catch (error) {
      this.setData({
        userStats: normalizeUserStats(),
        statsLoading: false
      });
      console.error("getUserStats failed", error);
    }
  },

  async loadAnswerRecords() {
    this.setData({ loading: true });

    try {
      const { result } = await wx.cloud.callFunction({
        name: "getAnswerRecords",
        data: { limit: 5 }
      });
      const cloudRecords = result.records || [];
      const localRecords = wx.getStorageSync("answer_records_cache") || [];
      this.setData({
        records: normalizeRecords(cloudRecords.length ? cloudRecords : localRecords.slice(0, 5)),
        loading: false
      });
    } catch (error) {
      const localRecords = wx.getStorageSync("answer_records_cache") || [];
      this.setData({
        records: normalizeRecords(localRecords.slice(0, 5)),
        loading: false
      });
      console.error("getAnswerRecords failed", error);
    }
  },

  goEntry(e) {
    const { url, action } = e.currentTarget.dataset;

    if (url) {
      wx.navigateTo({ url });
      return;
    }

    if (action === "records") {
      wx.pageScrollTo({
        selector: "#recentRecords",
        duration: 240
      });
    }
  },

  goRecordDetail(e) {
    const { id } = e.currentTarget.dataset;

    if (!id) {
      return;
    }

    wx.navigateTo({
      url: `/pages/recordDetail/recordDetail?id=${id}`
    });
  }
});
