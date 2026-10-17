import { db } from "../core/db.server";
import type { DuplicatePolicy } from "../types";

export type ImportBatchStatus = "importing" | "completed" | "cancelled";
export type DuplicateResolution = "pending" | "keep_new" | "cancel";

export interface ImportBatch {
  id: number;
  batch_token: string;
  file_name: string | null;
  user_id: number;
  user_name: string;
  total_rows: number;
  imported_count: number;
  duplicate_count: number;
  invalid_status_count: number;
  invalid_user_count: number;
  duplicate_policy: DuplicatePolicy;
  status: ImportBatchStatus;
  created_at: string;
  completed_at: string | null;
  pending_count: number;
  kept_new_count: number;
  cancelled_count: number;
}

export interface ImportDuplicateSnapshot {
  id: number | null;
  game_name: string | null;
  account_name: string;
  description: string | null;
  status: string | null;
  user: string | null;
  usage_time: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  /** "database" = a material that already existed; "import" = earlier row of the same batch. */
  source: "database" | "import";
  row_number?: number;
}

export interface ImportDuplicate {
  id: number;
  batch_id: number;
  row_number: number;
  game_name: string;
  account_name: string;
  description: string | null;
  status: string | null;
  user: string | null;
  usage_time: string | null;
  raw_data: string | null;
  existing_material_id: number | null;
  existing_snapshot: string;
  resolution: DuplicateResolution;
  resolved_material_id: number | null;
  resolved_by_id: number | null;
  resolved_by_name: string | null;
  resolved_at: string | null;
  created_at: string;
}

export interface ImportChunkResult {
  count: number;
  duplicateCount: number;
  duplicateAccounts: string[];
  /** Duplicates that were automatically kept because of the import policy. */
  autoKeptCount: number;
  /** Duplicates that were automatically discarded because of the policy. */
  autoCancelledCount: number;
  invalidStatusCount: number;
  invalidStatusAccounts: string[];
  invalidUserCount: number;
  invalidUserAccounts: string[];
}

export interface ImportChunkInput {
  batchId: number;
  rows: Record<string, string>[];
  /** 0-based row offset of this chunk in the original file. */
  rowOffset: number;
}

export interface ResolveDuplicateResult {
  batchId: number;
  duplicateId: number;
  accountName: string;
  resolution: Exclude<DuplicateResolution, "pending">;
  materialId: number | null;
}

const BATCH_SELECT = `
  SELECT b.*,
    (SELECT COUNT(*) FROM import_duplicates d
      WHERE d.batch_id = b.id AND d.resolution = 'pending') AS pending_count,
    (SELECT COUNT(*) FROM import_duplicates d
      WHERE d.batch_id = b.id AND d.resolution = 'keep_new') AS kept_new_count,
    (SELECT COUNT(*) FROM import_duplicates d
      WHERE d.batch_id = b.id AND d.resolution = 'cancel') AS cancelled_count
  FROM import_batches b
`;

