import { db } from "../server/db.server";
import type { Material } from "../../types";

export async function getMaterials(filters: {
  game_name?: string;
  account_name?: string;
  status?: string;
  user?: string;
  startDate?: string;
  endDate?: string;
  viewer?: { username: string; role: string };
  page?: number;
  limit?: number;
}) {
  const { page = 1, limit = 10 } = filters;
  const offset = (page - 1) * limit;

  let query = "SELECT * FROM materials WHERE 1=1";
  let countQuery = "SELECT COUNT(*) as count FROM materials WHERE 1=1";
  const params: any[] = [];

  if (filters.game_name) {
    const clause = " AND game_name LIKE ?";
    query += clause;
    countQuery += clause;
    params.push(`%${filters.game_name}%`);
  }

  if (filters.account_name) {
    const clause = " AND account_name LIKE ?";
    query += clause;
    countQuery += clause;
    params.push(`%${filters.account_name}%`);
  }

  if (filters.status) {
    const clause = " AND status = ?";
    query += clause;
    countQuery += clause;
    params.push(filters.status);
  }

  if (filters.user) {
    const clause = " AND user LIKE ?";
    query += clause;
    countQuery += clause;
    params.push(`%${filters.user}%`);
  }

  if (filters.startDate) {
    const clause = " AND usage_time >= ?";
    query += clause;
    countQuery += clause;
    params.push(filters.startDate);
  }

  if (filters.endDate) {
    const clause = " AND usage_time <= ?";
    query += clause;
    countQuery += clause;
    params.push(filters.endDate);
  }

  // Visibility Logic
  if (filters.viewer && filters.viewer.role !== "admin") {
    const clause = " AND (status = '空闲' OR user = ?)";
    query += clause;
    countQuery += clause;
    params.push(filters.viewer.username);
  }

  query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";

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

  const now = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

  db.prepare(
    "UPDATE materials SET status = '已使用', user = ?, usage_time = ? WHERE id = ?"
  ).run(username, now, id);

  return { ...material, status: "已使用", user: username, usage_time: now };
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
  startDate: string,
  endDate: string
) {
  const query = `
    SELECT usage_time as date, COUNT(*) as count
    FROM materials
    WHERE user = ? AND usage_time >= ? AND usage_time <= ?
    GROUP BY usage_time
    ORDER BY usage_time ASC
  `;
  return db.prepare(query).all(username, startDate, endDate) as {
    date: string;
    count: number;
  }[];
}

export async function getTodayUsageCount(username: string) {
  const today = new Date().toISOString().split("T")[0];
  const query = `
    SELECT COUNT(*) as count
    FROM materials
    WHERE user = ? AND usage_time = ?
  `;
  const result = db.prepare(query).get(username, today) as { count: number };
  return result.count;
}

export async function getAllMaterialUsageStats(
  startDate: string,
  endDate: string
) {
  const query = `
    SELECT usage_time as date, COUNT(*) as count
    FROM materials
    WHERE usage_time >= ? AND usage_time <= ?
    GROUP BY usage_time
    ORDER BY usage_time ASC
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
