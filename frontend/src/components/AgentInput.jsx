import { SendHorizontal, Sparkles } from 'lucide-react';

const reminderTypes = ['Travel', 'Home', 'Office', 'General', 'One-time'];

export function AgentInput({
  value,
  onChange,
  onSubmit,
  isSubmitting,
  reminderType,
  onReminderTypeChange
}) {
  return (
    <form className="agent-form" onSubmit={onSubmit}>
      <div className="agent-input">
        <Sparkles size={20} aria-hidden="true" />
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Pack passport at 8 AM"
          aria-label="Reminder prompt"
        />
        <button type="submit" disabled={isSubmitting || !value.trim()} aria-label="Add reminder">
          <SendHorizontal size={18} aria-hidden="true" />
        </button>
      </div>

      <div className="input-controls" aria-label="Reminder settings">
        <div className="control-group">
          <span>Reminder type</span>
          <div className="segmented-control category-control">
            {reminderTypes.map((item) => (
              <button
                key={item}
                type="button"
                className={reminderType === item ? 'is-active' : ''}
                onClick={() => onReminderTypeChange(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      </div>
    </form>
  );
}
