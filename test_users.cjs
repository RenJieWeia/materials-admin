const Database = require('better-sqlite3');
const db = new Database('data/app.db');

try {
  const query = `SELECT id, name, real_name, role FROM users ORDER BY role DESC, name ASC`;
  const users = db.prepare(query).all();
  console.log(users);
} catch (e) {
  console.error(e);
}