function formatLocalDateTime(date: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    ` ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

export function getImportBatchById(id: number): ImportBatch | null {
  const row = db
    .prepare(`${BATCH_SELECT} WHERE b.id = ?`)
    .get(id) as ImportBatch | undefined;
  return row ?? null;
}

export function getImportBatchByToken(token: string): ImportBatch | null {
  const row = db
    .prepare(`${BATCH_SELECT} WHERE b.batch_token = ?`)
    .get(token) as ImportBatch | undefined;
  return row ?? null;
}

/**
 * Create the batch row on the first chunk. Later chunks reuse it by token, so a
 * very large file can be uploaded in pieces without losing the record.
 */
export function getOrCreateImportBatch(input: {
  batchToken: string;
  fileName?: string | null;
  userId: number;
  userName: string;
  totalRows?: number;
  duplicatePolicy?: DuplicatePolicy;
}): ImportBatch {
  const token = input.batchToken.trim();
  if (!token) {
    throw new Error("导入批次标识缺失");
  }

  const existing = getImportBatchByToken(token);
  if (existing) {
    if (existing.user_id !== input.userId) {
      throw new Error("无权操作该导入批次");
    }
    db.prepare(
      `UPDATE import_batches
       SET file_name = COALESCE(NULLIF(?, ''), file_name),
           total_rows = MAX(total_rows, ?)
       WHERE id = ?`
    ).run(input.fileName ?? "", input.totalRows ?? 0, existing.id);
    return getImportBatchById(existing.id)!;
  }

  // INSERT OR IGNORE + re-read keeps two nearly simultaneous first chunks from
  // racing on the UNIQUE token: exactly one inserts and both use the same row.
  db.prepare(
    `INSERT OR IGNORE INTO import_batches
       (batch_token, file_name, user_id, user_name, total_rows,
        duplicate_policy, status)
     VALUES (?, ?, ?, ?, ?, ?, 'importing')`
  ).run(
    token,
    input.fileName?.trim() || null,
    input.userId,
    input.userName,
    input.totalRows ?? 0,
    input.duplicatePolicy ?? "manual"
  );

  const created = getImportBatchByToken(token);
  if (!created) {
    throw new Error("创建导入批次失败");
  }
  if (created.user_id !== input.userId) {
    throw new Error("无权操作该导入批次");
  }
  return created;
}

export function completeImportBatch(batchId: number): void {
  db.prepare(
    `UPDATE import_batches
     SET status = 'completed', completed_at = datetime('now', '+8 hours')
     WHERE id = ? AND status = 'importing'`
  ).run(batchId);
}

export function cancelImportBatch(
  batchToken: string,
  userId: number
): boolean {
  const result = db
    .prepare(
      `UPDATE import_batches
       SET status = 'cancelled', completed_at = datetime('now', '+8 hours')
       WHERE batch_token = ? AND user_id = ? AND status = 'importing'`
    )
    .run(batchToken, userId);
  return result.changes > 0;
}

function toSnapshot(row: {
  id: number;
  game_name: string;
  account_name: string;
  description: string | null;
  status: string;
  user: string | null;
  usage_time: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}): ImportDuplicateSnapshot {
  return {
    id: row.id,
    game_name: row.game_name,
    account_name: row.account_name,
    description: row.description,
    status: row.status,
    user: row.user,
    usage_time: row.usage_time,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
    source: "database",
  };
}

/**
 * Import one chunk, isolating duplicates instead of dropping them.
 *
 * Every write for the chunk — new materials, duplicate records and batch
 * counters — happens in one IMMEDIATE transaction. A duplicate is therefore
 * either fully recorded (and skipped by materials) or the whole chunk rolls
 * back; an import can never half-apply a duplicate.
 */
export function importMaterialsChunk(input: ImportChunkInput): ImportChunkResult {
  const run = db.transaction(
    (batchId: number, rows: Record<string, string>[], rowOffset: number) => {
      const batch = db
        .prepare("SELECT * FROM import_batches WHERE id = ?")
        .get(batchId) as ImportBatch | undefined;
      if (!batch) throw new Error("导入批次不存在");
      if (batch.status !== "importing") {
        throw new Error(
          batch.status === "cancelled" ? "该导入已取消" : "该导入已结束"
        );
      }

      const duplicatePolicy: DuplicatePolicy =
        batch.duplicate_policy === "keep_new" ||
        batch.duplicate_policy === "cancel"
          ? batch.duplicate_policy
          : "manual";
      const actor = { id: batch.user_id, name: batch.user_name };

      const validUsernames = new Set(
        (
          db.prepare("SELECT name FROM users").all() as { name: string }[]
        ).map((user) => user.name)
      );

      const accountNames = rows
        .map((row) => row["账户名称"])
        .filter((name): name is string => Boolean(name));
      const uniqueAccountNames = [...new Set(accountNames)];

      let existingMaterials: {
        id: number;
        game_name: string;
        account_name: string;
        description: string | null;
        status: string;
        user: string | null;
        usage_time: string | null;
        created_at: string;
        updated_at: string;
      }[] = [];
      if (uniqueAccountNames.length > 0) {
        const placeholders = uniqueAccountNames.map(() => "?").join(",");
        existingMaterials = db
          .prepare(
            `SELECT id, game_name, account_name, description, status, user,
                    usage_time, created_at, updated_at
             FROM materials
             WHERE account_name IN (${placeholders})
               AND status != '失效'
             ORDER BY id DESC`
          )
          .all(...uniqueAccountNames) as typeof existingMaterials;
      }

      /**
       * The reference a later duplicate should point at. Existing rows are
       * indexed first; rows inserted during this chunk then join the map.
       */
      const references = new Map<
        string,
        { materialId: number | null; snapshot: ImportDuplicateSnapshot }
      >();
      for (const material of existingMaterials) {
        if (!references.has(material.account_name)) {
          references.set(material.account_name, {
            materialId: material.id,
            snapshot: toSnapshot(material),
          });
        }
      }

      const insertMaterial = db.prepare(
        `INSERT INTO materials (game_name, account_name, description, status, user, usage_time)
         VALUES (?, ?, ?, ?, ?, ?)`
      );
      const insertDuplicate = db.prepare(
        `INSERT INTO import_duplicates
           (batch_id, row_number, game_name, account_name, description, status,
            user, usage_time, raw_data, existing_material_id, existing_snapshot)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );

      let count = 0;
      let duplicateCount = 0;
      let autoKeptCount = 0;
      let autoCancelledCount = 0;
      let invalidStatusCount = 0;
      let invalidUserCount = 0;
      const duplicateAccounts: string[] = [];
      const invalidStatusAccounts: string[] = [];
      const invalidUserAccounts: string[] = [];

      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        const gameName = row["游戏名称"];
        const accountName = row["账户名称"];
        if (!gameName || !accountName) continue;

        const rowNumber = rowOffset + index + 1;

        // Validate the incoming row BEFORE treating it as a duplicate, because
        // "keep new" needs a usable row to insert later.
        let status = row["使用状态"] || row["状态"] || "空闲";
        if (status !== "空闲" && status !== "已使用") {
          invalidStatusCount += 1;
          if (invalidStatusAccounts.length < 3) {
            invalidStatusAccounts.push(accountName);
          }
          continue;
        }

        let user: string | undefined = row["使用人"];
        let usageTime: string | undefined = row["使用时间"];

        if (status === "空闲") {
          user = undefined;
          usageTime = undefined;
        } else if (status === "已使用") {
          if (!user || !validUsernames.has(user)) {
            invalidUserCount += 1;
            if (invalidUserAccounts.length < 3) {
              invalidUserAccounts.push(accountName);
            }
            continue;
          }
          if (!usageTime) {
            usageTime = formatLocalDateTime(new Date());
          }
        }

        const description = row["描述"] || null;
        const reference = references.get(accountName);

        if (reference) {
          const duplicateInfo = insertDuplicate.run(
            batchId,
            rowNumber,
            gameName,
            accountName,
            description,
            status,
            user ?? null,
            usageTime ?? null,
            JSON.stringify(row),
            reference.materialId,
            JSON.stringify(reference.snapshot)
          );
          duplicateCount += 1;
          if (duplicateAccounts.length < 3) {
            duplicateAccounts.push(accountName);
          }

          // The administrator may have pre-selected a policy. Apply it right
          // here, inside the same chunk transaction, so the batch never has to
          // stop and wait for manual confirmation.
          if (duplicatePolicy !== "manual") {
            const duplicateRow = db
              .prepare("SELECT * FROM import_duplicates WHERE id = ?")
              .get(Number(duplicateInfo.lastInsertRowid)) as ImportDuplicate;
            const resolved = resolveOne(
              duplicateRow,
              duplicatePolicy,
              actor
            );

            if (resolved.materialId !== null) {
              autoKeptCount += 1;
              // Later rows of the same account should now compare against the
              // freshly kept material, not the one that was just invalidated.
              references.set(accountName, {
                materialId: resolved.materialId,
                snapshot: {
                  id: resolved.materialId,
                  game_name: gameName,
                  account_name: accountName,
                  description,
                  status,
                  user: user ?? null,
                  usage_time: usageTime ?? null,
                  created_at: null,
                  updated_at: null,
                  source: "import",
                  row_number: rowNumber,
                },
              });
            } else {
              autoCancelledCount += 1;
            }
          }
          continue;
        }

        const info = insertMaterial.run(
          gameName,
          accountName,
          description,
          status,
          user ?? null,
          usageTime ?? null
        );
        const newId = Number(info.lastInsertRowid);
        count += 1;
        references.set(accountName, {
          materialId: newId,
          snapshot: {
            id: newId,
            game_name: gameName,
            account_name: accountName,
            description,
            status,
            user: user ?? null,
            usage_time: usageTime ?? null,
            created_at: null,
            updated_at: null,
            source: "import",
            row_number: rowNumber,
          },
        });
      }

      db.prepare(
        `UPDATE import_batches
         SET imported_count = imported_count + ?,
             duplicate_count = duplicate_count + ?,
             invalid_status_count = invalid_status_count + ?,
             invalid_user_count = invalid_user_count + ?,
             total_rows = MAX(total_rows, ?)
         WHERE id = ?`
      ).run(
        count,
        duplicateCount,
        invalidStatusCount,
        invalidUserCount,
        rowOffset + rows.length,
        batchId
      );

      return {
        count,
        duplicateCount,
        duplicateAccounts,
        autoKeptCount,
        autoCancelledCount,
        invalidStatusCount,
        invalidStatusAccounts,
        invalidUserCount,
        invalidUserAccounts,
      };
    }
  );

  return run.immediate(input.batchId, input.rows, input.rowOffset);
}

