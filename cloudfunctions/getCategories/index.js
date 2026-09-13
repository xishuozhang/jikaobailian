const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;
const $ = db.command.aggregate;

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

exports.main = async () => {
  const result = await db.collection("questions")
    .aggregate()
    .match({
      status: _.neq("disabled")
    })
    .group({
      _id: "$category",
      count: $.sum(1)
    })
    .limit(1000)
    .end();

  const categoryMap = CATEGORY_ORDER.reduce((map, name) => {
    map[name] = 0;
    return map;
  }, {});

  (result.list || []).forEach((item) => {
    const name = normalizeMainCategory(item._id);
    categoryMap[name] = (categoryMap[name] || 0) + Number(item.count || 0);
  });

  return {
    categories: CATEGORY_ORDER.map((name) => ({
      name,
      count: categoryMap[name] || 0
    })).filter((item) => item.count > 0)
  };
};
