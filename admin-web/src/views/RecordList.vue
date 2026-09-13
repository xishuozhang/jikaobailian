<template>
  <section>
    <div class="page-heading"><h1>学习记录管理</h1></div>

    <el-card class="filter-panel" shadow="never">
      <el-form :model="filters" class="filter-form" label-width="86px">
        <el-row :gutter="16">
          <el-col :xs="24" :md="8">
            <el-form-item label="用户关键词">
              <el-input v-model.trim="filters.keyword" clearable placeholder="openid / 昵称" @keyup.enter="handleSearch" />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :md="6">
            <el-form-item label="练习类型">
              <el-select v-model="filters.practiceType" clearable placeholder="全部">
                <el-option label="随机一练" value="random" />
                <el-option label="分类练习" value="category" />
                <el-option label="模拟考试" value="mock" />
                <el-option label="错题练习" value="wrong" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :xs="24" :md="10">
            <el-form-item label="日期范围">
              <el-date-picker
                v-model="filters.dateRange"
                type="daterange"
                value-format="YYYY-MM-DD"
                start-placeholder="开始日期"
                end-placeholder="结束日期"
              />
            </el-form-item>
          </el-col>
          <el-col :xs="24">
            <div class="filter-actions filter-actions-inline">
              <el-button type="primary" :loading="loading" @click="handleSearch">查询</el-button>
              <el-button @click="handleReset">重置</el-button>
            </div>
          </el-col>
        </el-row>
      </el-form>
    </el-card>

    <el-alert v-if="errorMessage" class="page-alert" type="error" :title="errorMessage" show-icon :closable="false" />

    <el-card class="table-panel" shadow="never">
      <el-table v-loading="loading" :data="records" row-key="_id" empty-text="暂无学习记录">
        <el-table-column label="用户" min-width="180">
          <template #default="{ row }">
            <div class="user-cell">
              <el-avatar :src="row.avatarUrl" :size="32">{{ (row.nickName || "用").slice(0, 1) }}</el-avatar>
              <div>
                <div>{{ row.nickName || "未命名用户" }}</div>
                <div class="muted-text">{{ maskOpenid(row._openid) }}</div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="练习类型" width="110">
          <template #default="{ row }">{{ practiceTypeText(row.practiceType) }}</template>
        </el-table-column>
        <el-table-column prop="category" label="分类" min-width="120" show-overflow-tooltip />
        <el-table-column label="分数" width="90">
          <template #default="{ row }">{{ row.score === "" ? "-" : row.score }}</template>
        </el-table-column>
        <el-table-column label="正确 / 总题数" width="130">
          <template #default="{ row }">{{ row.correctCount || 0 }} / {{ row.total || 0 }}</template>
        </el-table-column>
        <el-table-column label="错误数" width="90">
          <template #default="{ row }">{{ row.wrongCount || 0 }}</template>
        </el-table-column>
        <el-table-column label="用时" width="110">
          <template #default="{ row }">{{ formatDuration(row.duration) }}</template>
        </el-table-column>
        <el-table-column label="完成时间" min-width="160">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="110" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="openDetail(row)">查看详情</el-button>
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
          @current-change="loadRecords"
        />
      </div>
    </el-card>

    <el-dialog v-model="detailVisible" title="学习记录详情" width="860px">
      <div v-if="detail" v-loading="detailLoading">
        <div class="record-detail-summary">
          <div>
            <strong>{{ detail.nickName || "未命名用户" }}</strong>
            <div class="muted-text">{{ maskOpenid(detail._openid) }}</div>
          </div>
          <div>{{ practiceTypeText(detail.practiceType) }}</div>
          <div>分数：{{ detail.score ?? "-" }}</div>
          <div>完成时间：{{ formatTime(detail.createdAt) }}</div>
        </div>

        <el-alert
          v-if="!detailQuestions.length"
          class="page-alert"
          type="info"
          title="该历史记录缺少详细题目快照，仅能查看基础成绩信息。"
          show-icon
          :closable="false"
        />

        <div v-for="(item, index) in detailQuestions" :key="index" class="record-question-card">
          <div class="record-question-title">{{ index + 1 }}. {{ item.title || "未命名题目" }}</div>
          <div class="record-answer-row">
            <span>用户答案：{{ formatAnswer(item.userAnswer) }}</span>
            <span>正确答案：{{ formatAnswer(item.correctAnswer) }}</span>
            <el-tag :type="item.isCorrect ? 'success' : 'danger'" size="small">{{ item.isCorrect ? "正确" : "错误" }}</el-tag>
          </div>
          <div class="record-analysis">解析：{{ item.analysis || "-" }}</div>
        </div>
      </div>
    </el-dialog>
  </section>
</template>

