<template>
  <section>
    <div class="page-heading page-heading-row">
      <h1>题库管理</h1>
      <div class="page-actions">
        <el-button type="primary" @click="router.push('/questions/create')">
          <el-icon><Plus /></el-icon>
          <span>新增题目</span>
        </el-button>
        <el-button @click="router.push('/questions/import')">
          <el-icon><Upload /></el-icon>
          <span>批量导入</span>
        </el-button>
      </div>
    </div>

    <el-card class="filter-panel" shadow="never">
      <el-form :model="filters" class="filter-form" label-width="86px">
        <el-row :gutter="16">
          <el-col :xs="24" :md="12" :xl="8">
            <el-form-item label="题干关键词">
              <el-input v-model.trim="filters.keyword" clearable placeholder="输入题干关键词" @keyup.enter="handleSearch" />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :md="12" :xl="8">
            <el-form-item label="分类">
              <el-input v-model.trim="filters.category" clearable placeholder="输入分类" @keyup.enter="handleSearch" />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :md="12" :xl="8">
            <el-form-item label="题型">
              <el-select v-model="filters.type" clearable placeholder="全部题型">
                <el-option label="单选题" value="single" />
                <el-option label="多选题" value="multiple" />
                <el-option label="判断题" value="judge" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :xs="24" :md="12" :xl="8">
            <el-form-item label="难度">
              <el-select v-model="filters.difficulty" clearable placeholder="全部难度">
                <el-option label="简单" value="easy" />
                <el-option label="中等" value="medium" />
                <el-option label="困难" value="hard" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :xs="24" :md="12" :xl="8">
            <el-form-item label="模拟题">
              <el-select v-model="filters.isMock" clearable placeholder="全部">
                <el-option label="是" value="true" />
                <el-option label="否" value="false" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :xs="24" :md="12" :xl="8">
            <div class="filter-actions">
              <el-button type="primary" :loading="loading" @click="handleSearch">
                <el-icon><Search /></el-icon>
                <span>查询</span>
              </el-button>
              <el-button @click="handleReset">
                <el-icon><RefreshLeft /></el-icon>
                <span>重置</span>
              </el-button>
            </div>
          </el-col>
        </el-row>
      </el-form>
    </el-card>

    <el-alert v-if="errorMessage" class="page-alert" type="error" :title="errorMessage" show-icon :closable="false" />

    <el-card class="table-panel" shadow="never">
      <el-table v-loading="loading" :data="questions" row-key="_id" empty-text="暂无题目">
        <el-table-column prop="title" label="题干" min-width="280" show-overflow-tooltip />
        <el-table-column label="题型" width="96">
          <template #default="{ row }">{{ typeText(row.type) }}</template>
        </el-table-column>
        <el-table-column prop="category" label="分类" min-width="130" show-overflow-tooltip />
        <el-table-column label="难度" width="96">
          <template #default="{ row }">{{ difficultyText(row.difficulty) }}</template>
        </el-table-column>
        <el-table-column label="模拟题" width="92">
          <template #default="{ row }">
            <el-tag :type="row.isMock ? 'success' : 'info'" size="small">{{ row.isMock ? "是" : "否" }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" min-width="160">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="router.push(`/questions/edit/${row._id}`)">编辑</el-button>
            <el-button size="small" type="danger" :loading="deletingId === row._id" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination-bar">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :total="total"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          background
          @size-change="handlePageSizeChange"
          @current-change="loadQuestions"
        />
      </div>
    </el-card>
  </section>
</template>

<script setup>
import { onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import { Plus, RefreshLeft, Search, Upload } from "@element-plus/icons-vue";
import { callFunction } from "../cloudbase";

const router = useRouter();
const loading = ref(false);
const deletingId = ref("");
const errorMessage = ref("");
const questions = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(10);

const filters = reactive({
  keyword: "",
  category: "",
  type: "",
  difficulty: "",
  isMock: ""
});

const typeTextMap = {
  single: "单选题",
  multiple: "多选题",
  judge: "判断题"
};

const difficultyTextMap = {
  easy: "简单",
  medium: "中等",
  hard: "困难"
};

const typeText = (value) => typeTextMap[value] || value || "-";
const difficultyText = (value) => difficultyTextMap[value] || value || "-";

const parseTime = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "number") return new Date(value);
  if (typeof value === "string") {
    const date = new Date(value.includes("T") ? value : value.replace(/-/g, "/"));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === "object" && value.$date) return parseTime(value.$date);
  return null;
};

const formatTime = (value) => {
  const date = parseTime(value);
  if (!date) return "-";
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const loadQuestions = async () => {
  loading.value = true;
  errorMessage.value = "";

  try {
    const result = await callFunction("webAdminGetQuestions", {
      page: page.value,
      pageSize: pageSize.value,
      keyword: filters.keyword,
      category: filters.category,
      type: filters.type,
      difficulty: filters.difficulty,
      isMock: filters.isMock
    });

    if (!result || !result.success) {
      throw new Error(result?.message || "获取题库列表失败");
    }

    questions.value = result.data?.list || [];
    total.value = result.data?.total || 0;
    page.value = result.data?.page || page.value;
    pageSize.value = result.data?.pageSize || pageSize.value;
  } catch (error) {
    errorMessage.value = error.message || "获取题库列表失败";
    questions.value = [];
    total.value = 0;
    ElMessage.error(errorMessage.value);
  } finally {
    loading.value = false;
  }
};

const handleSearch = () => {
  page.value = 1;
  loadQuestions();
};

const handleReset = () => {
  Object.assign(filters, {
    keyword: "",
    category: "",
    type: "",
    difficulty: "",
    isMock: ""
  });
  page.value = 1;
  loadQuestions();
};

const handlePageSizeChange = () => {
  page.value = 1;
  loadQuestions();
};

const handleDelete = async (row) => {
  try {
    await ElMessageBox.confirm("删除后不可恢复，确定删除这道题目吗？", "删除确认", {
      confirmButtonText: "删除",
      cancelButtonText: "取消",
      type: "warning"
    });
  } catch (error) {
    return;
  }

  deletingId.value = row._id;
  try {
    const result = await callFunction("webAdminDeleteQuestion", { questionId: row._id });
    if (!result || !result.success) throw new Error(result?.message || "删除题目失败");
    ElMessage.success(result.message || "删除成功");
    if (questions.value.length === 1 && page.value > 1) page.value -= 1;
    loadQuestions();
  } catch (error) {
    ElMessage.error(error.message || "删除题目失败");
  } finally {
    deletingId.value = "";
  }
};

onMounted(() => {
  loadQuestions();
});
</script>
