<template>
  <section>
    <div class="page-heading page-heading-row">
      <h1>题库导入</h1>
      <el-button @click="router.push('/questions')">返回列表</el-button>
    </div>

    <el-card class="import-panel" shadow="never">
      <el-tabs v-model="mode" @tab-change="resetParsed">
        <el-tab-pane label="粘贴 JSON" name="paste">
          <el-input v-model="jsonText" type="textarea" :rows="12" placeholder="粘贴 JSON 题目数组" />
          <div class="import-actions">
            <el-button @click="copyExample">复制示例格式</el-button>
            <el-button type="primary" @click="parsePastedJson">校验格式</el-button>
            <el-button type="success" :disabled="!validatedQuestions.length" :loading="importing" @click="handleImport">
              开始导入
            </el-button>
          </div>
        </el-tab-pane>

        <el-tab-pane label="上传 JSON 文件" name="json">
          <el-upload :auto-upload="false" :show-file-list="false" accept=".json,application/json" :on-change="handleJsonFile">
            <el-button type="primary">选择 JSON 文件</el-button>
          </el-upload>
          <div class="file-hint">{{ fileName || "请选择 JSON 文件" }}</div>
          <div class="import-actions">
            <el-button type="primary" :disabled="!rawQuestions.length" @click="validateRawQuestions">校验格式</el-button>
            <el-button type="success" :disabled="!validatedQuestions.length" :loading="importing" @click="handleImport">
              开始导入
            </el-button>
          </div>
        </el-tab-pane>

        <el-tab-pane label="上传 CSV 文件" name="csv">
          <el-upload :auto-upload="false" :show-file-list="false" accept=".csv,text/csv" :on-change="handleCsvFile">
            <el-button type="primary">选择 CSV 文件</el-button>
          </el-upload>
          <div class="file-hint">{{ fileName || "请选择 CSV 文件" }}</div>
          <div class="import-actions">
            <el-button type="primary" :disabled="!rawQuestions.length" @click="validateRawQuestions">校验格式</el-button>
            <el-button type="success" :disabled="!validatedQuestions.length" :loading="importing" @click="handleImport">
              开始导入
            </el-button>
          </div>
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <el-alert v-if="errorMessage" class="page-alert" type="error" :title="errorMessage" show-icon :closable="false" />

    <el-card v-if="validatedQuestions.length" class="table-panel" shadow="never">
      <template #header>
        <div class="panel-header">
          <span>导入预览</span>
          <span class="panel-note">共 {{ validatedQuestions.length }} 道题，最多显示前 20 条</span>
        </div>
      </template>
      <el-table :data="previewQuestions" row-key="_previewId">
        <el-table-column prop="title" label="题干" min-width="260" show-overflow-tooltip />
        <el-table-column label="题型" width="96">
          <template #default="{ row }">{{ typeText(row.type) }}</template>
        </el-table-column>
        <el-table-column prop="category" label="分类" min-width="120" show-overflow-tooltip />
        <el-table-column label="难度" width="96">
          <template #default="{ row }">{{ difficultyText(row.difficulty) }}</template>
        </el-table-column>
        <el-table-column label="模拟题" width="92">
          <template #default="{ row }">{{ row.isMock ? "是" : "否" }}</template>
        </el-table-column>
        <el-table-column label="答案" min-width="120">
          <template #default="{ row }">{{ row.answer.join(",") }}</template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-card v-if="importResult" class="result-panel" shadow="never">
      <template #header>导入结果</template>
      <el-row :gutter="16">
        <el-col :xs="12" :md="6"><div class="result-item"><span>总题数</span><strong>{{ importResult.total }}</strong></div></el-col>
        <el-col :xs="12" :md="6"><div class="result-item"><span>成功导入</span><strong>{{ importResult.successCount }}</strong></div></el-col>
        <el-col :xs="12" :md="6"><div class="result-item"><span>重复跳过</span><strong>{{ importResult.skippedCount }}</strong></div></el-col>
        <el-col :xs="12" :md="6"><div class="result-item"><span>失败数量</span><strong>{{ importResult.failCount }}</strong></div></el-col>
      </el-row>

      <el-divider v-if="importResult.skippedItems?.length || importResult.errors?.length" />

      <div v-if="importResult.skippedItems?.length" class="result-list">
        <h3>重复题列表</h3>
        <el-table :data="importResult.skippedItems" size="small">
          <el-table-column prop="index" label="序号" width="80" />
          <el-table-column prop="title" label="题干" min-width="240" show-overflow-tooltip />
          <el-table-column prop="category" label="分类" min-width="120" />
        </el-table>
      </div>

      <div v-if="importResult.errors?.length" class="result-list">
        <h3>失败原因</h3>
        <el-table :data="importResult.errors" size="small">
          <el-table-column prop="index" label="序号" width="80" />
          <el-table-column prop="message" label="原因" min-width="240" />
        </el-table>
      </div>
    </el-card>
  </section>
