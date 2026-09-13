const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext();
  const nickName = String(event.nickName || "").trim();
  const avatarUrl = String(event.avatarUrl || "").trim();

  if (!nickName) {
    return {
      success: false,
      message: "请输入昵称"
    };
  }

  if (nickName.length > 20) {
    return {
      success: false,
      message: "昵称不能超过20个字符"
    };
  }

  const now = db.serverDate();
  const userQuery = await db.collection("users").where({ _openid: OPENID }).limit(1).get();

  if (userQuery.data.length) {
    const user = userQuery.data[0];
    await db.collection("users").doc(user._id).update({
      data: {
        nickName,
        avatarUrl,
        updatedAt: now
      }
    });

    return {
      success: true,
      message: "保存成功",
      user: {
        ...user,
        nickName,
        avatarUrl
      }
    };
  }

  const userData = {
    _openid: OPENID,
    nickName,
    avatarUrl,
    isMember: false,
    memberStatus: "normal",
    memberExpireAt: null,
    createdAt: now,
    updatedAt: now
  };
  const addResult = await db.collection("users").add({ data: userData });

  return {
    success: true,
    message: "保存成功",
    user: {
      _id: addResult._id,
      ...userData
    }
  };
};
