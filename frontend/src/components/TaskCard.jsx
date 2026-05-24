import { CalendarClock, Check, Repeat, Trash2 } from 'lucide-react';

export function TaskCard({ task, onComplete, onDelete }) {
  const due = new Date(task.due_at);
  const isCompleted = task.status === 'completed';
  const dueLabel = due.toLocaleString([], {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    day: 'numeric'
  });

  return (
    <article className={`task-card ${isCompleted ? 'is-completed' : ''}`}>
      <div className="task-card__left">
        <button
          className="icon-button check-button"
          onClick={() => onComplete(task)}
          disabled={isCompleted}
          title={task.is_recurring ? 'Complete and move to tomorrow' : 'Complete reminder'}
          aria-label="Mark completed"
        >
          <Check size={18} aria-hidden="true" />
        </button>
        <h3>{task.title}</h3>
        {task.is_recurring && (
          <span className="routine-pill" title="Daily reminder">
            <Repeat size={13} aria-hidden="true" />
          </span>
        )}
      </div>
      <div className="task-card__right">
        {!task.is_recurring && (
          <time dateTime={task.due_at}>
            <CalendarClock size={14} aria-hidden="true" />
            {dueLabel}
          </time>
        )}
        <button className="icon-button danger-button" onClick={() => onDelete(task.id)} title="Delete reminder" aria-label="Delete reminder">
          <Trash2 size={17} aria-hidden="true" />
        </button>
      </div>
    </article>
  );
}
