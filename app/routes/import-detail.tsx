import {
  Link,
  useFetcher,
  useLoaderData,
  useNavigate,
} from "react-router";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { Route } from "./+types/import-detail";
import { requireUserId } from "../core/session.server";
import { getUserById } from "../services/user.server";
import {
  getImportBatchById,
  getImportDuplicates,
  getImportDuplicateStats,
  parseDuplicateSnapshot,
  resolveImportBatchDuplicates,
  resolveImportDuplicate,
  type DuplicateResolution,
} from "../services/import.server";
import { createAuditLog } from "../services/audit.server";
import Pagination from "../components/Pagination";
import { DUPLICATE_POLICY_LABELS } from "../types";
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  ClockIcon,
  DocumentArrowUpIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";

type Resolution = Exclude<DuplicateResolution, "pending">;

async function requireAdminUser(request: Request) {
  const userId = await requireUserId(request);
  const user = await getUserById(userId);
  if (!user) throw new Response("User not found", { status: 404 });
  if (user.role !== "admin") {
    throw new Response("Forbidden", { status: 403 });
  }
  return user;
}

const RESOLUTION_STATUS: Record<
  DuplicateResolution,
  { label: string; className: string }
> = {
  pending: {
    label: "待处理",
    className:
      "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  },
  keep_new: {
    label: "已保留新数据",
    className:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  },
  cancel: {
    label: "已取消导入",
    className:
      "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
  },
};

const FILTER_TABS: { key: DuplicateResolution | "all"; label: string }[] = [
  { key: "pending", label: "待处理" },
  { key: "keep_new", label: "已保留新数据" },
  { key: "cancel", label: "已取消导入" },
  { key: "all", label: "全部" },
];

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireAdminUser(request);

  const batchId = Number.parseInt(params.id || "", 10);
  if (!Number.isFinite(batchId)) {
    throw new Response("导入批次无效", { status: 400 });
  }
  const batch = getImportBatchById(batchId);
  if (!batch) {
    throw new Response("导入批次不存在", { status: 404 });
  }

  const stats = getImportDuplicateStats(batchId);
  const url = new URL(request.url);
  // A fully processed batch has nothing to show under "pending"; open "all"
  // instead so "查看记录" still lands on the history.
  const statusParam =
    url.searchParams.get("status") ||
    (stats.pending > 0 ? "pending" : "all");
  const resolution: DuplicateResolution | "all" = [
    "pending",
    "keep_new",
    "cancel",
    "all",
  ].includes(statusParam)
    ? (statusParam as DuplicateResolution | "all")
    : "pending";
  const page = Math.max(
    1,
    Number.parseInt(url.searchParams.get("page") || "1", 10) || 1
  );
  const limit = Math.min(
    100,
    Math.max(
      5,
      Number.parseInt(url.searchParams.get("limit") || "20", 10) || 20
    )
  );

  const data = getImportDuplicates({
    batchId,
    resolution,
    page,
    limit,
  });

  const duplicates = data.duplicates.map((duplicate) => ({
    id: duplicate.id,
    batch_id: duplicate.batch_id,
    row_number: duplicate.row_number,
    game_name: duplicate.game_name,
    account_name: duplicate.account_name,
    description: duplicate.description,
    status: duplicate.status,
    user: duplicate.user,
    usage_time: duplicate.usage_time,
    existing_material_id: duplicate.existing_material_id,
    resolution: duplicate.resolution,
    resolved_material_id: duplicate.resolved_material_id,
    resolved_by_name: duplicate.resolved_by_name,
    resolved_at: duplicate.resolved_at,
    created_at: duplicate.created_at,
    snapshot: parseDuplicateSnapshot(duplicate.existing_snapshot),
  }));

  return {
    batch,
    stats,
    duplicates,
    total: data.total,
    page,
    limit,
    filters: { status: resolution },
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const user = await requireAdminUser(request);
  const batchId = Number.parseInt(params.id || "", 10);
  if (!Number.isFinite(batchId)) {
    return { error: "导入批次无效" };
  }

  const formData = await request.formData();
  const intent = formData.get("intent");
  const rawResolution = formData.get("resolution");
  if (rawResolution !== "keep_new" && rawResolution !== "cancel") {
    return { error: "请选择有效的处理方式" };
  }
  const resolution: Resolution = rawResolution;
  const actor = { id: Number(user.id), name: user.name };

  try {
    if (intent === "resolve_one") {
      const duplicateId = Number(formData.get("duplicateId"));
      if (!Number.isFinite(duplicateId)) {
        return { error: "重复数据 ID 无效" };
      }

      const result = resolveImportDuplicate({
        duplicateId,
        resolution,
        actor,
      });

      createAuditLog(
        {
          user_id: actor.id,
          user_name: actor.name,
          action: "处理导入重复数据",
          entity: "导入批次",
          entity_id: result.batchId.toString(),
          details:
            resolution === "keep_new"
              ? `保留账户「${result.accountName}」的新数据，原数据标记为失效（重复记录 #${result.duplicateId}）`
              : `取消账户「${result.accountName}」的重复导入（重复记录 #${result.duplicateId}）`,
        },
        request
      );

      return {
        success: true,
        message:
          resolution === "keep_new"
            ? `已保留账户「${result.accountName}」的新数据，原数据已标记为失效`
            : `已取消账户「${result.accountName}」的重复导入`,
      };
    }

    if (intent === "resolve_batch") {
      // Resolve in short transactions and yield between them. A single
      // all-or-nothing transaction over tens of thousands of duplicates used
      // to block every other request (and SQLite writer) for minutes.
      const RESOLVE_CHUNK = 200;
      const RESOLVE_PER_REQUEST = 1200;

      let processed = 0;
      let inserted = 0;
      let remaining = getImportDuplicateStats(batchId).pending;

      if (remaining === 0) {
        return {
          success: true,
          processed: 0,
          inserted: 0,
          remaining: 0,
          message: "该导入没有待处理的重复数据",
        };
      }

      while (remaining > 0 && processed < RESOLVE_PER_REQUEST) {
        const result = resolveImportBatchDuplicates({
          batchId,
          resolution,
          actor,
          limit: Math.min(RESOLVE_CHUNK, RESOLVE_PER_REQUEST - processed),
        });
        processed += result.processed;
        inserted += result.inserted;
        remaining = result.remaining;

        if (remaining > 0 && processed < RESOLVE_PER_REQUEST) {
          // Let pending HTTP requests, page loads and static assets run
          // between two duplicate-resolution transactions.
          await new Promise<void>((resolve) => setImmediate(resolve));
        }
      }

      createAuditLog(
        {
          user_id: actor.id,
          user_name: actor.name,
          action: "批量处理导入重复数据",
          entity: "导入批次",
          entity_id: batchId.toString(),
          details:
            (resolution === "keep_new"
              ? `批量保留新数据 ${processed} 条，原数据标记为失效`
              : `批量取消重复导入 ${processed} 条`) +
            (remaining > 0 ? `，剩余 ${remaining} 条待继续处理` : ""),
        },
        request
      );

      return {
        success: true,
        processed,
        inserted,
        remaining,
        message:
          remaining > 0
            ? `已处理 ${processed} 条重复数据，剩余 ${remaining} 条，正在继续处理…`
            : resolution === "keep_new"
              ? `已批量保留 ${processed} 条新数据，原数据已标记为失效`
              : `已批量取消 ${processed} 条重复导入`,
      };
    }
  } catch (error) {
    return { error: (error as Error).message };
  }

  return { error: "未知操作" };
}

function FieldRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string | null | undefined;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 py-1.5 last:border-0 dark:border-slate-700/60">
      <dt className="flex-shrink-0 text-[11px] text-slate-500 dark:text-slate-400">
        {label}
      </dt>
      <dd
        className={`min-w-0 break-all text-right text-xs ${
          highlight
            ? "font-semibold text-amber-700 dark:text-amber-400"
            : "text-slate-700 dark:text-slate-200"
        }`}
      >
        {value === null || value === undefined || value === "" ? "-" : value}
      </dd>
    </div>
  );
}

