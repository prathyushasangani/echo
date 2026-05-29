import express from 'express';
import { all, get, mapTask, run } from '../db/database.js';
import { addDaysPreservingTime } from '../services/taskDates.js';
import { createTaskFromInput } from '../services/taskService.js';

export function createTaskRouter(db) {
  const router = express.Router();

  router.get('/', async (req, res, next) => {
    try {
      const includeCompleted = req.query.includeCompleted === 'true';
      const rows = await all(
        db,
        `SELECT * FROM todos
         WHERE user_id = ?
         ${includeCompleted ? '' : "AND status = 'pending'"}
         ORDER BY due_at ASC`,
        [req.user.id]
      );

      res.json(rows.map(mapTask));
    } catch (error) {
      next(error);
    }
  });

  router.post('/parse', async (req, res, next) => {
    try {
      const input = String(req.body.input || '').trim();
      if (!input) {
        return res.status(400).json({ error: 'Input is required.' });
      }

      const task = await createTaskFromInput(db, input, {
        category: req.body.category,
        is_recurring: req.body.is_recurring,
        source: 'top-input',
        userId: req.user.id
      });
      res.status(201).json(mapTask(task));
    } catch (error) {
      next(error);
    }
  });

  router.put('/:id', async (req, res, next) => {
    try {
      const task = await get(db, 'SELECT * FROM todos WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
      if (!task) {
        return res.status(404).json({ error: 'Task not found.' });
      }

      const requestedStatus = req.body.status || (task.status === 'pending' ? 'completed' : 'pending');
      if (!['pending', 'completed'].includes(requestedStatus)) {
        return res.status(400).json({ error: 'Status must be pending or completed.' });
      }

      if (task.is_recurring && requestedStatus === 'completed') {
        const nextDueAt = addDaysPreservingTime(task.due_at, 1);
        await run(db, "UPDATE todos SET due_at = ?, status = 'pending' WHERE id = ?", [nextDueAt, task.id]);
      } else {
        await run(db, 'UPDATE todos SET status = ? WHERE id = ?', [requestedStatus, task.id]);
      }

      const updated = await get(db, 'SELECT * FROM todos WHERE id = ? AND user_id = ?', [task.id, req.user.id]);
      res.json(mapTask(updated));
    } catch (error) {
      next(error);
    }
  });

  router.delete('/:id', async (req, res, next) => {
    try {
      const result = await run(db, 'DELETE FROM todos WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
      if (!result.changes) {
        return res.status(404).json({ error: 'Task not found.' });
      }

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  router.use((error, _req, res, _next) => {
    if (!error.statusCode || error.statusCode >= 500) {
      console.error(error);
    }
    res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'Unexpected server error.' });
  });

  return router;
}
