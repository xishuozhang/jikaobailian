const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

const INVALID_LOGIN_MESSAGE = "Login expired, please sign in again";
const VALID_TYPES = ["single", "multiple", "judge"];
const VALID_DIFFICULTIES = ["easy", "medium", "hard"];
const QUERY_CHUNK_SIZE = 20;
const WRITE_CHUNK_SIZE = 10;

const parseTime = (value) => {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const time = new Date(value.includes("T") ? value : value.replace(/-/g, "/")).getTime();
    return Number.isNaN(time) ? 0 : time;
  }
  if (typeof value === "object" && value.$date) return parseTime(value.$date);
  return 0;
};

const checkSession = async (token) => {
  if (!token) return null;
  const result = await db.collection("admin_sessions").where({ token }).limit(1).get();
  const session = result.data[0];
  if (!session || parseTime(session.expiredAt) <= Date.now()) {
    if (session) await db.collection("admin_sessions").where({ token }).remove();
    return null;
  }
  return session;
};

const normalizeBoolean = (value, defaultValue) => {
  if (value === true || value === "true" || value === 1 || value === "1") return true;
  if (value === false || value === "false" || value === 0 || value === "0") return false;
  return defaultValue;
};

const normalizeAnswerValue = (value) => {
  const text = String(value ?? "").trim();
  if (["correct", "true", "TRUE", "True", "A", "a"].includes(text)) return "true";
  if (["wrong", "false", "FALSE", "False", "B", "b"].includes(text)) return "false";
  return text;
};

const validateQuestion = (input = {}, index) => {
  const prefix = index ? `Question ${index}: ` : "";
  const title = String(input.title || "").trim();
  const type = String(input.type || "").trim();
  const analysis = String(input.analysis || "").trim();
  const category = String(input.category || "").trim();
  const difficulty = VALID_DIFFICULTIES.includes(input.difficulty) ? input.difficulty : "easy";
  const imageUrl = String(input.imageUrl || "").trim();
  const isMock = normalizeBoolean(input.isMock, true);
  let options = Array.isArray(input.options) ? input.options : [];
  let answer = Array.isArray(input.answer) ? input.answer.map((item) => String(item).trim()).filter(Boolean) : [];

  if (!title) throw new Error(`${prefix}missing title`);
  if (!VALID_TYPES.includes(type)) throw new Error(`${prefix}type must be single, multiple, or judge`);
  if (!answer.length) throw new Error(`${prefix}missing answer`);
  if (!analysis) throw new Error(`${prefix}missing analysis`);
  if (!category) throw new Error(`${prefix}missing category`);
  if (!Array.isArray(input.options)) throw new Error(`${prefix}options must be an array`);

  if (type === "judge") {
    options = [
      { key: "true", label: "true", text: "\u6b63\u786e" },
      { key: "false", label: "false", text: "\u9519\u8bef" }
    ];
    answer = [normalizeAnswerValue(answer[0])];
    if (!["true", "false"].includes(answer[0])) {
      throw new Error(`${prefix}judge answer must be true or false`);
    }
  } else {
    options = options
      .map((item) => ({
        key: String(item.key || item.label || "").trim(),
        label: String(item.label || item.key || "").trim(),
        text: String(item.text || "").trim()
      }))
      .filter((item) => item.key);
    const labels = options.map((item) => item.key);
    if (!options.length) throw new Error(`${prefix}options cannot be empty`);
    if (type === "single" && answer.length !== 1) {
      throw new Error(`${prefix}single-choice answer can only contain one option`);
    }
    answer.forEach((item) => {
      if (!labels.includes(item)) {
        throw new Error(`${prefix}answer ${item} does not exist in options`);
      }
    });
  }

  return {
    title,
    type,
    imageUrl,
    options,
    answer,
    analysis,
    category,
    difficulty,
    isMock
  };
};

const chunkArray = (items, size) => {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const getDuplicateMap = async (questions) => {
  const duplicateMap = new Map();
  const categoryTitleMap = new Map();

  questions.forEach((question) => {
    const titles = categoryTitleMap.get(question.category) || new Set();
    titles.add(question.title);
    categoryTitleMap.set(question.category, titles);
  });

  for (const [category, titleSet] of categoryTitleMap.entries()) {
    const titleChunks = chunkArray([...titleSet], QUERY_CHUNK_SIZE);
    for (const titles of titleChunks) {
      const result = await db.collection("questions")
        .where({
          category,
          title: _.in(titles)
        })
        .get();

      result.data.forEach((item) => {
        duplicateMap.set(`${item.category}\n${item.title}`, item);
      });
    }
  }

  return duplicateMap;
};

const addQuestions = async (items) => {
  let successCount = 0;
  const chunks = chunkArray(items, WRITE_CHUNK_SIZE);

  for (const chunk of chunks) {
    const settled = await Promise.allSettled(chunk.map(({ question }) => {
      const now = new Date();
      return db.collection("questions").add({
        data: {
          ...question,
          createdAt: now,
          updatedAt: now
        }
      });
    }));

    settled.forEach((result, index) => {
      if (result.status === "fulfilled") {
        successCount += 1;
      } else {
        chunk[index].error = result.reason;
      }
    });
  }

  return successCount;
};

exports.main = async (event = {}) => {
  try {
    const session = await checkSession(String(event.token || "").trim());
    if (!session) return { success: false, message: INVALID_LOGIN_MESSAGE };

    const questions = Array.isArray(event.questions) ? event.questions : [];
    const total = questions.length;
    const errors = [];
    const skippedItems = [];
    let failCount = 0;
    let skippedCount = 0;

    if (!total) {
      return {
        success: true,
        data: { total: 0, successCount: 0, failCount: 0, skippedCount: 0, errors: [], skippedItems: [] }
      };
    }

    const validItems = [];
    const seenInCurrentImport = new Map();

    for (let index = 0; index < questions.length; index += 1) {
      try {
        const question = validateQuestion(questions[index], index + 1);
        const importKey = `${question.category}\n${question.title}`;

        if (seenInCurrentImport.has(importKey)) {
          skippedCount += 1;
          skippedItems.push({
            index: index + 1,
            title: question.title,
            category: question.category,
            questionId: "",
            reason: "duplicate in current import"
          });
          continue;
        }

        seenInCurrentImport.set(importKey, true);
        validItems.push({ index: index + 1, question });
      } catch (error) {
        failCount += 1;
        errors.push({
          index: index + 1,
          message: error.message || "Import failed"
        });
      }
    }

    const duplicateMap = await getDuplicateMap(validItems.map((item) => item.question));
    const pendingItems = [];

    validItems.forEach((item) => {
      const key = `${item.question.category}\n${item.question.title}`;
      const duplicate = duplicateMap.get(key);
      if (duplicate) {
        skippedCount += 1;
        skippedItems.push({
          index: item.index,
          title: item.question.title,
          category: item.question.category,
          questionId: duplicate._id
        });
      } else {
        pendingItems.push(item);
      }
    });

    const successCount = await addQuestions(pendingItems);

    pendingItems.forEach((item) => {
      if (item.error) {
        failCount += 1;
        errors.push({
          index: item.index,
          message: item.error.message || item.error.errMsg || "Import failed"
        });
      }
    });

    return {
      success: true,
      data: {
        total,
        successCount,
        failCount,
        skippedCount,
        errors,
        skippedItems
      }
    };
  } catch (error) {
    console.error("webAdminImportQuestions failed:", error);
    return {
      success: false,
      message: error.message || "Import failed"
    };
  }
};
