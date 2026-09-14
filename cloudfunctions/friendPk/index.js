const cloud = require("wx-server-sdk");
const crypto = require("crypto");
const { prepareQuestion, createRoom, transition, publicRoom } = require("./engine");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const rooms = () => db.collection("pk_rooms");
const error = (code, message) => Object.assign(new Error(message), { code });
const findRoom = async (id) => (await rooms().where({ _id: id }).limit(1).get()).data[0];

async function profileFor(openid) {
  const result = await db.collection("users").where({ _openid: openid }).limit(1).get();
  return result.data[0] || {};
}

exports.main = async (event = {}) => {
  try {
    const { OPENID } = cloud.getWXContext();
    if (!OPENID) throw error("UNAUTHORIZED", "请在微信中进入好友 PK");
    const action = event.action || "status";
    if (!["create", "join", "ready", "answer", "status", "leave"].includes(action)) throw error("BAD_ACTION", "不支持的操作");
    if (action === "create") {
      if (!/^[a-zA-Z0-9-]{16,100}$/.test(event.requestId || "")) throw error("BAD_REQUEST", "创建请求无效，请重试");
      const id = crypto.createHash("sha256").update(`${OPENID}:${event.requestId}`).digest("hex");
      const existing = await findRoom(id);
      if (existing) return { room: publicRoom(existing, OPENID, Date.now()) };
      const sampled = await db.collection("questions").aggregate()
        .match({ status: db.command.neq("disabled") }).sample({ size: 50 }).end();
      const questions = (sampled.list || []).map(prepareQuestion).filter(Boolean).slice(0, 10);
      const room = createRoom(id, OPENID, await profileFor(OPENID), questions, Number(event.duration), Date.now());
      try { await rooms().add({ data: { _id: id, ...room } }); }
      catch (failure) {
        const duplicate = await findRoom(id);
        if (!duplicate) throw failure;
        return { room: publicRoom(duplicate, OPENID, Date.now()) };
      }
      return { room: publicRoom(room, OPENID, Date.now()) };
    }
    const id = String(event.roomId || "");
    if (!/^[a-f0-9]{64}$/.test(id)) throw error("BAD_ROOM", "邀请链接无效");
    const profile = action === "join" ? await profileFor(OPENID) : null;
    // Compare-and-swap prevents simultaneous joins, readiness changes and answers from overwriting each other.
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const stored = await findRoom(id);
      if (!stored) throw error("ROOM_NOT_FOUND", "房间不存在或已清理");
      const { _id, ...current } = stored;
      const now = Date.now();
      const next = transition(current, OPENID, action, event, now, profile);
      if (JSON.stringify(next) === JSON.stringify(current)) return { room: publicRoom(current, OPENID, now) };
      next.version = current.version + 1;
      const updated = await rooms().where({ _id: id, version: current.version }).update({ data: next });
      if (updated.stats && updated.stats.updated === 1) {
        if (action === "leave" && !next.players.some((participant) => participant.openid === OPENID)) return { left: true };
        return { room: publicRoom(next, OPENID, now) };
      }
    }
    throw error("BUSY", "房间正在同步，请稍后重试");
  } catch (failure) {
    console.error("friendPk", failure);
    const message = String(failure.errMsg || failure.message || "");
    return { errCode: failure.code || "PK_FAILED", errMsg: failure.code ? failure.message
      : /collection.*exist|集合不存在/i.test(message) ? "好友 PK 尚未配置，请先创建 pk_rooms 集合并部署云函数" : "连接失败，请稍后重试" };
  }
};
