import { db } from "../server/db.server";

export interface DailyConversion {
  id: number;
  user_id: number;
  date: string;
  count: number;
  created_at: string;
  updated_at: string;
}

export async function recordConversion(
  userId: number,
  date: string,
  count: number
) {
  const stmt = db.prepare(`
    INSERT INTO daily_conversions (user_id, date, count, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id, date) DO UPDATE SET
      count = excluded.count,
      updated_at = CURRENT_TIMESTAMP
  `);
  return stmt.run(userId, date, count);
}

export async function getConversion(userId: number, date: string) {
  const stmt = db.prepare(`
    SELECT * FROM daily_conversions
    WHERE user_id = ? AND date = ?
  `);
  return stmt.get(userId, date) as DailyConversion | undefined;
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
    SELECT date, SUM(count) as count
    FROM daily_conversions
    WHERE date >= ? AND date <= ?
    GROUP BY date
    ORDER BY date ASC
  `;
  return db.prepare(query).all(startDate, endDate) as {
    date: string;
    count: number;
  }[];
}

export async function getTopUsersByConversion(
  startDate: string,
  endDate: string,
  limit: number = 5
) {
  const query = `
    SELECT u.name as user, SUM(dc.count) as count
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
  }[];
}
