const DEFAULT_OPTIONS = [
  { key: "A", text: "" },
  { key: "B", text: "" },
  { key: "C", text: "" },
  { key: "D", text: "" }
];

const normalizeAnswer = (type, answer) => {
  if (type === "multiple") {
    return Array.isArray(answer) ? answer : `${answer || ""}`.split(",").filter(Boolean);
  }

  return Array.isArray(answer) ? answer[0] || "" : `${answer || ""}`;
};

const IMAGE_SIZE_LIMIT = 2 * 1024 * 1024;
const VALID_IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp"];

const getFileExtension = (path = "") => {
  const cleanPath = `${path}`.split("?")[0];
  const ext = cleanPath.slice(cleanPath.lastIndexOf(".") + 1).toLowerCase();
  return VALID_IMAGE_EXTENSIONS.includes(ext) ? ext : "jpg";
};

const createCloudPath = (filePath) => {
  const random = Math.random().toString(36).slice(2, 8);
  return `question-images/${Date.now()}_${random}.${getFileExtension(filePath)}`;
};

const chooseImageFile = () => new Promise((resolve, reject) => {
  if (wx.chooseMedia) {
    wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      sourceType: ["album"],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0];
        resolve(file ? {
          path: file.tempFilePath,
          size: file.size
        } : null);
      },
      fail: reject
    });
    return;
  }

  wx.chooseImage({
    count: 1,
    sourceType: ["album"],
    success: (res) => {
      const path = res.tempFilePaths && res.tempFilePaths[0];
      const file = res.tempFiles && res.tempFiles[0];
      resolve(path ? {
        path,
        size: file && file.size
      } : null);
    },
    fail: reject
  });
});

const uploadCloudFile = ({ cloudPath, filePath }) => new Promise((resolve, reject) => {
  wx.cloud.uploadFile({
    cloudPath,
    filePath,
    success: resolve,
    fail: reject
  });
});

const isFunctionNotFound = (error) => {
  const message = `${error.errMsg || error.message || ""}`;
  return message.includes("FUNCTION_NOT_FOUND")
    || message.includes("FunctionName parameter could not be found")
    || message.includes("-501000");
};

