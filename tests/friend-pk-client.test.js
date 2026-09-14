const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const engine = require("../cloudfunctions/friendPk/engine");
const source = fs.readFileSync(path.join(__dirname, "../miniprogram/pages/friendPk/index.js"), "utf8");

function fixture() {
  let now = 1000;
  let room = engine.createRoom("a".repeat(64), "a", {}, [engine.prepareQuestion({ _id: "q", type: "multiple", title: "选择", options: [{ key: "A", text: "甲" }, { key: "B", text: "乙" }], answer: ["A", "B"] })], 60, now);
  let page;
  let failResponse = false;
  const storage = {};
  const timers = new Set();
  const wx = {
    getStorageSync: (key) => storage[key], setStorageSync: (key, value) => { storage[key] = value; }, removeStorageSync: (key) => { delete storage[key]; },
    cloud: { async callFunction({ data }) {
      room = engine.transition(room, "a", data.action, data, now);
      if (failResponse) { failResponse = false; throw new Error("lost response"); }
      return { result: { room: engine.publicRoom(room, "a", now) } };
    } }, vibrateShort() {}, reLaunch() {}
  };
  vm.runInNewContext(source, { Page: (value) => { page = value; }, wx, console, Date: { now: () => now },
    setInterval: () => { const id = {}; timers.add(id); return id; }, clearInterval: (id) => timers.delete(id) });
  page.setData = (values) => Object.assign(page.data, values);
  page.onLoad({});
  page.applyRoom(engine.publicRoom(room, "a", now));
  return { page, timers, wx,
    loseResponse() { failResponse = true; },
    start() { room = engine.transition(room, "b", "join", {}, now, {}); room = engine.transition(room, "b", "ready", { ready: true }, now); room = engine.transition(room, "a", "ready", { ready: true }, now); now = room.startAt; page.applyRoom(engine.publicRoom(room, "a", now)); },
    timeout() { now = room.deadline; }, getRoom: () => room };
}

test("client generates invitation and multi-select choices without exposing answers", () => {
  const { page, start } = fixture();
  assert.equal(page.onShareAppMessage().path, "/pages/friendPk/index?roomId=" + "a".repeat(64));
  start();
  assert.equal(page.data.currentQuestion.answer, undefined);
  page.selectOption({ currentTarget: { dataset: { key: "A" } } });
  page.selectOption({ currentTarget: { dataset: { key: "B" } } });
  assert.equal(page.data.selected.length, 2);
  assert.equal(page.data.canConfirm, true);
});

test("lost confirmation response recovers without counting the answer twice", async () => {
  const { page, start, loseResponse, getRoom } = fixture();
  start(); loseResponse();
  await page.act("answer", { index: 0, answer: ["A", "B"] });
  assert.match(page.data.errorText, /lost response/);
  assert.equal(getRoom().players[0].answers.length, 1);
  await page.act("status");
  assert.equal(page.data.me.done, true);
  assert.equal(page.data.currentIndex, 1);
  assert.equal(page.data.selected.length, 0);
  assert.equal(page.data.errorText, "");
});

test("timers stop in background and server timeout becomes a result", async () => {
  const { page, timers, start, timeout } = fixture();
  page.onShow(); assert.equal(timers.size, 2);
  page.onHide(); assert.equal(timers.size, 0);
  start(); timeout();
  await page.act("status");
  assert.equal(page.data.resultKind, "draw");
  assert.equal(page.data.review[0].mineText, "未作答");
  page.onUnload(); assert.equal(timers.size, 0);
});
