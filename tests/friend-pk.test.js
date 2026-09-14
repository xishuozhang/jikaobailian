const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const engine = require("../cloudfunctions/friendPk/engine");
const question = (id = "q1", type = "single", answer = "A") => engine.prepareQuestion({
  _id: id, type, title: "测试题", options: [{ key: "A", text: "选项 A" }, { key: "B", text: "选项 B" }], answer, analysis: "解析内容"
});
function waiting(questions = [question()]) { return engine.createRoom("room", "a", { nickName: "甲" }, questions, 60, 1000); }
function started(questions) {
  let room = engine.transition(waiting(questions), "b", "join", {}, 1001, { nickName: "乙" });
  room = engine.transition(room, "a", "ready", { ready: true }, 1002);
  return engine.transition(room, "b", "ready", { ready: true }, 1003);
}

test("invitation, readiness and synchronized start; no answers, identities or early questions leak", () => {
  let room = waiting();
  assert.equal(engine.publicRoom(room, "a", 1000).questions.length, 0);
  room = engine.transition(room, "a", "join", {}, 1001);
  assert.equal(room.players.length, 1);
  room = engine.transition(room, "b", "join", {}, 1002, {});
  assert.throws(() => engine.transition(room, "c", "join", {}, 1003), /房间已满/);
  assert.throws(() => engine.transition(room, "c", "status", {}, 1003), /参与者/);
  room = engine.transition(room, "a", "ready", { ready: true }, 1004);
  assert.equal(room.status, "waiting");
  room = engine.transition(room, "b", "ready", { ready: true }, 1005);
  assert.equal(room.startAt, 6005);
  assert.equal(room.deadline, 66005);
  assert.equal(engine.publicRoom(room, "a", 6004).questions.length, 0);
  assert.throws(() => engine.transition(room, "a", "answer", { index: 0, answer: "A" }, 6004), /倒计时/);
  const a = engine.publicRoom(room, "a", 6005);
  const b = engine.publicRoom(room, "b", 6005);
  assert.deepEqual(a.questions, b.questions);
  assert.equal(a.questions[0].answer, undefined);
  assert.equal(a.questions[0].analysis, undefined);
  assert.equal(a.players[0].openid, undefined);
  assert.equal(a.players[0].score, null);
});

test("server scores exact multi-select answers, ignores submitted scores and locks confirmed answers", () => {
  let room = started([question("multi", "multiple", ["B", "A"]), question("single")]);
  room = engine.transition(room, "a", "answer", { index: 0, answer: ["A", "B"], score: 999 }, room.startAt);
  const again = engine.transition(room, "a", "answer", { index: 0, answer: ["B", "A"] }, room.startAt);
  assert.equal(again.players[0].answers.length, 1);
  assert.throws(() => engine.transition(room, "a", "answer", { index: 0, answer: "A" }, room.startAt), /不能修改/);
  assert.throws(() => engine.transition(room, "a", "answer", { index: 1, answer: ["A", "B"] }, room.startAt), /有效答案/);
  room = engine.transition(room, "a", "answer", { index: 1, answer: "A" }, room.startAt);
  room = engine.transition(room, "b", "answer", { index: 0, answer: "A" }, room.startAt);
  room = engine.transition(room, "b", "answer", { index: 1, answer: "B", score: 1000 }, room.startAt);
  assert.equal(room.status, "finished");
  assert.equal(room.winner, 0);
  const result = engine.publicRoom(room, "a", room.startAt);
  assert.equal(result.players[0].score, 100);
  assert.equal(result.players[1].score, 0);
  assert.deepEqual(result.questions[0].answer, ["A", "B"]);
});

test("timeout counts only saved answers and rejects late scoring, ties remain ties", () => {
  let room = started();
  room = engine.transition(room, "a", "answer", { index: 0, answer: "A" }, room.deadline - 1);
  room = engine.transition(room, "b", "answer", { index: 0, answer: "A" }, room.deadline);
  assert.equal(room.status, "finished");
  assert.equal(room.players[1].answers.length, 0);
  assert.equal(room.winner, 0);
  let draw = started();
  draw = engine.transition(draw, "b", "status", {}, draw.deadline + 100000);
  assert.equal(draw.winner, -1);
  assert.equal(draw.reason, "timeout");
});

