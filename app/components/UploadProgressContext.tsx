import { createContext, useContext, useState, useCallback, useRef } from "react";
import type { ReactNode } from "react";

interface ChunkResult {
  count: number;
  skipped: number;
  skippedAccounts: string[];
  invalidStatusCount: number;
  invalidStatusAccounts: string[];
  invalidUserCount: number;
  invalidUserAccounts: string[];
}

interface UploadState {
  status: "idle" | "uploading" | "done" | "error";
  totalRows: number;
  processedRows: number;
  totalChunks: number;
  completedChunks: number;
  result: {
    count: number;
    skipped: number;
    skippedAccounts: string[];
    invalidStatusCount: number;
    invalidStatusAccounts: string[];
    invalidUserCount: number;
    invalidUserAccounts: string[];
  };
  error?: string;
  minimized: boolean;
}

interface UploadContextValue {
  state: UploadState;
  startUpload: (rows: Record<string, string>[]) => void;
  cancelUpload: () => void;
  dismiss: () => void;
  toggleMinimize: () => void;
}

const initialState: UploadState = {
  status: "idle",
  totalRows: 0,
  processedRows: 0,
  totalChunks: 0,
  completedChunks: 0,
  result: {
    count: 0,
    skipped: 0,
    skippedAccounts: [],
    invalidStatusCount: 0,
    invalidStatusAccounts: [],
    invalidUserCount: 0,
    invalidUserAccounts: [],
  },
  minimized: false,
};

const UploadProgressContext = createContext<UploadContextValue | null>(null);

const CHUNK_SIZE = 500;

export function UploadProgressProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<UploadState>(initialState);
  const cancelledRef = useRef(false);

  const startUpload = useCallback((rows: Record<string, string>[]) => {
    cancelledRef.current = false;

    const chunks: Record<string, string>[][] = [];
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      chunks.push(rows.slice(i, i + CHUNK_SIZE));
    }

    const totalChunks = chunks.length;

    setState({
      status: "uploading",
      totalRows: rows.length,
      processedRows: 0,
      totalChunks,
      completedChunks: 0,
      result: {
        count: 0,
        skipped: 0,
        skippedAccounts: [],
        invalidStatusCount: 0,
        invalidStatusAccounts: [],
        invalidUserCount: 0,
        invalidUserAccounts: [],
      },
      minimized: false,
    });

    // Process chunks sequentially in background
    (async () => {
      const accumulated: ChunkResult = {
        count: 0,
        skipped: 0,
        skippedAccounts: [],
        invalidStatusCount: 0,
        invalidStatusAccounts: [],
        invalidUserCount: 0,
        invalidUserAccounts: [],
      };

      for (let i = 0; i < chunks.length; i++) {
        if (cancelledRef.current) {
          setState((prev) => ({
            ...prev,
            status: "done",
            error: "已取消导入",
          }));
          return;
        }

        try {
          const resp = await fetch("/api/import-chunk", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              rows: chunks[i],
              chunkIndex: i,
              totalChunks,
              isLast: i === chunks.length - 1,
            }),
          });

          if (!resp.ok) {
            const err = await resp.json();
            setState((prev) => ({
              ...prev,
              status: "error",
              error: err.error || `请求失败 (${resp.status})`,
            }));
            return;
          }

          const data: ChunkResult & { success: boolean } = await resp.json();

          accumulated.count += data.count;
          accumulated.skipped += data.skipped;
          accumulated.invalidStatusCount += data.invalidStatusCount;
          accumulated.invalidUserCount += data.invalidUserCount;
          if (accumulated.skippedAccounts.length < 3) {
            accumulated.skippedAccounts.push(...data.skippedAccounts);
            accumulated.skippedAccounts = accumulated.skippedAccounts.slice(0, 3);
          }
          if (accumulated.invalidStatusAccounts.length < 3) {
            accumulated.invalidStatusAccounts.push(...data.invalidStatusAccounts);
            accumulated.invalidStatusAccounts = accumulated.invalidStatusAccounts.slice(0, 3);
          }
          if (accumulated.invalidUserAccounts.length < 3) {
            accumulated.invalidUserAccounts.push(...data.invalidUserAccounts);
            accumulated.invalidUserAccounts = accumulated.invalidUserAccounts.slice(0, 3);
          }

          setState((prev) => ({
            ...prev,
            processedRows: Math.min((i + 1) * CHUNK_SIZE, rows.length),
            completedChunks: i + 1,
            result: { ...accumulated },
          }));
        } catch (err: any) {
          setState((prev) => ({
            ...prev,
            status: "error",
            error: err.message || "网络错误",
          }));
          return;
        }
      }

      setState((prev) => ({
        ...prev,
        status: "done",
        processedRows: rows.length,
      }));
    })();
  }, []);

  const cancelUpload = useCallback(() => {
    cancelledRef.current = true;
  }, []);

  const dismiss = useCallback(() => {
    setState(initialState);
  }, []);

  const toggleMinimize = useCallback(() => {
    setState((prev) => ({ ...prev, minimized: !prev.minimized }));
  }, []);

  return (
    <UploadProgressContext.Provider
      value={{ state, startUpload, cancelUpload, dismiss, toggleMinimize }}
    >
      {children}
    </UploadProgressContext.Provider>
  );
}

export function useUploadProgress() {
  const context = useContext(UploadProgressContext);
  if (!context) {
    throw new Error("useUploadProgress must be used within UploadProgressProvider");
  }
  return context;
}
