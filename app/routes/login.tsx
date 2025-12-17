import { Form, redirect, useNavigation } from "react-router";
import { createUserSession, getUserId } from "./server/session.server";
import type { Route } from "./+types/login";
import { verifyLogin } from "./model/user.server";

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
  return createUserSession(user.id, "/dashboard");
}
export default function Login({ actionData }: Route.ComponentProps) {
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 dark:bg-gray-900 transition-colors duration-200">
      <div className="w-full max-w-md rounded-lg bg-white dark:bg-gray-800 p-8 shadow-md transition-colors duration-200">
        <h3 className="mb-6 text-center text-2xl font-bold text-gray-800 dark:text-white">
          登录
        </h3>
        <Form method="post" className="space-y-6">
          {actionData?.error && (
            <div className="rounded bg-red-50 dark:bg-red-900 p-3 text-sm text-red-600 dark:text-red-200 border border-red-200 dark:border-red-800">
              {actionData.error}
            </div>
          )}
          <div>
            <label
              htmlFor="username"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              用户名
            </label>
            <input
              type="text"
              name="username"
              id="username"
              placeholder="请输入用户名"
              required
              className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:text-sm"
            />
          </div>
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              密码
            </label>
            <input
              type="password"
              name="password"
              id="password"
              placeholder="请输入密码"
              required
              className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full flex justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? "登录中..." : "登录"}
          </button>
        </Form>
      </div>
    </div>
  );
}
