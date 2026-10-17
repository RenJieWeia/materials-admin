import { useEffect, useRef, useState } from "react";
import { useFetcher, useRevalidator } from "react-router";
import {
  ArrowDownTrayIcon,
  CheckCircleIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

export interface ExtractGameOption {
  game_name: string;
  count: number;
}

export interface ExtractFormatOption {
  key: string;
  label: string;
}

export interface ExtractConfig {
  idleCount: number;
  maxCount: number;
  defaultCount: number;
  formats: ExtractFormatOption[];
  games: ExtractGameOption[];
}

type ExtractOrder = "oldest" | "newest";

/** Response shape of POST /resources/export-materials. */
type ExtractResponse =
  | {
      ok: true;
      count: number;
      requestedCount: number;
      order: ExtractOrder;
      gameName: string | null;
      filename: string;
      contentType: string;
      encoding: "utf8" | "base64";
      content: string;
    }
  | { ok: false; error: string };

const ORDER_OPTIONS: {
  value: ExtractOrder;
  label: string;
  hint: string;
}[] = [
  {
    value: "oldest",
    label: "最早优先",
    hint: "先提取最早入库的料子",
  },
  {
    value: "newest",
    label: "最新优先",
    hint: "先提取最新入库的料子",
  },
];

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = window.atob(base64);
  // Allocate over an explicit ArrayBuffer so the result is a valid BlobPart.
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Write a server-rendered export payload to disk.
 *
 * The server owns the filename and the serialisation (see export.server.ts);
 * the browser only turns the bytes into a download, which keeps every format —
 * including future binary ones — working without touching this component.
 */
function saveExportToDisk(payload: Extract<ExtractResponse, { ok: true }>) {
  const blob =
    payload.encoding === "base64"
      ? new Blob([base64ToBytes(payload.content)], {
          type: payload.contentType,
        })
      : new Blob([payload.content], { type: payload.contentType });

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = payload.filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoking straight away can cancel the download in some browsers.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * The extraction entry point, shared by the employee and admin dashboards.
 *
 * A compact popover keeps the dashboard usable while offering the full set of
 * choices: quantity, game scope, stock order and file format. Every choice is
 * posted to the server, which re-validates it before claiming any stock.
 */
export function ExtractMaterialsPanel({ extract }: { extract: ExtractConfig }) {
  const [isOpen, setIsOpen] = useState(false);
  // Kept as a string so the field can be cleared while typing; the server
  // validates the value and clamps it to MAX_EXTRACT_COUNT.
  const [count, setCount] = useState(String(extract.defaultCount));
  const [format, setFormat] = useState(extract.formats[0]?.key ?? "csv");
  const [order, setOrder] = useState<ExtractOrder>("oldest");
  const [game, setGame] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fetcher = useFetcher<ExtractResponse>();
  const revalidator = useRevalidator();
  const panelRef = useRef<HTMLDivElement>(null);

  const selectedGame = extract.games.find(
    (entry) => entry.game_name === game
  );
  /** Stock available in the current game scope (all games when game is ""). */
  const availableCount = selectedGame ? selectedGame.count : extract.idleCount;
  const maxSelectable = Math.min(availableCount, extract.maxCount);
  const outOfStock = availableCount === 0;

  const parsedCount = Number.parseInt(count, 10);
  const requestedCount =
    Number.isFinite(parsedCount) && parsedCount > 0 ? parsedCount : 0;
  const effectiveCount = Math.min(
    requestedCount,
    availableCount,
    extract.maxCount
  );
  const exceedsStock =
    requestedCount > 0 && requestedCount > availableCount && !outOfStock;

  /** Opening always starts from the safest, most predictable defaults. */
  const openPanel = () => {
    const initialCount = Math.min(
      extract.defaultCount,
      Math.max(extract.idleCount, 1),
      extract.maxCount
    );
    setCount(String(initialCount));
    setFormat(extract.formats[0]?.key ?? "csv");
    setOrder("oldest");
    setGame("");
    setError(null);
    setIsOpen(true);
  };

  // A game can disappear from the idle list after somebody else extracts it or
  // after this user's own extraction. Fall back to "all games" rather than
  // leaving a select box pointing at an option that no longer exists.
  useEffect(() => {
    if (game && !extract.games.some((entry) => entry.game_name === game)) {
      setGame("");
    }
  }, [extract.games, game]);

  // Dismiss on outside click / Escape, like any other popover.
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  // Success notices fade out on their own; errors stay until the user acts.
  useEffect(() => {
    if (!success) return;
    const timer = window.setTimeout(() => setSuccess(null), 6000);
    return () => window.clearTimeout(timer);
  }, [success]);

  useEffect(() => {
    const data = fetcher.data;
    // Ignore the HTML payload we get back when the session expired and the
    // request was redirected to /login.
    if (!data || typeof data.ok !== "boolean") return;

    if (!data.ok) {
      setError(data.error || "提取失败");
      return;
    }

    saveExportToDisk(data);
    const scope = data.gameName ? `游戏「${data.gameName}」` : "全部游戏";
    const orderLabel = data.order === "newest" ? "最新优先" : "最早优先";
    setSuccess(
      `已按「${orderLabel}」从${scope}提取 ${data.count} 条料子，文件已开始下载。`
    );
    setIsOpen(false);
    // Refresh the loader so idle counts, game options and dashboard numbers
    // stay honest after the claim.
    revalidator.revalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.data]);

  const handleGameChange = (value: string) => {
    setGame(value);
    const nextAvailable = value
      ? (extract.games.find((entry) => entry.game_name === value)?.count ?? 0)
      : extract.idleCount;
    const cap = Math.max(1, Math.min(nextAvailable, extract.maxCount));
    setCount((previous) => {
      const parsed = Number.parseInt(previous, 10);
      if (!Number.isFinite(parsed) || parsed < 1) return previous;
      return parsed > cap ? String(cap) : previous;
    });
  };

  return (
    <>
      <div className="relative" ref={panelRef}>
        <button
          type="button"
          onClick={() => (isOpen ? setIsOpen(false) : openPanel())}
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          title={`当前空闲 ${extract.idleCount} 条`}
          className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium shadow-sm transition-colors active:scale-[0.98] ${
            isOpen
              ? "bg-blue-700 text-white"
              : "bg-blue-600 text-white hover:bg-blue-700"
          }`}
        >
          <ArrowDownTrayIcon className="h-4 w-4" />
          提取料子
          <span className="rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums">
            {extract.idleCount}
          </span>
        </button>

        {isOpen && (
          <>
            {/* On phones the popover becomes a bottom sheet; this backdrop
                keeps the rest of the dashboard from competing with it. */}
            <div
              aria-hidden="true"
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 z-40 bg-slate-900/20 backdrop-blur-[1px] sm:hidden"
            />
            <div
              role="dialog"
              aria-label="提取料子"
              className="fixed inset-x-3 bottom-3 z-50 max-h-[calc(100vh-1.5rem)] origin-bottom overflow-hidden rounded-lg border border-slate-200 bg-white text-left shadow-xl dark:border-slate-700 dark:bg-slate-800 sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-auto sm:mt-2 sm:max-h-none sm:w-[min(22rem,calc(100vw-2rem))] sm:origin-top-right"
            >
            <div className="flex items-start justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-700">
              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  提取料子
                </p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  当前空闲 {extract.idleCount} 条 · 单次最多 {extract.maxCount}{" "}
                  条
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="关闭提取面板"
                className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-200"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            </div>

            <fetcher.Form
              method="post"
              action="/resources/export-materials"
              className="max-h-[calc(100vh-9rem)] overflow-y-auto p-4"
            >
              <label
                htmlFor="extract-game"
                className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300"
              >
                游戏范围
              </label>
              <select
                id="extract-game"
                name="game"
                value={game}
                onChange={(event) => handleGameChange(event.target.value)}
                className="mb-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-700/50 dark:text-white"
              >
                <option value="">全部游戏（{extract.idleCount} 条）</option>
                {extract.games.map((entry) => (
                  <option key={entry.game_name} value={entry.game_name}>
                    {entry.game_name}（{entry.count} 条）
                  </option>
                ))}
              </select>
              <p className="mb-3 text-[11px] leading-4 text-slate-400 dark:text-slate-500">
                仅列出当前有空闲库存的游戏。
              </p>

              <span className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">
                提取顺序
              </span>
              <div className="mb-3 grid grid-cols-2 gap-2">
                {ORDER_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    className={`cursor-pointer rounded-md border p-2 transition-colors ${
                      order === option.value
                        ? "border-blue-500 bg-blue-50 dark:border-blue-500 dark:bg-blue-900/20"
                        : "border-slate-200 hover:border-slate-300 dark:border-slate-600 dark:hover:border-slate-500"
                    }`}
                  >
                    <input
                      type="radio"
                      name="order"
                      value={option.value}
                      checked={order === option.value}
                      onChange={() => setOrder(option.value)}
                      className="sr-only"
                    />
                    <span
                      className={`block text-xs font-semibold ${
                        order === option.value
                          ? "text-blue-700 dark:text-blue-300"
                          : "text-slate-700 dark:text-slate-200"
                      }`}
                    >
                      {option.label}
                    </span>
                    <span className="mt-0.5 block text-[10px] leading-4 text-slate-500 dark:text-slate-400">
                      {option.hint}
                    </span>
                  </label>
                ))}
              </div>

              <label
                htmlFor="extract-count"
                className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300"
              >
                提取数量
              </label>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {[5, 10, 20].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setCount(String(preset))}
                    disabled={outOfStock || preset > maxSelectable}
                    className={`rounded px-2 py-1 text-xs font-medium tabular-nums transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                      count === String(preset)
                        ? "bg-blue-600 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
                    }`}
                  >
                    {preset}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setCount(String(Math.max(1, maxSelectable)))}
                  disabled={outOfStock}
                  className={`rounded px-2 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                    maxSelectable > 0 && count === String(maxSelectable)
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
                  }`}
                >
                  全部
                </button>
              </div>

              <input
                type="number"
                id="extract-count"
                name="count"
                min="1"
                max={Math.max(1, maxSelectable)}
                required
                value={count}
                onChange={(event) => setCount(event.target.value)}
                placeholder={`1 - ${Math.max(1, maxSelectable)}`}
                className="mb-3 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm tabular-nums text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-700/50 dark:text-white"
              />

              <label
                htmlFor="extract-format"
                className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300"
              >
                导出格式
              </label>
              <select
                id="extract-format"
                name="format"
                value={format}
                onChange={(event) => setFormat(event.target.value)}
                className="mb-3 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-700/50 dark:text-white"
              >
                {extract.formats.map((entry) => (
                  <option key={entry.key} value={entry.key}>
                    {entry.label}
                  </option>
                ))}
              </select>

              <div className="rounded-md border border-blue-100 bg-blue-50/70 p-2.5 text-[11px] leading-5 text-slate-600 dark:border-blue-900/50 dark:bg-blue-900/20 dark:text-slate-300">
                <p>
                  将从
                  <span className="font-semibold text-blue-700 dark:text-blue-300">
                    {game ? `「${game}」` : "全部游戏"}
                  </span>
                  中，按
                  <span className="font-semibold text-blue-700 dark:text-blue-300">
                    「{order === "newest" ? "最新优先" : "最早优先"}」
                  </span>
                  提取
                  <span className="font-semibold tabular-nums text-blue-700 dark:text-blue-300">
                    {" "}
                    {effectiveCount}{" "}
                  </span>
                  条空闲料子
                </p>
                <p className="mt-0.5 text-slate-500 dark:text-slate-400">
                  当前范围可提取 {availableCount} 条。
                  {exceedsStock &&
                    `数量超过库存，本次最多提取 ${effectiveCount} 条。`}
                </p>
              </div>

              <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
                提取后账号会标记为已使用，并计入今日使用量。
              </p>

              {error && (
                <div
                  role="alert"
                  className="mt-3 rounded-md bg-rose-50 p-2.5 text-xs text-rose-600 dark:bg-rose-900/20 dark:text-rose-400"
                >
                  {error}
                </div>
              )}

              <div className="mt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="rounded-md px-3 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={fetcher.state !== "idle" || effectiveCount === 0}
                  className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ArrowDownTrayIcon className="h-3.5 w-3.5" />
                  {fetcher.state !== "idle" ? "提取中..." : "提取并下载"}
                </button>
              </div>
            </fetcher.Form>
            </div>
          </>
        )}
      </div>

      {success && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-4 right-4 z-50 flex max-w-[calc(100vw-2rem)] items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 shadow-lg dark:border-emerald-800 dark:bg-emerald-900/90 dark:text-emerald-300"
        >
          <CheckCircleIcon className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span className="leading-5">{success}</span>
          <button
            type="button"
            onClick={() => setSuccess(null)}
            aria-label="关闭提示"
            className="ml-2 rounded p-0.5 text-emerald-600 transition-colors hover:bg-emerald-100 dark:text-emerald-400 dark:hover:bg-emerald-800"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>
      )}
    </>
  );
}
