import { TaskCard } from './TaskCard.jsx';

export function TaskSection({ title, subtitle, tasks, emptyText, onComplete, onDelete, compact = false }) {
  return (
    <section className={`task-section ${compact ? 'task-section--compact' : ''}`}>
      <header>
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <span>{tasks.length}</span>
      </header>

      <div className="task-list">
        {tasks.length ? (
          tasks.map((task) => (
            <TaskCard key={task.id} task={task} onComplete={onComplete} onDelete={onDelete} />
          ))
        ) : (
          <div className="empty-state">{emptyText}</div>
        )}
      </div>
    </section>
  );
}
