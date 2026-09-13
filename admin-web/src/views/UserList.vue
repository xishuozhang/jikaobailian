<template>
  <section>
    <div class="page-heading"><h1>用户会员管理</h1></div>

    <el-card class="filter-panel" shadow="never">
      <el-form :model="filters" class="filter-form" label-width="86px">
        <el-row :gutter="16">
          <el-col :xs="24" :md="10">
            <el-form-item label="关键词">
              <el-input v-model.trim="filters.keyword" clearable placeholder="昵称 / openid" @keyup.enter="handleSearch" />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :md="8">
            <el-form-item label="会员状态">
              <el-select v-model="filters.memberStatus" clearable placeholder="全部">
                <el-option label="普通用户" value="normal" />
                <el-option label="有效会员" value="vip" />
                <el-option label="已过期会员" value="expired" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :xs="24" :md="6">
            <div class="filter-actions">
              <el-button type="primary" :loading="loading" @click="handleSearch">查询</el-button>
              <el-button @click="handleReset">重置</el-button>
            </div>
          </el-col>
        </el-row>
      </el-form>
    </el-card>

    <el-alert v-if="errorMessage" class="page-alert" type="error" :title="errorMessage" show-icon :closable="false" />

    <el-card class="table-panel" shadow="never">
      <el-table v-loading="loading" :data="users" row-key="_id" empty-text="暂无用户">
        <el-table-column label="头像" width="72">
          <template #default="{ row }">
            <el-avatar :src="row.avatarUrl" :size="36">{{ (row.nickName || "用").slice(0, 1) }}</el-avatar>
          </template>
        </el-table-column>
        <el-table-column label="昵称" min-width="140">
          <template #default="{ row }">{{ row.nickName || "未命名用户" }}</template>
        </el-table-column>
        <el-table-column label="openid" min-width="180">
          <template #default="{ row }">{{ maskOpenid(row._openid) }}</template>
        </el-table-column>
        <el-table-column label="会员状态" width="110">
          <template #default="{ row }">
            <el-tag :type="statusTag(row.memberStatus)">{{ statusText(row.memberStatus) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="会员到期时间" min-width="160">
          <template #default="{ row }">{{ formatTime(row.memberExpireAt) }}</template>
        </el-table-column>
        <el-table-column label="注册时间" min-width="160">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="230" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="openMemberDialog(row, 'open')">开通</el-button>
            <el-button size="small" @click="openMemberDialog(row, 'renew')">续期</el-button>
            <el-button size="small" type="danger" @click="handleCancelMember(row)">取消</el-button>
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
          @current-change="loadUsers"
        />
      </div>
    </el-card>

    <el-dialog v-model="memberDialogVisible" :title="memberAction === 'open' ? '开通会员' : '续期会员'" width="520px">
      <div v-if="currentUser" class="member-dialog-user">
        <el-avatar :src="currentUser.avatarUrl" :size="42">{{ (currentUser.nickName || "用").slice(0, 1) }}</el-avatar>
        <div>
          <div class="dialog-user-name">{{ currentUser.nickName || "未命名用户" }}</div>
          <div class="dialog-openid">{{ maskOpenid(currentUser._openid) }}</div>
        </div>
      </div>
      <el-form label-width="96px">
        <el-form-item label="快捷天数">
          <el-radio-group v-model="memberForm.days">
            <el-radio-button :label="30">30天</el-radio-button>
            <el-radio-button :label="90">90天</el-radio-button>
            <el-radio-button :label="180">180天</el-radio-button>
            <el-radio-button :label="365">365天</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="指定到期">
          <el-date-picker v-model="memberForm.memberExpireAt" type="datetime" value-format="YYYY-MM-DD HH:mm:ss" placeholder="可选，优先使用指定时间" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="memberDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="updating" @click="submitMemberUpdate">确认</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup>
import { reactive, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { callFunction } from "../cloudbase";

const loading = ref(false);
const updating = ref(false);
const errorMessage = ref("");
const users = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(10);
const memberDialogVisible = ref(false);
const memberAction = ref("open");
const currentUser = ref(null);

const filters = reactive({ keyword: "", memberStatus: "" });
const memberForm = reactive({ days: 30, memberExpireAt: "" });

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

const statusText = (status) => ({ normal: "普通用户", vip: "有效会员", expired: "已过期" }[status] || "普通用户");
const statusTag = (status) => ({ normal: "info", vip: "success", expired: "warning" }[status] || "info");

const loadUsers = async () => {
  loading.value = true;
  errorMessage.value = "";
  try {
    const result = await callFunction("webAdminGetUsers", {
      page: page.value,
      pageSize: pageSize.value,
      keyword: filters.keyword,
      memberStatus: filters.memberStatus
    });
    if (!result || !result.success) throw new Error(result?.message || "获取用户列表失败");
    users.value = result.data?.list || [];
    total.value = result.data?.total || 0;
    page.value = result.data?.page || page.value;
    pageSize.value = result.data?.pageSize || pageSize.value;
  } catch (error) {
    errorMessage.value = error.message || "获取用户列表失败";
    users.value = [];
    total.value = 0;
    ElMessage.error(errorMessage.value);
  } finally {
    loading.value = false;
  }
};

const handleSearch = () => {
  page.value = 1;
  loadUsers();
};

const handleReset = () => {
  filters.keyword = "";
  filters.memberStatus = "";
  page.value = 1;
  loadUsers();
};

const handlePageSizeChange = () => {
  page.value = 1;
  loadUsers();
};

const openMemberDialog = (user, action) => {
  currentUser.value = user;
  memberAction.value = action;
  memberForm.days = 30;
  memberForm.memberExpireAt = "";
  memberDialogVisible.value = true;
};

const submitMemberUpdate = async () => {
  if (!currentUser.value) return;
  updating.value = true;
  try {
    const result = await callFunction("webAdminUpdateMember", {
      targetOpenid: currentUser.value._openid,
      action: memberAction.value,
      days: memberForm.memberExpireAt ? undefined : memberForm.days,
      memberExpireAt: memberForm.memberExpireAt || undefined
    });
    if (!result || !result.success) throw new Error(result?.message || "会员状态更新失败");
    ElMessage.success(result.message || "会员状态已更新");
    memberDialogVisible.value = false;
    loadUsers();
  } catch (error) {
    ElMessage.error(error.message || "会员状态更新失败");
  } finally {
    updating.value = false;
  }
};

const handleCancelMember = async (user) => {
  try {
    await ElMessageBox.confirm("确定取消该用户的会员资格吗？", "取消会员", {
      confirmButtonText: "确认取消",
      cancelButtonText: "返回",
      type: "warning"
    });
  } catch (error) {
    return;
  }
  try {
    const result = await callFunction("webAdminUpdateMember", {
      targetOpenid: user._openid,
      action: "cancel"
    });
    if (!result || !result.success) throw new Error(result?.message || "取消会员失败");
    ElMessage.success(result.message || "已取消会员");
    loadUsers();
  } catch (error) {
    ElMessage.error(error.message || "取消会员失败");
  }
};

loadUsers();
</script>
