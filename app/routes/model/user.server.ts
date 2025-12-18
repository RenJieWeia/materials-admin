import bcrypt from "bcryptjs";
import { db } from "../server/db.server";

export interface User {
  id: number;
  email: string;
  name: string;
  real_name?: string;
  role: string;
  created_at: string;
  updated_at: string;
}

export async function verifyLogin(name: string, password: string) {
  let user = db
    .prepare(
      `
    SELECT id, email, password, name
    FROM users
    WHERE name = ?
  `
    )
    .get(name) as
    | { id: number; email: string; password: string; name: string }
    | undefined;
  if (!user) {
    return null;
  }
  const isValid = await bcrypt.compare(password, user.password);
  if (!isValid) {
    return null;
  }

  return {
    id: user.id.toString(),
    email: user.email,
    name: user.name,
  };
}

export async function getUserById(id: string) {
  const user = db
    .prepare(
      `
    SELECT id, email, name, real_name, role, created_at
    FROM users
    WHERE id = ?
  `
    )
    .get(parseInt(id)) as User | undefined;

  if (!user) return null;

  return {
    id: user.id.toString(),
    email: user.email,
    name: user.name,
    real_name: user.real_name,
    role: user.role,
    created_at: user.created_at,
  };
}

export async function deleteUser(userId: string) {
  try {
    db.prepare("DELETE FROM users WHERE id = ?").run(parseInt(userId));
    return { success: true };
  } catch (error) {
    return { success: false, message: "Delete failed" };
  }
}

export async function updateUserProfile(
  userId: string,
  data: { name?: string; email?: string; real_name?: string }
) {
  const updateFields = [];
  const values: any[] = [];

  if (data.name) {
    updateFields.push("name = ?");
    values.push(data.name);
  }

  if (data.email) {
    updateFields.push("email = ?");
    values.push(data.email);
  }

  if (data.real_name !== undefined) {
    updateFields.push("real_name = ?");
    values.push(data.real_name);
  }

  if (updateFields.length === 0) {
    return { success: false, message: "No fields to update" };
  }

  updateFields.push("updated_at = CURRENT_TIMESTAMP");
  values.push(parseInt(userId));

  const query = `
    UPDATE users
    SET ${updateFields.join(", ")}
    WHERE id = ?
  `;

  try {
    db.prepare(query).run(...values);
    return { success: true };
  } catch (error: any) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return { success: false, message: "Email already exists" };
    }
    return { success: false, message: "Update failed" };
  }
}

export async function createUser(
  email: string,
  password: string,
  name: string,
  role: string = "user",
  real_name?: string
) {
  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const result = db
      .prepare(
        `
      INSERT INTO users (email, password, name, role, real_name)
      VALUES (?, ?, ?, ?, ?)
    `
      )
      .run(email, hashedPassword, name, role, real_name || null);

    return {
      success: true,
      userId: result.lastInsertRowid,
    };
  } catch (error: any) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return { success: false, message: "Email already exists" };
    }
    return { success: false, message: "Registration failed" };
  }
}

export async function updateUserPassword(userId: string, password: string) {
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    db.prepare("UPDATE users SET password = ? WHERE id = ?").run(
      hashedPassword,
      userId
    );
    return { success: true };
  } catch (error) {
    return { success: false, message: "Update password failed" };
  }
}

export async function getAllUsers() {
  const query = `SELECT id, name, real_name, role FROM users ORDER BY role DESC, name ASC`;
  return db.prepare(query).all() as User[];
}

export async function getUsers(options: {
  name?: string;
  email?: string;
  role?: string;
  page?: number;
  limit?: number;
} = {}) {
  const { name, email, role, page = 1, limit = 10 } = options;
  const offset = (page - 1) * limit;

  let query =
    "SELECT id, email, name, real_name, role, created_at FROM users WHERE 1=1";
  let countQuery = "SELECT COUNT(*) as count FROM users WHERE 1=1";
  const params: any[] = [];

  if (name) {
    const clause = " AND name LIKE ?";
    query += clause;
    countQuery += clause;
    params.push(`%${name}%`);
  }

  if (email) {
    const clause = " AND email LIKE ?";
    query += clause;
    countQuery += clause;
    params.push(`%${email}%`);
  }

  if (role) {
    const clause = " AND role = ?";
    query += clause;
    countQuery += clause;
    params.push(role);
  }

  query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";

  const total = (db.prepare(countQuery).get(...params) as { count: number })
    .count;
  const users = db.prepare(query).all(...params, limit, offset) as User[];

  return { users, total, page, limit, totalPages: Math.ceil(total / limit) };
}
