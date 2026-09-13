const PERIOD_DAYS = [30, 90, 180, 365];

const formatTime = (value) => {
  if (!value) {
    return "未设置";
  }

  const date = new Date(value.$date || value);

  if (Number.isNaN(date.getTime())) {
    return "未设置";
  }

  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const maskOpenid = (openid = "") => {
  if (openid.length <= 8) {
    return openid;
  }
  return `${openid.slice(0, 3)}***${openid.slice(-3)}`;
};

const normalizeUsers = (users = []) => users.map((user) => ({
  ...user,
  displayName: user.nickName || user.nickname || "未命名用户",
  openid: user._openid || user.openid || "",
  maskedOpenid: maskOpenid(user._openid || user.openid || ""),
  memberText: user.memberStatus === "vip" ? "会员" : "普通",
  memberClass: user.memberStatus === "vip" ? "right" : "wrong",
  expireText: formatTime(user.memberExpireAt),
  createdText: formatTime(user.createdAt)
}));

const getExpireDate = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

Page({
  data: {
    loading: true,
    keyword: "",
    users: []
  },

  onShow() {
    this.loadUsers();
  },

  onKeywordInput(e) {
    this.setData({ keyword: e.detail.value });
  },

  search() {
    this.loadUsers();
  },

  async loadUsers() {
    this.setData({ loading: true });

    try {
      const { result } = await wx.cloud.callFunction({
        name: "adminGetUsers",
        data: {
          keyword: this.data.keyword,
          limit: 50
        }
      });

      if (result && result.errCode) {
        throw new Error(result.errMsg || result.errCode);
      }

      this.setData({
        loading: false,
        users: normalizeUsers(result.users || [])
      });
    } catch (error) {
      this.setData({ loading: false });
      wx.showToast({ title: "用户加载失败", icon: "none" });
      console.error("adminGetUsers failed", error);
    }
  },

  setMember(e) {
    const { openid } = e.currentTarget.dataset;

    wx.showActionSheet({
      itemList: ["30天", "90天", "180天", "365天"],
      success: (res) => {
        const days = PERIOD_DAYS[res.tapIndex] || 30;
        this.updateMember(openid, "vip", getExpireDate(days));
      }
    });
  },

  customExpire(e) {
    const { openid } = e.currentTarget.dataset;
    this.pendingOpenid = openid;
  },

  onDateChange(e) {
    const openid = e.currentTarget.dataset.openid || this.pendingOpenid;

    if (!openid) {
      return;
    }

    this.updateMember(openid, "vip", e.detail.value);
  },

  cancelMember(e) {
    const { openid } = e.currentTarget.dataset;

    wx.showModal({
      title: "取消会员",
      content: "确认取消该用户会员吗？",
      success: (res) => {
        if (res.confirm) {
          this.updateMember(openid, "normal", "");
        }
      }
    });
  },

  async updateMember(targetOpenid, memberStatus, memberExpireAt) {
    try {
      const { result } = await wx.cloud.callFunction({
        name: "adminUpdateMember",
        data: {
          targetOpenid,
          memberStatus,
          memberExpireAt
        }
      });

      if (result && result.errCode) {
        throw new Error(result.errMsg || result.errCode);
      }

      wx.showToast({ title: "操作成功", icon: "success" });
      this.loadUsers();
    } catch (error) {
      wx.showToast({ title: "操作失败", icon: "none" });
      console.error("adminUpdateMember failed", error);
    }
  }
});
