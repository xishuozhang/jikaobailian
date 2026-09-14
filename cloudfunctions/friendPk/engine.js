const fail = (code, message) => { const error = new Error(message); error.code = code; throw error; };
const canonical = (value) => [...new Set((Array.isArray(value) ? value : [value])
  .filter((item) => item !== undefined && item !== null && String(item).trim() !== "")
  .map((item) => String(item).trim()))].sort();

function prepareQuestion(raw) {
  if (!raw || !["single", "multiple", "judge"].includes(raw.type) || !raw.title) return null;
  const options = (Array.isArray(raw.options) && raw.options.length ? raw.options : raw.type === "judge"
    ? [{ key: "true", text: "正确" }, { key: "false", text: "错误" }] : [])
    .map((option) => ({ key: String(option.key || option.label || ""), text: String(option.text || option.title || "") }))
    .filter((option) => option.key && option.text);
  const answer = canonical(raw.answer);
  if (options.length < 2 || new Set(options.map((option) => option.key)).size !== options.length
    || !answer.length || answer.some((key) => !options.some((option) => option.key === key))
    || (raw.type !== "multiple" && answer.length !== 1)) return null;
  return { id: raw._id, title: raw.title, type: raw.type, options, answer,
    imageUrl: raw.imageUrl || "", analysis: raw.analysis || "暂无解析" };
}

const player = (openid, profile = {}) => ({ openid, name: String(profile.nickName || "同学").slice(0, 24),
  avatar: String(profile.avatarUrl || ""), ready: false, done: false, forfeited: false, answers: [] });

function createRoom(id, openid, profile, questions, duration, now) {
  if (![60, 180, 300].includes(duration)) fail("BAD_DURATION", "请选择有效的对战时长");
  if (!questions.length) fail("NO_QUESTIONS", "题库暂无可用于 PK 的题目");
  return { id, version: 0, status: "waiting", duration, questions, players: [player(openid, profile)],
    createdAt: now, expiresAt: now + 15 * 60 * 1000, startAt: 0, deadline: 0, finishedAt: 0, winner: -1, reason: "" };
}

const correctCount = (room, participant) => participant.answers.reduce((count, answer, index) =>
  count + (JSON.stringify(answer) === JSON.stringify(room.questions[index].answer) ? 1 : 0), 0);

function finish(room, now, reason) {
  const scores = room.players.map((participant) => correctCount(room, participant));
  room.winner = room.players.some((participant) => participant.forfeited)
    ? room.players.findIndex((participant) => !participant.forfeited)
    : scores[0] === scores[1] ? -1 : scores[0] > scores[1] ? 0 : 1;
  room.status = "finished";
  room.finishedAt = now;
  room.reason = reason;
}

function transition(source, openid, action, data, now, profile) {
  const room = JSON.parse(JSON.stringify(source));
  let index = room.players.findIndex((participant) => participant.openid === openid);
  if (index < 0 && action !== "join") fail("FORBIDDEN", "你不是本场 PK 的参与者");
  if (room.status === "waiting" && now >= room.expiresAt) room.status = "expired";
  if (room.status === "playing" && now >= room.deadline) finish(room, now, "timeout");
  if (action === "join") {
    if (index < 0) {
      if (room.status !== "waiting") fail("ROOM_CLOSED", "邀请已失效或对战已经开始");
      if (room.players.length >= 2) fail("ROOM_FULL", "房间已满，只能两位同学参加");
      room.players.push(player(openid, profile));
      index = 1;
    }
  } else if (action === "ready") {
    if (room.status === "waiting") {
      room.players[index].ready = data.ready === true;
      if (room.players.length === 2 && room.players.every((participant) => participant.ready)) {
        room.status = "playing";
        room.startAt = now + 5000;
        room.deadline = room.startAt + room.duration * 1000;
      }
    }
  } else if (action === "answer" && room.status === "playing") {
    if (now < room.startAt) fail("NOT_STARTED", "倒计时结束后才能作答");
    const participant = room.players[index];
    const answerIndex = data.index;
    const answer = canonical(data.answer);
    if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex >= room.questions.length) fail("BAD_ANSWER", "题目无效");
    if (answerIndex < participant.answers.length) {
      if (JSON.stringify(answer) !== JSON.stringify(participant.answers[answerIndex])) fail("ANSWER_LOCKED", "已确认的答案不能修改");
    } else {
      if (participant.done || answerIndex !== participant.answers.length) fail("BAD_ORDER", "请按顺序确认答案");
      const question = room.questions[answerIndex];
      if (!answer.length || answer.some((key) => !question.options.some((option) => option.key === key))
        || (question.type !== "multiple" && answer.length !== 1)) fail("BAD_ANSWER", "请选择有效答案");
      participant.answers.push(answer);
      participant.done = participant.answers.length === room.questions.length;
      if (room.players.every((item) => item.done)) finish(room, now, "completed");
    }
  } else if (action === "leave") {
    if (room.status === "waiting") {
      if (index === 0) room.status = "cancelled";
      else { room.players.pop(); room.players[0].ready = false; }
    } else if (room.status === "playing") {
      room.players[index].forfeited = true;
      finish(room, now, "forfeit");
    }
  } else if (!["status", "answer"].includes(action)) {
    fail("BAD_ACTION", "不支持的操作");
  }
  return room;
}

function publicRoom(room, openid, now) {
  const me = room.players.findIndex((participant) => participant.openid === openid);
  if (me < 0) fail("FORBIDDEN", "你不是本场 PK 的参与者");
  const ended = room.status === "finished";
  const visible = ended || (room.status === "playing" && now >= room.startAt);
  return { id: room.id, version: room.version, status: room.status, duration: room.duration, me,
    serverNow: now, startAt: room.startAt, deadline: room.deadline, expiresAt: room.expiresAt,
    total: room.questions.length, winner: ended ? room.winner : null, reason: ended ? room.reason : "",
    players: room.players.map((participant, index) => ({ name: participant.name, avatar: participant.avatar,
      ready: participant.ready, done: participant.done, answered: participant.answers.length,
      forfeited: participant.forfeited, correct: ended ? correctCount(room, participant) : null,
      score: ended ? Math.round(correctCount(room, participant) / room.questions.length * 100) : null,
      isMe: index === me })),
    questions: visible ? room.questions.map((question, index) => ({ id: question.id, title: question.title,
      type: question.type, options: question.options, imageUrl: question.imageUrl,
      ...(ended ? { answer: question.answer, analysis: question.analysis, mine: room.players[me].answers[index] || [] } : {}) })) : [] };
}

module.exports = { prepareQuestion, createRoom, transition, publicRoom };
