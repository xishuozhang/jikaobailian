const maskOpenid = (openid = "") => {
  if (!openid) {
    return "未获取";
  }

  if (openid.length <= 12) {
    return openid;
  }

  return `${openid.slice(0, 6)}****${openid.slice(-4)}`;
};

Page({
  data: {
    openid: "",
    maskedOpenid: "未获取",
    nickName: "微信用户",
    avatarUrl: "/images/avatar.png",
    memberStatusText: "普通用户",
    memberStatusClass: "normal",
    memberExpireText: "",
    isAdmin: false,
    showEditPanel: false,
    editNickName: "",
    editAvatarUrl: "/images/avatar.png",
    editAvatarTempPath: "",
    savingProfile: false
  },

  onShow() {
    this.loadProfile();
    this.loadMemberStatus();
    this.loadAdminStatus();
  },

  async loadProfile() {
    try {
      const { result } = await wx.cloud.callFunction({
        name: "login",
        data: {}
      });
      const user = result.user || {};
      const openid = result.openid || user._openid || "";
      const nickName = user.nickName || "微信用户";
      const avatarUrl = user.avatarUrl || "/images/avatar.png";

      this.setData({
        openid,
        maskedOpenid: maskOpenid(openid),
        nickName,
        avatarUrl,
        editNickName: nickName,
        editAvatarUrl: avatarUrl,
        editAvatarTempPath: ""
      });
    } catch (error) {
      console.error("load profile failed", error);
    }
  },

  async loadMemberStatus() {
    try {
      const { result } = await wx.cloud.callFunction({ name: "checkMember" });
      const expire = result.memberExpireAt || "";

      this.setData({
        memberStatusText: result.isAdmin ? "管理员用户" : result.isMember ? "会员用户" : "普通用户",
        memberStatusClass: result.isMember ? "vip" : "normal",
        memberExpireText: result.isMember && expire ? `会员有效期至：${expire}` : result.isMember ? "会员长期有效" : "暂未开通会员"
      });
    } catch (error) {
      this.setData({
        memberStatusText: "普通用户",
        memberStatusClass: "normal",
        memberExpireText: "暂未开通会员"
      });
      console.error("checkMember failed", error);
    }
  },

  async loadAdminStatus() {
    try {
      const { result } = await wx.cloud.callFunction({ name: "checkAdmin" });
      this.setData({ isAdmin: !!(result && result.isAdmin) });
    } catch (error) {
      this.setData({ isAdmin: false });
      console.error("checkAdmin failed", error);
    }
  },

  goEditProfile() {
    this.setData({
      showEditPanel: true,
      editNickName: this.data.nickName,
      editAvatarUrl: this.data.avatarUrl,
      editAvatarTempPath: ""
    });
  },

  closeEditProfile() {
    this.setData({ showEditPanel: false });
  },

  noop() {},

  onChooseAvatar(event) {
    const avatarUrl = event.detail.avatarUrl;
    this.setData({
      editAvatarUrl: avatarUrl,
      editAvatarTempPath: avatarUrl
    });
  },

  onNickNameInput(event) {
    this.setData({
      editNickName: event.detail.value
    });
  },

  async uploadAvatarIfNeeded() {
    const { editAvatarTempPath } = this.data;
    if (!editAvatarTempPath || editAvatarTempPath.startsWith("cloud://") || editAvatarTempPath.startsWith("http")) {
      return this.data.editAvatarUrl;
    }

    const extMatch = editAvatarTempPath.match(/\.(jpg|jpeg|png|webp)$/i);
    const ext = extMatch ? extMatch[1].toLowerCase() : "png";
    const cloudPath = `user-avatars/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const uploadResult = await wx.cloud.uploadFile({
      cloudPath,
      filePath: editAvatarTempPath
    });
    return uploadResult.fileID;
  },

  async saveProfile() {
    const nickName = String(this.data.editNickName || "").trim();
    if (!nickName) {
      wx.showToast({ title: "请输入昵称", icon: "none" });
      return;
    }
    if (nickName.length > 20) {
      wx.showToast({ title: "昵称不能超过20个字符", icon: "none" });
      return;
    }

    this.setData({ savingProfile: true });
    wx.showLoading({ title: "保存中" });

    try {
      const avatarUrl = await this.uploadAvatarIfNeeded();
      const { result } = await wx.cloud.callFunction({
        name: "updateUserProfile",
        data: {
          nickName,
          avatarUrl
        }
      });

      if (!result || !result.success) {
        throw new Error(result && result.message ? result.message : "保存失败");
      }

      this.setData({
        nickName,
        avatarUrl,
        editAvatarUrl: avatarUrl,
        editAvatarTempPath: "",
        showEditPanel: false
      });
      wx.showToast({ title: "保存成功", icon: "success" });
    } catch (error) {
      console.error("save profile failed", error);
      wx.showToast({ title: error.message || "保存失败", icon: "none" });
    } finally {
      wx.hideLoading();
      this.setData({ savingProfile: false });
    }
  },

  goStudy() {
    wx.navigateTo({ url: "/pages/study/study" });
  },

  goMember() {
    wx.navigateTo({ url: "/pages/member/index" });
  },

  goAdmin() {
    wx.navigateTo({ url: "/pages/admin/admin" });
  },

  showAbout() {
    wx.showModal({
      title: "关于小程序",
      content: "中职数字媒体题库小程序，支持随机练习、分类练习、模拟考试、错题复习和学习统计。",
      showCancel: false
    });
  }
});
