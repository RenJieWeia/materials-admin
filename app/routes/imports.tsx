import {
  Form,
  Link,
  useLoaderData,
  useSearchParams,
} from "react-router";
import type { Route } from "./+types/imports";
import { requireUserId } from "../core/session.server";
import { getUserById } from "../services/user.server";
import {
  getImportBatches,
  getImportOverview,
} from "../services/import.server";
import Pagination from "../components/Pagination";
import { DUPLICATE_POLICY_LABELS } from "../types";
import {
  ArrowPathIcon,
  CheckCircleIcon,
  DocumentArrowUpIcon,
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";

export async function loader({ request }: Route.LoaderArgs) {
  const userId = await requireUserId(request);
  const user = await getUserById(userId);
  if (!user) throw new Response("User not found", { status: 404 });
  if (user.role !== "admin") {
    throw new Response("Forbidden", { status: 403 });
  }

  const url = new URL(request.url);
  const page = Math.max(
    1,
    Number.parseInt(url.searchParams.get("page") || "1", 10) || 1
  );
  const limit = Math.min(
    100,
    Math.max(
      5,
      Number.parseInt(url.searchParams.get("limit") || "15", 10) || 15
    )
  );
  const pendingOnly = url.searchParams.get("pending") === "1";
  const search = (url.searchParams.get("search") || "").trim();

  const data = getImportBatches({
    page,
    limit,
    pendingOnly,
    search,
  });
  const overview = getImportOverview();

  return {
    ...data,
    overview,
    filters: { pendingOnly, search },
  };
}

const BATCH_STATUS: Record<
  string,
  { label: string; className: string }
> = {
  completed: {
    label: "已完成",
    className:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  },
  importing: {
    label: "导入中",
    className:
      "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  },
  cancelled: {
    label: "已取消",
    className:
      "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  },
};

export default function ImportsPage({ loaderData }: Route.ComponentProps) {
  const {
    batches,
    total,
    page,
    limit,
    overview,
    filters,
  } = loaderData;
  const [, setSearchParams] = useSearchParams();

  const pendingPercent =
    overview.duplicates > 0
      ? Math.round((overview.pending / overview.duplicates) * 100)
      : 0;

  return (
    <div className="p-6 container mx-auto min-h-screen space-y-6 bg-gray-50/50 text-slate-800 dark:bg-gray-900 dark:text-slate-200">
      <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-700 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-blue-600 p-2 shadow-sm">
            <DocumentArrowUpIcon className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
              导入管理
            </h1>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              查看所有 Excel 导入记录，并处理被隔离的重复数据
            </p>
          </div>
        </div>
        <Link
          to="/materials"
          className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          返回材料管理
        </Link>
      </div>

      {/* Overview */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            导入批次
          </p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            {overview.batches.toLocaleString()}
          </p>
          <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
            累计 {overview.total_rows.toLocaleString()} 行数据
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            直接导入
          </p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
            {overview.imported_rows.toLocaleString()}
          </p>
          <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
            另有 {overview.kept_new.toLocaleString()} 条重复数据已确认保留
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            隔离重复数据
          </p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400">
            {overview.duplicates.toLocaleString()}
          </p>
          <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
            已保留 {overview.kept_new.toLocaleString()} · 已取消{" "}
            {overview.cancelled.toLocaleString()}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            待人工处理
          </p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-rose-600 dark:text-rose-400">
            {overview.pending.toLocaleString()}
          </p>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-600">
            <div
              className="h-full rounded-full bg-rose-500"
              style={{ width: `${pendingPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <Form method="get" className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label
              htmlFor="search"
              className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300"
            >
              文件名
            </label>
            <input
              id="search"
              name="search"
              defaultValue={filters.search}
              placeholder="搜索导入文件名..."
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-700/50 dark:text-white"
            />
          </div>
          <div>
            <label
              htmlFor="pending"
              className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300"
            >
              处理状态
            </label>
            <select
              id="pending"
              name="pending"
              defaultValue={filters.pendingOnly ? "1" : ""}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-700/50 dark:text-white"
            >
              <option value="">全部导入</option>
              <option value="1">仅看有未处理重复</option>
            </select>
          </div>
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
          >
            <MagnifyingGlassIcon className="mr-2 h-4 w-4" />
            查询
          </button>
          <Link
            to="/imports"
            className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <ArrowPathIcon className="mr-2 h-4 w-4" />
            重置
          </Link>
        </Form>
      </div>

      {/* Batch list */}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
            <thead className="bg-slate-50 dark:bg-slate-700/50">
              <tr>
                {[
                  "导入时间",
                  "文件名",
                  "操作人",
                  "状态",
                  "总行数",
                  "直接导入",
                  "重复隔离",
                  "待处理",
                  "操作",
                ].map((header) => (
                  <th
                    key={header}
                    scope="col"
                    className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-700 dark:bg-slate-800">
              {batches.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-6 py-14 text-center text-sm text-slate-500 dark:text-slate-400"
                  >
                    <DocumentArrowUpIcon className="mx-auto mb-3 h-12 w-12 text-slate-300 dark:text-slate-600" />
                    暂无导入记录
                  </td>
                </tr>
              ) : (
                batches.map((batch) => {
                  const meta =
                    BATCH_STATUS[batch.status] ?? BATCH_STATUS.completed;
                  return (
                    <tr
                      key={batch.id}
                      className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/50"
                    >
                      <td className="whitespace-nowrap px-4 py-4 text-xs text-slate-500 dark:text-slate-400">
                        {batch.created_at}
                      </td>
                      <td className="max-w-[240px] px-4 py-4">
                        <Link
                          to={`/imports/${batch.id}`}
                          className="block truncate text-sm font-medium text-slate-900 hover:text-blue-600 dark:text-white dark:hover:text-blue-400"
                          title={batch.file_name || "未命名导入"}
                        >
                          {batch.file_name || "未命名导入"}
                        </Link>
                        <span className="text-[11px] text-slate-400 dark:text-slate-500">
                          批次 #{batch.id} ·{" "}
                          {DUPLICATE_POLICY_LABELS[batch.duplicate_policy]}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-600 dark:text-slate-300">
                        {batch.user_name}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${meta.className}`}
                        >
                          {meta.label}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-sm tabular-nums text-slate-600 dark:text-slate-300">
                        {batch.total_rows.toLocaleString()}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-sm tabular-nums text-emerald-600 dark:text-emerald-400">
                        {batch.imported_count.toLocaleString()}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-sm tabular-nums text-amber-600 dark:text-amber-400">
                        {batch.duplicate_count.toLocaleString()}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4">
                        {batch.pending_count > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-medium text-rose-700 dark:bg-rose-900/30 dark:text-rose-400">
                            <ExclamationTriangleIcon className="h-3.5 w-3.5" />
                            {batch.pending_count}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                            <CheckCircleIcon className="h-3.5 w-3.5" />
                            已处理
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-sm">
                        <Link
                          to={`/imports/${batch.id}`}
                          className="font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                        >
                          {batch.pending_count > 0 ? "查看并处理" : "查看记录"}
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Pagination
        total={total}
        page={page}
        limit={limit}
        onPageChange={(nextPage) => {
          setSearchParams((prev) => {
            prev.set("page", nextPage.toString());
            return prev;
          });
        }}
        onLimitChange={(nextLimit) => {
          setSearchParams((prev) => {
            prev.set("limit", nextLimit.toString());
            prev.set("page", "1");
            return prev;
          });
        }}
      />
    </div>
  );
}
