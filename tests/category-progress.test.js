const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");

const source = fs.readFileSync(path.join(__dirname, "../cloudfunctions/getCategories/index.js"), "utf8");

function createFunction({ questions = [], records = [], openid = "user-a", historyError } = {}) {
  const reads = [];
  const db = {
    command: {
      in: (values) => ({ values }),
      neq: (value) => ({ not: value }),
      aggregate: { sum: (value) => value }
    },
    collection(name) {
      let condition = {};
      let offset = 0;
      let limit = 100;
      const query = {
        where(value) { condition = value; return query; },
        field() { return query; },
        orderBy() { return query; },
        skip(value) { offset = value; return query; },
        limit(value) { limit = value; return query; },
        async get() {
          reads.push({ name, condition, offset, limit });
          if (name === "answer_records" && historyError) throw historyError;
          const rows = name === "answer_records"
            ? records.filter((record) => record._openid === condition._openid)
            : questions.filter((question) => condition._id.values.includes(question._id) && question.status !== condition.status.not);
          return { data: rows.slice(offset, offset + limit) };
        },
        aggregate() { return query; },
        match() { return query; },
        group() { return query; },
        async end() {
          const groups = new Map();
          for (const question of questions.filter((item) => item.status !== "disabled")) {
            groups.set(question.category, (groups.get(question.category) || 0) + 1);
          }
          return { list: [...groups].map(([_id, count]) => ({ _id, count })) };
        }
      };
      return query;
    }
  };
  const cloud = { init() {}, database: () => db, getWXContext: () => ({ OPENID: openid }) };
  const context = { require: () => cloud, exports: {} };
  vm.runInNewContext(source, context);
  return { run: context.exports.main, reads };
}

test("counts unique answered questions for the current user across practice types and legacy records", async () => {
  const { run } = createFunction({
    questions: [
      { _id: "a", category: "HTML" }, { _id: "b", category: "CSS" },
      { _id: "c", category: "photography", status: "disabled" },
      { _id: "d", category: "摄影" }, { _id: "e", category: "网页" },
      { _id: "f", category: "图像" }
    ],
    records: [
      { _openid: "user-a", practiceType: "category", answers: [{ questionId: "a", selectedAnswer: "A", isCorrect: false }] },
      { _openid: "user-a", practiceType: "random", answers: [{ questionId: "a", userAnswer: "B", isCorrect: true }] },
      { _openid: "user-a", questionId: "b", selectedAnswer: ["A", "B"] },
      { _openid: "user-a", answers: [{ questionId: "c", userAnswer: "A" }, { questionId: "deleted", userAnswer: "A" }] },
      { _openid: "user-a", questionSnapshot: { questionId: "d", category: "old category" }, selectedAnswer: false },
      { _openid: "user-a", answers: [{ questionId: "f", userAnswer: [] }, { questionId: "e", userAnswer: " " }] },
      { _openid: "user-b", answers: [{ questionId: "e", userAnswer: "A" }] }
    ]
  });
  const { categories } = await run();
  const web = categories.find((item) => item.name === "网页设计");
  assert.equal(web.count, 3);
  assert.equal(web.practicedCount, 2);
  assert.equal(categories.find((item) => item.name === "数字摄影摄像").practicedCount, 1);
  assert.equal(categories.find((item) => item.name === "图形图像处理知识").practicedCount, 0);
});

test("reads past the first 100 records and queries question IDs in bounded batches", async () => {
  const questions = Array.from({ length: 205 }, (_, i) => ({ _id: `q${i}`, category: "HTML" }));
  const records = questions.map((question) => ({ _openid: "user-a", questionId: question._id, selectedAnswer: "A" }));
  const { run, reads } = createFunction({ questions, records });
  const { categories } = await run();
  assert.equal(categories[0].practicedCount, 205);
  assert.deepEqual(reads.filter((read) => read.name === "answer_records").map((read) => read.offset), [0, 100, 200]);
  assert(reads.filter((read) => read.name === "questions").every((read) => read.condition._id.values.length <= 20));
});

test("new users receive zero progress; a missing history collection is allowed", async () => {
  for (const historyError of [undefined, new Error("collection not exists")]) {
    const { run } = createFunction({ questions: [{ _id: "a", category: "HTML" }], historyError });
    assert.equal((await run()).categories[0].practicedCount, 0);
  }
});

test("history failures are not presented as zero progress and anonymous requests cannot read records", async () => {
  await assert.rejects(createFunction({ historyError: new Error("database offline") }).run(), /database offline/);
  const { run, reads } = createFunction({ openid: "" });
  assert.equal((await run()).errCode, "UNAUTHORIZED");
  assert.equal(reads.length, 0);
});

test("category page refreshes when shown and retains unknown progress for an older cloud function", async () => {
  let page;
  let calls = 0;
  const pageSource = fs.readFileSync(path.join(__dirname, "../miniprogram/pages/category/category.js"), "utf8");
  vm.runInNewContext(pageSource, {
    Page(value) { page = value; },
    wx: { cloud: { callFunction: async () => { calls += 1; return { result: { categories: [{ name: "HTML", count: 100, practicedCount: 50 }, { name: "CSS", count: 20 }] } }; } } }
  });
  page.setData = (values) => Object.assign(page.data, values);
  await page.loadCategories();
  assert.equal(page.data.categories[0].practicedText, 50);
  assert.equal(page.data.categories[1].practicedText, "--");
  page.onShow();
  assert.equal(calls, 2);
});
