const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

const seedQuestions = [
  {
    title: "在数字图像中，像素的主要作用是什么？",
    type: "single",
    options: [
      { key: "A", text: "记录图像中最小显示单元的颜色信息" },
      { key: "B", text: "只负责存储图像文件名" },
      { key: "C", text: "只决定图像的播放速度" },
      { key: "D", text: "用于压缩音频文件" }
    ],
    answer: "A",
    analysis: "像素是位图图像的最小显示单元，每个像素记录对应位置的颜色或亮度信息。",
    category: "数字图像",
    difficulty: "easy",
    isMock: true,
    mockGroup: "mock-001",
    status: "active",
    tags: ["图像基础", "像素"]
  },
  {
    title: "下列哪一种文件格式通常支持透明背景？",
    type: "single",
    options: [
      { key: "A", text: "BMP" },
      { key: "B", text: "PNG" },
      { key: "C", text: "WAV" },
      { key: "D", text: "TXT" }
    ],
    answer: "B",
    analysis: "PNG 支持 Alpha 通道，常用于需要透明背景的网页图片和界面素材。",
    category: "数字图像",
    difficulty: "easy",
    isMock: true,
    mockGroup: "mock-001",
    status: "active",
    tags: ["文件格式", "PNG"]
  },
  {
    title: "视频帧率 25fps 表示什么含义？",
    type: "single",
    options: [
      { key: "A", text: "每秒显示 25 帧画面" },
      { key: "B", text: "每帧包含 25 个像素" },
      { key: "C", text: "视频总时长为 25 秒" },
      { key: "D", text: "音频采样率为 25Hz" }
    ],
    answer: "A",
    analysis: "fps 是 frames per second 的缩写，表示每秒播放的画面帧数。",
    category: "视频制作",
    difficulty: "easy",
    isMock: true,
    mockGroup: "mock-001",
    status: "active",
    tags: ["视频", "帧率"]
  },
  {
    title: "在 Photoshop 中，图层蒙版的主要用途是？",
    type: "single",
    options: [
      { key: "A", text: "永久删除图像区域" },
      { key: "B", text: "非破坏性地隐藏或显示图层部分内容" },
      { key: "C", text: "改变文件扩展名" },
      { key: "D", text: "提高电脑显示器亮度" }
    ],
    answer: "B",
    analysis: "图层蒙版通过黑白灰控制显示范围，不会直接破坏原图像内容。",
    category: "图像处理",
    difficulty: "medium",
    isMock: true,
    mockGroup: "mock-001",
    status: "active",
    tags: ["Photoshop", "图层蒙版"]
  },
  {
    title: "RGB 色彩模式主要用于哪类场景？",
    type: "single",
    options: [
      { key: "A", text: "屏幕显示" },
      { key: "B", text: "四色印刷专版输出" },
      { key: "C", text: "机械零件加工" },
      { key: "D", text: "数据库备份" }
    ],
    answer: "A",
    analysis: "RGB 是基于红、绿、蓝三色光的加色模式，主要用于显示器、手机屏幕等发光设备。",
    category: "色彩基础",
    difficulty: "easy",
    isMock: true,
    mockGroup: "mock-001",
    status: "active",
    tags: ["RGB", "色彩模式"]
  },
  {
    title: "网页中常用的矢量图形格式是？",
    type: "single",
    options: [
      { key: "A", text: "SVG" },
      { key: "B", text: "MP3" },
      { key: "C", text: "AVI" },
      { key: "D", text: "DOCX" }
    ],
    answer: "A",
    analysis: "SVG 是基于 XML 的矢量图形格式，适合图标、插画等可缩放图形。",
    category: "网页设计",
    difficulty: "easy",
    isMock: true,
    mockGroup: "mock-001",
    status: "active",
    tags: ["SVG", "网页素材"]
  },
  {
    title: "音频采样率越高，通常表示什么？",
    type: "single",
    options: [
      { key: "A", text: "单位时间内采集声音样本次数越多" },
      { key: "B", text: "图片分辨率越低" },
      { key: "C", text: "视频帧数固定为 1fps" },
      { key: "D", text: "文件一定越小" }
    ],
    answer: "A",
    analysis: "采样率表示每秒采集声音样本的次数，采样率越高，声音细节记录通常越充分。",
    category: "音频处理",
    difficulty: "medium",
    isMock: true,
    mockGroup: "mock-001",
    status: "active",
    tags: ["音频", "采样率"]
  },
  {
    title: "在二维动画制作中，关键帧的作用是？",
    type: "single",
    options: [
      { key: "A", text: "定义动画中重要动作或状态的画面" },
      { key: "B", text: "删除全部时间轴内容" },
      { key: "C", text: "只用于导出音频" },
      { key: "D", text: "固定屏幕分辨率" }
    ],
    answer: "A",
    analysis: "关键帧用于确定动画变化的关键状态，中间过渡可由软件或人工补间完成。",
    category: "动画制作",
    difficulty: "easy",
    isMock: true,
    mockGroup: "mock-001",
    status: "active",
    tags: ["动画", "关键帧"]
  }
];

const normalizeOption = (option = {}) => {
  const key = `${option.key || option.label || ""}`.trim();
  const rawText = `${option.text || ""}`.trim();
  return {
    ...option,
    key,
    label: `${option.label || key}`.trim(),
    text: rawText === "correct" ? "\u6b63\u786e" : rawText === "wrong" ? "\u9519\u8bef" : rawText
  };
};

const sanitizeQuestion = (question) => {
  const { answer, analysis, ...safeQuestion } = question;
  safeQuestion.options = Array.isArray(safeQuestion.options)
    ? safeQuestion.options.map(normalizeOption).filter((option) => option.key)
    : [];
  return safeQuestion;
};

const shuffle = (items) => {
  const list = [...items];
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
};

const isCollectionMissing = (error) => {
  const message = `${error.errMsg || error.message || ""}`;
  return message.includes("collection not exists")
    || message.includes("collection doesn't exists")
    || message.includes("collection not exist")
    || message.includes("集合不存在");
};

const fetchQuestions = async (condition) => {
  const result = await db.collection("questions")
    .where(condition)
    .limit(100)
    .get();

  return result.data.filter((question) => question.status !== "disabled");
};

const seedDefaultQuestions = async () => {
  const now = db.serverDate();

  for (const question of seedQuestions) {
    await db.collection("questions").add({
      data: {
        ...question,
        createdAt: now,
        updatedAt: now
      }
    });
  }
};

exports.main = async (event = {}) => {
  const limit = Math.min(Number(event.limit) || 10, 50);
  const condition = {};

  if (event.category) {
    condition.category = event.category;
  }

  if (event.difficulty) {
    condition.difficulty = event.difficulty;
  }

  let questions = [];

  try {
    questions = await fetchQuestions(condition);
  } catch (error) {
    if (!isCollectionMissing(error)) {
      console.error("fetch questions failed", error);
    }
  }

  if (!questions.length && !event.category && !event.difficulty) {
    try {
      await seedDefaultQuestions();
      questions = await fetchQuestions(condition);
    } catch (error) {
      console.error("seed default questions failed", error);
      questions = seedQuestions;
    }
  }

  return {
    questions: shuffle(questions).slice(0, limit).map(sanitizeQuestion)
  };
};
