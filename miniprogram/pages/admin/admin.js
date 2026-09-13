Page({
  data: {
    loading: true,
    stats: {
      totalUsers: 0,
      vipUsers: 0,
      totalQuestions: 0,
      totalAnswerRecords: 0,
      totalWrongRecords: 0
    },
    statList: [],
    entryList: [
      { title: "题库管理", desc: "新增、编辑、删除题目", url: "/pages/adminQuestions/adminQuestions" },
      { title: "会员管理", desc: "设置会员状态和到期时间", url: "/pages/adminUsers/adminUsers" },
      { title: "题库批量导入", desc: "粘贴 JSON、JSON 文件或 CSV 文件批量写入题库", url: "/pages/adminImport/index" }
    ]
  },

  onShow() {
    this.loadStats();
  },

  async loadStats() {
    this.setData({ loading: true });

    try {
      const { result } = await wx.cloud.callFunction({ name: "adminGetStats" });

      if (result && result.errCode) {
        throw new Error(result.errMsg || result.errCode);
      }

      const stats = result.stats || {};
      const statList = [
        { label: "总用户数", value: stats.totalUsers || 0 },
        { label: "会员用户数", value: stats.vipUsers || 0 },
        { label: "总题目数", value: stats.totalQuestions || 0 },
        { label: "总练习记录数", value: stats.totalAnswerRecords || 0 },
        { label: "总错题记录数", value: stats.totalWrongRecords || 0 }
      ];

      this.setData({ stats, statList, loading: false });
    } catch (error) {
      this.setData({ loading: false });
      wx.showToast({ title: "无管理员权限或加载失败", icon: "none" });
      console.error("adminGetStats failed", error);
    }
  },

  goPage(e) {
    const { url } = e.currentTarget.dataset;

    if (!url) {
      wx.showToast({ title: "功能待开放", icon: "none" });
      return;
    }

    wx.navigateTo({ url });
  }
});
