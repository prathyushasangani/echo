import { LockKeyhole, UserPlus } from 'lucide-react';
import { useState } from 'react';

export function AuthPage({ onSignIn, onSignUp }) {
  const [mode, setMode] = useState('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      if (mode === 'signup') {
        await onSignUp({ name, email, password });
      } else {
        await onSignIn({ email, password });
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-shell">
      <div className="jarvis-bg" aria-hidden="true">
        <span className="glow glow--blue" />
        <span className="glow glow--violet" />
        <span className="scan-ring scan-ring--one" />
      </div>
      <section className="auth-card">
        <div className="brand-mark">
          <span>E</span>
          <div>
            <strong>Echo</strong>
            <small>Your private reminder assistant</small>
          </div>
        </div>
        <div className="auth-copy">
          <h1>{mode === 'signup' ? 'Create your Echo account' : 'Welcome back'}</h1>
          <p>Your reminders stay linked to your own account.</p>
        </div>
        <div className="auth-tabs">
          <button type="button" className={mode === 'signin' ? 'is-active' : ''} onClick={() => setMode('signin')}>
            <LockKeyhole size={16} />
            Sign in
          </button>
          <button type="button" className={mode === 'signup' ? 'is-active' : ''} onClick={() => setMode('signup')}>
            <UserPlus size={16} />
            Sign up
          </button>
        </div>
        <form className="auth-form" onSubmit={handleSubmit}>
          {mode === 'signup' && (
            <label>
              Name
              <input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" />
            </label>
          )}
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            />
          </label>
          {error && <div className="notice">{error}</div>}
          <button type="submit" disabled={isSubmitting || !email.trim() || !password.trim()}>
            {isSubmitting ? 'Please wait...' : mode === 'signup' ? 'Create account' : 'Sign in'}
          </button>
        </form>
      </section>
    </main>
  );
}
