import { Form, redirect, useNavigation } from "react-router";
import { createUserSession, getUserId } from "../core/session.server";
import type { Route } from "./+types/login";
import { verifyLogin } from "../services/user.server";
import { createAuditLog } from "../services/audit.server";

export async function loader({ request }: Route.LoaderArgs) {
  if (await getUserId(request)) {
    return redirect("/dashboard");
  }
}

export async function action({ request }: Route.ActionArgs) {
  let formData = await request.formData();
  let username = formData.get("username") as string;
  let password = formData.get("password") as string;

  const user = await verifyLogin(username, password);
  console.log("Login attempt for user:", username, "Result:", user);
  if (!user) {
    return { error: "Invalid username or password" };
  }

  createAuditLog({
    user_id: parseInt(user.id),
    user_name: user.name,
    action: "登录",
    entity: "用户",
    entity_id: user.id,
    details: "用户登录系统",
  }, request);

  return createUserSession(user.id, "/dashboard");
}
export default function Login({ actionData }: Route.ComponentProps) {
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900 transition-colors duration-200 font-sans">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="mx-auto w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg mb-4">
            <span className="text-white font-bold text-2xl">M</span>
          </div>
          <h2 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
            Material Admin
          </h2>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            企业级数据管理平台
          </p>
        </div>

        <div className="rounded-xl bg-white dark:bg-slate-800 p-8 shadow-sm border border-slate-200 dark:border-slate-700">
          <h3 className="mb-6 text-xl font-semibold text-slate-800 dark:text-white">
            账号登录
          </h3>
          <Form method="post" className="space-y-6">
            {actionData?.error && (
              <div className="rounded-md bg-rose-50 dark:bg-rose-900/20 p-4 text-sm text-rose-600 dark:text-rose-400 border border-rose-100 dark:border-rose-800 flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 mr-2 flex-shrink-0">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
                </svg>
                {actionData.error}
              </div>
            )}
            <div>
              <label
                htmlFor="username"
                className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
              >
                用户名
              </label>
              <input
                type="text"
                name="username"
                id="username"
                placeholder="请输入用户名"
                required
                className="block w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700/50 text-slate-900 dark:text-white px-4 py-2.5 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all sm:text-sm"
              />
            </div>
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
              >
                密码
              </label>
              <input
                type="password"
                name="password"
                id="password"
                placeholder="请输入密码"
                required
                className="block w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700/50 text-slate-900 dark:text-white px-4 py-2.5 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all sm:text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex justify-center rounded-lg border border-transparent bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-70 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? (
                <span className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  登录中...
                </span>
              ) : "登录"}
            </button>
          </Form>
        </div>
        <p className="mt-8 text-center text-xs text-slate-400 dark:text-slate-500">
          &copy; {new Date().getFullYear()} Material Admin System. All rights reserved.
        </p>
      </div>
    </div>
  );
}