</template>

<script setup>
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { callFunction } from "../cloudbase";

const router = useRouter();
const mode = ref("paste");
const jsonText = ref("");
const fileName = ref("");
const rawQuestions = ref([]);
const validatedQuestions = ref([]);
const errorMessage = ref("");
const importResult = ref(null);
const importing = ref(false);

const requiredHeaders = ["title", "type", "A", "B", "C", "D", "answer", "analysis", "category", "difficulty", "isMock", "imageUrl"];
const validTypes = ["single", "multiple", "judge"];
const validDifficulties = ["easy", "medium", "hard"];
const importBatchSize = 5;
const importRequestTimeout = 20000;

const sampleQuestions = [
  {
    title: "Photoshop 中用于非破坏性隐藏图层局部内容的功能是？",
    type: "single",
    imageUrl: "",
    options: [
      { label: "A", text: "图层蒙版" },
      { label: "B", text: "合并图层" },
      { label: "C", text: "删除图层" },
      { label: "D", text: "栅格化文字" }
    ],
    answer: ["A"],
    analysis: "图层蒙版可以控制图层局部显示与隐藏，不直接破坏原图层内容。",
    category: "Photoshop基础",
    difficulty: "easy",
    isMock: true
  }
];

const previewQuestions = computed(() => validatedQuestions.value.slice(0, 20).map((item, index) => ({ ...item, _previewId: index })));

const typeText = (value) => ({ single: "单选题", multiple: "多选题", judge: "判断题" }[value] || value || "-");
const difficultyText = (value) => ({ easy: "简单", medium: "中等", hard: "困难" }[value] || value || "-");

const resetParsed = () => {
  rawQuestions.value = [];
  validatedQuestions.value = [];
  errorMessage.value = "";
  importResult.value = null;
  fileName.value = "";
};

const normalizeBoolean = (value, defaultValue) => {
  if (value === true || value === "true" || value === "1" || value === 1) return true;
  if (value === false || value === "false" || value === "0" || value === 0) return false;
  return defaultValue;
};

const normalizeJudgeAnswer = (value) => {
  const text = String(value ?? "").trim();
  if (["true", "TRUE", "True", "正确", "A", "a"].includes(text)) return "true";
  if (["false", "FALSE", "False", "错误", "B", "b"].includes(text)) return "false";
  return text;
};

