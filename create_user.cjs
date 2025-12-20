const Database = require('better-sqlite3');
const db = new Database('data/app.db');

try {
  // Add real_name column if it doesn't exist
  const tableInfo = db.pragma("table_info(users)");
  const hasRealName = tableInfo.some((col) => col.name === "real_name");
  if (!hasRealName) {
    console.log("Adding real_name column...");
    db.prepare("ALTER TABLE users ADD COLUMN real_name TEXT").run();
  }

  db.prepare(`
    INSERT INTO users (email, password, name, role, real_name)
    VALUES ('test@example.com', 'password', 'testuser', 'user', 'Test User')
  `).run();
  console.log('User created');
} catch (e) {
  console.error(e);
}
