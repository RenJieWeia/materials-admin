import { createContext, useContext, useState, useCallback, useRef } from "react";
import type { ReactNode } from "react";
import type { DuplicatePolicy } from "../types";

interface ChunkResult {
  count: number;
  duplicateCount: number;
  duplicateAccounts: string[];
  autoKeptCount: number;
  autoCancelledCount: number;
  invalidStatusCount: number;
  invalidStatusAccounts: string[];
  invalidUserCount: number;
  invalidUserAccounts: string[];
}

interface UploadResult {
  count: number;
  duplicateCount: number;
  duplicateAccounts: string[];
  autoKeptCount: number;
  autoCancelledCount: number;
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
  batchId: number | null;
  duplicatePolicy: DuplicatePolicy;
  result: UploadResult;
  error?: string;
  minimized: boolean;
}

interface UploadContextValue {
  state: UploadState;
  startUpload: (
    rows: Record<string, string>[],
    fileName?: string,
    duplicatePolicy?: DuplicatePolicy
  ) => void;
  cancelUpload: () => void;
  dismiss: () => void;
  toggleMinimize: () => void;
}

const emptyResult = (): UploadResult => ({
  count: 0,
  duplicateCount: 0,
  duplicateAccounts: [],
  autoKeptCount: 0,
  autoCancelledCount: 0,
  invalidStatusCount: 0,
  invalidStatusAccounts: [],
  invalidUserCount: 0,
  invalidUserAccounts: [],
});

const initialState: UploadState = {
  status: "idle",
  totalRows: 0,
  processedRows: 0,
  totalChunks: 0,
  completedChunks: 0,
  batchId: null,
  duplicatePolicy: "manual",
  result: emptyResult(),
  minimized: false,
};

const UploadProgressContext = createContext<UploadContextValue | null>(null);

const CHUNK_SIZE = 500;

function createBatchToken(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function markBatchCancelled(batchToken: string) {
  try {
    await fetch("/api/import-chunk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ batchToken, cancel: true }),
    });
  } catch {
    // Best effort: the import batch is still visible even if this never lands.
  }
}

export function UploadProgressProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<UploadState>(initialState);
  const cancelledRef = useRef(false);
  const batchTokenRef = useRef<string | null>(null);

  const startUpload = useCallback(
    (
      rows: Record<string, string>[],
      fileName?: string,
      duplicatePolicy: DuplicatePolicy = "manual"
    ) => {
      cancelledRef.current = false;
      const batchToken = createBatchToken();
      batchTokenRef.current = batchToken;

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
        batchId: null,
        duplicatePolicy,
        result: emptyResult(),
        minimized: false,
      });

      // Process chunks sequentially in the background.
      (async () => {
        const accumulated: ChunkResult = {
          count: 0,
          duplicateCount: 0,
          duplicateAccounts: [],
          autoKeptCount: 0,
          autoCancelledCount: 0,
          invalidStatusCount: 0,
          invalidStatusAccounts: [],
          invalidUserCount: 0,
          invalidUserAccounts: [],
        };

        for (let i = 0; i < chunks.length; i++) {
          if (cancelledRef.current) {
            await markBatchCancelled(batchToken);
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
                rowOffset: i * CHUNK_SIZE,
                totalRows: rows.length,
                fileName: fileName || "",
                batchToken,
                duplicatePolicy,
              }),
            });

            if (!resp.ok) {
              const err = await resp.json();
              await markBatchCancelled(batchToken);
              setState((prev) => ({
                ...prev,
                status: "error",
                error: err.error || `请求失败 (${resp.status})`,
              }));
              return;
            }

            const data: ChunkResult & {
              success: boolean;
              batchId: number;
              duplicatePolicy?: DuplicatePolicy;
            } = await resp.json();

            accumulated.count += data.count;
            accumulated.duplicateCount += data.duplicateCount;
            accumulated.autoKeptCount += data.autoKeptCount || 0;
            accumulated.autoCancelledCount += data.autoCancelledCount || 0;
            accumulated.invalidStatusCount += data.invalidStatusCount;
            accumulated.invalidUserCount += data.invalidUserCount;
            if (accumulated.duplicateAccounts.length < 3) {
              accumulated.duplicateAccounts.push(...data.duplicateAccounts);
              accumulated.duplicateAccounts =
                accumulated.duplicateAccounts.slice(0, 3);
            }
            if (accumulated.invalidStatusAccounts.length < 3) {
              accumulated.invalidStatusAccounts.push(
                ...data.invalidStatusAccounts
              );
              accumulated.invalidStatusAccounts =
                accumulated.invalidStatusAccounts.slice(0, 3);
            }
            if (accumulated.invalidUserAccounts.length < 3) {
              accumulated.invalidUserAccounts.push(
                ...data.invalidUserAccounts
              );
              accumulated.invalidUserAccounts =
                accumulated.invalidUserAccounts.slice(0, 3);
            }

            setState((prev) => ({
              ...prev,
              batchId: data.batchId ?? prev.batchId,
              duplicatePolicy: data.duplicatePolicy ?? prev.duplicatePolicy,
              processedRows: Math.min((i + 1) * CHUNK_SIZE, rows.length),
              completedChunks: i + 1,
              result: { ...accumulated },
            }));
          } catch (err: any) {
            await markBatchCancelled(batchToken);
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
    },
    []
  );

  const cancelUpload = useCallback(() => {
    cancelledRef.current = true;
    if (batchTokenRef.current) {
      void markBatchCancelled(batchTokenRef.current);
    }
  }, []);

  const dismiss = useCallback(() => {
    batchTokenRef.current = null;
    cancelledRef.current = false;
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
