const SAMPLE_JSON = JSON.stringify([
  {
    title: "下列哪一项属于位图图像格式？",
    type: "single",
    imageUrl: "",
    options: [
      { label: "A", key: "A", text: "JPG" },
      { label: "B", key: "B", text: "MP3" },
      { label: "C", key: "C", text: "DOCX" },
      { label: "D", key: "D", text: "XLSX" }
    ],
    answer: ["A"],
    analysis: "JPG属于常见的位图图像格式。",
    category: "数字媒体基础",
    difficulty: "easy",
    isMock: true
  }
], null, 2);

const VALID_TYPES = ["single", "multiple", "judge"];
const IMPORT_MODES = ["paste", "jsonFile", "csvFile"];
const FILE_SIZE_LIMIT = 2 * 1024 * 1024;
const CSV_HEADERS = ["title", "type", "A", "B", "C", "D", "answer", "analysis", "category", "difficulty", "isMock", "imageUrl"];
const REQUIRED_CSV_FIELDS = ["title", "type", "answer", "analysis", "category"];

const trim = (value) => `${value || ""}`.trim();

const normalizeBoolean = (value, defaultValue) => {
  if (typeof value === "boolean") {
    return value;
  }

  const text = trim(value).toLowerCase();

  if (!text) {
    return defaultValue;
  }

  return ["true", "1", "yes", "是"].includes(text);
};

const normalizeJudgeAnswer = (answer) => {
  const value = trim(answer).toLowerCase();
  const trueValues = ["true", "正确", "a"];
  const falseValues = ["false", "错误", "b"];

  if (trueValues.includes(value)) {
    return "true";
  }

  if (falseValues.includes(value)) {
    return "false";
  }

  return trim(answer);
};

const normalizeOption = (option = {}) => {
  const label = trim(option.label || option.key);

  return {
    label,
    key: label,
    text: trim(option.text)
  };
};

const normalizeQuestion = (question = {}) => {
  const type = trim(question.type);
  const rawAnswer = Array.isArray(question.answer) ? question.answer : [];
  const answer = type === "judge"
    ? rawAnswer.map(normalizeJudgeAnswer).filter(Boolean)
    : rawAnswer.map((item) => trim(item)).filter(Boolean);

  return {
    title: trim(question.title),
    type,
    imageUrl: trim(question.imageUrl),
    options: Array.isArray(question.options) ? question.options.map(normalizeOption).filter((option) => option.label || option.text) : question.options,
    answer,
    analysis: trim(question.analysis),
    category: trim(question.category),
    difficulty: trim(question.difficulty) || "easy",
    isMock: question.isMock === undefined || question.isMock === null || question.isMock === "" ? true : normalizeBoolean(question.isMock, true),
    status: question.status || "active"
  };
};

const validateQuestions = (questions) => {
  const errors = [];

  if (!Array.isArray(questions)) {
    return {
      normalizedQuestions: [],
      errors: ["questions 必须是数组"]
    };
  }

  const normalizedQuestions = questions.map(normalizeQuestion);

  normalizedQuestions.forEach((question, index) => {
    const rawQuestion = questions[index];
    const prefix = `第${index + 1}题`;

    if (!rawQuestion || typeof rawQuestion !== "object" || Array.isArray(rawQuestion)) {
      errors.push(`${prefix}：不是有效对象`);
      return;
    }

    if (!question.title) errors.push(`${prefix}：缺少 title 字段`);
    if (!question.type) errors.push(`${prefix}：缺少 type 字段`);
    if (question.type && !VALID_TYPES.includes(question.type)) errors.push(`${prefix}：type 必须为 single / multiple / judge`);
    if (!Array.isArray(rawQuestion.answer)) errors.push(`${prefix}：answer 必须是数组`);
    if (!question.answer.length) errors.push(`${prefix}：answer 不能为空`);
    if (!question.analysis) errors.push(`${prefix}：缺少 analysis 字段`);
    if (!question.category) errors.push(`${prefix}：缺少 category 字段`);
    if (!Array.isArray(rawQuestion.options)) errors.push(`${prefix}：options 必须是数组`);

    if (!VALID_TYPES.includes(question.type) || !Array.isArray(rawQuestion.answer) || !Array.isArray(rawQuestion.options)) {
      return;
    }

    if (question.type === "single" && question.answer.length !== 1) {
      errors.push(`${prefix}：单选题 answer 只能有一个`);
    }

    if (question.type === "multiple" && question.answer.length < 1) {
      errors.push(`${prefix}：多选题 answer 至少有一个`);
    }

    if (question.type === "judge") {
      if (question.answer.length !== 1 || !["true", "false"].includes(question.answer[0])) {
        errors.push(`${prefix}：判断题答案必须能识别为 true / false / 正确 / 错误 / A / B`);
      }
      return;
    }

    const optionLabels = question.options.map((option) => option.label).filter(Boolean);
    question.answer.forEach((answer) => {
      if (!optionLabels.includes(answer)) {
        errors.push(`${prefix}：答案 ${answer} 不存在于 options 的 label 中`);
      }
    });
  });

  return { normalizedQuestions, errors };
};