export function getImportBatches(options: {
  page?: number;
  limit?: number;
  pendingOnly?: boolean;
  search?: string;
} = {}) {
  const { page = 1, limit = 15, pendingOnly = false, search = "" } = options;
  const offset = (page - 1) * limit;
  const params: (string | number)[] = [];
  let where = "WHERE 1 = 1";

  if (pendingOnly) {
    where += ` AND (SELECT COUNT(*) FROM import_duplicates d
                    WHERE d.batch_id = b.id AND d.resolution = 'pending') > 0`;
  }
  if (search) {
    where += " AND b.file_name LIKE ?";
    params.push(`%${search}%`);
  }

  const total = (
    db
      .prepare(`SELECT COUNT(*) AS count FROM import_batches b ${where}`)
      .get(...params) as { count: number }
  ).count;

  const batches = db
    .prepare(
      `${BATCH_SELECT} ${where}
       ORDER BY b.created_at DESC, b.id DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset) as ImportBatch[];

  return {
    batches,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export function getImportOverview() {
  return db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM import_batches) AS batches,
         (SELECT COALESCE(SUM(total_rows), 0) FROM import_batches) AS total_rows,
         (SELECT COALESCE(SUM(imported_count), 0) FROM import_batches) AS imported_rows,
         (SELECT COUNT(*) FROM import_duplicates) AS duplicates,
         (SELECT COUNT(*) FROM import_duplicates WHERE resolution = 'pending') AS pending,
         (SELECT COUNT(*) FROM import_duplicates WHERE resolution = 'keep_new') AS kept_new,
         (SELECT COUNT(*) FROM import_duplicates WHERE resolution = 'cancel') AS cancelled`
    )
    .get() as {
    batches: number;
    total_rows: number;
    imported_rows: number;
    duplicates: number;
    pending: number;
    kept_new: number;
    cancelled: number;
  };
}