const validateQuestion = (question, index) => {
  const number = index + 1;
  const title = String(question.title || "").trim();
  const type = String(question.type || "").trim();
  const analysis = String(question.analysis || "").trim();
  const category = String(question.category || "").trim();
  const difficulty = validDifficulties.includes(question.difficulty) ? question.difficulty : "easy";
  const imageUrl = String(question.imageUrl || "").trim();
  const isMock = normalizeBoolean(question.isMock, true);
  let options = Array.isArray(question.options) ? question.options : [];
  let answer = Array.isArray(question.answer) ? question.answer.map((item) => String(item).trim()).filter(Boolean) : [];

  if (!title) throw new Error(`第${number}道题缺少 title 字段`);
  if (!validTypes.includes(type)) throw new Error(`第${number}道题 type 必须是 single、multiple 或 judge`);
  if (!answer.length) throw new Error(`第${number}道题缺少 answer 字段`);
  if (!analysis) throw new Error(`第${number}道题缺少 analysis 字段`);
  if (!category) throw new Error(`第${number}道题缺少 category 字段`);
  if (!Array.isArray(question.options)) throw new Error(`第${number}道题 options 必须是数组`);

  if (type === "judge") {
    options = [
      { label: "true", text: "正确" },
      { label: "false", text: "错误" }
    ];
    answer = [normalizeJudgeAnswer(answer[0])];
    if (!["true", "false"].includes(answer[0])) throw new Error(`第${number}道题判断题答案必须为 true 或 false`);
  } else {
    options = options.map((item) => ({
      key: String(item.key || item.label || "").trim(),
      label: String(item.label || item.key || "").trim(),
      text: String(item.text || "").trim()
    })).filter((item) => item.key);
    const labels = options.map((item) => item.key);
    if (!options.length) throw new Error(`第${number}道题 options 不能为空`);
    if (type === "single" && answer.length !== 1) throw new Error(`第${number}道题单选题答案只能有一个`);
    if (type === "multiple" && !answer.length) throw new Error(`第${number}道题多选题至少有一个答案`);
    answer.forEach((item) => {
      if (!labels.includes(item)) throw new Error(`第${number}道题答案 ${item} 不存在于选项中`);
    });
  }

  return { title, type, imageUrl, options, answer, analysis, category, difficulty, isMock };
};

const validateRawQuestions = () => {
  errorMessage.value = "";
  importResult.value = null;
  try {
    if (!Array.isArray(rawQuestions.value)) throw new Error("questions 必须是数组");
    validatedQuestions.value = rawQuestions.value.map((item, index) => validateQuestion(item, index));
    ElMessage.success(`校验通过，共 ${validatedQuestions.value.length} 道题`);
  } catch (error) {
    validatedQuestions.value = [];
    errorMessage.value = error.message || "格式校验失败";
    ElMessage.error(errorMessage.value);
  }
};

const parsePastedJson = () => {
  try {
    rawQuestions.value = JSON.parse(jsonText.value || "[]");
    validateRawQuestions();
  } catch (error) {
    errorMessage.value = "JSON 格式错误";
    validatedQuestions.value = [];
    ElMessage.error(errorMessage.value);
  }
};

const readTextFile = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ""));
  reader.onerror = () => reject(new Error("读取文件失败"));
  reader.readAsText(file, "utf-8");
});

const handleJsonFile = async (file) => {
  resetParsed();
  fileName.value = file.name;
  try {
    const text = await readTextFile(file.raw);
    rawQuestions.value = JSON.parse(text);
    validateRawQuestions();
  } catch (error) {
    errorMessage.value = error.message || "JSON 文件解析失败";
    ElMessage.error(errorMessage.value);
  }
};

const parseCsv = (text) => {
  const rows = [];
  let current = "";
  let row = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === "\"" && inQuotes && next === "\"") {
      current += "\"";
      index += 1;
    } else if (char === "\"") {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(current.trim());
      current = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(current.trim());
      if (row.some((item) => item !== "")) rows.push(row);
      row = [];
      current = "";
    } else {
      current += char;
    }
  }
  row.push(current.trim());
  if (row.some((item) => item !== "")) rows.push(row);
  return rows;
};

const csvRowsToQuestions = (rows) => {
  if (!rows.length) throw new Error("CSV 文件为空");
  const headers = rows[0].map((item) => item.trim());
  const missing = requiredHeaders.filter((header) => !headers.includes(header));
  if (missing.length) throw new Error(`CSV 表头缺失：${missing.join(", ")}`);

  return rows.slice(1).map((row, rowIndex) => {
    const data = {};
    headers.forEach((header, index) => {
      data[header] = String(row[index] || "").trim();
    });
    const lineNumber = rowIndex + 2;
    ["title", "type", "answer", "analysis", "category"].forEach((field) => {
      if (!data[field]) throw new Error(`第${lineNumber}行缺少 ${field} 字段`);
    });

    const type = data.type;
    const options = type === "judge"
      ? [
        { label: "true", text: "正确" },
        { label: "false", text: "错误" }
      ]
      : ["A", "B", "C", "D"]
        .filter((label) => data[label])
        .map((label) => ({ key: label, label, text: data[label] }));

    return {
      title: data.title,
      type,
      imageUrl: data.imageUrl,
      options,
      answer: data.answer.split(",").map((item) => item.trim()).filter(Boolean),
      analysis: data.analysis,
      category: data.category,
      difficulty: data.difficulty || "easy",
      isMock: data.isMock === "" ? true : normalizeBoolean(data.isMock, true)
    };
  });
};

