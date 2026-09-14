const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const source = read("cloudfunctions/getUserStats/index.js");

async function getStats(records) {
  const db = {
    collection(name) {
      const query = {
        where(filter) { assert.equal(filter._openid, "current-user"); return query; },
        orderBy() { return query; },
        limit() { return query; },
        async get() { return { data: name === "answer_records" ? records : [] }; }
      };
      return query;
    }
  };
  const cloud = { init() {}, database: () => db, getWXContext: () => ({ OPENID: "current-user" }) };
  const context = { require: () => cloud, exports: {} };
  vm.runInNewContext(source, context);
  return JSON.parse(JSON.stringify((await context.exports.main()).stats));
}

test("category names, order and normalization match category practice exactly", () => {
  const extract = (code, end) => code.slice(code.indexOf("const CATEGORY_ORDER"), code.indexOf(end)).trim();
  assert.equal(extract(source, "const isCollectionMissing"),
    extract(read("cloudfunctions/getCategories/index.js"), "const hasAnswer"));
});

test("mixed practice and legacy records contribute to the same four weighted category rates", async () => {
  const stats = await getStats([
    { questionId: "legacy", questionSnapshot: { category: "CSS" }, isCorrect: true },
    { category: "HTML", total: 3, correctCount: 1 },
    {
      practiceType: "mock", total: 4, correctCount: 3,
      questionsSnapshot: [
        { questionId: "p", category: "摄影" },
        { questionId: "w", category: "HTML" },
        { questionId: "i", category: "Photoshop" },
        { questionId: "a", category: "色彩" }
      ],
      answers: [
        { questionId: "w", isCorrect: false },
        { questionId: "i", isCorrect: true },
        { questionId: "p", isCorrect: true },
        { questionId: "a", isCorrect: true }
      ]
    }
  ]);
  assert.deepEqual(stats.categoryStats, [
    { category: "网页设计", totalQuestionCount: 5, correctCount: 2, accuracyRate: 40 },
    { category: "数字摄影摄像", totalQuestionCount: 1, correctCount: 1, accuracyRate: 100 },
    { category: "图形图像处理知识", totalQuestionCount: 1, correctCount: 1, accuracyRate: 100 },
    { category: "实用美术基础", totalQuestionCount: 1, correctCount: 1, accuracyRate: 100 }
  ]);
  assert.equal(stats.totalQuestionCount, 8);
  assert.equal(stats.totalCorrectCount, 5);
});

test("unpracticed categories remain visible and unmatched IDs do not borrow another question's category", async () => {
  const stats = await getStats([{
    questionsSnapshot: [{ questionId: "known", category: "HTML" }],
    answers: [{ questionId: "missing", isCorrect: true }, { questionId: "known", isCorrect: false }]
  }]);
  assert.equal(stats.categoryStats.length, 4);
  assert.equal(stats.categoryStats[0].totalQuestionCount, 1);
  assert.equal(stats.categoryStats[0].correctCount, 0);
  assert.equal(stats.categoryStats[1].totalQuestionCount, 0);
  assert.equal((await getStats([])).categoryStats.length, 4);
});
