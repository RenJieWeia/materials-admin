import { db } from "../core/db.server";

export interface DailyConversion {
  id: number;
  user_id: number;
  date: string;
  count: number;
  pass_count: number;
  created_at: string;
  updated_at: string;
}

export async function recordConversion(
  userId: number,
  date: string,
  count: number,
  passCount: number
) {
  const stmt = db.prepare(`
    INSERT INTO daily_conversions (user_id, date, count, pass_count, updated_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id, date) DO UPDATE SET
      count = excluded.count,
      pass_count = excluded.pass_count,
      updated_at = CURRENT_TIMESTAMP
  `);
  return stmt.run(userId, date, count, passCount);
}

export async function incrementConversionCount(userId: number, date: string) {
  const stmt = db.prepare(`
    INSERT INTO daily_conversions (user_id, date, count, pass_count, updated_at)
    VALUES (?, ?, 1, 0, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id, date) DO UPDATE SET
      count = count + 1,
      updated_at = CURRENT_TIMESTAMP
  `);
  return stmt.run(userId, date);
}


export async function getConversion(userId: number, date: string) {
  const stmt = db.prepare(`
    SELECT * FROM daily_conversions
    WHERE user_id = ? AND date = ?
  `);
  return stmt.get(userId, date) as DailyConversion | undefined;
}

export async function getSystemTotalConversion(date: string) {
  const stmt = db.prepare(`
    SELECT SUM(count) as count, SUM(pass_count) as pass_count FROM daily_conversions
    WHERE date = ?
  `);
  const result = stmt.get(date) as { count: number; pass_count: number } | undefined;
  return { count: result?.count || 0, pass_count: result?.pass_count || 0 };
}

export async function getConversions(
  userId: number,
  startDate?: string,
  endDate?: string
) {
  let query = `SELECT * FROM daily_conversions WHERE user_id = ?`;
  const params: any[] = [userId];

  if (startDate) {
    query += ` AND date >= ?`;
    params.push(startDate);
  }

  if (endDate) {
    query += ` AND date <= ?`;
    params.push(endDate);
  }

  query += ` ORDER BY date DESC`;

  const stmt = db.prepare(query);
  return stmt.all(...params) as DailyConversion[];
}

export async function getAllConversions(startDate: string, endDate: string) {
  const query = `
    SELECT date, SUM(count) as count, SUM(pass_count) as pass_count
    FROM daily_conversions
    WHERE date >= ? AND date <= ?
    GROUP BY date
    ORDER BY date ASC
  `;
  return db.prepare(query).all(startDate, endDate) as {
    date: string;
    count: number;
    pass_count: number;
  }[];
}

export async function getTopUsersByConversion(
  startDate: string,
  endDate: string,
  limit: number = 5
) {
  const query = `
    SELECT u.name as user, SUM(dc.count) as count, SUM(dc.pass_count) as pass_count
    FROM daily_conversions dc
    JOIN users u ON dc.user_id = u.id
    WHERE dc.date >= ? AND dc.date <= ?
    GROUP BY u.name
    ORDER BY count DESC
    LIMIT ?
  `;
  return db.prepare(query).all(startDate, endDate, limit) as {
    user: string;
    count: number;
    pass_count: number;
  }[];
}

export async function getAllUsersByConversion(
  startDate: string,
  endDate: string
) {
  const query = `
    SELECT u.name as user, SUM(dc.count) as count, SUM(dc.pass_count) as pass_count
    FROM daily_conversions dc
    JOIN users u ON dc.user_id = u.id
    WHERE dc.date >= ? AND dc.date <= ?
    GROUP BY u.name
    ORDER BY count DESC
  `;
  return db.prepare(query).all(startDate, endDate) as {
    user: string;
    count: number;
    pass_count: number;
  }[];
}

export async function getAllUserConversions(
  startDate?: string,
  endDate?: string,
  userId?: number
) {
  let query = `
    SELECT dc.*, u.name as user_name, u.real_name
    FROM daily_conversions dc
    JOIN users u ON dc.user_id = u.id
  `;
  const params: any[] = [];

  const conditions = [];
  if (startDate) {
    conditions.push(`dc.date >= ?`);
    params.push(startDate);
  }

  if (endDate) {
    conditions.push(`dc.date <= ?`);
    params.push(endDate);
  }

  if (userId) {
    conditions.push(`dc.user_id = ?`);
    params.push(userId);
  }

  if (conditions.length > 0) {
    query += ` WHERE ` + conditions.join(" AND ");
  }

  query += ` ORDER BY dc.date DESC, dc.updated_at DESC`;

  const stmt = db.prepare(query);
  return stmt.all(...params) as (DailyConversion & {
    user_name: string;
    real_name?: string;
  })[];
}