export default function ImportDetailPage({
  loaderData,
}: Route.ComponentProps) {
  const { batch, stats, duplicates, total, page, limit, filters } = loaderData;
  const navigate = useNavigate();
  const fetcher = useFetcher<{
    success?: boolean;
    message?: string;
    error?: string;
    remaining?: number;
    processed?: number;
  }>();
  const batchResolutionRef = useRef<Resolution | null>(null);
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    if (!fetcher.data) return;
    if (fetcher.data.error) {
      batchResolutionRef.current = null;
      setToast({ type: "error", message: fetcher.data.error });
    } else if (fetcher.data.success) {
      setToast({
        type: "success",
        message: fetcher.data.message || "处理完成",
      });

      // The action handles a bounded number of rows per request so it can
      // yield to other traffic; keep going until the batch is fully resolved.
      if ((fetcher.data.remaining ?? 0) > 0 && batchResolutionRef.current) {
        fetcher.submit(
          {
            intent: "resolve_batch",
            resolution: batchResolutionRef.current,
          },
          { method: "post" }
        );
      } else {
        batchResolutionRef.current = null;
      }
    }
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [fetcher.data]);

  const confirmResolution = (event: FormEvent<HTMLFormElement>) => {
    const submitter = (event.nativeEvent as SubmitEvent)
      .submitter as HTMLButtonElement | null;
    const resolution = submitter?.value;
    const account = submitter?.dataset.account;
    const count = submitter?.dataset.count;
    const message =
      resolution === "keep_new"
        ? account
          ? `确定保留账户「${account}」的新数据？原数据会被标记为失效。`
          : `确定保留本批次全部 ${count} 条重复数据的新数据？原数据会被标记为失效。`
        : account
        ? `确定取消账户「${account}」的重复导入？原数据保持不变。`
        : `确定取消本批次全部 ${count} 条重复导入？原数据保持不变。`;
    if (!window.confirm(message)) {
      event.preventDefault();
      batchResolutionRef.current = null;
      return;
    }

    // Remember which policy the batch form used so the fetcher effect can
    // automatically continue with the remaining rows.
    const intent = submitter?.form?.querySelector<HTMLInputElement>(
      'input[name="intent"]'
    )?.value;
    if (
      intent === "resolve_batch" &&
      (resolution === "keep_new" || resolution === "cancel")
    ) {
      batchResolutionRef.current = resolution;
    }
  };

  const isImporting = batch.status === "importing";
  const canResolve = !isImporting && stats.pending > 0;

  return (
    <div className="p-6 container mx-auto min-h-screen space-y-6 bg-gray-50/50 text-slate-800 dark:bg-gray-900 dark:text-slate-200">
      <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-700 sm:flex-row sm:items-start">
        <div>
          <Link
            to="/imports"
            className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-slate-500 transition-colors hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400"
          >
            <ArrowLeftIcon className="h-3.5 w-3.5" />
            返回导入管理
          </Link>
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-blue-600 p-2 shadow-sm">
              <DocumentArrowUpIcon className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                {batch.file_name || "未命名导入"}
              </h1>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                批次 #{batch.id} · {batch.user_name} · {batch.created_at}
                {batch.completed_at ? ` · 完成于 ${batch.completed_at}` : ""}
              </p>
              <p className="mt-1 inline-flex rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                重复策略：{DUPLICATE_POLICY_LABELS[batch.duplicate_policy]}
              </p>
            </div>
          </div>
        </div>
        <span
          className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-medium ${
            isImporting
              ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
              : batch.status === "cancelled"
              ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
              : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
          }`}
        >
          {isImporting
            ? "导入中"
            : batch.status === "cancelled"
            ? "已取消"
            : "已完成"}
        </span>
      </div>

      {isImporting && (
        <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
          <ClockIcon className="mt-0.5 h-4 w-4 flex-shrink-0" />
          导入仍在进行中。完成后才能处理重复数据，当前不会被中断。
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {[
          { label: "总行数", value: batch.total_rows, tone: "text-slate-900 dark:text-white" },
          { label: "直接导入", value: batch.imported_count, tone: "text-emerald-600 dark:text-emerald-400" },
          { label: "重复隔离", value: batch.duplicate_count, tone: "text-amber-600 dark:text-amber-400" },
          { label: "已保留新数据", value: stats.kept_new, tone: "text-emerald-600 dark:text-emerald-400" },
          { label: "待处理", value: stats.pending, tone: "text-rose-600 dark:text-rose-400" },
          { label: "异常数据", value: batch.invalid_status_count + batch.invalid_user_count, tone: "text-slate-600 dark:text-slate-300" },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800"
          >
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {item.label}
            </p>
            <p className={`mt-1 text-2xl font-bold tabular-nums ${item.tone}`}>
              {item.value.toLocaleString()}
            </p>
          </div>
        ))}
      </div>

      {canResolve && (
        <div className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-800 dark:bg-amber-900/10 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
              还有 {stats.pending} 条重复数据待确认
            </p>
            <p className="mt-0.5 text-xs text-amber-700/80 dark:text-amber-400/80">
              可以逐条处理，也可以将本批次所有待处理重复数据一次性处理。
            </p>
          </div>
          <fetcher.Form
            method="post"
            onSubmit={confirmResolution}
            className="flex flex-wrap items-center gap-2"
          >
            <input type="hidden" name="intent" value="resolve_batch" />
            <button
              type="submit"
              name="resolution"
              value="keep_new"
              data-count={stats.pending}
              disabled={fetcher.state !== "idle"}
              className="rounded-md bg-emerald-600 px-3 py-2 text-xs font-medium text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-50"
            >
              全部保留新数据
            </button>
            <button
              type="submit"
              name="resolution"
              value="cancel"
              data-count={stats.pending}
              disabled={fetcher.state !== "idle"}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              全部取消导入
            </button>
          </fetcher.Form>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex flex-wrap items-center gap-1.5">
        {FILTER_TABS.map((tab) => {
          const count =
            tab.key === "all"
              ? stats.total
              : tab.key === "pending"
              ? stats.pending
              : tab.key === "keep_new"
              ? stats.kept_new
              : stats.cancelled;
          const active = filters.status === tab.key;
          return (
            <Link
              key={tab.key}
              to={`/imports/${batch.id}?status=${tab.key}&page=1&limit=${limit}`}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? "bg-blue-600 text-white"
                  : "bg-white text-slate-600 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              }`}
            >
              {tab.label}（{count}）
            </Link>
          );
        })}
      </div>

      {/* Duplicate list */}
      {duplicates.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white px-6 py-16 text-center shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <CheckCircleIcon className="mx-auto mb-3 h-12 w-12 text-emerald-300 dark:text-emerald-700" />
          <p className="text-sm text-slate-500 dark:text-slate-400">
            当前筛选下没有重复数据
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {duplicates.map((duplicate) => {
            const snapshot = duplicate.snapshot;
            const meta = RESOLUTION_STATUS[duplicate.resolution];
            const fields = [
              {
                label: "游戏名称",
                newValue: duplicate.game_name,
                oldValue: snapshot.game_name,
              },
              {
                label: "账户名称",
                newValue: duplicate.account_name,
                oldValue: snapshot.account_name,
              },
              {
                label: "描述",
                newValue: duplicate.description,
                oldValue: snapshot.description,
              },
              {
                label: "使用状态",
                newValue: duplicate.status,
                oldValue: snapshot.status,
              },
              {
                label: "使用人",
                newValue: duplicate.user,
                oldValue: snapshot.user,
              },
              {
                label: "使用时间",
                newValue: duplicate.usage_time,
                oldValue: snapshot.usage_time,
              },
            ];

            return (
              <div
                key={duplicate.id}
                className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800"
              >
                <div className="flex flex-col gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-700 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900 dark:text-white">
                      {duplicate.account_name}
                    </span>
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                      导入第 {duplicate.row_number} 行
                    </span>
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${meta.className}`}
                    >
                      {meta.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {duplicate.existing_material_id && (
                      <span className="text-[11px] text-slate-400 dark:text-slate-500">
                        重复对象：材料 #{duplicate.existing_material_id}
                      </span>
                    )}
                    {duplicate.resolution === "pending" && !isImporting && (
                      <fetcher.Form
                        method="post"
                        onSubmit={confirmResolution}
                        className="flex flex-wrap items-center gap-2"
                      >
                        <input type="hidden" name="intent" value="resolve_one" />
                        <input
                          type="hidden"
                          name="duplicateId"
                          value={duplicate.id}
                        />
                        <button
                          type="submit"
                          name="resolution"
                          value="keep_new"
                          data-account={duplicate.account_name}
                          disabled={fetcher.state !== "idle"}
                          className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-50"
                        >
                          保留新数据
                        </button>
                        <button
                          type="submit"
                          name="resolution"
                          value="cancel"
                          data-account={duplicate.account_name}
                          disabled={fetcher.state !== "idle"}
                          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                        >
                          取消导入
                        </button>
                      </fetcher.Form>
                    )}
                  </div>
                </div>

                <div className="grid gap-3 p-4 lg:grid-cols-2">
                  <div className="rounded-md border border-blue-200 bg-blue-50/50 p-3 dark:border-blue-800 dark:bg-blue-900/10">
                    <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-blue-800 dark:text-blue-300">
                      <DocumentArrowUpIcon className="h-4 w-4" />
                      本次导入的新数据
                    </p>
                    <dl>
                      {fields.map((field) => (
                        <FieldRow
                          key={field.label}
                          label={field.label}
                          value={field.newValue}
                          highlight={
                            String(field.newValue ?? "") !==
                            String(field.oldValue ?? "")
                          }
                        />
                      ))}
                    </dl>
                  </div>

                  <div className="rounded-md border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-800 dark:bg-amber-900/10">
                    <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
                      <ExclamationTriangleIcon className="h-4 w-4" />
                      已存在的重复数据
                    </p>
                    <p className="mb-2 text-[11px] text-slate-500 dark:text-slate-400">
                      判定依据：账户名称相同 ·{" "}
                      {snapshot.source === "import"
                        ? `本批次第 ${snapshot.row_number ?? "?"} 行（本次已导入）`
                        : `材料 #${snapshot.id ?? "?"}${
                            snapshot.created_at
                              ? ` · 创建于 ${snapshot.created_at}`
                              : ""
                          }`}
                    </p>
                    <dl>
                      {fields.map((field) => (
                        <FieldRow
                          key={field.label}
                          label={field.label}
                          value={field.oldValue}
                        />
                      ))}
                    </dl>
                  </div>
                </div>

                {duplicate.resolution !== "pending" && (
                  <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 bg-slate-50/70 px-4 py-2.5 text-[11px] text-slate-500 dark:border-slate-700 dark:bg-slate-700/30 dark:text-slate-400">
                    {duplicate.resolution === "keep_new" ? (
                      <CheckCircleIcon className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <XCircleIcon className="h-3.5 w-3.5 text-slate-400" />
                    )}
                    <span>
                      {batch.duplicate_policy !== "manual"
                        ? "按导入策略自动处理："
                        : ""}
                      {duplicate.resolution === "keep_new"
                        ? `已保留新数据${
                            duplicate.resolved_material_id
                              ? `，新材料 #${duplicate.resolved_material_id}`
                              : ""
                          }`
                        : "已取消导入该条数据"}
                    </span>
                    <span>·</span>
                    <span>{duplicate.resolved_by_name || "未知操作人"}</span>
                    <span>·</span>
                    <span>{duplicate.resolved_at || duplicate.created_at}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Pagination
        total={total}
        page={page}
        limit={limit}
        onPageChange={(nextPage) => {
          navigate(
            `/imports/${batch.id}?status=${filters.status}&page=${nextPage}&limit=${limit}`
          );
        }}
        onLimitChange={(nextLimit) => {
          navigate(
            `/imports/${batch.id}?status=${filters.status}&page=1&limit=${nextLimit}`
          );
        }}
      />

      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex max-w-sm items-start gap-2 rounded-lg px-5 py-3 text-sm text-white shadow-xl ${
            toast.type === "success" ? "bg-emerald-600" : "bg-rose-600"
          }`}
        >
          {toast.type === "success" ? (
            <CheckCircleIcon className="mt-0.5 h-4 w-4 flex-shrink-0" />
          ) : (
            <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 flex-shrink-0" />
          )}
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}