test("waiting expiry, cancellation, replacement guest, rejoin and explicit forfeit", () => {
  let room = waiting();
  assert.equal(engine.transition(room, "a", "status", {}, room.expiresAt).status, "expired");
  assert.throws(() => engine.transition(room, "b", "join", {}, room.expiresAt), /失效/);
  assert.equal(engine.transition(room, "a", "leave", {}, 1001).status, "cancelled");
  room = engine.transition(room, "b", "join", {}, 1001, {});
  room = engine.transition(room, "a", "ready", { ready: true }, 1002);
  room = engine.transition(room, "b", "leave", {}, 1003);
  assert.equal(room.players.length, 1);
  assert.equal(room.players[0].ready, false);
  room = engine.transition(room, "c", "join", {}, 1004, {});
  assert.equal(room.players[1].openid, "c");
  room = started();
  assert.deepEqual(engine.transition(room, "a", "join", {}, room.startAt), room);
  room = engine.transition(room, "a", "leave", {}, room.startAt);
  assert.equal(room.winner, 1);
  assert.equal(room.reason, "forfeit");
});

test("question validation and allowed durations", () => {
  assert.equal(engine.prepareQuestion({ type: "single", title: "bad", options: [], answer: "A" }), null);
  const judge = engine.prepareQuestion({ _id: "judge", type: "judge", title: "判断", answer: false });
  assert.deepEqual(judge.answer, ["false"]);
  assert.equal(judge.options.length, 2);
  assert.throws(() => engine.createRoom("r", "a", {}, [question()], 999, 0), /时长/);
});

function adapterFixture() {
  const stored = new Map();
  let actor = "a";
  let now = 1000;
  const db = {
    command: { neq: (value) => value },
    collection(name) {
      let condition;
      const query = {
        where(value) { condition = value; return query; }, limit() { return query; },
        aggregate() { return query; }, match() { return query; }, sample() { return query; },
        async end() { return { list: [{ _id: "q1", title: "题目", type: "single", options: [{ key: "A", text: "甲" }, { key: "B", text: "乙" }], answer: "A" }] }; },
        async get() { return { data: name === "users" ? [] : stored.has(condition._id) ? [structuredClone(stored.get(condition._id))] : [] }; },
        async add({ data }) { if (stored.has(data._id)) throw new Error("duplicate"); stored.set(data._id, structuredClone(data)); },
        async update({ data }) {
          const current = stored.get(condition._id);
          if (current.version !== condition.version) return { stats: { updated: 0 } };
          stored.set(condition._id, structuredClone({ ...current, ...data }));
          return { stats: { updated: 1 } };
        }
      };
      return query;
    }
  };
  const context = { exports: {}, console: { error() {} }, Date: { now: () => now },
    require(name) { return name === "wx-server-sdk" ? { init() {}, database: () => db, getWXContext: () => ({ OPENID: actor }) } : name === "./engine" ? engine : require(name); } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../cloudfunctions/friendPk/index.js"), "utf8"), context);
  return { call(as, event) { actor = as; return context.exports.main(event); }, time(value) { now = value; }, stored };
}

test("cloud adapter: idempotent create, competing joins, simultaneous readiness and answers", async () => {
  const api = adapterFixture();
  const input = { action: "create", requestId: "request-1234567890", duration: 60 };
  const created = await api.call("a", input);
  const roomId = created.room.id;
  assert.equal((await api.call("a", input)).room.id, roomId);
  const joins = await Promise.all([api.call("b", { action: "join", roomId }), api.call("c", { action: "join", roomId })]);
  assert.equal(joins.filter((result) => result.room).length, 1);
  assert.equal(joins.filter((result) => result.errCode === "ROOM_FULL").length, 1);
  const guest = joins[0].room ? "b" : "c";
  await Promise.all([api.call("a", { action: "ready", roomId, ready: true }), api.call(guest, { action: "ready", roomId, ready: true })]);
  const current = (await api.call("a", { action: "status", roomId })).room;
  assert.equal(current.status, "playing");
  api.time(current.startAt);
  await Promise.all([api.call("a", { action: "answer", roomId, index: 0, answer: "A" }), api.call(guest, { action: "answer", roomId, index: 0, answer: "A" })]);
  const final = (await api.call("a", { action: "status", roomId })).room;
  assert.equal(final.status, "finished");
  assert.equal(final.winner, -1);
  assert.equal(final.players[0].score, 100);
  assert.equal(final.players[1].score, 100);
});

test("guest can leave the waiting room successfully without exposing it after departure", async () => {
  const api = adapterFixture();
  const { room } = await api.call("a", { action: "create", requestId: "request-guest-leave", duration: 60 });
  await api.call("b", { action: "join", roomId: room.id });
  assert.equal((await api.call("b", { action: "leave", roomId: room.id })).left, true);
  assert.equal((await api.call("b", { action: "status", roomId: room.id })).errCode, "FORBIDDEN");
  assert.equal((await api.call("c", { action: "join", roomId: room.id })).room.players.length, 2);
});
