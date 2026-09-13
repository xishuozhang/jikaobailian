const { envList } = require("./envList");

App({
  onLaunch() {
    const env = envList[0] && envList[0].envId;

    this.globalData = {
      env,
      userInfo: null
    };

    if (!wx.cloud) {
      console.error("请使用 2.2.3 或以上基础库以使用云能力");
      return;
    }

    wx.cloud.init(env ? {
      env,
      traceUser: true
    } : {
      traceUser: true
    });
  }
});
