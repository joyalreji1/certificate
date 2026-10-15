import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Award, LogOut, CloudOff } from 'lucide-react';

export const Navbar: React.FC = () => {
  const { user, logout, isAuthenticated } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  if (!isAuthenticated || !user) return null;

  return (
    <header style={{
      backgroundColor: 'var(--surface)',
      borderBottom: '1px solid var(--border)',
      padding: '0.85rem 2rem',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      position: 'sticky',
      top: 0,
      zIndex: 50
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', textDecoration: 'none' }}>
          <div style={{
            width: 32,
            height: 32,
            backgroundColor: 'var(--ink)',
            color: 'var(--gold)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 'var(--radius-sm)'
          }}>
            <Award size={18} />
          </div>
          <div>
            <span style={{
              fontFamily: 'var(--font-serif)',
              fontSize: '1.2rem',
              fontWeight: 700,
              color: 'var(--ink)',
              letterSpacing: '0.02em',
              display: 'block',
              lineHeight: 1.1
            }}>
              BULK CERTIFICATES
            </span>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-2)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Precision Production
            </span>
          </div>
        </Link>

        <nav style={{ display: 'flex', gap: '1.25rem', alignItems: 'center' }}>
          <Link to="/" style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--ink)', textDecoration: 'none' }}>
            Dashboard
          </Link>
          <Link to="/upload" style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-2)', textDecoration: 'none' }}>
            New Batch
          </Link>
          <Link to="/settings" style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-2)', textDecoration: 'none' }}>
            Settings & Help
          </Link>
        </nav>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        {/* Drive Status Chip */}
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.4rem',
          padding: '0.25rem 0.65rem',
          backgroundColor: 'var(--surface-alt)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          fontSize: '0.78rem',
          color: 'var(--text-2)'
        }}>
          <CloudOff size={13} style={{ color: 'var(--gold)' }} />
          <span>Drive: Download-first</span>
        </div>

        {/* User Chip */}
        <div style={{
          fontSize: '0.85rem',
          color: 'var(--ink)',
          fontWeight: 500,
          borderRight: '1px solid var(--border)',
          paddingRight: '1rem'
        }}>
          {user.loginName}
        </div>

        {/* Sign out */}
        <button
          onClick={handleLogout}
          className="btn btn-quiet"
          style={{ fontSize: '0.825rem', padding: '0.35rem 0.65rem' }}
          title="Sign out"
          aria-label="Sign out"
        >
          <LogOut size={15} />
          <span>Sign out</span>
        </button>
      </div>
    </header>
  );
};
