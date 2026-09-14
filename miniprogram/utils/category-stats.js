const CATEGORY_ORDER = [
  "网页设计",
  "数字摄影摄像",
  "图形图像处理知识",
  "实用美术基础"
];

const includesAny = (text, keywords) => keywords.some((keyword) => text.includes(keyword.toLowerCase()));

const normalizeMainCategory = (category) => {
  const text = `${category || ""}`.trim().toLowerCase();

  if (includesAny(text, [
    "网页", "网站", "web", "html", "css", "javascript", "js", "盒子模型", "超链接", "表单", "浏览器", "响应式"
  ])) {
    return "网页设计";
  }

  if (includesAny(text, [
    "摄影", "摄像", "拍摄", "相机", "照相", "镜头", "光圈", "快门", "曝光", "感光度", "白平衡", "焦距", "景别", "机位"
  ])) {
    return "数字摄影摄像";
  }

  if (includesAny(text, [
    "图形图像", "图形", "图像", "photoshop", "ps", "illustrator", "ai", "位图", "矢量", "像素", "图层", "蒙版", "通道", "路径", "rgb", "cmyk"
  ])) {
    return "图形图像处理知识";
  }

  return "实用美术基础";
};

const normalizeCategoryStats = (items = []) => {
  const grouped = new Map(CATEGORY_ORDER.map((category) => [category, {
    category,
    totalQuestionCount: 0,
    correctCount: 0
  }]));
  for (const item of items) {
    const entry = grouped.get(normalizeMainCategory(item.category));
    entry.totalQuestionCount += Math.max(0, Number(item.totalQuestionCount) || 0);
    entry.correctCount += Math.max(0, Number(item.correctCount) || 0);
  }
  return CATEGORY_ORDER.map((category) => {
    const entry = grouped.get(category);
    const accuracyRate = entry.totalQuestionCount
      ? Math.min(100, Math.round(entry.correctCount / entry.totalQuestionCount * 100))
      : 0;
    return {
      ...entry,
      accuracyRate,
      accuracyText: entry.totalQuestionCount ? `${accuracyRate}%` : "\u672a\u7ec3\u4e60",
      progressStyle: `width: ${accuracyRate}%;`
    };
  });
};

module.exports = { normalizeCategoryStats };

