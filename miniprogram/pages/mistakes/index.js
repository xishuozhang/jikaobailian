const TYPE_TEXT = {
  single: "单选题",
  multiple: "多选题",
  judge: "判断题"
};

const normalizeAnswerList = (answer) => {
  if (Array.isArray(answer)) {
    return answer.map((item) => String(item).trim()).filter(Boolean);
  }

  if (answer === undefined || answer === null || answer === "") {
    return [];
  }

  return String(answer).split(/[,，、]/).map((item) => item.trim()).filter(Boolean);
};

const pickOptionValue = (option = {}, fields = []) => {
  for (const field of fields) {
    if (option[field] !== undefined && option[field] !== null && option[field] !== "") {
      return option[field];
    }
  }

  return "";
};

const getOptionKey = (option = {}) => String(pickOptionValue(option, ["key", "label", "value"])).trim();

const getOptionText = (option = {}) => String(pickOptionValue(option, ["text", "title", "content", "name"])).trim();

const buildOptionMap = (options = []) => options.reduce((map, option) => {
  const key = getOptionKey(option);
  if (key) {
    map[key] = getOptionText(option);
  }
  return map;
}, {});

const formatAnswer = (answer) => {
  const answerList = normalizeAnswerList(answer);

  if (!answerList.length) {
    return "未作答";
  }

  return answerList.join("、");
};

const buildOptionItems = (question = {}, selectedAnswer, correctAnswer) => {
  const optionMap = buildOptionMap(question.options || []);
  const selectedList = normalizeAnswerList(selectedAnswer);
  const correctList = normalizeAnswerList(correctAnswer);
  const selectedSet = selectedList.reduce((set, key) => ({ ...set, [key]: true }), {});
  const correctSet = correctList.reduce((set, key) => ({ ...set, [key]: true }), {});
  const sourceOptions = Array.isArray(question.options) && question.options.length
    ? question.options
    : [...new Set([...selectedList, ...correctList])].map((key) => ({ key, text: optionMap[key] || "" }));

  return sourceOptions.map((option) => {
    const key = getOptionKey(option);
    const isSelected = !!selectedSet[key];
    const isCorrect = !!correctSet[key];
    const isWrong = isSelected && !isCorrect;
    const statusClass = isCorrect ? "is-correct" : (isWrong ? "is-wrong" : "");
    let badgeText = "";

    if (isCorrect && isSelected) {
      badgeText = "已选 / 正确";
    } else if (isCorrect) {
      badgeText = "正确答案";
    } else if (isWrong) {
      badgeText = "你的答案";
    }

    return {
      key,
      text: getOptionText(option) || optionMap[key] || "",
      className: `option-item ${statusClass}`,
      badgeText
    };
  });
};

const formatTime = (value) => {
  if (!value) {
    return "";
  }

  const dateValue = value.$date || value;
  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hour = `${date.getHours()}`.padStart(2, "0");
  const minute = `${date.getMinutes()}`.padStart(2, "0");
  return `${month}-${day} ${hour}:${minute}`;
};

const normalizeRecords = (records = []) => records.map((record) => {
  const question = record.questionSnapshot || {};
  const isMastered = record.mastered === true;
  const selectedAnswer = record.userAnswer || record.selectedAnswer;

  return {
    ...record,
    title: question.title || "未命名题目",
    imageUrl: question.imageUrl || "",
    typeText: TYPE_TEXT[question.type] || "练习题",
    selectedText: formatAnswer(selectedAnswer),
    correctText: formatAnswer(record.correctAnswer),
    optionItems: buildOptionItems(question, selectedAnswer, record.correctAnswer),
    analysis: record.analysis || "暂无解析",
    dateText: formatTime(record.lastWrongAt || record.updatedAt),
    statusText: isMastered ? "已掌握" : "未掌握",
    actionText: isMastered ? "重新加入错题本" : "标记已掌握",
    actionName: isMastered ? "restoreWrongRecord" : "markWrongMastered"
  };
});

Page({
  data: {
    loading: true,
    operating: false,
    activeStatus: "unmastered",
    hasUnmasteredWrong: false,
    statusTabs: [
      { key: "unmastered", text: "未掌握" },
      { key: "mastered", text: "已掌握" },
      { key: "all", text: "全部" }
    ],
    records: []
  },

  onShow() {
    this.loadWrongRecords();
    this.loadUnmasteredStatus();
  },

  onPullDownRefresh() {
    this.loadWrongRecords().finally(() => wx.stopPullDownRefresh());
  },

  goPractice() {
    wx.navigateTo({ url: "/pages/randomPractice/index" });
  },

  goWrongPractice() {
    if (!this.data.hasUnmasteredWrong) {
      wx.showToast({ title: "暂无未掌握错题", icon: "none" });
      return;
    }

    wx.navigateTo({ url: "/pages/wrongPractice/wrongPractice" });
  },

  switchStatus(e) {
    const { status } = e.currentTarget.dataset;

    if (!status || status === this.data.activeStatus) {
      return;
    }

    this.setData({ activeStatus: status });
    this.loadWrongRecords();
  },

  async loadWrongRecords() {
    const { activeStatus } = this.data;

    this.setData({ loading: true });

    try {
      const { result } = await wx.cloud.callFunction({
        name: "getWrongRecords",
        data: {
          limit: 50,
          status: activeStatus
        }
      });
      const cloudRecords = result.records || [];
      const localRecords = wx.getStorageSync("wrong_records_cache") || [];
      const sourceRecords = cloudRecords.length ? cloudRecords : this.filterLocalRecords(localRecords, activeStatus);
      const records = normalizeRecords(sourceRecords);

      this.setData({
        records,
        loading: false,
        hasUnmasteredWrong: activeStatus === "unmastered" ? records.length > 0 : this.data.hasUnmasteredWrong
      });
    } catch (error) {
      const localRecords = wx.getStorageSync("wrong_records_cache") || [];
      const records = normalizeRecords(this.filterLocalRecords(localRecords, activeStatus));
      this.setData({
        records,
        loading: false,
        hasUnmasteredWrong: activeStatus === "unmastered" ? records.length > 0 : this.data.hasUnmasteredWrong
      });
      console.error("getWrongRecords failed", error);
    }
  },

  async loadUnmasteredStatus() {
    try {
      const { result } = await wx.cloud.callFunction({
        name: "getWrongRecords",
        data: {
          limit: 1,
          status: "unmastered"
        }
      });

      this.setData({ hasUnmasteredWrong: !!(result.records && result.records.length) });
    } catch (error) {
      const localRecords = wx.getStorageSync("wrong_records_cache") || [];
      this.setData({ hasUnmasteredWrong: this.filterLocalRecords(localRecords, "unmastered").length > 0 });
      console.error("load unmastered wrong status failed", error);
    }
  },

  filterLocalRecords(records, status) {
    if (status === "all") {
      return records;
    }

    return records.filter((record) => (status === "mastered" ? record.mastered === true : record.mastered !== true));
  },

  async toggleMastered(e) {
    const { id, questionId, action } = e.currentTarget.dataset;

    if (!action || this.data.operating) {
      return;
    }

    this.setData({ operating: true });

    try {
      const { result } = await wx.cloud.callFunction({
        name: action,
        data: {
          recordId: id,
          questionId
        }
      });

      if (result && result.errCode) {
        throw new Error(result.errMsg || result.errCode);
      }

      await this.loadWrongRecords();
    } catch (error) {
      wx.showToast({ title: "操作失败，请重试", icon: "none" });
      console.error(`${action} failed`, error);
    } finally {
      this.setData({ operating: false });
    }
  }
});
