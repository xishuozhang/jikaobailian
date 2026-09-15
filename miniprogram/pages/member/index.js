const formatTime = (value) => {
  if (!value) {
    return "";
  }

  const raw = value.$date || value;
  const date = new Date(raw);

  if (Number.isNaN(date.getTime())) {
    return `${value}`;
  }

  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hour = `${date.getHours()}`.padStart(2, "0");
  const minute = `${date.getMinutes()}`.padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}`;
};

const formatFee = (fee) => `${(Number(fee || 0) / 100).toFixed(2)}元`;

const STATUS_TEXT = {
  pending: "待支付",
  paid: "已支付",
  closed: "已关闭",
  failed: "支付失败"
};

const requestVirtualPayment = (payment) => new Promise((resolve, reject) => {
  if (typeof wx.requestVirtualPayment !== "function") {
    reject(new Error("当前微信版本不支持虚拟支付"));
    return;
  }
  wx.requestVirtualPayment({
    signData: payment.signData,
    paySig: payment.paySig,
    signature: payment.signature,
    mode: payment.mode || "short_series_goods",
    success: resolve,
    fail: reject
  });
});

Page({
  data: {
    isMember: false,
    memberStatusText: "当前为普通用户",
    memberExpireText: "",
    plansLoading: true,
    ordersLoading: true,
    payingPlanId: "",
    plans: [],
    orders: [],
    benefits: [
      "会员专属模拟练习",
      "完整答题解析",
      "错题复习巩固",
      "学习记录追踪"
    ]
  },

  onShow() {
    this.loadMemberStatus();
    this.loadPlans();
    this.loadPaymentOrders();
  },

  async loadMemberStatus() {
    try {
      const { result } = await wx.cloud.callFunction({ name: "checkMember" });
      const expire = result.memberExpireAt || "";

      this.setData({
        isMember: !!result.isMember,
        memberStatusText: result.isMember ? "当前为会员用户" : "当前为普通用户",
        memberExpireText: result.isMember && expire ? `会员有效期至：${expire}` : "开通会员后可进入模拟练习"
      });
    } catch (error) {
      this.setData({
        isMember: false,
        memberStatusText: "当前为普通用户",
        memberExpireText: "开通会员后可进入模拟练习"
      });
      console.error("checkMember failed", error);
    }
  },

  async loadPlans() {
    this.setData({ plansLoading: true });

    try {
      const { result } = await wx.cloud.callFunction({ name: "getMemberPlans" });
      this.setData({
        plans: result.plans || [],
        plansLoading: false
      });
    } catch (error) {
      this.setData({ plansLoading: false });
      wx.showToast({ title: "套餐加载失败", icon: "none" });
      console.error("getMemberPlans failed", error);
    }
  },

  async loadPaymentOrders() {
    this.setData({ ordersLoading: true });

    try {
      const { result } = await wx.cloud.callFunction({
        name: "getPaymentOrders",
        data: { limit: 10 }
      });
      const orders = (result.orders || []).map((order) => ({
        ...order,
        totalFeeText: formatFee(order.totalFee),
        statusText: STATUS_TEXT[order.status] || order.status || "未知",
        createdAtText: formatTime(order.createdAt),
        paidAtText: formatTime(order.paidAt)
      }));

      this.setData({
        orders,
        ordersLoading: false
      });
    } catch (error) {
      this.setData({ ordersLoading: false });
      console.error("getPaymentOrders failed", error);
    }
  },

  async buyPlan(e) {
    const { id } = e.currentTarget.dataset;

    if (!id || this.data.payingPlanId) {
      return;
    }

    this.setData({ payingPlanId: id });

    try {
      const login = await new Promise((resolve, reject) => wx.login({ success: resolve, fail: reject }));
      const { result } = await wx.cloud.callFunction({
        name: "createMemberOrder",
        data: { planId: id, code: login.code }
      });

      if (result.errCode) {
        wx.showToast({ title: result.errMsg || "创建订单失败", icon: "none" });
        this.setData({ payingPlanId: "" });
        return;
      }

      await requestVirtualPayment(result.payment);
      wx.showToast({ title: "支付成功，会员开通中", icon: "none" });

      setTimeout(() => {
        this.loadMemberStatus();
        this.loadPaymentOrders();
      }, 1800);
    } catch (error) {
      const message = `${error.errMsg || error.message || ""}`;
      const isCancel = message.includes("cancel") || message.includes("取消");
      wx.showToast({
        title: isCancel ? "已取消支付" : message || "支付失败，请重试",
        icon: "none"
      });
      console.error("requestPayment failed", error);
    } finally {
      this.setData({ payingPlanId: "" });
    }
  },

  goBack() {
    wx.navigateBack();
  }
});
