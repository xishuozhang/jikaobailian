const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

const isCollectionMissing = (error) => {
  const message = `${error.errMsg || error.message || ""}`;
  return message.includes("collection not exists")
    || message.includes("collection doesn't exists")
    || message.includes("collection not exist")
    || message.includes("集合不存在");
};

const checkAdmin = async () => {
  const { OPENID } = cloud.getWXContext();
  try {
    const result = await db.collection("admin_config").limit(20).get();
    const isAdmin = result.data.some((item) => Array.isArray(item.adminOpenids) && item.adminOpenids.includes(OPENID));
    return { isAdmin, openid: OPENID };
  } catch (error) {
    if (isCollectionMissing(error)) {
      return { isAdmin: false, openid: OPENID };
    }
    throw error;
  }
};

const ensureCollection = async (name) => {
  if (typeof db.createCollection !== "function") {
    return;
  }

  try {
    await db.createCollection(name);
  } catch (error) {
    const message = `${error.errMsg || error.message || ""}`;
    if (!message.includes("already exists") && !message.includes("collection exists") && !message.includes("已存在")) {
      throw error;
    }
  }
};

exports.main = async (event = {}) => {
  const admin = await checkAdmin();

  if (!admin.isAdmin) {
    return { errCode: "NO_ADMIN_PERMISSION", errMsg: "无管理员权限" };
  }

  const targetOpenid = `${event.targetOpenid || ""}`.trim();
  const memberStatus = event.memberStatus === "vip" ? "vip" : "normal";
  const memberExpireAt = memberStatus === "vip" ? `${event.memberExpireAt || ""}`.trim() : "";

  if (!targetOpenid) {
    return { errCode: "EMPTY_TARGET_OPENID", errMsg: "用户 openid 不能为空" };
  }

  const userQuery = await db.collection("users").where({ _openid: targetOpenid }).limit(1).get();
  const user = userQuery.data[0];

  if (!user) {
    return { errCode: "USER_NOT_FOUND", errMsg: "用户不存在" };
  }

  const action = memberStatus !== "vip"
    ? "cancel"
    : user.memberStatus === "vip"
      ? "renew"
      : "open";

  await db.collection("users").doc(user._id).update({
    data: {
      memberStatus,
      memberExpireAt,
      isMember: memberStatus === "vip",
      updatedAt: db.serverDate()
    }
  });

  await ensureCollection("member_logs");
  await db.collection("member_logs").add({
    data: {
      targetOpenid,
      action,
      memberStatus,
      memberExpireAt,
      operatedBy: admin.openid,
      createdAt: db.serverDate()
    }
  });

  return { updated: true };
};
