import { LockKeyhole } from 'lucide-react';
import { useState } from 'react';
import { getGoogleIdToken } from '../lib/firebaseAuth.js';

export function AuthPage({ onSignIn, onSignUp, onGoogleSignIn }) {
  const [mode, setMode] = useState('signin');
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);

  function updateSignIn(field, value) {
    setAuthForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      if (mode === 'signup') {
        await onSignUp(authForm);
      } else {
        await onSignIn(authForm);
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleGoogleSignIn() {
    setError('');
    setIsGoogleSubmitting(true);

    try {
      const idToken = await getGoogleIdToken();
      await onGoogleSignIn(idToken);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsGoogleSubmitting(false);
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
          <h1>Welcome back</h1>
          <p>{mode === 'signup' ? 'Create an account to start saving reminders.' : 'Sign in to open your reminder dashboard.'}</p>
        </div>
        <div className="auth-actions">
          <button type="button" className="google-button" onClick={handleGoogleSignIn} disabled={isGoogleSubmitting}>
            <span aria-hidden="true">G</span>
            <span>{isGoogleSubmitting ? 'Opening Google...' : 'Continue with Google'}</span>
          </button>
        </div>
        <div className="auth-mode-toggle" role="tablist" aria-label="Account mode">
          <button type="button" className={mode === 'signin' ? 'is-active' : ''} onClick={() => setMode('signin')}>
            Sign in
          </button>
          <button type="button" className={mode === 'signup' ? 'is-active' : ''} onClick={() => setMode('signup')}>
            Sign up
          </button>
        </div>
        <form className="auth-form" onSubmit={handleSubmit}>
          {mode === 'signup' && (
            <label>
              Name
              <input
                type="text"
                value={authForm.name}
                onChange={(event) => updateSignIn('name', event.target.value)}
                autoComplete="name"
              />
            </label>
          )}
          <label>
            Email
            <input
              type="email"
              value={authForm.email}
              onChange={(event) => updateSignIn('email', event.target.value)}
              autoComplete="email"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={authForm.password}
              onChange={(event) => updateSignIn('password', event.target.value)}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            />
          </label>
          {error && <div className="notice">{error}</div>}
          <button
            type="submit"
            disabled={
              isSubmitting ||
              !authForm.email.trim() ||
              !authForm.password.trim() ||
              (mode === 'signup' && !authForm.name.trim())
            }
          >
            <LockKeyhole size={16} />
            {isSubmitting ? 'Please wait...' : mode === 'signup' ? 'Create account' : 'Sign in'}
          </button>
        </form>
      </section>
    </main>
  );
}
