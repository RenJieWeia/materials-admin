import { Form, useNavigation } from "react-router";
import type { Route } from "./+types/idle-cleanup";
import { ClockIcon, TrashIcon, WrenchScrewdriverIcon } from "@heroicons/react/24/outline";
import { requireUserId } from "../core/session.server";
import { getUserById } from "../services/user.server";
import {
  cleanupIdleMaterials,
  getIdleCleanupSettings,
  updateIdleCleanupSettings,
} from "../services/material.server";
import { createAuditLog } from "../services/audit.server";

export async function loader({ request }: Route.LoaderArgs) {
  const userId = await requireUserId(request);
  const user = await getUserById(userId);

  if (!user || user.role !== "admin") {
    throw new Response("无权限访问", { status: 403 });
  }

  const cleanupSettings = await getIdleCleanupSettings();
  return { cleanupSettings };
}

export async function action({ request }: Route.ActionArgs) {
  const userId = await requireUserId(request);
  const user = await getUserById(userId);

  if (!user || user.role !== "admin") {
    return { error: "无权限执行此操作" };
  }

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "cleanupIdleNow") {
    const result = await cleanupIdleMaterials();

    createAuditLog(
      {
        user_id: Number(user.id),
        user_name: user.name,
        action: "手动清理空闲账号",
        entity: "材料",
        details: `手动清理完成，删除 ${result.deletedCount} 条空闲账号`,
      },
      request
    );

    return {
      success: true,
      message: `清理完成，已删除 ${result.deletedCount} 条空闲账号`,
    };
  }

  if (intent === "updateCleanupSettings") {
    const enabled = formData.get("enabled") === "on";
    const scheduleTime = (formData.get("scheduleTime") as string) || "";
    const timeMatch = /^([01]\d|2[0-3]):([0-5]\d)$/.test(scheduleTime);

    if (!timeMatch) {
      return { error: "定时时间格式不正确" };
    }

    await updateIdleCleanupSettings({ enabled, scheduleTime });

    createAuditLog(
      {
        user_id: Number(user.id),
        user_name: user.name,
        action: "更新空闲账号清理计划",
        entity: "材料",
        details: `${enabled ? "启用" : "停用"}定时清理，执行时间：${scheduleTime}`,
      },
      request
    );

    return {
      success: true,
      message: enabled
        ? `已启用每日 ${scheduleTime} 定时清理`
        : "已停用定时清理",
    };
  }

  return { error: "未知操作" };
}

export default function IdleCleanupSettingsPage({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { cleanupSettings } = loaderData;
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <div className="p-8 container mx-auto min-h-screen bg-gray-50/50 dark:bg-gray-900 space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-blue-600 rounded-lg shadow-sm">
          <WrenchScrewdriverIcon className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            空闲账号清理设置
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            配置手动清理和每日定时清理空闲状态账号
          </p>
        </div>
      </div>

      {actionData?.success && actionData?.message && (
        <div className="rounded-md bg-emerald-50 dark:bg-emerald-900/20 p-4 text-sm text-emerald-700 dark:text-emerald-200 border border-emerald-100 dark:border-emerald-800">
          {actionData.message}
        </div>
      )}

      {actionData?.error && (
        <div className="rounded-md bg-rose-50 dark:bg-rose-900/20 p-4 text-sm text-rose-700 dark:text-rose-200 border border-rose-100 dark:border-rose-800">
          {actionData.error}
        </div>
      )}

      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 shadow-sm space-y-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">定时清理计划</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            当前状态：{cleanupSettings.enabled ? "已启用" : "未启用"}，上次定时执行：
            {cleanupSettings.lastRunAt || "暂无记录"}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            定时任务每分钟检查一次，到达配置时间后每天只执行一次。
          </p>
        </div>

        <Form method="post" className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <input type="hidden" name="intent" value="updateCleanupSettings" />

          <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
            <input
              type="checkbox"
              name="enabled"
              defaultChecked={cleanupSettings.enabled}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            启用每日定时清理
          </label>

          <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
            <ClockIcon className="w-4 h-4 text-slate-500" />
            执行时间
            <input
              type="time"
              name="scheduleTime"
              defaultValue={cleanupSettings.scheduleTime}
              required
              className="rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700/50 px-2.5 py-1.5 text-sm text-slate-900 dark:text-white"
            />
          </label>

          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center justify-center rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
          >
            保存计划
          </button>
        </Form>
      </div>

      <div className="rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50/40 dark:bg-rose-900/10 p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">手动清理</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          立即删除所有空闲状态账号，删除后不可恢复。
        </p>
        <Form
          method="post"
          className="mt-4"
          onSubmit={(e) => {
            if (!confirm("确定立即清理所有空闲状态账号吗？此操作不可恢复。")) {
              e.preventDefault();
            }
          }}
        >
          <input type="hidden" name="intent" value="cleanupIdleNow" />
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center justify-center rounded-md bg-rose-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-rose-700 disabled:opacity-50"
          >
            <TrashIcon className="w-4 h-4 mr-2" />
            手动立即清理
          </button>
        </Form>
      </div>
    </div>
  );
}
