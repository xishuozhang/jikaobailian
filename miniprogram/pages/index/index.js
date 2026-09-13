Page({
  data: {
    entryList: [
      {
        title: "随机一练",
        desc: "快速抽题，随时开始练习",
        url: "/pages/randomPractice/index"
      },
      {
        title: "分类练习",
        desc: "按知识分类专项巩固",
        url: "/pages/category/category"
      },
      {
        title: "模拟练习",
        desc: "按考试节奏完成整套练习",
        url: "/pages/mockPractice/index",
        vip: true
      },
      {
        title: "错题本",
        desc: "回顾薄弱题目，集中巩固",
        url: "/pages/mistakes/index"
      },
      {
        title: "学习中心",
        desc: "查看统计、记录和学习入口",
        url: "/pages/study/study"
      },
      {
        title: "个人中心",
        desc: "管理账号、会员和个人信息",
        url: "/pages/profile/index"
      }
    ]
  },

  goPage(e) {
    const { url } = e.currentTarget.dataset;

    if (!url) {
      return;
    }

    wx.navigateTo({ url });
  }
});