const handleCsvFile = async (file) => {
  resetParsed();
  fileName.value = file.name;
  try {
    const text = await readTextFile(file.raw);
    rawQuestions.value = csvRowsToQuestions(parseCsv(text));
    validateRawQuestions();
  } catch (error) {
    errorMessage.value = error.message || "CSV 文件解析失败";
    ElMessage.error(errorMessage.value);
  }
};

const copyExample = async () => {
  const text = JSON.stringify(sampleQuestions, null, 2);
  jsonText.value = text;
  try {
    await navigator.clipboard.writeText(text);
    ElMessage.success("示例已复制");
  } catch (error) {
    ElMessage.info("示例已填入文本框");
  }
};

const handleImportLegacy = async () => {
  importing.value = true;
  try {
    const result = await callFunction("webAdminImportQuestions", {
      questions: validatedQuestions.value
    });
    if (!result || !result.success) throw new Error(result?.message || "导入失败");
    importResult.value = result.data;
    ElMessage.success("导入完成");
  } catch (error) {
    ElMessage.error(error.message || "导入失败");
  } finally {
    importing.value = false;
  }
};

const createEmptyImportResult = () => ({
  total: 0,
  successCount: 0,
  skippedCount: 0,
  failCount: 0,
  errors: [],
  skippedItems: []
});

const mergeImportResult = (target, source, offset) => {
  target.total += Number(source?.total || 0);
  target.successCount += Number(source?.successCount || 0);
  target.skippedCount += Number(source?.skippedCount || 0);
  target.failCount += Number(source?.failCount || 0);
  target.errors.push(...(source?.errors || []).map((item) => ({
    ...item,
    index: Number(item.index || 0) + offset
  })));
  target.skippedItems.push(...(source?.skippedItems || []).map((item) => ({
    ...item,
    index: Number(item.index || 0) + offset
  })));
};

const sleep = (ms) => new Promise((resolve) => {
  window.setTimeout(resolve, ms);
});

const isRetryableImportError = (error) => {
  const message = String(error?.message || error?.errMsg || error?.msg || "");
  return message.includes("network request error")
    || message.includes("timeout")
    || message.includes("TIME_LIMIT")
    || message.includes("FUNCTIONS_TIME_LIMIT_EXCEEDED");
};

const importQuestionBatch = async (batch) => {
  let lastError = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await callFunction("webAdminImportQuestions", {
        questions: batch
      }, {
        timeout: importRequestTimeout
      });
    } catch (error) {
      lastError = error;
      if (!isRetryableImportError(error) || attempt === 2) {
        throw error;
      }
      await sleep(800 * (attempt + 1));
    }
  }

  throw lastError;
};

const handleImport = async () => {
  importing.value = true;
  importResult.value = null;
  try {
    const mergedResult = createEmptyImportResult();

    for (let start = 0; start < validatedQuestions.value.length; start += importBatchSize) {
      const batch = validatedQuestions.value.slice(start, start + importBatchSize);
      const result = await importQuestionBatch(batch);
      if (!result || !result.success) throw new Error(result?.message || "Import failed");
      mergeImportResult(mergedResult, result.data, start);
      importResult.value = { ...mergedResult };
      await sleep(200);
    }

    importResult.value = mergedResult;
    ElMessage.success("Import completed");
  } catch (error) {
    ElMessage.error(error.message || "Import failed");
  } finally {
    importing.value = false;
  }
};
</script>
