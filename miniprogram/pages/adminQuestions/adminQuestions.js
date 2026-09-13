const TYPE_TEXT = {
  single: "单选题",
  multiple: "多选题",
  judge: "判断题"
};

const DIFFICULTY_TEXT = {
  easy: "简单",
  medium: "中等",
  hard: "困难"
};

const normalizeQuestions = (questions = []) => questions.map((question) => ({
  ...question,
  typeText: TYPE_TEXT[question.type] || question.type || "未知题型",
  difficultyText: DIFFICULTY_TEXT[question.difficulty] || question.difficulty || "未设置",
  mockText: question.isMock ? "模拟题" : "普通题"
}));

Page({
  data: {
    loading: true,
    keyword: "",
    category: "",
    categories: [],
    questions: []
  },

  onShow() {
    this.loadQuestions();
  },

  onKeywordInput(e) {
    this.setData({ keyword: e.detail.value });
  },

  onCategoryInput(e) {
    this.setData({ category: e.detail.value });
  },

  search() {
    this.loadQuestions();
  },

  clearFilter() {
    this.setData({ keyword: "", category: "" });
    this.loadQuestions();
  },

  async loadQuestions() {
    const { keyword, category } = this.data;
    this.setData({ loading: true });

    try {
      const { result } = await wx.cloud.callFunction({
        name: "adminGetQuestions",
        data: { keyword, category, limit: 50 }
      });

      if (result && result.errCode) {
        throw new Error(result.errMsg || result.errCode);
      }

      this.setData({
        loading: false,
        questions: normalizeQuestions(result.questions || []),
        categories: result.categories || []
      });
    } catch (error) {
      this.setData({ loading: false });
      wx.showToast({ title: "题库加载失败", icon: "none" });
      console.error("adminGetQuestions failed", error);
    }
  },

  goAdd() {
    wx.navigateTo({ url: "/pages/adminQuestionForm/adminQuestionForm" });
  },

  goEdit(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/adminQuestionForm/adminQuestionForm?id=${id}` });
  },

  deleteQuestion(e) {
    const { id } = e.currentTarget.dataset;

    wx.showModal({
      title: "确认删除",
      content: "删除后不会出现在普通用户刷题中，确认删除该题目吗？",
      success: async (res) => {
        if (!res.confirm) {
          return;
        }

        try {
          const { result } = await wx.cloud.callFunction({
            name: "adminDeleteQuestion",
            data: { id }
          });

          if (result && result.errCode) {
            throw new Error(result.errMsg || result.errCode);
          }

          wx.showToast({ title: "已删除", icon: "success" });
          this.loadQuestions();
        } catch (error) {
          wx.showToast({ title: "删除失败", icon: "none" });
          console.error("adminDeleteQuestion failed", error);
        }
      }
    });
  }
});
