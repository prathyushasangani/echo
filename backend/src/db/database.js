import sqlite3 from 'sqlite3';
import pg from 'pg';
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
  if (process.env.DATABASE_URL) {
    const db = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false }
    });
    db.clientType = 'postgres';
    db.close = db.end.bind(db);
    await migratePostgres(db);
    return db;
  }

  const db = new sqlite3.Database(databasePath);
  db.clientType = 'sqlite';
  await migrateSqlite(db);
  return db;
}

async function migrateSqlite(db) {
  await run(db, `
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      is_admin INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )
  `);
  await run(db, `
    CREATE TABLE IF NOT EXISTS todos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      due_at TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending', 'completed')) DEFAULT 'pending',
      is_recurring INTEGER NOT NULL DEFAULT 0,
      category TEXT NOT NULL DEFAULT 'General',
      last_notified_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  await ensureColumn(db, 'users', 'is_admin', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn(db, 'todos', 'user_id', 'INTEGER');
  await ensureColumn(db, 'todos', 'category', "TEXT NOT NULL DEFAULT 'General'");
  await ensureColumn(db, 'todos', 'last_notified_at', 'TEXT');
  await promoteConfiguredAdmin(db);
}

async function migratePostgres(db) {
  await run(db, `
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      is_admin BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TEXT NOT NULL
    )
  `);
  await run(db, `
    CREATE TABLE IF NOT EXISTS todos (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      due_at TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending', 'completed')) DEFAULT 'pending',
      is_recurring BOOLEAN NOT NULL DEFAULT FALSE,
      category TEXT NOT NULL DEFAULT 'General',
      last_notified_at TEXT
    )
  `);
  await ensureColumn(db, 'users', 'is_admin', 'BOOLEAN NOT NULL DEFAULT FALSE');
  await ensureColumn(db, 'todos', 'user_id', 'INTEGER');
  await ensureColumn(db, 'todos', 'category', "TEXT NOT NULL DEFAULT 'General'");
  await ensureColumn(db, 'todos', 'last_notified_at', 'TEXT');
  await promoteConfiguredAdmin(db);
}

async function ensureColumn(db, table, column, definition) {
  assertSafeIdentifier(table);
  assertSafeIdentifier(column);
  const columns =
    db.clientType === 'postgres'
      ? await all(db, 'SELECT column_name AS name FROM information_schema.columns WHERE table_name = ?', [table])
      : await all(db, `PRAGMA table_info(${table})`);
  if (!columns.some((existingColumn) => existingColumn.name === column)) {
    await run(db, `ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

async function promoteConfiguredAdmin(db) {
  const adminEmail = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  if (adminEmail) {
    await run(db, 'UPDATE users SET is_admin = ? WHERE email = ?', [true, adminEmail]);
  }
}

export async function run(db, sql, params = []) {
  if (db.clientType === 'postgres') {
    const statement = withReturningId(toPostgresSql(sql));
    const result = await db.query(statement, params);
    return { id: result.rows[0]?.id, changes: result.rowCount };
  }

  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) reject(error);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

export async function get(db, sql, params = []) {
  if (db.clientType === 'postgres') {
    const result = await db.query(toPostgresSql(sql), params);
    return result.rows[0] || null;
  }

  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) reject(error);
      else resolve(row);
    });
  });
}

export async function all(db, sql, params = []) {
  if (db.clientType === 'postgres') {
    const result = await db.query(toPostgresSql(sql), params);
    return result.rows;
  }

  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) reject(error);
      else resolve(rows);
    });
  });
}

function toPostgresSql(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

function withReturningId(sql) {
  const normalized = sql.trim().toLowerCase();
  if (normalized.startsWith('insert') && !normalized.includes(' returning ')) {
    return `${sql} RETURNING id`;
  }
  return sql;
}

function assertSafeIdentifier(value) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(value)) {
    throw new Error(`Unsafe database identifier: ${value}`);
  }
}

export function mapTask(row) {
  if (!row) return null;

  return {
    ...row,
    category: row.category || 'General',
    is_recurring: Boolean(row.is_recurring)
  };
}
