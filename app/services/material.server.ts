import { db } from "../core/db.server";
import type { Material } from "../types";
import { incrementUsageCountBy } from "./conversion.server";

export interface IdleCleanupSettings {
  enabled: boolean;
  scheduleTime: string;
  lastRunDate: string | null;
  lastRunAt: string | null;
}

/** Upper bound on a single extraction, so one click cannot drain the pool. */
export const MAX_EXTRACT_COUNT = 200;
/** Pre-filled quantity in the extraction dialog. */
export const DEFAULT_EXTRACT_COUNT = 10;

/**
 * How many candidate/claim passes a batch does before giving up.
 * One pass is enough while the IMMEDIATE lock is held; the extra passes are a
 * safety valve in case the lock is ever lost, so a batch still fills up.
 */
const MAX_CLAIM_PASSES = 3;

/** `YYYY-MM-DD HH:mm:ss` in server-local time (matches the import format). */
function formatLocalDateTime(date: Date): string {
  return (
    date.getFullYear() +
    "-" +
    String(date.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(date.getDate()).padStart(2, "0") +
    " " +
    String(date.getHours()).padStart(2, "0") +
    ":" +
    String(date.getMinutes()).padStart(2, "0") +
    ":" +
    String(date.getSeconds()).padStart(2, "0")
  );
}

function getShanghaiDate(date: Date = new Date()): string {
  return date.toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
}

/** Bump the usage counter for a username; unknown users are ignored. */
function incrementUsageForUsername(username: string, amount: number): void {
  const user = db
    .prepare("SELECT id FROM users WHERE name = ?")
    .get(username) as { id: number } | undefined;
  if (user) {
    incrementUsageCountBy(user.id, getShanghaiDate(), amount);
  }
}

/**
 * Conditional claim used by every write path.
 *
 * `status = '空闲'` is part of the WHERE clause rather than a separate check, so
 * the database itself decides the winner: of two racing updates exactly one
 * reports `changes === 1`.
 */
const CLAIM_ONE_SQL = `
  UPDATE materials
  SET status = '已使用', user = ?, usage_time = ?, updated_at = CURRENT_TIMESTAMP
  WHERE id = ? AND status = '空闲'
`;


export async function getUniqueGameNames(status?: string) {
  let query = `SELECT DISTINCT game_name FROM materials WHERE game_name IS NOT NULL AND game_name != ''`;
  const params: any[] = [];

  if (status && status !== "全部") {
    query += ` AND status = ?`;
    params.push(status);
  }

  query += ` ORDER BY game_name ASC`;
  return (db.prepare(query).all(...params) as { game_name: string }[]).map(
    (r) => r.game_name
  );
}

export async function getMaterials(filters: {
  game_name?: string;
  account_name?: string;
  status?: string;
  user?: string;
  user_real_name?: string;
  startDate?: string;
  endDate?: string;
  viewer?: { username: string; role: string };
  page?: number;
  limit?: number;
  sort?: string;
}) {
  const { page = 1, limit = 10, sort = "created_at" } = filters;
  const offset = (page - 1) * limit;

  let query =
    "SELECT m.*, u.real_name as user_real_name FROM materials m LEFT JOIN users u ON m.user = u.name WHERE 1=1";
  let countQuery =
    "SELECT COUNT(*) as count FROM materials m LEFT JOIN users u ON m.user = u.name WHERE 1=1";
  const params: any[] = [];

  if (filters.game_name) {
    const clause = " AND m.game_name LIKE ?";
    query += clause;
    countQuery += clause;
    params.push(`%${filters.game_name}%`);
  }

  if (filters.account_name) {
    const clause = " AND m.account_name LIKE ?";
    query += clause;
    countQuery += clause;
    params.push(`%${filters.account_name}%`);
  }

  if (filters.status) {
    const clause = " AND m.status = ?";
    query += clause;
    countQuery += clause;
    params.push(filters.status);
  }

  if (filters.user) {
    const clause = " AND m.user LIKE ?";
    query += clause;
    countQuery += clause;
    params.push(`%${filters.user}%`);
  }

  if (filters.user_real_name) {
    const clause = " AND u.real_name LIKE ?";
    query += clause;
    countQuery += clause;
    params.push(`%${filters.user_real_name}%`);
  }

  if (filters.startDate) {
    const clause = " AND m.usage_time >= ?";
    query += clause;
    countQuery += clause;
    params.push(filters.startDate);
  }

  if (filters.endDate) {
    const clause = " AND m.usage_time <= ?";
    query += clause;
    countQuery += clause;
    params.push(filters.endDate);
  }

  // Visibility Logic
  if (filters.viewer && filters.viewer.role !== "admin") {
    const clause = filters.account_name
      ? " AND m.status = '已使用' AND m.user = ?"
      : " AND (m.status = '空闲' OR m.user = ?)";
    query += clause;
    countQuery += clause;
    params.push(filters.viewer.username);
  }

  const sortField = sort === "usage_time" ? "m.usage_time" : "m.created_at";
  query += ` ORDER BY ${sortField} DESC LIMIT ? OFFSET ?`;

  const total = (db.prepare(countQuery).get(...params) as { count: number })
    .count;
  const materials = db.prepare(query).all(...params, limit, offset) as Material[];

  // Masking Logic
  const maskedMaterials = materials.map((m) => {
    if (m.status === "空闲") {
      const name = m.account_name;
      if (name.length > 4) {
        m.account_name = `${name.slice(0, 2)}****${name.slice(-2)}`;
      } else {
        m.account_name = `${name}****`; // Fallback for short names
      }
    }
    return m;
  });

  return {
    materials: maskedMaterials,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Claim a single idle material for `username`.
 *
 * Runs inside a BEGIN IMMEDIATE transaction: the write lock is taken up front,
 * so no other writer can slip in between reading the row and claiming it, and
 * the conditional UPDATE is the final arbiter of who wins the row.
 */
export async function claimMaterial(id: number, username: string) {
  const claim = db.transaction((materialId: number, name: string): Material => {
    const material = db
      .prepare("SELECT * FROM materials WHERE id = ?")
      .get(materialId) as Material | undefined;

    if (!material) {
      throw new Error("Material not found");
    }

    if (material.status !== "空闲") {
      throw new Error("Material is already in use");
    }

    const now = formatLocalDateTime(new Date());
    const result = db.prepare(CLAIM_ONE_SQL).run(name, now, materialId);

    // Lost a race against another claim between the read above and this write.
    if (result.changes !== 1) {
      throw new Error("Material is already in use");
    }

    incrementUsageForUsername(name, 1);

    return { ...material, status: "已使用", user: name, usage_time: now };
  });

  return claim.immediate(id, username);
}

/**
 * Atomically claim up to `limit` idle materials for `username` and return the
 * rows that were actually claimed (never rows belonging to someone else).
 *
 * Concurrency contract:
 *  - the whole pick-and-claim sequence runs in ONE `BEGIN IMMEDIATE`
 *    transaction, which acquires SQLite's write lock before any row is read, so
 *    a competing extraction cannot interleave with this one;
 *  - each write still re-checks `status = '空闲'` and is only accepted when the
 *    database reports exactly 1 changed row, so overlapping claims are
 *    impossible even if the lock is lost (e.g. multiple app instances on a
 *    shared database file);
 *  - the usage counter and the claims commit together, so a crash cannot leave
 *    materials handed out but uncounted.
 */
export function claimIdleMaterialsBatch(
  username: string,
  limit: number
): Material[] {
  const wanted = Math.max(
    1,
    Math.min(Math.floor(limit) || 0, MAX_EXTRACT_COUNT)
  );

  const claim = db.transaction((name: string, max: number): Material[] => {
    const now = formatLocalDateTime(new Date());
    const selectCandidates = db.prepare(
      `SELECT id FROM materials
       WHERE status = '空闲'
       ORDER BY created_at ASC, id ASC
       LIMIT ?`
    );
    const claimOne = db.prepare(CLAIM_ONE_SQL);

    const claimedIds: number[] = [];

    // Claimed rows are no longer '空闲', so every pass naturally sees fresh
    // candidates without needing to exclude anything.
    for (let pass = 0; pass < MAX_CLAIM_PASSES && claimedIds.length < max; pass++) {
      const candidates = selectCandidates.all(max - claimedIds.length) as {
        id: number;
      }[];
      if (candidates.length === 0) break;

      for (const { id } of candidates) {
        if (claimOne.run(name, now, id).changes === 1) {
          claimedIds.push(id);
        }
      }
    }

    if (claimedIds.length === 0) return [];

    incrementUsageForUsername(name, claimedIds.length);

    const placeholders = claimedIds.map(() => "?").join(",");
    return db
      .prepare(
        `SELECT * FROM materials
         WHERE id IN (${placeholders})
         ORDER BY created_at ASC, id ASC`
      )
      .all(...claimedIds) as Material[];
  });

  return claim.immediate(username, wanted);
}

export async function getIdleMaterialCount(): Promise<number> {
  const row = db
    .prepare("SELECT COUNT(*) as count FROM materials WHERE status = '空闲'")
    .get() as { count: number };
  return row.count;
}


export async function getMaterialByAccountName(accountName: string) {
  return db
    .prepare("SELECT * FROM materials WHERE account_name = ?")
    .get(accountName) as Material | undefined;
}

export async function createMaterial(data: {
  game_name: string;
  account_name: string;
  description?: string;
  status?: string;
  user?: string;
  usage_time?: string;
}) {
  const result = db
    .prepare(
      `
    INSERT INTO materials (game_name, account_name, description, status, user, usage_time)
    VALUES (?, ?, ?, ?, ?, ?)
  `
    )
    .run(
      data.game_name,
      data.account_name,
      data.description || null,
      data.status || "空闲",
      data.user || null,
      data.usage_time || null
    );

  return { success: true, id: result.lastInsertRowid };
}

export function batchCreateMaterials(rows: Array<{
  game_name: string;
  account_name: string;
  description?: string;
  status?: string;
  user?: string;
  usage_time?: string;
}>) {
  const insert = db.prepare(`
    INSERT INTO materials (game_name, account_name, description, status, user, usage_time)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const transaction = db.transaction((items: typeof rows) => {
    for (const data of items) {
      insert.run(
        data.game_name,
        data.account_name,
        data.description || null,
        data.status || "空闲",
        data.user || null,
        data.usage_time || null
      );
    }
  });

  transaction(rows);
}

export function batchCheckAccountNames(accountNames: string[]): Set<string> {
  if (accountNames.length === 0) return new Set();
  const placeholders = accountNames.map(() => "?").join(",");
  const existing = db
    .prepare(`SELECT account_name FROM materials WHERE account_name IN (${placeholders})`)
    .all(...accountNames) as { account_name: string }[];
  return new Set(existing.map((r) => r.account_name));
}

export async function updateMaterial(
  id: number,
  data: {
    game_name?: string;
    account_name?: string;
    description?: string;
    status?: string;
    user?: string;
    usage_time?: string;
  }
) {
  const fields: string[] = [];
  const params: any[] = [];

  if (data.game_name !== undefined) {
    fields.push("game_name = ?");
    params.push(data.game_name);
  }
  if (data.account_name !== undefined) {
    fields.push("account_name = ?");
    params.push(data.account_name);
  }
  if (data.description !== undefined) {
    fields.push("description = ?");
    params.push(data.description);
  }
  if (data.status !== undefined) {
    fields.push("status = ?");
    params.push(data.status);
  }
  if (data.user !== undefined) {
    fields.push("user = ?");
    params.push(data.user);
  }
  if (data.usage_time !== undefined) {
    fields.push("usage_time = ?");
    params.push(data.usage_time);
  }

  if (fields.length === 0) return { success: true };

  fields.push("updated_at = CURRENT_TIMESTAMP");
  params.push(id);

  const query = `UPDATE materials SET ${fields.join(", ")} WHERE id = ?`;
  db.prepare(query).run(...params);

  return { success: true };
}

export async function deleteMaterial(id: number) {
  db.prepare("DELETE FROM materials WHERE id = ?").run(id);
  return { success: true };
}

export async function getMaterialUsageStats(
  username: string,
  startDate?: string,
  endDate?: string
) {
  let query = `
    SELECT date(usage_time) as date, COUNT(*) as count
    FROM materials
    WHERE user = ?
  `;
  const params: any[] = [username];

  if (startDate) {
    query += ` AND date(usage_time) >= ?`;
    params.push(startDate);
  }
  if (endDate) {
    query += ` AND date(usage_time) <= ?`;
    params.push(endDate);
  }

  query += `
    GROUP BY date(usage_time)
    ORDER BY date ASC
  `;
  return db.prepare(query).all(...params) as {
    date: string;
    count: number;
  }[];
}

export async function getTodayUsageCount(username: string) {
  const today = new Date().toISOString().split("T")[0];
  const query = `
    SELECT COUNT(*) as count
    FROM materials
    WHERE user = ? AND date(usage_time) = ?
  `;
  const result = db.prepare(query).get(username, today) as { count: number };
  return result.count;
}

export async function getUsageCountByDate(username: string, date: string) {
  const query = `
    SELECT COUNT(*) as count
    FROM materials
    WHERE user = ? AND date(usage_time) = ?
  `;
  const result = db.prepare(query).get(username, date) as { count: number };
  return result.count;
}

export async function getSystemUsageCountByDate(date: string) {
  const query = `
    SELECT COUNT(*) as count
    FROM materials
    WHERE date(usage_time) = ?
  `;
  const result = db.prepare(query).get(date) as { count: number };
  return result.count;
}

export async function getAllMaterialUsageStats(
  startDate: string,
  endDate: string
) {
  const query = `
    SELECT date(usage_time) as date, COUNT(*) as count
    FROM materials
    WHERE date(usage_time) >= ? AND date(usage_time) <= ?
    GROUP BY date(usage_time)
    ORDER BY date ASC
  `;
  return db.prepare(query).all(startDate, endDate) as {
    date: string;
    count: number;
  }[];
}

export async function getMaterialStatusStats() {
  const query = `
    SELECT status, COUNT(*) as count
    FROM materials
    GROUP BY status
  `;
  return db.prepare(query).all() as { status: string; count: number }[];
}

export async function getTopUsersByUsage(
  startDate: string,
  endDate: string,
  limit: number = 5
) {
  const query = `
    SELECT user, COUNT(*) as count
    FROM materials
    WHERE user IS NOT NULL AND usage_time >= ? AND usage_time <= ?
    GROUP BY user
    ORDER BY count DESC
    LIMIT ?
  `;
  return db.prepare(query).all(startDate, endDate, limit) as {
    user: string;
    count: number;
  }[];
}

export async function getAllUsersByUsage(
  startDate: string,
  endDate: string
) {
  const query = `
    SELECT user, COUNT(*) as count
    FROM materials
    WHERE user IS NOT NULL AND date(usage_time) >= ? AND date(usage_time) <= ?
    GROUP BY user
    ORDER BY count DESC
  `;
  return db.prepare(query).all(startDate, endDate) as {
    user: string;
    count: number;
  }[];
}

export async function getAllUserDailyUsageStats(
  startDate?: string,
  endDate?: string
) {
  let query = `
    SELECT user, date(usage_time) as date, COUNT(*) as count
    FROM materials
    WHERE user IS NOT NULL
  `;
  const params: any[] = [];

  if (startDate) {
    query += ` AND date(usage_time) >= ?`;
    params.push(startDate);
  }
  if (endDate) {
    query += ` AND date(usage_time) <= ?`;
    params.push(endDate);
  }

  query += `
    GROUP BY user, date(usage_time)
  `;
  return db.prepare(query).all(...params) as {
    user: string;
    date: string;
    count: number;
  }[];
}

export async function getMaterialGameStats(limit: number = 5) {
  const query = `
    SELECT game_name, COUNT(*) as count
    FROM materials
    WHERE game_name IS NOT NULL AND game_name != ''
    GROUP BY game_name
    ORDER BY count DESC
    LIMIT ?
  `;
  return db.prepare(query).all(limit) as { game_name: string; count: number }[];
}

export async function getIdleMaterialGameStats(limit: number = 10) {
  const query = `
    SELECT game_name, COUNT(*) as count
    FROM materials
    WHERE status = '空闲' AND game_name IS NOT NULL AND game_name != ''
    GROUP BY game_name
    ORDER BY count DESC
    LIMIT ?
  `;
  return db.prepare(query).all(limit) as { game_name: string; count: number }[];
}

export async function getUserMaterialGameStats(username: string, limit: number = 5) {
  const query = `
    SELECT game_name, COUNT(*) as count
    FROM materials
    WHERE user = ? AND game_name IS NOT NULL AND game_name != ''
    GROUP BY game_name
    ORDER BY count DESC
    LIMIT ?
  `;
  return db.prepare(query).all(username, limit) as { game_name: string; count: number }[];
}

export async function getIdleCleanupSettings(): Promise<IdleCleanupSettings> {
  db.prepare(
    "INSERT OR IGNORE INTO idle_cleanup_settings (id, enabled, schedule_time) VALUES (1, 0, '03:00')"
  ).run();

  const row = db
    .prepare(
      "SELECT enabled, schedule_time, last_run_date, last_run_at FROM idle_cleanup_settings WHERE id = 1"
    )
    .get() as
    | {
        enabled: number;
        schedule_time: string;
        last_run_date: string | null;
        last_run_at: string | null;
      }
    | undefined;

  return {
    enabled: row?.enabled === 1,
    scheduleTime: row?.schedule_time || "03:00",
    lastRunDate: row?.last_run_date || null,
    lastRunAt: row?.last_run_at || null,
  };
}

export async function updateIdleCleanupSettings(data: {
  enabled: boolean;
  scheduleTime: string;
}) {
  db.prepare(
    `
      UPDATE idle_cleanup_settings
      SET enabled = ?, schedule_time = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `
  ).run(data.enabled ? 1 : 0, data.scheduleTime);

  return { success: true };
}

export async function cleanupIdleMaterials() {
  const result = db.prepare("DELETE FROM materials WHERE status = '空闲'").run();
  return { success: true, deletedCount: result.changes };
}
