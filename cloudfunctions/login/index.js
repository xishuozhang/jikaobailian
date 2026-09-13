const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

exports.main = async (event) => {
  const wxContext = cloud.getWXContext();
  const now = db.serverDate();
  const openid = wxContext.OPENID;
  const userInfo = event.userInfo || {};

  const userQuery = await db.collection("users").where({ _openid: openid }).limit(1).get();

  if (userQuery.data.length) {
    const user = userQuery.data[0];
    await db.collection("users").doc(user._id).update({
      data: {
        nickName: userInfo.nickName || user.nickName || "",
        avatarUrl: userInfo.avatarUrl || user.avatarUrl || "",
        updatedAt: now
      }
    });

    return {
      openid,
      user: {
        ...user,
        nickName: userInfo.nickName || user.nickName || "",
        avatarUrl: userInfo.avatarUrl || user.avatarUrl || ""
      }
    };
  }

  const userData = {
    _openid: openid,
    nickName: userInfo.nickName || "",
    avatarUrl: userInfo.avatarUrl || "",
    isMember: false,
    memberExpireAt: null,
    createdAt: now,
    updatedAt: now
  };

  const addResult = await db.collection("users").add({ data: userData });

  return {
    openid,
    user: {
      _id: addResult._id,
      ...userData
    }
  };
};
