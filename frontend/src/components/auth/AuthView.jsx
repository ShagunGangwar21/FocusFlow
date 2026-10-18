import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { IconSun, IconMoon, IconShieldCheck, IconClock } from '../common/Icons';

export default function AuthView({ theme, onToggleTheme }) {
  const { login, register, error, clearError } = useAuth();
  const [tab, setTab] = useState('login'); // 'login' | 'register'
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // Form fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [timezone, setTimezone] = useState(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
      return 'UTC';
    }
  });

  const handleTabChange = (nextTab) => {
    setTab(nextTab);
    setFormError('');
    clearError();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    clearError();

    // Client-side quick checks
    if (!email || !password) {
      setFormError('Please enter both your email and password.');
      return;
    }

    if (tab === 'register') {
      if (!name || name.trim().length < 2) {
        setFormError('Name must be at least 2 characters long.');
        return;
      }
      if (password.length < 8) {
        setFormError('Password must be at least 8 characters.');
        return;
      }
      if (!/^(?=.*[A-Za-z])(?=.*\d)/.test(password)) {
        setFormError('Password must contain at least one letter and one number.');
        return;
      }
    }

    try {
      setIsSubmitting(true);
      if (tab === 'login') {
        await login(email.trim(), password);
      } else {
        await register(name.trim(), email.trim(), password, timezone);
      }
    } catch (err) {
      // Specific field validation details from backend if available
      if (err.details && Array.isArray(err.details) && err.details.length > 0) {
        setFormError(err.details.map((d) => d.issue).join(' • '));
      } else {
        setFormError(err.message || 'Authentication failed. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-[var(--bg-app)] text-[var(--text-main)] transition-colors">
      {/* Top Bar with Brand & Theme Toggle */}
      <header className="flex items-center justify-between h-16 px-6 md:px-12 border-b border-[var(--border-subtle)] bg-[var(--bg-app)]/80 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-[var(--accent)] text-[var(--accent-text)] font-bold shadow-xs">
            <span className="text-base tracking-tight">FF</span>
          </div>
          <span className="text-lg font-bold tracking-tight text-[var(--text-main)]">
            Focus<span className="text-[var(--accent)]">Flow</span>
          </span>
        </div>

        <button
          type="button"
          onClick={onToggleTheme}
          className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-card)] border border-[var(--border-subtle)] transition-colors cursor-pointer"
          title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} mode`}
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? (
            <IconSun className="w-4 h-4 text-[var(--accent)]" />
          ) : (
            <IconMoon className="w-4 h-4 text-[var(--text-main)]" />
          )}
        </button>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex items-center justify-center p-4 md:p-8">
        <div className="w-full max-w-md">
          {/* Brand Introduction Pill */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-muted)] mb-3">
              <IconShieldCheck className="w-3.5 h-3.5 text-[var(--status-success)]" />
              <span>Personal & Team Productivity</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-[var(--text-main)]">
              {tab === 'login' ? 'Welcome back' : 'Start your flow'}
            </h1>
            <p className="text-xs sm:text-sm text-[var(--text-muted)] mt-1.5">
              {tab === 'login'
                ? 'Sign in to access your protected schedule, focus timer, and recovery engine.'
                : 'Create your account to organize tasks, track focus time, and recover overruns.'}
            </p>
          </div>

          {/* Auth Card Container */}
          <div className="p-6 md:p-8 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-sm">
            {/* Tab Navigation */}
            <div className="flex p-1 mb-6 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-subtle)]">
              <button
                type="button"
                onClick={() => handleTabChange('login')}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  tab === 'login'
                    ? 'bg-[var(--bg-card)] text-[var(--text-main)] shadow-xs border border-[var(--border-subtle)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => handleTabChange('register')}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  tab === 'register'
                    ? 'bg-[var(--bg-card)] text-[var(--text-main)] shadow-xs border border-[var(--border-subtle)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
                }`}
              >
                Create Account
              </button>
            </div>

            {/* Error Banner */}
            {(formError || error) && (
              <div
                role="alert"
                className="mb-5 p-3.5 rounded-xl bg-red-500/10 border border-red-500/25 text-red-400 text-xs font-medium flex items-start gap-2.5"
              >
                <span className="text-base leading-none">⚠️</span>
                <span className="flex-1 leading-relaxed">{formError || error}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {tab === 'register' && (
                <div>
                  <label htmlFor="auth-name" className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                    Full Name
                  </label>
                  <input
                    id="auth-name"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Jane Doe"
                    disabled={isSubmitting}
                    className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-main)] placeholder-[var(--text-dim)] focus:outline-hidden focus:border-[var(--accent)] transition-colors"
                  />
                </div>
              )}

              <div>
                <label htmlFor="auth-email" className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                  Email Address
                </label>
                <input
                  id="auth-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  disabled={isSubmitting}
                  className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-main)] placeholder-[var(--text-dim)] focus:outline-hidden focus:border-[var(--accent)] transition-colors"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="auth-password" className="text-xs font-semibold text-[var(--text-muted)]">
                    Password
                  </label>
                  {tab === 'register' && (
                    <span className="text-[11px] text-[var(--text-dim)]">Min 8 chars, 1 letter & 1 number</span>
                  )}
                </div>
                <input
                  id="auth-password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  disabled={isSubmitting}
                  className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-main)] placeholder-[var(--text-dim)] focus:outline-hidden focus:border-[var(--accent)] transition-colors"
                />
              </div>

              {tab === 'register' && (
                <div>
                  <label htmlFor="auth-timezone" className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">
                    Timezone
                  </label>
                  <input
                    id="auth-timezone"
                    type="text"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    placeholder="UTC"
                    disabled={isSubmitting}
                    className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-[var(--bg-subtle)] border border-[var(--border-subtle)] text-[var(--text-main)] placeholder-[var(--text-dim)] focus:outline-hidden focus:border-[var(--accent)] transition-colors"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full mt-2 py-2.5 px-4 rounded-xl text-sm font-bold bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-text)] transition-all shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 active:scale-98"
              >
                {isSubmitting ? (
                  <>
                    <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    <span>{tab === 'login' ? 'Signing In...' : 'Creating Account...'}</span>
                  </>
                ) : (
                  <span>{tab === 'login' ? 'Sign In to FocusFlow' : 'Create Account'}</span>
                )}
              </button>
            </form>
          </div>

          {/* Security Assurance Badge */}
          <div className="flex items-center justify-center gap-2 mt-6 text-xs text-[var(--text-dim)]">
            <IconClock className="w-3.5 h-3.5 text-[var(--accent)]" />
            <span>Secure HttpOnly session cookie • Double-submit CSRF protection</span>
          </div>
        </div>
      </main>
    </div>
  );
}
