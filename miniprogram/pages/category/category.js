Page({
  data: {
    loading: true,
    categories: []
  },

  onShow() {
    this.loadCategories();
  },

  onPullDownRefresh() {
    this.loadCategories().finally(() => wx.stopPullDownRefresh());
  },

  async loadCategories() {
    this.setData({ loading: true });

    try {
      const { result } = await wx.cloud.callFunction({
        name: "getCategories"
      });

      if (result && result.errCode) {
        throw new Error(result.errMsg || result.errCode);
      }

      this.setData({
        categories: (result.categories || []).map((item) => ({
          ...item,
          practicedText: typeof item.practicedCount === "number" ? item.practicedCount : "--"
        })),
        loading: false
      });
    } catch (error) {
      this.setData({ loading: false });
      wx.showToast({ title: "分类加载失败", icon: "none" });
      console.error("getCategories failed", error);
    }
  },

  goPractice(e) {
    const { category } = e.currentTarget.dataset;

    if (!category) {
      return;
    }

    wx.navigateTo({
      url: `/pages/categoryPractice/categoryPractice?category=${encodeURIComponent(category)}`
    });
  }
});
