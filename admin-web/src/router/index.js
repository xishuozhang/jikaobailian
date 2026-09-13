import { createRouter, createWebHashHistory } from "vue-router";
import { callFunction } from "../cloudbase";
import Login from "../views/Login.vue";
import AdminLayout from "../layout/AdminLayout.vue";
import Dashboard from "../views/Dashboard.vue";
import QuestionForm from "../views/QuestionForm.vue";
import QuestionImport from "../views/QuestionImport.vue";
import QuestionList from "../views/QuestionList.vue";
import RecordList from "../views/RecordList.vue";
import UserList from "../views/UserList.vue";
import NotFound from "../views/NotFound.vue";

const routes = [
  {
    path: "/login",
    name: "Login",
    component: Login
  },
  {
    path: "/",
    component: AdminLayout,
    redirect: "/dashboard",
    children: [
      {
        path: "dashboard",
        name: "Dashboard",
        component: Dashboard
      },
      {
        path: "questions",
        name: "Questions",
        component: QuestionList
      },
      {
        path: "questions/create",
        name: "QuestionCreate",
        component: QuestionForm
      },
      {
        path: "questions/edit/:id",
        name: "QuestionEdit",
        component: QuestionForm
      },
      {
        path: "questions/import",
        name: "QuestionImport",
        component: QuestionImport
      },
      {
        path: "users",
        name: "Users",
        component: UserList
      },
      {
        path: "records",
        name: "Records",
        component: RecordList
      }
    ]
  },
  {
    path: "/:pathMatch(.*)*",
    name: "NotFound",
    component: NotFound
  }
];

const router = createRouter({
  history: createWebHashHistory(),
  routes
});

router.beforeEach(async (to) => {
  const token = localStorage.getItem("adminToken");

  if (to.path === "/login") {
    return true;
  }

  if (!token) {
    return "/login";
  }

  try {
    const result = await callFunction("adminWebCheckSession");
    if (!result || !result.isLogin) {
      localStorage.removeItem("adminToken");
      localStorage.removeItem("adminUser");
      return "/login";
    }
    return true;
  } catch (error) {
    localStorage.removeItem("adminToken");
    localStorage.removeItem("adminUser");
    return "/login";
  }
});

export default router;
