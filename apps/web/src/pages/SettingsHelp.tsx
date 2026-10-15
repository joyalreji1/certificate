import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { Shield, Key, Cloud, CloudOff, Clock, CheckCircle, AlertTriangle, ExternalLink, RefreshCw } from 'lucide-react';
import { apiRequest } from '../api/client';

export const SettingsHelp: React.FC = () => {
  const { user, changePassword, logout } = useAuthStore();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);

  // Google Drive state
  const [driveStatus, setDriveStatus] = useState<{ configured: boolean; connected: boolean; accountEmail?: string } | null>(null);
  const [loadingDriveStatus, setLoadingDriveStatus] = useState(true);
  const [driveConnecting, setDriveConnecting] = useState(false);
  const [driveMessage, setDriveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchDriveStatus = async () => {
    setLoadingDriveStatus(true);
    try {
      const res = await apiRequest<{ configured: boolean; connected: boolean; accountEmail?: string }>('/api/drive/status');
      setDriveStatus(res);
    } catch {
      setDriveStatus({ configured: false, connected: false });
    } finally {
      setLoadingDriveStatus(false);
    }
  };

  useEffect(() => {
    fetchDriveStatus();

    // Parse URL feedback parameters if returned from OAuth redirect
    const params = new URLSearchParams(window.location.search);
    if (params.get('drive') === 'connected') {
      setDriveMessage({ type: 'success', text: 'Google Drive connected successfully! You can now upload certificates directly to your Drive.' });
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (params.get('drive_error')) {
      setDriveMessage({ type: 'error', text: `Failed to connect Google Drive: ${params.get('drive_error')}` });
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const handleConnectDrive = async () => {
    setDriveConnecting(true);
    setDriveMessage(null);
    try {
      const res = await apiRequest<{ url: string }>('/api/drive/auth-url');
      if (res?.url) {
        window.location.href = res.url;
      }
    } catch (err: any) {
      setDriveMessage({
        type: 'error',
        text: err.message || 'Failed to initiate Google OAuth flow. Please ensure credentials are set in .env.'
      });
      setDriveConnecting(false);
    }
  };

  const handleDisconnectDrive = async () => {
    setDriveConnecting(true);
    try {
      await apiRequest('/api/drive/disconnect', { method: 'POST' });
      setDriveStatus({ configured: driveStatus?.configured ?? false, connected: false });
      setDriveMessage({ type: 'success', text: 'Google Drive disconnected.' });
    } catch (err: any) {
      setDriveMessage({ type: 'error', text: err.message || 'Failed to disconnect Google Drive.' });
    } finally {
      setDriveConnecting(false);
    }
  };

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
          {driveStatus?.connected ? (
            <Cloud size={18} style={{ color: '#22c55e' }} />
          ) : (
            <CloudOff size={18} style={{ color: 'var(--text-2)' }} />
          )}
          <h2 style={{ fontSize: '1.35rem', margin: 0 }}>Google Drive Integration</h2>
        </div>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-2)', marginBottom: '1rem' }}>
          Bulk Certificate Generator is built <strong>download-first</strong>. All features work completely without Google Drive. When connected, certificates can be uploaded directly to your chosen Drive folder via genuine OAuth 2.0 with the narrow <code>drive.file</code> scope.
        </p>

        {driveMessage && (
          <div
            className={`badge ${driveMessage.type === 'success' ? 'badge-success' : 'badge-error'}`}
            style={{ width: '100%', padding: '0.65rem', marginBottom: '1rem', textTransform: 'none', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            {driveMessage.type === 'success' ? <CheckCircle size={15} /> : <AlertTriangle size={15} />}
            <span>{driveMessage.text}</span>
          </div>
        )}

        <div style={{
          backgroundColor: 'var(--surface-alt)',
          border: '1px solid var(--border)',
          padding: '1rem',
          borderRadius: 'var(--radius-sm)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
              <span style={{ fontWeight: 600 }}>
                Status: {driveStatus?.connected ? 'Connected' : 'Not Connected'}
              </span>
              {driveStatus?.connected && (
                <span className="badge badge-success" style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem' }}>
                  Active
                </span>
              )}
            </div>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-2)' }}>
              {driveStatus?.connected
                ? `Authorized with Google OAuth (${driveStatus.accountEmail || 'OAuth token active'}). Narrow drive.file scope.`
                : driveStatus?.configured
                  ? 'Ready to connect. Click below to authorize Google Drive.'
                  : 'Operating in download-first mode. All outputs download directly to your computer.'}
            </span>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button
              className="btn btn-secondary"
              style={{ fontSize: '0.85rem', padding: '0.4rem 0.75rem' }}
              onClick={fetchDriveStatus}
              disabled={loadingDriveStatus}
              title="Refresh Drive status"
            >
              <RefreshCw size={14} className={loadingDriveStatus ? 'animate-spin' : ''} />
            </button>

            {driveStatus?.connected ? (
              <button
                className="btn btn-danger"
                style={{ fontSize: '0.85rem' }}
                onClick={handleDisconnectDrive}
                disabled={driveConnecting}
              >
                {driveConnecting ? 'Disconnecting...' : 'Disconnect Drive'}
              </button>
            ) : (
              <button
                className="btn btn-primary"
                style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                onClick={handleConnectDrive}
                disabled={driveConnecting || !driveStatus?.configured}
                title={!driveStatus?.configured ? 'Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env' : 'Authorize Google Drive'}
              >
                <ExternalLink size={14} />
                {driveConnecting ? 'Connecting...' : 'Connect Google Drive'}
              </button>
            )}
          </div>
        </div>

        {!driveStatus?.configured && (
          <p style={{ fontSize: '0.75rem', color: 'var(--text-2)', marginTop: '0.5rem' }}>
            Note: To enable Google Drive uploads, provide <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> in your server <code>.env</code> file.
          </p>
        )}
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
