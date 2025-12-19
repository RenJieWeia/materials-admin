import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath =
  process.env.NODE_ENV === "production"
    ? path.join(process.cwd(), "data", "app.db")
    : path.join(__dirname, "..", "data", "app.db");

// 确保数据目录存在
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Singleton pattern for development to avoid database locks during HMR
let db: Database.Database;

declare global {
  var __db__: Database.Database | undefined;
}

if (process.env.NODE_ENV === "production") {
  db = new Database(dbPath);
} else {
  if (!global.__db__) {
    global.__db__ = new Database(dbPath);
  }
  db = global.__db__;
}

db.pragma("journal_mode = WAL");

// 创建用户表
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'user' NOT NULL,
    name TEXT NOT NULL,
    real_name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS user_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    session_token TEXT UNIQUE NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS materials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_name TEXT NOT NULL,
    account_name TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT '空闲' NOT NULL,
    user TEXT,
    usage_time DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS daily_conversions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    count INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, date)
  );

  CREATE TABLE IF NOT EXISTS todos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    text TEXT NOT NULL,
    completed INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

// Migration: Add real_name column if it doesn't exist
try {
  const tableInfo = db.pragma("table_info(users)") as any[];
  const hasRealName = tableInfo.some((col) => col.name === "real_name");
  if (!hasRealName) {
    db.prepare("ALTER TABLE users ADD COLUMN real_name TEXT").run();
  }
} catch (error) {
  console.error("Migration failed:", error);
}

// 插入示例数据（如果表是空的）
const userCount = db.prepare("SELECT COUNT(*) as count FROM users").get() as {
  count: number;
};

if (userCount.count === 0) {
  const insertUser = db.prepare(`
    INSERT INTO users (email, password, name, role)
    VALUES (?, ?, ?, ?)
  `);

  const users = [
    {
      email: "admin@example.com",
      password: bcrypt.hashSync("Renjienb", 10),
      name: "admin",
      role: "admin",
    },
  ];

  for (const user of users) {
    insertUser.run(user.email, user.password, user.name, user.role);
  }
}

export { db };
