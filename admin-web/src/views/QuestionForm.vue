<template>
  <section>
    <div class="page-heading page-heading-row">
      <h1>{{ isEdit ? "编辑题目" : "新增题目" }}</h1>
      <el-button @click="goBack">返回列表</el-button>
    </div>

    <el-card class="form-panel" shadow="never" v-loading="loading">
      <el-form :model="form" label-width="96px" class="question-form">
        <el-form-item label="题干" required>
          <el-input v-model.trim="form.title" type="textarea" :rows="3" placeholder="请输入题干" />
        </el-form-item>

        <el-row :gutter="16">
          <el-col :xs="24" :md="8">
            <el-form-item label="题型" required>
              <el-select v-model="form.type" @change="handleTypeChange">
                <el-option label="单选题" value="single" />
                <el-option label="多选题" value="multiple" />
                <el-option label="判断题" value="judge" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :xs="24" :md="8">
            <el-form-item label="难度">
              <el-select v-model="form.difficulty">
                <el-option label="简单" value="easy" />
                <el-option label="中等" value="medium" />
                <el-option label="困难" value="hard" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :xs="24" :md="8">
            <el-form-item label="模拟题">
              <el-switch v-model="form.isMock" active-text="是" inactive-text="否" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="分类" required>
          <el-input v-model.trim="form.category" placeholder="请输入分类" />
        </el-form-item>

        <el-form-item label="题目图片">
          <div class="image-upload-row">
            <el-upload
              :auto-upload="false"
              :show-file-list="false"
              accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
              :on-change="handleImageChange"
            >
              <el-button :loading="uploading">
                <el-icon><Upload /></el-icon>
                <span>上传题目图片</span>
              </el-button>
            </el-upload>
            <el-button v-if="form.imageUrl" @click="clearImage">清除图片</el-button>
          </div>
          <el-input v-model.trim="form.imageUrl" class="image-url-input" placeholder="图片 fileID 或图片地址，可为空" />
          <el-image v-if="form.imageUrl" class="question-image-preview" :src="form.imageUrl" fit="contain" />
        </el-form-item>

        <el-form-item label="选项" required>
          <div class="option-editor">
            <template v-if="form.type === 'judge'">
              <el-radio-group v-model="judgeAnswer">
                <el-radio label="true">正确</el-radio>
                <el-radio label="false">错误</el-radio>
              </el-radio-group>
            </template>
            <template v-else>
              <div v-for="option in form.options" :key="option.label" class="option-row">
                <span class="option-label">{{ option.label }}</span>
                <el-input v-model.trim="option.text" :placeholder="`请输入 ${option.label} 选项内容`" />
                <el-radio
                  v-if="form.type === 'single'"
                  v-model="singleAnswer"
                  :label="option.label"
                >
                  正确
                </el-radio>
                <el-checkbox
                  v-else
                  :model-value="form.answer.includes(option.label)"
                  @change="(checked) => toggleMultipleAnswer(option.label, checked)"
                >
                  正确
                </el-checkbox>
              </div>
            </template>
          </div>
        </el-form-item>

        <el-form-item label="答案解析" required>
          <el-input v-model.trim="form.analysis" type="textarea" :rows="4" placeholder="请输入答案解析" />
        </el-form-item>

        <div class="form-actions">
          <el-button @click="goBack">取消</el-button>
          <el-button type="primary" :loading="saving" @click="handleSave">保存</el-button>
        </div>
      </el-form>
    </el-card>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { Upload } from "@element-plus/icons-vue";
import { callFunction, uploadFile } from "../cloudbase";

const route = useRoute();
const router = useRouter();
const loading = ref(false);
const saving = ref(false);
const uploading = ref(false);
const isEdit = computed(() => Boolean(route.params.id));

const defaultOptions = () => [
  { label: "A", text: "" },
  { label: "B", text: "" },
  { label: "C", text: "" },
  { label: "D", text: "" }
];

const form = reactive({
  title: "",
  type: "single",
  imageUrl: "",
  options: defaultOptions(),
  answer: [],
  analysis: "",
  category: "",
  difficulty: "easy",
  isMock: true
});

const singleAnswer = computed({
  get: () => form.answer[0] || "",
  set: (value) => {
    form.answer = value ? [value] : [];
  }
});

const judgeAnswer = computed({
  get: () => form.answer[0] || "",
  set: (value) => {
    form.answer = value ? [value] : [];
  }
});

watch(
  () => form.type,
  () => {
    handleTypeChange();
  }
);

