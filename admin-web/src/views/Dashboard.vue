<template>
  <section>
    <div class="page-heading page-heading-row">
      <div>
        <h1>数据概览</h1>
      </div>
      <el-button type="primary" :loading="loading" @click="loadStats">
        <el-icon><Refresh /></el-icon>
        <span>刷新数据</span>
      </el-button>
    </div>

    <el-alert
      v-if="errorMessage"
      class="page-alert"
      type="error"
      :title="errorMessage"
      show-icon
      :closable="false"
    />

    <el-row v-loading="loading" :gutter="16">
      <el-col v-for="item in cards" :key="item.key" :xs="24" :sm="12" :lg="8">
        <el-card class="stat-card" shadow="never">
          <div class="stat-label">{{ item.title }}</div>
          <div class="stat-value">{{ formatNumber(stats[item.key]) }}</div>
        </el-card>
      </el-col>
    </el-row>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import { Refresh } from "@element-plus/icons-vue";
import { callFunction } from "../cloudbase";

const loading = ref(false);
const errorMessage = ref("");
const stats = reactive({
  totalUsers: 0,
  vipUsers: 0,
  totalQuestions: 0,
  totalRecords: 0,
  totalWrongRecords: 0,
  todayRecords: 0
});

const cards = computed(() => [
  { key: "totalUsers", title: "总用户数" },
  { key: "vipUsers", title: "会员用户数" },
  { key: "totalQuestions", title: "总题目数" },
  { key: "totalRecords", title: "总练习次数" },
  { key: "totalWrongRecords", title: "总错题数" },
  { key: "todayRecords", title: "今日练习次数" }
]);

const formatNumber = (value) => Number(value || 0).toLocaleString("zh-CN");

const loadStats = async () => {
  loading.value = true;
  errorMessage.value = "";

  try {
    const result = await callFunction("webAdminGetStats");
    if (!result || !result.success) {
      throw new Error(result?.message || "获取数据概览失败");
    }
    Object.assign(stats, result.data || {});
  } catch (error) {
    errorMessage.value = error.message || "获取数据概览失败";
    ElMessage.error(errorMessage.value);
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  loadStats();
});
</script>
