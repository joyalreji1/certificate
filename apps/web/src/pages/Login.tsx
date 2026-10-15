import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Eye, EyeOff, Lock, Mail, ArrowRight, ShieldCheck } from 'lucide-react';

export const Login: React.FC = () => {
  const [loginName, setLoginName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const { login, isLoading, error, clearError } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    const success = await login(loginName, password);
    if (success) {
      navigate('/');
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem 1rem',
      backgroundColor: 'var(--bg)'
    }}>
      <div style={{ width: '100%', maxWidth: '420px' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{
            width: 44,
            height: 44,
            backgroundColor: 'var(--ink)',
            color: 'var(--gold)',
            borderRadius: 'var(--radius-sm)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '0.75rem'
          }}>
            <ShieldCheck size={24} />
          </div>
          <h1 style={{ fontSize: '2.1rem', marginBottom: '0.35rem' }}>Bulk Certificates</h1>
          <p style={{ fontSize: '0.9rem' }}>Production Suite for High-Fidelity PDF Generation</p>
        </div>

        <div className="card" style={{ padding: '2.25rem' }}>
          <h2 style={{ fontSize: '1.6rem', marginBottom: '0.25rem' }}>Sign in</h2>
          <div className="gold-rule" />

          {/* Screen reader live region for error announcements */}
          <div aria-live="polite" role="status">
            {error && (
              <div
                className="badge badge-error"
                style={{
                  width: '100%',
                  padding: '0.65rem 0.85rem',
                  marginBottom: '1.25rem',
                  fontSize: '0.85rem',
                  textTransform: 'none',
                  fontWeight: 500
                }}
              >
                {error}
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} noValidate>
            <div className="form-group">
              <label htmlFor="loginName" className="form-label">
                Login Name (Email)
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  id="loginName"
                  type="email"
                  autoComplete="username"
                  required
                  value={loginName}
                  onChange={(e) => setLoginName(e.target.value)}
                  className="form-input"
                  style={{ width: '100%', paddingLeft: '2.3rem' }}
                  placeholder="name@example.com"
                  disabled={isLoading}
                />
                <Mail
                  size={16}
                  style={{
                    position: 'absolute',
                    left: '0.75rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--text-2)'
                  }}
                />
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: '1.75rem' }}>
              <label htmlFor="password" className="form-label">
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="form-input"
                  style={{ width: '100%', paddingLeft: '2.3rem', paddingRight: '2.5rem' }}
                  placeholder="••••••••••••"
                  disabled={isLoading}
                />
                <Lock
                  size={16}
                  style={{
                    position: 'absolute',
                    left: '0.75rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--text-2)'
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  style={{
                    position: 'absolute',
                    right: '0.65rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-2)',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0.2rem'
                  }}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', padding: '0.75rem' }}
              disabled={isLoading || !loginName || !password}
            >
              {isLoading ? (
                <span>Verifying credentials...</span>
              ) : (
                <>
                  <span>Sign in</span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border-subtle)', textAlign: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-2)' }}>
              Protected by session encryption & rate-limit defenses
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
