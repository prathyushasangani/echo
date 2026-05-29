import admin from 'firebase-admin';
import fs from 'node:fs';
import path from 'node:path';

export function initFirebaseDb() {
  if (!admin.apps.length) {
    const credentialsJson = getServiceAccountJson();
    const credential = credentialsJson
      ? admin.credential.cert(JSON.parse(credentialsJson))
      : admin.credential.applicationDefault();

    admin.initializeApp({
      credential,
      projectId: process.env.FIREBASE_PROJECT_ID
    });
  }

  return {
    clientType: 'firebase',
    firestore: admin.firestore(),
    close: async () => {}
  };
}

function getServiceAccountJson() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  }

  if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    return Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8');
  }

  return readServiceAccountFile();
}

function readServiceAccountFile() {
  const configuredPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (!configuredPath) return '';

  const resolvedPath = path.isAbsolute(configuredPath)
    ? configuredPath
    : path.resolve(process.cwd(), configuredPath);

  return fs.readFileSync(resolvedPath, 'utf8');
}

export async function runFirebase(db, sql, params = []) {
  const normalized = normalizeSql(sql);

  if (normalized.startsWith('create table') || normalized.startsWith('alter table')) {
    return { id: undefined, changes: 0 };
  }

  if (normalized.startsWith('insert into users')) {
    const [name, email, passwordHash, isAdmin, createdAt] = params;
    const id = await nextId(db, 'users');
    await setDoc(db, 'users', id, { id, name, email, password_hash: passwordHash, is_admin: Boolean(isAdmin), created_at: createdAt });
    return { id, changes: 1 };
  }

  if (normalized.startsWith('insert into todos')) {
    const [userId, title, description, createdAt, dueAt, isRecurring, category] = params;
    const id = await nextId(db, 'todos');
    await setDoc(db, 'todos', id, {
      id,
      user_id: Number(userId),
      title,
      description,
      created_at: createdAt,
      due_at: dueAt,
      status: 'pending',
      is_recurring: Boolean(isRecurring),
      category,
      last_notified_at: null
    });
    return { id, changes: 1 };
  }

  if (normalized.startsWith('insert into push_subscriptions')) {
    const [userId, endpoint, subscriptionJson, createdAt, updatedAt] = params;
    const existing = (await queryCollection(db, 'push_subscriptions', (item) => item.endpoint === endpoint))[0];
    const id = existing?.id || await nextId(db, 'push_subscriptions');
    await setDoc(db, 'push_subscriptions', id, {
      id,
      user_id: Number(userId),
      endpoint,
      subscription_json: subscriptionJson,
      created_at: existing?.created_at || createdAt,
      updated_at: updatedAt
    });
    return { id, changes: 1 };
  }

  if (normalized === 'update users set is_admin = ? where email = ?') {
    const [isAdmin, email] = params;
    const users = await queryCollection(db, 'users', (user) => user.email === email);
    await Promise.all(users.map((user) => updateDoc(db, 'users', user.id, { is_admin: Boolean(isAdmin) })));
    return { changes: users.length };
  }

  if (normalized === 'update users set is_admin = ? where email != ?') {
    const [isAdmin, email] = params;
    const users = await queryCollection(db, 'users', (user) => user.email !== email);
    await Promise.all(users.map((user) => updateDoc(db, 'users', user.id, { is_admin: Boolean(isAdmin) })));
    return { changes: users.length };
  }

  if (normalized === 'update users set is_admin = ? where id = ?') {
    const [isAdmin, id] = params;
    await updateDoc(db, 'users', id, { is_admin: Boolean(isAdmin) });
    return { changes: 1 };
  }

  if (normalized === 'update todos set status = ? where id = ?') {
    const [status, id] = params;
    await updateDoc(db, 'todos', id, { status });
    return { changes: 1 };
  }

  if (normalized === "update todos set due_at = ?, status = 'pending' where id = ?") {
    const [dueAt, id] = params;
    await updateDoc(db, 'todos', id, { due_at: dueAt, status: 'pending' });
    return { changes: 1 };
  }

  if (normalized === 'update todos set due_at = ?, last_notified_at = null where id = ?') {
    const [dueAt, id] = params;
    await updateDoc(db, 'todos', id, { due_at: dueAt, last_notified_at: null });
    return { changes: 1 };
  }

  if (normalized === 'update todos set due_at = ?, status = ?, last_notified_at = null where id = ?') {
    const [dueAt, status, id] = params;
    await updateDoc(db, 'todos', id, { due_at: dueAt, status, last_notified_at: null });
    return { changes: 1 };
  }

  if (normalized === 'update todos set status = ?, last_notified_at = null where id = ?') {
    const [status, id] = params;
    await updateDoc(db, 'todos', id, { status, last_notified_at: null });
    return { changes: 1 };
  }

  if (normalized === 'update todos set last_notified_at = ? where id = ?') {
    const [lastNotifiedAt, id] = params;
    await updateDoc(db, 'todos', id, { last_notified_at: lastNotifiedAt });
    return { changes: 1 };
  }

  if (normalized === 'delete from todos where id = ? and user_id = ?') {
    const [id, userId] = params;
    const task = await getById(db, 'todos', id);
    if (!task || Number(task.user_id) !== Number(userId)) return { changes: 0 };
    await db.firestore.collection('todos').doc(String(id)).delete();
    return { changes: 1 };
  }

  if (normalized === 'delete from push_subscriptions where endpoint = ? and user_id = ?') {
    const [endpoint, userId] = params;
    const subscriptions = await queryCollection(
      db,
      'push_subscriptions',
      (item) => item.endpoint === endpoint && Number(item.user_id) === Number(userId)
    );
    await Promise.all(subscriptions.map((item) => db.firestore.collection('push_subscriptions').doc(String(item.id)).delete()));
    return { changes: subscriptions.length };
  }

  if (normalized === 'delete from push_subscriptions where endpoint = ?') {
    const [endpoint] = params;
    const subscriptions = await queryCollection(db, 'push_subscriptions', (item) => item.endpoint === endpoint);
    await Promise.all(subscriptions.map((item) => db.firestore.collection('push_subscriptions').doc(String(item.id)).delete()));
    return { changes: subscriptions.length };
  }

  throw new Error(`Unsupported Firebase query: ${sql}`);
}