const parseCsv = (text) => {
  const rows = [];
  let field = "";
  let row = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === "\"") {
      if (inQuotes && nextChar === "\"") {
        field += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(trim(field));
      field = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }
      row.push(trim(field));
      if (row.some((item) => trim(item))) {
        rows.push(row);
      }
      row = [];
      field = "";
      continue;
    }

    field += char;
  }

  row.push(trim(field));
  if (row.some((item) => trim(item))) {
    rows.push(row);
  }

  return rows;
};

const csvToQuestions = (text) => {
  const rows = parseCsv(text);

  if (!rows.length) {
    throw new Error("CSV 文件内容为空");
  }

  const headers = rows[0].map(trim);
  const missingHeaders = CSV_HEADERS.filter((header) => !headers.includes(header));

  if (missingHeaders.length) {
    throw new Error(`表头缺少字段：${missingHeaders.join("、")}`);
  }

  const indexMap = headers.reduce((map, header, index) => {
    map[header] = index;
    return map;
  }, {});
  const questions = [];
  const rowErrors = [];

  rows.slice(1).forEach((row, rowIndex) => {
    const lineNumber = rowIndex + 2;
    const getValue = (key) => trim(row[indexMap[key]]);
    const missingFields = REQUIRED_CSV_FIELDS.filter((field) => !getValue(field));

    if (missingFields.length) {
      rowErrors.push(`第${lineNumber}行缺少 ${missingFields.join("、")} 字段`);
      return;
    }

    const type = getValue("type");
    const options = type === "judge"
      ? [
        { label: "true", key: "true", text: getValue("A") || "正确" },
        { label: "false", key: "false", text: getValue("B") || "错误" }
      ]
      : ["A", "B", "C", "D"]
        .map((label) => ({ label, key: label, text: getValue(label) }))
        .filter((option) => option.text);

    questions.push({
      title: getValue("title"),
      type,
      imageUrl: getValue("imageUrl") || "",
      options,
      answer: getValue("answer").split(",").map((item) => trim(item)).filter(Boolean),
      analysis: getValue("analysis"),
      category: getValue("category"),
      difficulty: getValue("difficulty") || "easy",
      isMock: getValue("isMock") ? normalizeBoolean(getValue("isMock"), true) : true
    });
  });

  if (rowErrors.length) {
    const error = new Error("CSV 行数据校验失败");
    error.details = rowErrors;
    throw error;
  }

  return questions;
};