Page({
  data: {
    id: "",
    imageUploading: false,
    form: {
      title: "",
      type: "single",
      imageUrl: "",
      options: DEFAULT_OPTIONS,
      answer: "",
      analysis: "",
      category: "",
      difficulty: "easy",
      isMock: false
    }
  },

  onLoad(options = {}) {
    const id = options.id || "";
    this.setData({ id });

    if (id) {
      this.loadQuestion(id);
    }
  },

  async loadQuestion(id) {
    try {
      const { result } = await wx.cloud.callFunction({
        name: "adminGetQuestions",
        data: { limit: 100 }
      });

      if (result && result.errCode) {
        throw new Error(result.errMsg || result.errCode);
      }

      const question = (result.questions || []).find((item) => item._id === id);

      if (!question) {
        wx.showToast({ title: "题目不存在", icon: "none" });
        return;
      }

      this.setData({
        form: {
          title: question.title || "",
          type: question.type || "single",
          imageUrl: question.imageUrl || "",
          options: question.type === "judge" ? DEFAULT_OPTIONS : question.options || DEFAULT_OPTIONS,
          answer: normalizeAnswer(question.type, question.answer),
          analysis: question.analysis || "",
          category: question.category || "",
          difficulty: question.difficulty || "easy",
          isMock: question.isMock === true
        }
      });
    } catch (error) {
      wx.showToast({ title: "题目加载失败", icon: "none" });
      console.error("load admin question failed", error);
    }
  },

  updateField(e) {
    const { field } = e.currentTarget.dataset;
    this.setData({ [`form.${field}`]: e.detail.value });
  },

  updateOption(e) {
    const { index } = e.currentTarget.dataset;
    const options = [...this.data.form.options];
    options[index] = { ...options[index], text: e.detail.value };
    this.setData({ "form.options": options });
  },

  changeType(e) {
    const types = ["single", "multiple", "judge"];
    const type = types[Number(e.detail.value)] || "single";
    this.setData({
      "form.type": type,
      "form.answer": type === "multiple" ? [] : "",
      "form.options": type === "judge"
        ? [
          { key: "true", text: "正确" },
          { key: "false", text: "错误" }
        ]
        : DEFAULT_OPTIONS
    });
  },

  changeDifficulty(e) {
    const values = ["easy", "medium", "hard"];
    this.setData({ "form.difficulty": values[Number(e.detail.value)] || "easy" });
  },

  changeMock(e) {
    this.setData({ "form.isMock": e.detail.value });
  },

  changeMultiAnswer(e) {
    this.setData({ "form.answer": e.detail.value });
  },

  async chooseQuestionImage() {
    if (this.data.imageUploading) {
      return;
    }

    try {
      const file = await chooseImageFile();

      if (!file || !file.path) {
        wx.showToast({ title: "未选择图片", icon: "none" });
        return;
      }

      if (file.size && file.size > IMAGE_SIZE_LIMIT) {
        wx.showToast({ title: "图片不能超过 2MB", icon: "none" });
        return;
      }

      const ext = getFileExtension(file.path);
      if (!VALID_IMAGE_EXTENSIONS.includes(ext)) {
        wx.showToast({ title: "仅支持 jpg、png、webp", icon: "none" });
        return;
      }

      this.setData({ imageUploading: true });

      const uploadResult = await uploadCloudFile({
        cloudPath: createCloudPath(file.path),
        filePath: file.path
      });

      this.setData({
        "form.imageUrl": uploadResult.fileID || "",
        imageUploading: false
      });
      wx.showToast({ title: "图片上传成功", icon: "success" });
    } catch (error) {
      this.setData({ imageUploading: false });
      const message = `${error.errMsg || error.message || ""}`;
      const isCancel = message.includes("cancel") || message.includes("取消");
      if (!isCancel) {
        wx.showToast({ title: "图片上传失败，请重试", icon: "none" });
        console.error("upload question image failed", error);
      }
    }
  },

  removeQuestionImage() {
    this.setData({ "form.imageUrl": "" });
  },

  validateForm(question) {
    if (!question.title) return "题干不能为空";
    if (!question.type) return "题型不能为空";
    if (!question.answer || Array.isArray(question.answer) && !question.answer.length) return "答案不能为空";
    if (!question.analysis) return "解析不能为空";
    if (!question.category) return "分类不能为空";
    return "";
  },

  async save() {
    const { id, form } = this.data;
    const question = {
      ...form,
      title: form.title.trim(),
      imageUrl: form.imageUrl.trim(),
      analysis: form.analysis.trim(),
      category: form.category.trim(),
      answer: form.type === "multiple" ? form.answer : `${form.answer}`.trim(),
      options: form.type === "judge"
        ? [
          { key: "true", text: "正确" },
          { key: "false", text: "错误" }
        ]
        : form.options
    };
    const errorMsg = this.validateForm(question);

    if (errorMsg) {
      wx.showToast({ title: errorMsg, icon: "none" });
      return;
    }

    try {
      const functionName = id ? "adminUpdateQuestion" : "adminAddQuestion";
      const { result } = await wx.cloud.callFunction({
        name: functionName,
        data: id ? { id, question } : { question }
      });

      if (result && result.errCode) {
        throw new Error(result.errMsg || result.errCode);
      }

      wx.showToast({ title: "保存成功", icon: "success" });
      setTimeout(() => wx.navigateBack(), 500);
    } catch (error) {
      const functionName = id ? "adminUpdateQuestion" : "adminAddQuestion";
      wx.showToast({
        title: isFunctionNotFound(error) ? `请先部署${functionName}` : "保存失败",
        icon: "none"
      });
      console.error("save question failed", error);
    }
  }
});
