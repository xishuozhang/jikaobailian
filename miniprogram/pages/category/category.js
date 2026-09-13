Page({
  data: {
    loading: true,
    categories: []
  },

  onLoad() {
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
        categories: result.categories || [],
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
