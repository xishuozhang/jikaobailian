Page({
  data: {
    statsLoading: true,
    statsError: false,
    totalQuestionCount: 0,
    accuracyText: "0%",
    unmasteredWrongCount: 0
  },

  onShow() {
    this.loadStats();
  },

  async loadStats() {
    this.setData({ statsLoading: true, statsError: false });
    try {
      const { result } = await wx.cloud.callFunction({ name: "getUserStats" });
      if (!result || result.errCode || !result.stats) {
        throw new Error("Learning statistics unavailable");
      }
      const stats = result.stats;
      this.setData({
        totalQuestionCount: stats.totalQuestionCount || 0,
        accuracyText: `${Number(stats.accuracyRate) || 0}%`,
        unmasteredWrongCount: stats.unmasteredWrongCount || 0,
        statsLoading: false
      });
    } catch (error) {
      this.setData({ statsLoading: false, statsError: true });
      console.error("getUserStats failed", error);
    }
  },

  onShareAppMessage() {
    return {
      title: "刷题练习",
      path: "/pages/index/index"
    };
  },

  onShareTimeline() {
    return {
      title: "刷题练习",
      query: ""
    };
  },

  goPage(e) {
    const { url } = e.currentTarget.dataset;

    if (!url) {
      return;
    }

    wx.navigateTo({ url });
  }
});