<script setup>
import { computed, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import { callFunction } from "../cloudbase";

const loading = ref(false);
const detailLoading = ref(false);
const errorMessage = ref("");
const records = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(10);
const detailVisible = ref(false);
const detail = ref(null);

const filters = reactive({ keyword: "", practiceType: "", dateRange: [] });

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

const maskOpenid = (openid = "") => {
  if (!openid) return "-";
  if (openid.length <= 12) return `${openid.slice(0, 4)}***`;
  return `${openid.slice(0, 6)}***${openid.slice(-6)}`;
};

const practiceTypeText = (value) => ({
  random: "随机一练",
  category: "分类练习",
  mock: "模拟考试",
  wrong: "错题练习"
}[value] || value || "-");

const formatDuration = (duration) => {
  const seconds = Number(duration || 0);
  if (!seconds) return "-";
  return `${Math.floor(seconds / 60)}分${seconds % 60}秒`;
};

const formatAnswer = (answer) => {
  if (Array.isArray(answer)) return answer.join(",");
  return answer || "-";
};

const detailQuestions = computed(() => {
  const record = detail.value || {};
  if (Array.isArray(record.questionsSnapshot)) {
    return record.questionsSnapshot.map((question, index) => {
      const answerItem = Array.isArray(record.answers) ? record.answers[index] : {};
      return {
        title: question.title,
        userAnswer: answerItem?.selectedAnswer || answerItem?.answer || question.selectedAnswer,
        correctAnswer: question.answer || question.correctAnswer,
        isCorrect: answerItem?.isCorrect ?? question.isCorrect,
        analysis: question.analysis
      };
    });
  }
  if (Array.isArray(record.answers)) {
    return record.answers.map((item) => ({
      title: item.title || item.questionTitle,
      userAnswer: item.selectedAnswer || item.answer,
      correctAnswer: item.correctAnswer,
      isCorrect: item.isCorrect,
      analysis: item.analysis
    }));
  }
  const merged = [];
  if (Array.isArray(record.correctList)) merged.push(...record.correctList.map((item) => ({ ...item, isCorrect: true })));
  if (Array.isArray(record.wrongList)) merged.push(...record.wrongList.map((item) => ({ ...item, isCorrect: false })));
  if (merged.length) {
    return merged.map((item) => ({
      title: item.title || item.questionTitle || item.questionSnapshot?.title,
      userAnswer: item.selectedAnswer || item.answer,
      correctAnswer: item.correctAnswer || item.questionSnapshot?.answer,
      isCorrect: item.isCorrect,
      analysis: item.analysis || item.questionSnapshot?.analysis
    }));
  }
  if (record.questionSnapshot) {
    return [{
      title: record.questionSnapshot.title,
      userAnswer: record.selectedAnswer,
      correctAnswer: record.correctAnswer || record.questionSnapshot.answer,
      isCorrect: record.isCorrect,
      analysis: record.analysis || record.questionSnapshot.analysis
    }];
  }
  return [];
});

const loadRecords = async () => {
  loading.value = true;
  errorMessage.value = "";
  try {
    const result = await callFunction("webAdminGetRecords", {
      page: page.value,
      pageSize: pageSize.value,
      keyword: filters.keyword,
      practiceType: filters.practiceType,
      startDate: filters.dateRange?.[0] || "",
      endDate: filters.dateRange?.[1] || ""
    });
    if (!result || !result.success) throw new Error(result?.message || "获取学习记录失败");
    records.value = result.data?.list || [];
    total.value = result.data?.total || 0;
    page.value = result.data?.page || page.value;
    pageSize.value = result.data?.pageSize || pageSize.value;
  } catch (error) {
    errorMessage.value = error.message || "获取学习记录失败";
    records.value = [];
    total.value = 0;
    ElMessage.error(errorMessage.value);
  } finally {
    loading.value = false;
  }
};

const handleSearch = () => {
  page.value = 1;
  loadRecords();
};

const handleReset = () => {
  filters.keyword = "";
  filters.practiceType = "";
  filters.dateRange = [];
  page.value = 1;
  loadRecords();
};

const handlePageSizeChange = () => {
  page.value = 1;
  loadRecords();
};

const openDetail = async (row) => {
  detailVisible.value = true;
  detailLoading.value = true;
  detail.value = null;
  try {
    const result = await callFunction("webAdminGetRecordDetail", { recordId: row._id });
    if (!result || !result.success) throw new Error(result?.message || "获取学习记录详情失败");
    detail.value = result.data || {};
  } catch (error) {
    ElMessage.error(error.message || "获取学习记录详情失败");
    detailVisible.value = false;
  } finally {
    detailLoading.value = false;
  }
};

loadRecords();
</script>
