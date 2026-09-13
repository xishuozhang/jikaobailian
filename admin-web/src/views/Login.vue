<template>
  <div class="login-page">
    <el-card class="login-card" shadow="never">
      <div class="login-title">中职数字媒体题库管理后台</div>
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent>
        <el-form-item label="账号" prop="username">
          <el-input v-model.trim="form.username" size="large" autocomplete="username" />
        </el-form-item>
        <el-form-item label="密码" prop="password">
          <el-input
            v-model="form.password"
            size="large"
            type="password"
            autocomplete="current-password"
            show-password
            @keyup.enter="handleLogin"
          />
        </el-form-item>
        <el-button class="login-button" type="primary" size="large" :loading="loading" @click="handleLogin">
          登录
        </el-button>
      </el-form>
    </el-card>
  </div>
</template>

<script setup>
import { reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { callFunction } from "../cloudbase";

const router = useRouter();
const formRef = ref();
const loading = ref(false);

const form = reactive({
  username: "",
  password: ""
});

const rules = {
  username: [{ required: true, message: "请输入账号", trigger: "blur" }],
  password: [{ required: true, message: "请输入密码", trigger: "blur" }]
};

const handleLogin = async () => {
  await formRef.value.validate();
  loading.value = true;

  try {
    const result = await callFunction("adminWebLogin", {
      username: form.username,
      password: form.password
    });

    if (!result || !result.success) {
      ElMessage.error(result?.message || "登录失败");
      return;
    }

    const adminUser = {
      username: result.username,
      role: result.role,
      realName: result.realName
    };

    localStorage.setItem("adminToken", result.token);
    localStorage.setItem("adminUser", JSON.stringify(adminUser));
    router.replace("/dashboard");
  } catch (error) {
    console.error("admin web login failed:", error);
    const message = error?.message || error?.errMsg || error?.code || "未知错误";
    ElMessage.error(`登录请求失败：${message}`);
  } finally {
    loading.value = false;
  }
};
</script>
