import { db } from "../core/db.server";

export interface AuditLog {
  id: number;
  user_id?: number;
  user_name?: string;
  action: string;
  entity: string;
  entity_id?: string;
  details?: string;
  ip_address?: string;
  created_at: string;
}

export function getClientIP(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }
  return request.headers.get("x-real-ip") || "127.0.0.1";
}

export function createAuditLog(data: Omit<AuditLog, "id" | "created_at">, request?: Request) {
  try {
    let ip_address = data.ip_address;
    if (!ip_address && request) {
      ip_address = getClientIP(request);
    }

    const stmt = db.prepare(`
      INSERT INTO audit_logs (user_id, user_name, action, entity, entity_id, details, ip_address)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      data.user_id || null,
      data.user_name || null,
      data.action,
      data.entity,
      data.entity_id || null,
      data.details || null,
      ip_address || null
    );
  } catch (error) {
    console.error("Failed to create audit log:", error);
  }
}

export function getAuditLogs(
  page: number = 1,
  limit: number = 20,
  filters: {
    user_name?: string;
    action?: string;
    entity?: string;
    startDate?: string;
    endDate?: string;
  } = {}
) {
  const offset = (page - 1) * limit;
  let query = `SELECT * FROM audit_logs WHERE 1=1`;
  let countQuery = `SELECT COUNT(*) as count FROM audit_logs WHERE 1=1`;
  const params: any[] = [];

  if (filters.user_name) {
    const clause = ` AND user_name LIKE ?`;
    query += clause;
    countQuery += clause;
    params.push(`%${filters.user_name}%`);
  }

  if (filters.action) {
    const clause = ` AND action = ?`;
    query += clause;
    countQuery += clause;
    params.push(filters.action);
  }

  if (filters.entity) {
    const clause = ` AND entity = ?`;
    query += clause;
    countQuery += clause;
    params.push(filters.entity);
  }

  if (filters.startDate) {
    const clause = ` AND created_at >= ?`;
    query += clause;
    countQuery += clause;
    params.push(`${filters.startDate} 00:00:00`);
  }

  if (filters.endDate) {
    const clause = ` AND created_at <= ?`;
    query += clause;
    countQuery += clause;
    params.push(`${filters.endDate} 23:59:59`);
  }

  query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  
  const logs = db.prepare(query).all(...params, limit, offset) as AuditLog[];
  const count = db.prepare(countQuery).get(...params) as { count: number };

  return {
    logs,
    total: count.count,
    page,
    totalPages: Math.ceil(count.count / limit),
  };
}

export function getAuditLogOptions() {
  const actions = db.prepare("SELECT DISTINCT action FROM audit_logs ORDER BY action").all() as { action: string }[];
  const entities = db.prepare("SELECT DISTINCT entity FROM audit_logs ORDER BY entity").all() as { entity: string }[];
  
  return {
    actions: actions.map(a => a.action),
    entities: entities.map(e => e.entity)
  };
}