export async function getFirebase(db, sql, params = []) {
  const normalized = normalizeSql(sql);

  if (normalized === 'select id from users where email = ?' || normalized === 'select * from users where email = ?') {
    return (await queryCollection(db, 'users', (user) => user.email === params[0]))[0] || null;
  }

  if (normalized === 'select count(*) as count from users') {
    return { count: (await allDocs(db, 'users')).length };
  }

  if (normalized === 'select count(*) as count from users where is_admin = ?') {
    return { count: (await queryCollection(db, 'users', (user) => Boolean(user.is_admin) === Boolean(params[0]))).length };
  }

  if (normalized.startsWith('select id, name, email, is_admin, created_at from users where id =')) {
    return getById(db, 'users', params[0]);
  }

  if (normalized === 'select id from users where id = ?') {
    const user = await getById(db, 'users', params[0]);
    return user ? { id: user.id } : null;
  }

  if (normalized === 'select * from todos where id = ?') {
    return getById(db, 'todos', params[0]);
  }

  if (normalized === 'select * from todos where id = ? and user_id = ?') {
    const task = await getById(db, 'todos', params[0]);
    return task && Number(task.user_id) === Number(params[1]) ? task : null;
  }

  if (normalized.includes('from todos') && normalized.includes('last_notified_at is not null')) {
    const userId = params[0];
    const tasks = (await queryCollection(
      db,
      'todos',
      (task) => task.status === 'pending' && Number(task.user_id) === Number(userId) && task.last_notified_at
    )).sort((a, b) => String(b.last_notified_at).localeCompare(String(a.last_notified_at)));
    return tasks[0] || null;
  }

  throw new Error(`Unsupported Firebase query: ${sql}`);
}

export async function allFirebase(db, sql, params = []) {
  const normalized = normalizeSql(sql);

  if (normalized.includes('information_schema.columns')) return [];

  if (normalized.startsWith('select * from todos where user_id =')) {
    const userId = params[0];
    const includeCompleted = !normalized.includes("and status = 'pending'");
    return (await queryCollection(
      db,
      'todos',
      (task) => Number(task.user_id) === Number(userId) && (includeCompleted || task.status === 'pending')
    )).sort(sortByDueAt);
  }

  if (normalized.startsWith('select * from todos where due_at <=')) {
    const now = params[0];
    return (await queryCollection(
      db,
      'todos',
      (task) => task.due_at <= now && task.status === 'pending' && !task.last_notified_at
    )).sort(sortByDueAt);
  }

  if (normalized.includes('from users') && normalized.includes('left join todos') && normalized.includes('group by')) {
    const users = await allDocs(db, 'users');
    const todos = await allDocs(db, 'todos');
    return users
      .map((user) => {
        const userTodos = todos.filter((task) => Number(task.user_id) === Number(user.id));
        return {
          ...user,
          reminder_count: userTodos.length,
          pending_count: userTodos.filter((task) => task.status === 'pending').length
        };
      })
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  }

  if (normalized.includes('from todos') && normalized.includes('left join users')) {
    const users = await allDocs(db, 'users');
    const userById = new Map(users.map((user) => [Number(user.id), user]));
    return (await allDocs(db, 'todos'))
      .sort(sortByDueAt)
      .slice(0, 100)
      .map((task) => ({
        ...task,
        user_name: userById.get(Number(task.user_id))?.name || '',
        user_email: userById.get(Number(task.user_id))?.email || ''
      }));
  }

  if (normalized === 'select * from push_subscriptions where user_id = ?') {
    const [userId] = params;
    return queryCollection(db, 'push_subscriptions', (item) => Number(item.user_id) === Number(userId));
  }

  throw new Error(`Unsupported Firebase query: ${sql}`);
}

async function nextId(db, name) {
  const ref = db.firestore.collection('counters').doc(name);
  return db.firestore.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    const next = Number(snap.data()?.value || 0) + 1;
    transaction.set(ref, { value: next }, { merge: true });
    return next;
  });
}

async function setDoc(db, collection, id, value) {
  await db.firestore.collection(collection).doc(String(id)).set(value);
}

async function updateDoc(db, collection, id, value) {
  await db.firestore.collection(collection).doc(String(id)).set(value, { merge: true });
}

async function getById(db, collection, id) {
  const snap = await db.firestore.collection(collection).doc(String(id)).get();
  return snap.exists ? snap.data() : null;
}

async function allDocs(db, collection) {
  const snap = await db.firestore.collection(collection).get();
  return snap.docs.map((doc) => doc.data());
}

async function queryCollection(db, collection, predicate) {
  return (await allDocs(db, collection)).filter(predicate);
}

function normalizeSql(sql) {
  return String(sql || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function sortByDueAt(a, b) {
  return String(a.due_at || '').localeCompare(String(b.due_at || ''));
}
