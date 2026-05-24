import sqlite3 from 'sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultPath = path.resolve(__dirname, '../../agents.db');
const configuredPath = process.env.DATABASE_PATH || defaultPath;
const databasePath = path.isAbsolute(configuredPath)
  ? configuredPath
  : path.resolve(__dirname, '../../', configuredPath);

sqlite3.verbose();

export async function initDb() {
  const db = new sqlite3.Database(databasePath);
  await run(db, `
    CREATE TABLE IF NOT EXISTS todos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      due_at TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending', 'completed')) DEFAULT 'pending',
      is_recurring INTEGER NOT NULL DEFAULT 0,
      category TEXT NOT NULL DEFAULT 'General',
      last_notified_at TEXT
    )
  `);
  await ensureColumn(db, 'todos', 'category', "TEXT NOT NULL DEFAULT 'General'");
  await ensureColumn(db, 'todos', 'last_notified_at', 'TEXT');

  return db;
}

async function ensureColumn(db, table, column, definition) {
  const columns = await all(db, `PRAGMA table_info(${table})`);
  if (!columns.some((existingColumn) => existingColumn.name === column)) {
    await run(db, `ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) reject(error);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

export function get(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) reject(error);
      else resolve(row);
    });
  });
}

export function all(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) reject(error);
      else resolve(rows);
    });
  });
}

export function mapTask(row) {
  if (!row) return null;

  return {
    ...row,
    category: row.category || 'General',
    is_recurring: Boolean(row.is_recurring)
  };
}