export function getImportDuplicateStats(batchId: number) {
  return db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         COALESCE(SUM(CASE WHEN resolution = 'pending' THEN 1 ELSE 0 END), 0) AS pending,
         COALESCE(SUM(CASE WHEN resolution = 'keep_new' THEN 1 ELSE 0 END), 0) AS kept_new,
         COALESCE(SUM(CASE WHEN resolution = 'cancel' THEN 1 ELSE 0 END), 0) AS cancelled
       FROM import_duplicates
       WHERE batch_id = ?`
    )
    .get(batchId) as {
    total: number;
    pending: number;
    kept_new: number;
    cancelled: number;
  };
}

export function getImportDuplicates(options: {
  batchId: number;
  resolution?: DuplicateResolution | "all";
  page?: number;
  limit?: number;
}) {
  const {
    batchId,
    resolution = "all",
    page = 1,
    limit = 20,
  } = options;
  const offset = (page - 1) * limit;
  const params: (string | number)[] = [batchId];
  let where = "WHERE d.batch_id = ?";

  if (resolution !== "all") {
    where += " AND d.resolution = ?";
    params.push(resolution);
  }

  const total = (
    db
      .prepare(
        `SELECT COUNT(*) AS count FROM import_duplicates d ${where}`
      )
      .get(...params) as { count: number }
  ).count;

  const duplicates = db
    .prepare(
      `SELECT d.* FROM import_duplicates d ${where}
       ORDER BY CASE d.resolution WHEN 'pending' THEN 0 ELSE 1 END,
                d.row_number ASC, d.id ASC
       LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset) as ImportDuplicate[];

  return {
    duplicates,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

function assertBatchReadyForResolution(batchId: number) {
  const batch = db
    .prepare("SELECT status FROM import_batches WHERE id = ?")
    .get(batchId) as { status: ImportBatchStatus } | undefined;
  if (!batch) throw new Error("导入批次不存在");
  if (batch.status === "importing") {
    throw new Error("导入仍在进行中，请等待导入完成后再处理重复数据");
  }
}

function resolveOne(
  duplicate: ImportDuplicate,
  resolution: Exclude<DuplicateResolution, "pending">,
  actor: { id: number; name: string }
): ResolveDuplicateResult {
  if (duplicate.resolution !== "pending") {
    throw new Error("该重复数据已经处理过了");
  }

  const now = formatLocalDateTime(new Date());
  let materialId: number | null = null;

  if (resolution === "keep_new") {
    // All currently active rows with this account become invalid, so "keep
    // new" cannot leave two active copies behind when several batches imported
    // the same account at once.
    db.prepare(
      `UPDATE materials
       SET status = '失效', updated_at = CURRENT_TIMESTAMP
       WHERE account_name = ? AND status != '失效'`
    ).run(duplicate.account_name);

    const info = db
      .prepare(
        `INSERT INTO materials
           (game_name, account_name, description, status, user, usage_time)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        duplicate.game_name,
        duplicate.account_name,
        duplicate.description,
        duplicate.status || "空闲",
        duplicate.user,
        duplicate.usage_time
      );
    materialId = Number(info.lastInsertRowid);
  }

  db.prepare(
    `UPDATE import_duplicates
     SET resolution = ?,
         resolved_material_id = ?,
         resolved_by_id = ?,
         resolved_by_name = ?,
         resolved_at = ?
     WHERE id = ? AND resolution = 'pending'`
  ).run(
    resolution,
    materialId,
    actor.id,
    actor.name,
    now,
    duplicate.id
  );

  return {
    batchId: duplicate.batch_id,
    duplicateId: duplicate.id,
    accountName: duplicate.account_name,
    resolution,
    materialId,
  };
}

export function resolveImportDuplicate(input: {
  duplicateId: number;
  resolution: Exclude<DuplicateResolution, "pending">;
  actor: { id: number; name: string };
}): ResolveDuplicateResult {
  const run = db.transaction(() => {
    const duplicate = db
      .prepare("SELECT * FROM import_duplicates WHERE id = ?")
      .get(input.duplicateId) as ImportDuplicate | undefined;
    if (!duplicate) throw new Error("重复数据不存在");
    assertBatchReadyForResolution(duplicate.batch_id);
    return resolveOne(duplicate, input.resolution, input.actor);
  });
  return run.immediate();
}

export function resolveImportBatchDuplicates(input: {
  batchId: number;
  resolution: Exclude<DuplicateResolution, "pending">;
  actor: { id: number; name: string };
}) {
  const run = db.transaction(() => {
    assertBatchReadyForResolution(input.batchId);
    const duplicates = db
      .prepare(
        `SELECT * FROM import_duplicates
         WHERE batch_id = ? AND resolution = 'pending'
         ORDER BY row_number ASC, id ASC`
      )
      .all(input.batchId) as ImportDuplicate[];

    if (duplicates.length === 0) {
      throw new Error("该导入没有待处理的重复数据");
    }

    let inserted = 0;
    for (const duplicate of duplicates) {
      const result = resolveOne(duplicate, input.resolution, input.actor);
      if (result.materialId !== null) inserted += 1;
    }

    return {
      batchId: input.batchId,
      processed: duplicates.length,
      inserted,
      cancelled: duplicates.length - inserted,
    };
  });
  return run.immediate();
}

export function parseDuplicateSnapshot(
  snapshot: string
): ImportDuplicateSnapshot {
  try {
    return JSON.parse(snapshot) as ImportDuplicateSnapshot;
  } catch {
    return {
      id: null,
      game_name: null,
      account_name: "",
      description: null,
      status: null,
      user: null,
      usage_time: null,
      source: "database",
    };
  }
}
