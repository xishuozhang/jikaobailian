<template>
  <el-container class="admin-shell">
    <el-aside width="220px" class="admin-aside">
      <div class="brand">题库后台</div>
      <el-menu
        router
        :default-active="$route.path"
        background-color="#172033"
        text-color="#cbd5e1"
        active-text-color="#ffffff"
      >
        <el-menu-item index="/dashboard">
          <el-icon><DataLine /></el-icon>
          <span>数据概览</span>
        </el-menu-item>
        <el-menu-item index="/questions">
          <el-icon><Document /></el-icon>
          <span>题库管理</span>
        </el-menu-item>
        <el-menu-item index="/questions/import">
          <el-icon><Upload /></el-icon>
          <span>题库导入</span>
        </el-menu-item>
        <el-menu-item index="/users">
          <el-icon><User /></el-icon>
          <span>用户会员</span>
        </el-menu-item>
        <el-menu-item index="/records">
          <el-icon><Tickets /></el-icon>
          <span>学习记录</span>
        </el-menu-item>
      </el-menu>
    </el-aside>

    <el-container>
      <el-header class="admin-header">
        <div class="header-title">中职数字媒体题库管理后台</div>
        <div class="header-actions">
          <span class="admin-name">{{ adminName }}</span>
          <el-button type="primary" plain @click="handleLogout">退出登录</el-button>
        </div>
      </el-header>
      <el-main class="admin-main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { computed } from "vue";
import { useRouter } from "vue-router";
import { DataLine, Document, Tickets, Upload, User } from "@element-plus/icons-vue";
import { callFunction } from "../cloudbase";

const router = useRouter();

const adminUser = computed(() => {
  try {
    return JSON.parse(localStorage.getItem("adminUser") || "{}");
  } catch (error) {
    return {};
  }
});

const adminName = computed(() => adminUser.value.realName || adminUser.value.username || "管理员");

const handleLogout = async () => {
  try {
    await callFunction("adminWebLogout");
  } finally {
    localStorage.removeItem("adminToken");
    localStorage.removeItem("adminUser");
    router.replace("/login");
  }
};
</script>
