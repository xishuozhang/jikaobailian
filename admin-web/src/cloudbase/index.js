import cloudbase from "@cloudbase/js-sdk";
import { ElMessage } from "element-plus";

const app = cloudbase.init({
  env: "cloud1-d7gmn3sm460d5ad38"
});

const auth = app.auth({
  persistence: "local"
});

let authReadyPromise = null;

async function ensureAuth() {
  if (!authReadyPromise) {
    authReadyPromise = (async () => {
      try {
        const loginState = await auth.getLoginState();
        if (loginState) {
          return loginState;
        }

        const result = await auth.signInAnonymously();
        if (result && result.error) {
          throw result.error;
        }

        return auth.getLoginState();
      } catch (error) {
        error.message = `CloudBase anonymous auth failed: ${error.message || error.errMsg || error.code || "unknown error"}`;
        throw error;
      }
    })();
  }

  return authReadyPromise;
}

function handleInvalidLogin(response) {
  if (response && response.success === false && String(response.message || "").includes("登录已失效")) {
    localStorage.removeItem("adminToken");
    localStorage.removeItem("adminUser");
    ElMessage.error(response.message);
    window.location.hash = "#/login";
  }
}

export async function callFunction(name, data = {}, options = {}) {
  await ensureAuth();

  const token = localStorage.getItem("adminToken");
  const payload = {
    ...data,
    token
  };

  let result;
  try {
    result = await app.callFunction({
      name,
      data: payload
    }, {
      timeout: options.timeout || 15000
    });
  } catch (error) {
    error.message = `CloudBase callFunction(${name}) failed: ${error.message || error.errMsg || error.code || "unknown error"}`;
    throw error;
  }

  const response = result.result;
  handleInvalidLogin(response);
  return response;
}

export async function uploadFile(cloudPath, file) {
  await ensureAuth();
  const result = await app.uploadFile({
    cloudPath,
    filePath: file
  });
  return result.fileID || result.fileId || result.download_url || result.downloadUrl || "";
}

export default app;
