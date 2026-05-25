import express from 'express';
import { all, get, mapTask, run } from '../db/database.js';
import { authenticateRequest, requireAdmin } from '../services/authService.js';

export function createAdminRouter(db) {
  const router = express.Router();

  router.use(authenticateRequest.bind(null, db), requireAdmin);

  router.get('/overview', async (_req, res, next) => {
    try {
      const users = await all(
        db,
        `SELECT
          users.id,
          users.name,
          users.email,
          users.is_admin,
          users.created_at,
          COUNT(todos.id) AS reminder_count,
          SUM(CASE WHEN todos.status = 'pending' THEN 1 ELSE 0 END) AS pending_count
        FROM users
        LEFT JOIN todos ON todos.user_id = users.id
        GROUP BY users.id, users.name, users.email, users.is_admin, users.created_at
        ORDER BY users.created_at DESC`
      );
      const reminders = await all(
        db,
        `SELECT todos.*, users.name AS user_name, users.email AS user_email
         FROM todos
         LEFT JOIN users ON users.id = todos.user_id
         ORDER BY todos.due_at ASC
         LIMIT 100`
      );

      res.json({
        users: users.map((user) => ({
          ...user,
          is_admin: Boolean(user.is_admin),
          reminder_count: Number(user.reminder_count || 0),
          pending_count: Number(user.pending_count || 0)
        })),
        reminders: reminders.map((reminder) => ({
          ...mapTask(reminder),
          user_name: reminder.user_name,
          user_email: reminder.user_email
        }))
      });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/users/:id/admin', async (req, res, next) => {
    try {
      const user = await get(db, 'SELECT id FROM users WHERE id = ?', [req.params.id]);
      if (!user) return res.status(404).json({ error: 'User not found.' });

      if (!req.body.is_admin) {
        const adminCount = await get(db, 'SELECT COUNT(*) AS count FROM users WHERE is_admin = ?', [true]);
        if (Number(adminCount?.count || 0) <= 1) {
          return res.status(400).json({ error: 'At least one admin account is required.' });
        }
      }

      await run(db, 'UPDATE users SET is_admin = ? WHERE id = ?', [Boolean(req.body.is_admin), req.params.id]);
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