const handleTypeChange = () => {
  if (form.type === "judge") {
    form.options = [
      { label: "true", text: "正确" },
      { label: "false", text: "错误" }
    ];
    form.answer = form.answer[0] === "false" ? ["false"] : ["true"];
    return;
  }

  if (!form.options.length || form.options[0].label === "true") {
    form.options = defaultOptions();
  }
  const labels = form.options.map((item) => item.label);
  form.answer = form.answer.filter((item) => labels.includes(item));
  if (form.type === "single" && form.answer.length > 1) {
    form.answer = [form.answer[0]];
  }
};

const toggleMultipleAnswer = (label, checked) => {
  if (checked && !form.answer.includes(label)) {
    form.answer.push(label);
  }
  if (!checked) {
    form.answer = form.answer.filter((item) => item !== label);
  }
};

const normalizeQuestion = (question) => {
  form.title = question.title || "";
  form.type = question.type || "single";
  form.imageUrl = question.imageUrl || "";
  form.options = Array.isArray(question.options) && question.options.length ? question.options : defaultOptions();
  form.answer = Array.isArray(question.answer) ? question.answer.map((item) => String(item)) : [];
  form.analysis = question.analysis || "";
  form.category = question.category || "";
  form.difficulty = question.difficulty || "easy";
  form.isMock = question.isMock !== false;
  handleTypeChange();
};

const loadDetail = async () => {
  if (!isEdit.value) return;
  loading.value = true;
  try {
    const result = await callFunction("webAdminGetQuestionDetail", {
      questionId: route.params.id
    });
    if (!result || !result.success) throw new Error(result?.message || "获取题目详情失败");
    normalizeQuestion(result.data || {});
  } catch (error) {
    ElMessage.error(error.message || "获取题目详情失败");
    goBack();
  } finally {
    loading.value = false;
  }
};

const validateForm = () => {
  if (!form.title) throw new Error("题干不能为空");
  if (!["single", "multiple", "judge"].includes(form.type)) throw new Error("请选择题型");
  if (!form.answer.length) throw new Error("答案不能为空");
  if (!form.analysis) throw new Error("答案解析不能为空");
  if (!form.category) throw new Error("分类不能为空");
  if (!Array.isArray(form.options)) throw new Error("选项必须是数组");

  if (form.type === "judge") {
    if (!["true", "false"].includes(form.answer[0])) throw new Error("判断题答案必须为 true 或 false");
    return;
  }

  const labels = form.options.map((item) => item.label);
  if (form.type === "single" && form.answer.length !== 1) throw new Error("单选题答案只能有一个");
  if (form.type === "multiple" && !form.answer.length) throw new Error("多选题至少选择一个答案");
  form.answer.forEach((item) => {
    if (!labels.includes(item)) throw new Error(`答案 ${item} 不存在于选项中`);
  });
};

const buildPayload = () => ({
  title: form.title,
  type: form.type,
  imageUrl: form.imageUrl,
  options: form.options,
  answer: form.answer,
  analysis: form.analysis,
  category: form.category,
  difficulty: form.difficulty,
  isMock: form.isMock
});

const handleImageChange = async (file) => {
  const raw = file.raw;
  if (!raw) return;
  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
  if (!allowedTypes.includes(raw.type)) {
    ElMessage.error("仅支持 jpg、jpeg、png、webp 图片");
    return;
  }
  if (raw.size > 5 * 1024 * 1024) {
    ElMessage.error("图片大小不能超过 5MB");
    return;
  }

  const ext = raw.name.split(".").pop()?.toLowerCase() || "png";
  const cloudPath = `question-images/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  uploading.value = true;
  try {
    const fileID = await uploadFile(cloudPath, raw);
    if (!fileID) throw new Error("上传失败");
    form.imageUrl = fileID;
    ElMessage.success("图片上传成功");
  } catch (error) {
    ElMessage.error(error.message || "图片上传失败");
  } finally {
    uploading.value = false;
  }
};

const clearImage = () => {
  form.imageUrl = "";
};

const handleSave = async () => {
  try {
    validateForm();
  } catch (error) {
    ElMessage.error(error.message);
    return;
  }

  saving.value = true;
  try {
    const functionName = isEdit.value ? "webAdminUpdateQuestion" : "webAdminAddQuestion";
    const payload = isEdit.value ? { questionId: route.params.id, ...buildPayload() } : buildPayload();
    const result = await callFunction(functionName, payload);
    if (!result || !result.success) throw new Error(result?.message || "保存失败");
    ElMessage.success(result.message || "保存成功");
    router.push("/questions");
  } catch (error) {
    ElMessage.error(error.message || "保存失败");
  } finally {
    saving.value = false;
  }
};

const goBack = () => {
  router.push("/questions");
};

onMounted(() => {
  loadDetail();
});
</script>
