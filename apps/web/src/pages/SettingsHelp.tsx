import React, { useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { Shield, Key, CloudOff, Clock, CheckCircle } from 'lucide-react';

export const SettingsHelp: React.FC = () => {
  const { user, changePassword, logout } = useAuthStore();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);

    if (newPassword.length < 12) {
      setPasswordError('New password must be at least 12 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }

    setSavingPassword(true);
    try {
      await changePassword(currentPassword, newPassword);
      setPasswordSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setPasswordError(err.message || 'Failed to update password.');
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="app-container" style={{ maxWidth: '900px' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2.2rem', marginBottom: '0.35rem' }}>Settings & System Help</h1>
        <p style={{ fontSize: '0.95rem', color: 'var(--text-2)' }}>
          Manage your account credentials, security configurations, and Google Drive integrations.
        </p>
      </div>

      {/* Account Info */}
      <div className="card" style={{ marginBottom: '1.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          <Shield size={18} style={{ color: 'var(--gold)' }} />
          <h2 style={{ fontSize: '1.35rem', margin: 0 }}>Active Account</h2>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Authenticated User
            </span>
            <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>{user?.loginName}</div>
          </div>
          <button onClick={() => logout()} className="btn btn-secondary" style={{ fontSize: '0.85rem' }}>
            Sign Out
          </button>
        </div>
      </div>

      {/* Change Password */}
      <div className="card" style={{ marginBottom: '1.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <Key size={18} style={{ color: 'var(--gold)' }} />
          <h2 style={{ fontSize: '1.35rem', margin: 0 }}>Change Password</h2>
        </div>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-2)', marginBottom: '1.25rem' }}>
          Enforces minimum strength (12+ characters) with bcrypt cost-12 hashing.
        </p>

        {passwordSuccess && (
          <div className="badge badge-success" style={{ width: '100%', padding: '0.65rem', marginBottom: '1rem', textTransform: 'none' }}>
            <CheckCircle size={15} style={{ marginRight: '0.35rem' }} />
            <span>Password updated successfully.</span>
          </div>
        )}

        {passwordError && (
          <div className="badge badge-error" style={{ width: '100%', padding: '0.65rem', marginBottom: '1rem', textTransform: 'none' }}>
            {passwordError}
          </div>
        )}

        <form onSubmit={handleChangePassword}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Current Password</label>
              <input
                type="password"
                required
                className="form-input"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="••••••••••••"
              />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">New Password (12+ chars)</label>
              <input
                type="password"
                required
                className="form-input"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••••••"
              />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Confirm New Password</label>
              <input
                type="password"
                required
                className="form-input"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••••••"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={savingPassword || !currentPassword || !newPassword || !confirmPassword}
            className="btn btn-primary"
          >
            {savingPassword ? 'Updating Password...' : 'Save New Password'}
          </button>
        </form>
      </div>

      {/* Google Drive Status */}
      <div className="card" style={{ marginBottom: '1.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <CloudOff size={18} style={{ color: 'var(--text-2)' }} />
          <h2 style={{ fontSize: '1.35rem', margin: 0 }}>Google Drive Integration</h2>
        </div>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-2)', marginBottom: '1rem' }}>
          Bulk Certificate Generator is built <strong>download-first</strong>. All features work completely without Google Drive. When connected, certificates can be uploaded directly to your chosen Drive folder via genuine OAuth 2.0 with the narrow <code>drive.file</code> scope.
        </p>
        <div style={{
          backgroundColor: 'var(--surface-alt)',
          border: '1px solid var(--border)',
          padding: '1rem',
          borderRadius: 'var(--radius-sm)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <span style={{ fontWeight: 600, display: 'block' }}>Status: Not Connected</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-2)' }}>Operating in download-first mode. All outputs download directly to your computer.</span>
          </div>
          <button className="btn btn-secondary" style={{ fontSize: '0.85rem' }} onClick={() => alert('Configure GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env to activate Google OAuth in Stage 4.')}>
            Connect Google Drive
          </button>
        </div>
      </div>

      {/* Privacy and Retention Policy */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <Clock size={18} style={{ color: 'var(--gold)' }} />
          <h2 style={{ fontSize: '1.35rem', margin: 0 }}>Privacy & 24-Hour Retention</h2>
        </div>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-2)', lineHeight: 1.6, marginBottom: '1rem' }}>
          Your student records and generated certificates are confidential. Files uploaded to Bulk Certificate Generator are stored in isolated per-job directories on the host server. They are automatically deleted after 24 hours or immediately when you delete the batch. Student data is never retained, shared with third parties, or used for model training.
        </p>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-2)' }}>
          Detailed security and privacy policy documentation is available in <code>/docs/PRIVACY.md</code>.
        </div>
      </div>
    </div>
  );
};
