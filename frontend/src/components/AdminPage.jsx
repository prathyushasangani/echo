import { ShieldCheck, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { fetchAdminOverview, updateUserAdmin } from '../lib/api.js';

export function AdminPage({ onBack }) {
  const [overview, setOverview] = useState({ users: [], reminders: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadOverview() {
    setLoading(true);
    setError('');
    try {
      setOverview(await fetchAdminOverview());
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOverview();
  }, []);

  async function handleAdminToggle(user) {
    try {
      await updateUserAdmin(user.id, !user.is_admin);
      await loadOverview();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  return (
    <main className="app-shell">
      <div className="jarvis-bg" aria-hidden="true">
        <span className="glow glow--blue" />
        <span className="glow glow--violet" />
      </div>
      <header className="topbar topbar--compact">
        <div className="brand-mark">
          <span>E</span>
          <div>
            <strong>Echo Admin</strong>
            <small>Users and reminder storage</small>
          </div>
        </div>
        <button className="tool-button" onClick={onBack}>
          Back to app
        </button>
      </header>

      {error && <div className="notice">{error}</div>}
      {loading && <div className="loading">Loading admin data...</div>}

      <section className="admin-grid">
        <div className="task-section admin-panel">
          <header>
            <div>
              <h2>Accounts</h2>
              <p>Every reminder belongs to one user account.</p>
            </div>
            <Users size={20} aria-hidden="true" />
          </header>
          <div className="admin-table">
            <div className="admin-row admin-row--head">
              <span>User</span>
              <span>Reminders</span>
              <span>Admin</span>
            </div>
            {overview.users.map((user) => (
              <div className="admin-row" key={user.id}>
                <span>
                  <strong>{user.name}</strong>
                  <small>{user.email}</small>
                </span>
                <span>
                  {user.pending_count} pending / {user.reminder_count} total
                </span>
                <span>
                  <button className="admin-toggle" onClick={() => handleAdminToggle(user)}>
                    {user.is_admin ? 'Admin' : 'User'}
                  </button>
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="task-section admin-panel">
          <header>
            <div>
              <h2>Recent Reminders</h2>
              <p>Latest stored reminders across all users.</p>
            </div>
            <ShieldCheck size={20} aria-hidden="true" />
          </header>
          <div className="admin-table">
            <div className="admin-row admin-row--head admin-row--reminder">
              <span>Reminder</span>
              <span>Owner</span>
              <span>Status</span>
            </div>
            {overview.reminders.map((reminder) => (
              <div className="admin-row admin-row--reminder" key={reminder.id}>
                <span>
                  <strong>{reminder.title}</strong>
                  <small>{new Date(reminder.due_at).toLocaleString()}</small>
                </span>
                <span>{reminder.user_email || 'No owner'}</span>
                <span>{reminder.status}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
