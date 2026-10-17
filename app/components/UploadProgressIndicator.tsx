import { Link } from "react-router";
import { useUploadProgress } from "./UploadProgressContext";
import { DUPLICATE_POLICY_LABELS } from "../types";
import { DocumentArrowUpIcon, XMarkIcon, ChevronDownIcon, ChevronUpIcon } from "@heroicons/react/24/outline";

export default function UploadProgressIndicator() {
  const { state, cancelUpload, dismiss, toggleMinimize } = useUploadProgress();

  if (state.status === "idle") return null;

  const percent =
    state.totalRows > 0
      ? Math.round((state.processedRows / state.totalRows) * 100)
      : 0;

  const isDone = state.status === "done";
  const isError = state.status === "error";
  const isUploading = state.status === "uploading";

  // Build summary message
  let summary = "";
  if (isDone || isError) {
    const r = state.result;
    summary = `成功导入 ${r.count} 条`;
    if (r.duplicateCount > 0) {
      summary += `，重复数据 ${r.duplicateCount} 条`;
      if (state.duplicatePolicy === "keep_new") {
        summary += `（${DUPLICATE_POLICY_LABELS.keep_new} ${r.autoKeptCount} 条）`;
      } else if (state.duplicatePolicy === "cancel") {
        summary += `（${DUPLICATE_POLICY_LABELS.cancel} ${r.autoCancelledCount} 条）`;
      } else {
        summary += `（已隔离待处理）`;
      }
      if (r.duplicateAccounts.length > 0) {
        summary += ` (${r.duplicateAccounts.join(", ")}${
          r.duplicateCount > 3 ? " 等" : ""
        })`;
      }
    }
    if (r.invalidStatusCount > 0) {
      summary += `，${r.invalidStatusCount} 条状态异常`;
    }
    if (r.invalidUserCount > 0) {
      summary += `，${r.invalidUserCount} 条使用人异常`;
    }
    if (state.error) {
      summary += `。${state.error}`;
    }
  }

  // Minimized view
  if (state.minimized) {
    return (
      <div
        onClick={toggleMinimize}
        className="fixed bottom-6 right-6 z-[100] flex items-center gap-2 rounded-full px-4 py-2.5 shadow-lg cursor-pointer
          bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700
          hover:shadow-xl transition-shadow"
      >
        <DocumentArrowUpIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
        {isUploading && (
          <>
            <div className="w-20 h-1.5 bg-slate-200 dark:bg-slate-600 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-600 rounded-full transition-all duration-300"
                style={{ width: `${percent}%` }}
              />
            </div>
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
              {percent}%
            </span>
          </>
        )}
        {isDone && (
          <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">完成</span>
        )}
        {isError && (
          <span className="text-xs font-medium text-rose-600 dark:text-rose-400">异常</span>
        )}
        <ChevronUpIcon className="w-3.5 h-3.5 text-slate-400" />
      </div>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-[100] w-96 rounded-lg shadow-2xl border
      bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700
      overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-600">
        <div className="flex items-center gap-2">
          <DocumentArrowUpIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          <span className="text-sm font-semibold text-slate-800 dark:text-white">
            {isUploading ? "正在导入数据..." : isDone ? "导入完成" : "导入异常"}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={toggleMinimize}
            className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-500 dark:text-slate-400 transition-colors"
            title="最小化"
          >
            <ChevronDownIcon className="w-4 h-4" />
          </button>
          {(isDone || isError) && (
            <button
              onClick={dismiss}
              className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-500 dark:text-slate-400 transition-colors"
              title="关闭"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="px-4 py-3 space-y-3">
        {/* Progress bar */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {state.processedRows.toLocaleString()} / {state.totalRows.toLocaleString()} 条
            </span>
            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
              {percent}%
            </span>
          </div>
          <div className="w-full h-2 bg-slate-200 dark:bg-slate-600 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                isError
                  ? "bg-rose-500"
                  : isDone
                  ? "bg-emerald-500"
                  : "bg-blue-600"
              }`}
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>

        {/* Chunk info */}
        {isUploading && (
          <div className="text-xs text-slate-500 dark:text-slate-400">
            批次进度: {state.completedChunks} / {state.totalChunks}
          </div>
        )}

        {/* Running result */}
        {(state.result.count > 0 || state.result.duplicateCount > 0) && (
          <div className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-700/50 rounded-md px-3 py-2">
            已导入 <span className="font-medium text-emerald-600 dark:text-emerald-400">{state.result.count}</span> 条
            {state.result.duplicateCount > 0 && (
              <span>
                ，重复{" "}
                <span className="font-medium text-amber-600 dark:text-amber-400">
                  {state.result.duplicateCount}
                </span>{" "}
                条
                {state.duplicatePolicy === "keep_new"
                  ? `（自动保留 ${state.result.autoKeptCount} 条）`
                  : state.duplicatePolicy === "cancel"
                  ? `（自动取消 ${state.result.autoCancelledCount} 条）`
                  : "（隔离待处理）"}
              </span>
            )}
            {state.result.invalidStatusCount > 0 && (
              <span>，<span className="font-medium text-rose-600 dark:text-rose-400">{state.result.invalidStatusCount}</span> 条状态异常</span>
            )}
            {state.result.invalidUserCount > 0 && (
              <span>，<span className="font-medium text-rose-600 dark:text-rose-400">{state.result.invalidUserCount}</span> 条使用人异常</span>
            )}
          </div>
        )}

        {/* Summary when done */}
        {(isDone || isError) && summary && (
          <div
            className={`text-xs rounded-md px-3 py-2 ${
              isError
                ? "bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300"
                : "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300"
            }`}
          >
            {summary}
          </div>
        )}

        {(isDone || isError) &&
          state.batchId &&
          state.result.duplicateCount > 0 && (
            <Link
              to={`/imports/${state.batchId}`}
              className="flex items-center justify-center rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300 dark:hover:bg-amber-900/30"
            >
              {state.duplicatePolicy === "manual"
                ? `查看并处理 ${state.result.duplicateCount} 条重复数据`
                : "查看自动处理记录"}
            </Link>
          )}

        {/* Cancel button */}
        {isUploading && (
          <button
            onClick={cancelUpload}
            className="w-full text-center text-xs font-medium text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 py-1 rounded hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
          >
            取消导入
          </button>
        )}
      </div>
    </div>
  );
}
