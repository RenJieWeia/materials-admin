import type { Route } from "./+types/api.import-chunk";
import { requireUserId } from "../core/session.server";
import { getUserById } from "../services/user.server";
import {
  cancelImportBatch,
  completeImportBatch,
  getImportBatchById,
  getImportBatchByToken,
  getOrCreateImportBatch,
  importMaterialsChunk,
} from "../services/import.server";
import { createAuditLog } from "../services/audit.server";
import {
  DUPLICATE_POLICY_LABELS,
  type DuplicatePolicy,
} from "../types";

export async function action({ request }: Route.ActionArgs) {
  const userId = await requireUserId(request);
  const currentUser = await getUserById(userId);
  if (!currentUser) {
    return Response.json({ error: "User not found" }, { status: 401 });
  }
  if (currentUser.role !== "admin") {
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await request.json();
  const batchToken =
    typeof body.batchToken === "string" ? body.batchToken.trim() : "";

  if (!batchToken) {
    return Response.json({ error: "导入批次标识缺失" }, { status: 400 });
  }

  // A cancelled import closes the batch immediately. The client sends this
  // best-effort request when the user clicks "取消导入".
  if (body.cancel === true) {
    const cancelled = cancelImportBatch(
      batchToken,
      Number(currentUser.id)
    );
    if (cancelled) {
      const batch = getImportBatchByToken(batchToken);
      if (batch) {
        createAuditLog(
          {
            user_id: Number(currentUser.id),
            user_name: currentUser.name,
            action: "取消导入",
            entity: "导入批次",
            entity_id: batch.id.toString(),
            details:
              `取消导入文件「${batch.file_name || "未命名"}」：` +
              `已直接导入 ${batch.imported_count} 条，隔离重复 ${batch.duplicate_count} 条`,
          },
          request
        );
      }
    }
    return Response.json({ success: true, cancelled: true });
  }

  const rows = body.rows as Array<Record<string, string>> | undefined;
  if (!Array.isArray(rows) || rows.length === 0) {
    return Response.json({ error: "No data" }, { status: 400 });
  }
  // The bundled client sends 500 rows per chunk. Reject oversized chunks so a
  // custom caller cannot turn one request into a multi-second event-loop block.
  const maxRowsPerChunk = 1000;
  if (rows.length > maxRowsPerChunk) {
    return Response.json(
      { error: `单个导入分片最多 ${maxRowsPerChunk} 行` },
      { status: 400 }
    );
  }

  const rawPolicy = body.duplicatePolicy;
  if (
    rawPolicy !== undefined &&
    rawPolicy !== "manual" &&
    rawPolicy !== "keep_new" &&
    rawPolicy !== "cancel"
  ) {
    return Response.json({ error: "无效的重复数据处理方式" }, { status: 400 });
  }
  const duplicatePolicy: DuplicatePolicy = rawPolicy ?? "manual";

  const chunkIndex = Number(body.chunkIndex) || 0;
  const totalChunks = Number(body.totalChunks) || 1;
  const rawRowOffset = Number(body.rowOffset);
  const rowOffset =
    Number.isFinite(rawRowOffset) && rawRowOffset >= 0
      ? rawRowOffset
      : chunkIndex * 500;
  const isLast = body.isLast === true;

  let batch;
  try {
    batch = getOrCreateImportBatch({
      batchToken,
      fileName: typeof body.fileName === "string" ? body.fileName : null,
      userId: Number(currentUser.id),
      userName: currentUser.name,
      totalRows: Number(body.totalRows) || rowOffset + rows.length,
      duplicatePolicy,
    });
  } catch (error) {
    return Response.json(
      { error: (error as Error).message },
      { status: 400 }
    );
  }

  let result;
  try {
    result = importMaterialsChunk({
      batchId: batch.id,
      rows,
      rowOffset,
    });
  } catch (error) {
    return Response.json(
      { error: (error as Error).message },
      { status: 400 }
    );
  }

  if (isLast) {
    completeImportBatch(batch.id);

    const finished = getImportBatchById(batch.id);
    if (finished) {
      createAuditLog(
        {
          user_id: Number(currentUser.id),
          user_name: currentUser.name,
          action: "导入材料",
          entity: "导入批次",
          entity_id: finished.id.toString(),
          details:
            `导入文件「${finished.file_name || "未命名"}」完成：共 ${finished.total_rows} 行，` +
            `成功导入 ${finished.imported_count} 条，隔离重复 ${finished.duplicate_count} 条` +
            `（待处理 ${finished.pending_count} 条），重复策略：` +
            `${DUPLICATE_POLICY_LABELS[finished.duplicate_policy]}` +
            `，状态异常 ${finished.invalid_status_count} 条，` +
            `使用人异常 ${finished.invalid_user_count} 条`,
        },
        request
      );
    }
  }

  return Response.json({
    success: true,
    batchId: batch.id,
    duplicatePolicy: batch.duplicate_policy,
    chunkIndex,
    totalChunks,
    ...result,
  });
}
