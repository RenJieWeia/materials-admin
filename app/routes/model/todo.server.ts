import { db } from "../server/db.server";

export interface Todo {
  id: number;
  user_id: number;
  text: string;
  completed: number; // 0 or 1
  created_at: string;
  updated_at: string;
}

export async function getTodos(userId: number) {
  const query = `
    SELECT * FROM todos
    WHERE user_id = ?
    ORDER BY created_at DESC
  `;
  return db.prepare(query).all(userId) as Todo[];
}

export async function createTodo(userId: number, text: string) {
  const query = `
    INSERT INTO todos (user_id, text)
    VALUES (?, ?)
  `;
  const result = db.prepare(query).run(userId, text);
  return { id: result.lastInsertRowid, user_id: userId, text, completed: 0 };
}

export async function toggleTodo(id: number, userId: number) {
  const todo = db.prepare("SELECT completed FROM todos WHERE id = ? AND user_id = ?").get(id, userId) as { completed: number };
  if (!todo) return null;

  const newStatus = todo.completed === 1 ? 0 : 1;
  const query = `
    UPDATE todos
    SET completed = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ?
  `;
  db.prepare(query).run(newStatus, id, userId);
  return { id, completed: newStatus };
}

export async function deleteTodo(id: number, userId: number) {
  const query = `
    DELETE FROM todos
    WHERE id = ? AND user_id = ?
  `;
  db.prepare(query).run(id, userId);
  return { success: true };
}
