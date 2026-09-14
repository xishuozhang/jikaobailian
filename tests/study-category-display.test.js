const assert = require("node:assert/strict");
const test = require("node:test");
const { normalizeCategoryStats } = require("../miniprogram/utils/category-stats");

test("old category labels are merged using weighted counts in practice category order", () => {
  const result = normalizeCategoryStats([
    { category: "CSS", totalQuestionCount: 90, correctCount: 45, accuracyRate: 50 },
    { category: "HTML", totalQuestionCount: 10, correctCount: 10, accuracyRate: 100 },
    { category: "Photoshop", totalQuestionCount: 5, correctCount: 4 },
    { category: "摄影", totalQuestionCount: 5, correctCount: 3 }
  ]);
  assert.deepEqual(result.map((item) => item.category), ["网页设计", "数字摄影摄像", "图形图像处理知识", "实用美术基础"]);
  assert.equal(result[0].accuracyText, "55%");
  assert.equal(result[0].progressStyle, "width: 55%;");
  assert.equal(result[0].totalQuestionCount, 100);
  assert.equal(result[3].accuracyText, "未练习");
  assert.deepEqual(normalizeCategoryStats(result), result);
});

test("study page applies normalization to an actual legacy API response", async () => {
  let page;
  global.Page = (value) => { page = value; };
  global.wx = { cloud: { callFunction: async () => ({ result: { stats: {
    categoryStats: [{ category: "HTML", totalQuestionCount: 10, correctCount: 8 }]
  } } }) } };
  require("../miniprogram/pages/study/study");
  page.setData = (values) => Object.assign(page.data, values);
  await page.loadUserStats();
  assert.equal(page.data.statsLoading, false);
  assert.equal(page.data.userStats.categoryStats.length, 4);
  assert.equal(page.data.userStats.categoryStats[0].category, "网页设计");
  assert.equal(page.data.userStats.categoryStats[0].accuracyText, "80%");
  delete global.Page;
  delete global.wx;
});