Page({
  data: {
    mode: "paste",
    modeTabs: [
      { key: "paste", text: "粘贴 JSON" },
      { key: "jsonFile", text: "上传 JSON 文件" },
      { key: "csvFile", text: "上传 CSV 文件" }
    ],
    importText: "",
    jsonText: "",
    fileName: "",
    parsedQuestions: [],
    validateText: "",
    validateErrors: [],
    importing: false,
    result: null
  },

  switchMode(e) {
    const { mode } = e.currentTarget.dataset;

    if (!IMPORT_MODES.includes(mode)) {
      return;
    }

    this.setData({
      mode,
      validateText: "",
      validateErrors: [],
      result: null,
      fileName: "",
      parsedQuestions: [],
      importText: mode === "paste" ? this.data.jsonText : ""
    });
  },

  onInput(e) {
    this.setData({
      jsonText: e.detail.value,
      importText: e.detail.value,
      validateText: "",
      validateErrors: [],
      result: null,
      parsedQuestions: []
    });
  },

  copySample() {
    wx.setClipboardData({
      data: SAMPLE_JSON,
      success: () => wx.showToast({ title: "示例已复制", icon: "success" })
    });
  },

  chooseFile() {
    const { mode } = this.data;
    const extension = mode === "csvFile" ? "csv" : "json";

    wx.chooseMessageFile({
      count: 1,
      type: "file",
      extension: [extension],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0];

        if (!file) {
          wx.showToast({ title: "未选择文件", icon: "none" });
          return;
        }

        if (file.size > FILE_SIZE_LIMIT) {
          wx.showToast({ title: "文件过大，请拆分后导入", icon: "none" });
          return;
        }

        const fileName = file.name || "";
        if (!fileName.toLowerCase().endsWith(`.${extension}`)) {
          wx.showToast({ title: `请选择 .${extension} 文件`, icon: "none" });
          return;
        }

        wx.getFileSystemManager().readFile({
          filePath: file.path,
          encoding: "utf8",
          success: (readResult) => {
            this.setData({
              fileName,
              importText: readResult.data || "",
              validateText: "",
              validateErrors: [],
              result: null,
              parsedQuestions: []
            });
            wx.showToast({ title: "文件已读取", icon: "success" });
          },
          fail: (error) => {
            wx.showToast({ title: "文件读取失败", icon: "none" });
            console.error("read import file failed", error);
          }
        });
      },
      fail: (error) => {
        wx.showToast({ title: "文件选择失败或已取消", icon: "none" });
        console.error("choose import file failed", error);
      }
    });
  },

  parseImportText() {
    const { mode, importText } = this.data;

    if (!importText.trim()) {
      throw new Error(mode === "paste" ? "请先粘贴 JSON 题库数据" : "请先选择文件");
    }

    if (mode === "csvFile") {
      return csvToQuestions(importText);
    }

    try {
      return JSON.parse(importText);
    } catch (error) {
      throw new Error(`JSON 解析失败：${error.message}`);
    }
  },

  validateJson() {
    try {
      const questions = this.parseImportText();
      const { normalizedQuestions, errors } = validateQuestions(questions);

      if (errors.length) {
        this.setData({
          validateText: `格式校验未通过，共 ${errors.length} 处问题`,
          validateErrors: errors,
          parsedQuestions: []
        });
        return null;
      }

      this.setData({
        parsedQuestions: normalizedQuestions,
        validateText: `格式校验通过，共 ${normalizedQuestions.length} 道题`,
        validateErrors: []
      });
      return normalizedQuestions;
    } catch (error) {
      this.setData({
        validateText: error.message,
        validateErrors: error.details || [],
        parsedQuestions: []
      });
      return null;
    }
  },

  async importQuestions() {
    const questions = this.validateJson();

    if (!questions) {
      return;
    }

    this.setData({ importing: true, result: null });

    try {
      const { result } = await wx.cloud.callFunction({
        name: "adminImportQuestions",
        data: { questions }
      });

      if (result && result.errCode) {
        throw new Error(result.errMsg || result.errCode);
      }

      this.setData({
        importing: false,
        result
      });
      wx.showToast({ title: "导入完成", icon: "success" });
    } catch (error) {
      this.setData({ importing: false });
      wx.showToast({ title: "导入失败", icon: "none" });
      console.error("adminImportQuestions failed", error);
    }
  }
});
