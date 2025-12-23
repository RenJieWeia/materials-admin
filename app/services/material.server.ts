import { db } from "../core/db.server";
import type { Material } from "../types";

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
    const clause = " AND (m.status = '空闲' OR m.user = ?)";
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

export async function claimMaterial(id: number, username: string) {
  const material = db
    .prepare("SELECT * FROM materials WHERE id = ?")
    .get(id) as Material;

  if (!material) {
    throw new Error("Material not found");
  }

  if (material.status !== "空闲") {
    throw new Error("Material is already in use");
  }

  const date = new Date();
  const now = date.getFullYear() + "-" +
    String(date.getMonth() + 1).padStart(2, '0') + "-" +
    String(date.getDate()).padStart(2, '0') + " " +
    String(date.getHours()).padStart(2, '0') + ":" +
    String(date.getMinutes()).padStart(2, '0') + ":" +
    String(date.getSeconds()).padStart(2, '0');

  db.prepare(
    "UPDATE materials SET status = '已使用', user = ?, usage_time = ? WHERE id = ?"
  ).run(username, now, id);

  return { ...material, status: "已使用", user: username, usage_time: now };
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
