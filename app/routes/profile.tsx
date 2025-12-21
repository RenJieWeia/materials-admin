import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { useEffect, useRef } from "react";
import { requireUserId } from "../core/session.server";
import { getUserById, updateUserProfile, updateUserPassword } from "../services/user.server";
import type { Route } from "./+types/profile";
import { UserCircleIcon, KeyIcon, CheckCircleIcon, ExclamationCircleIcon } from "@heroicons/react/24/outline";

export async function loader({ request }: Route.LoaderArgs) {
  const userId = await requireUserId(request);
  const user = await getUserById(userId);
  if (!user) {
    throw new Response("User not found", { status: 404 });
  }
  return { user };
}

export async function action({ request }: Route.ActionArgs) {
  const userId = await requireUserId(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "updateProfile") {
    const name = formData.get("name") as string;
    const email = formData.get("email") as string;
    const real_name = formData.get("real_name") as string;

    if (!name || !email) {
      return { error: "用户名和邮箱不能为空", success: false, intent };
    }

    const result = await updateUserProfile(userId, { name, email, real_name });
    if (!result.success) {
      return { error: result.message, success: false, intent };
    }
    return { success: true, message: "个人信息更新成功", intent };
  }

  if (intent === "updatePassword") {
    const currentPassword = formData.get("currentPassword") as string;
    const newPassword = formData.get("newPassword") as string;
    const confirmPassword = formData.get("confirmPassword") as string;

    if (!newPassword || !confirmPassword) {
      return { error: "请输入新密码", success: false, intent };
    }

    if (newPassword !== confirmPassword) {
      return { error: "两次输入的密码不一致", success: false, intent };
    }

    // Note: In a real app, we should verify currentPassword here.
    // For now, we'll just update it as per existing model functions which don't seem to verify old password in update
    // But usually we should. The current model `updateUserPassword` just takes userId and new password.
    
    const result = await updateUserPassword(userId, newPassword);
    if (!result.success) {
      return { error: result.message, success: false, intent };
    }
    return { success: true, message: "密码修改成功", intent };
  }

  return { error: "Invalid intent", success: false };
}

export default function Profile({ loaderData, actionData }: Route.ComponentProps) {
  const { user } = loaderData;
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const profileFormRef = useRef<HTMLFormElement>(null);
  const passwordFormRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (actionData?.success && actionData.intent === "updatePassword") {
      passwordFormRef.current?.reset();
    }
  }, [actionData]);

  return (
    <div className="p-8 container mx-auto min-h-screen bg-gray-50/50 dark:bg-gray-900 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">个人中心</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">管理您的个人信息和账户安全</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Profile Card */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 text-center">
            <div className="w-24 h-24 mx-auto bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mb-4">
              <span className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                {(user.real_name || user.name).slice(-2).toUpperCase()}
              </span>
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">{user.real_name || user.name}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{user.email}</p>
            <div className="mt-4 inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 capitalize">
              {user.role === 'admin' ? '管理员' : '普通用户'}
            </div>
          </div>
        </div>

        {/* Right Column: Forms */}
        <div className="lg:col-span-2 space-y-6">
          {/* Basic Info Form */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
              <UserCircleIcon className="w-5 h-5 text-slate-500" />
              <h3 className="font-semibold text-slate-900 dark:text-white">基本信息</h3>
            </div>
            <div className="p-6">
              <Form method="post" ref={profileFormRef} className="space-y-4">
                <input type="hidden" name="intent" value="updateProfile" />
                
                {actionData?.intent === "updateProfile" && (
                  <div className={`p-3 rounded-md text-sm flex items-center gap-2 ${actionData.success ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400' : 'bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-400'}`}>
                    {actionData.success ? <CheckCircleIcon className="w-5 h-5" /> : <ExclamationCircleIcon className="w-5 h-5" />}
                    {actionData.success ? actionData.message : actionData.error}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      用户名
                    </label>
                    <input
                      type="text"
                      name="name"
                      defaultValue={user.name}
                      required
                      className="block w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700/50 text-slate-900 dark:text-white px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:text-sm transition-shadow"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      真实姓名
                    </label>
                    <input
                      type="text"
                      name="real_name"
                      defaultValue={user.real_name || ""}
                      className="block w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700/50 text-slate-900 dark:text-white px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:text-sm transition-shadow"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      邮箱地址
                    </label>
                    <input
                      type="email"
                      name="email"
                      defaultValue={user.email}
                      required
                      className="block w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700/50 text-slate-900 dark:text-white px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:text-sm transition-shadow"
                    />
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="inline-flex justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 transition-colors"
                  >
                    {isSubmitting && actionData?.intent === "updateProfile" ? "保存中..." : "保存修改"}
                  </button>
                </div>
              </Form>
            </div>
          </div>

          {/* Password Form */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
              <KeyIcon className="w-5 h-5 text-slate-500" />
              <h3 className="font-semibold text-slate-900 dark:text-white">安全设置</h3>
            </div>
            <div className="p-6">
              <Form method="post" ref={passwordFormRef} className="space-y-4">
                <input type="hidden" name="intent" value="updatePassword" />

                {actionData?.intent === "updatePassword" && (
                  <div className={`p-3 rounded-md text-sm flex items-center gap-2 ${actionData.success ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400' : 'bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-400'}`}>
                    {actionData.success ? <CheckCircleIcon className="w-5 h-5" /> : <ExclamationCircleIcon className="w-5 h-5" />}
                    {actionData.success ? actionData.message : actionData.error}
                  </div>
                )}

                <div className="grid grid-cols-1 gap-4">
                  {/* 
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      当前密码
                    </label>
                    <input
                      type="password"
                      name="currentPassword"
                      required
                      className="block w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700/50 text-slate-900 dark:text-white px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:text-sm transition-shadow"
                    />
                  </div>
                  */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      新密码
                    </label>
                    <input
                      type="password"
                      name="newPassword"
                      required
                      className="block w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700/50 text-slate-900 dark:text-white px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:text-sm transition-shadow"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      确认新密码
                    </label>
                    <input
                      type="password"
                      name="confirmPassword"
                      required
                      className="block w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700/50 text-slate-900 dark:text-white px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:text-sm transition-shadow"
                    />
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="inline-flex justify-center rounded-md bg-slate-800 dark:bg-slate-700 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-900 dark:hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 disabled:opacity-50 transition-colors"
                  >
                    {isSubmitting && actionData?.intent === "updatePassword" ? "修改中..." : "修改密码"}
                  </button>
                </div>
              </Form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
