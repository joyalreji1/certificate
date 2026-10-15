import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Award, LogOut, CloudOff, Menu, X } from 'lucide-react';

export const Navbar: React.FC = () => {
  const { user, logout, isAuthenticated } = useAuthStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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
      position: 'sticky',
      top: 0,
      zIndex: 50
    }}>
      <div style={{
        padding: '0.75rem 1.25rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        maxWidth: '1200px',
        margin: '0 auto',
        width: '100%'
      }}>
        {/* Brand & Desktop Nav */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', textDecoration: 'none' }}>
            <div style={{
              width: 30,
              height: 30,
              backgroundColor: 'var(--ink)',
              color: 'var(--gold)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 'var(--radius-sm)'
            }}>
              <Award size={17} />
            </div>
            <div>
              <span style={{
                fontFamily: 'var(--font-serif)',
                fontSize: '1.1rem',
                fontWeight: 700,
                color: 'var(--ink)',
                letterSpacing: '0.02em',
                display: 'block',
                lineHeight: 1.1
              }}>
                BULK CERTIFICATES
              </span>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-2)', letterSpacing: '0.08em', textTransform: 'uppercase' }} className="responsive-hide-mobile">
                Precision Production
              </span>
            </div>
          </Link>

          {/* Desktop Navigation Links */}
          <nav style={{ display: 'flex', gap: '1.25rem', alignItems: 'center' }} className="responsive-hide-mobile">
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

        {/* Desktop User Info & Mobile Hamburger */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }} className="responsive-hide-mobile">
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.2rem 0.55rem',
              backgroundColor: 'var(--surface-alt)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.75rem',
              color: 'var(--text-2)'
            }}>
              <CloudOff size={12} style={{ color: 'var(--gold)' }} />
              <span>Offline/Local</span>
            </div>

            <div style={{
              fontSize: '0.825rem',
              color: 'var(--ink)',
              fontWeight: 500,
              borderRight: '1px solid var(--border)',
              paddingRight: '0.75rem'
            }}>
              {user.loginName}
            </div>

            <button
              onClick={handleLogout}
              className="btn btn-quiet"
              style={{ fontSize: '0.8rem', padding: '0.3rem 0.55rem' }}
              title="Sign out"
            >
              <LogOut size={14} />
              <span>Sign out</span>
            </button>
          </div>

          {/* Mobile Menu Toggle Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="btn btn-quiet"
            style={{ display: 'none', padding: '0.4rem', color: 'var(--ink)' }}
            id="mobile-nav-toggle"
            aria-label="Toggle navigation"
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <style>{`
            @media (max-width: 768px) {
              #mobile-nav-toggle {
                display: flex !important;
              }
            }
          `}</style>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div style={{
          backgroundColor: 'var(--surface)',
          borderTop: '1px solid var(--border)',
          padding: '1rem 1.25rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem'
        }}>
          <Link
            to="/"
            onClick={() => setMobileMenuOpen(false)}
            style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--ink)', textDecoration: 'none', padding: '0.4rem 0' }}
          >
            Dashboard
          </Link>
          <Link
            to="/upload"
            onClick={() => setMobileMenuOpen(false)}
            style={{ fontSize: '0.95rem', fontWeight: 500, color: 'var(--ink)', textDecoration: 'none', padding: '0.4rem 0' }}
          >
            New Batch
          </Link>
          <Link
            to="/settings"
            onClick={() => setMobileMenuOpen(false)}
            style={{ fontSize: '0.95rem', fontWeight: 500, color: 'var(--ink)', textDecoration: 'none', padding: '0.4rem 0' }}
          >
            Settings & Help
          </Link>
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-2)' }}>{user.loginName}</span>
            <button
              onClick={handleLogout}
              className="btn btn-secondary"
              style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
            >
              <LogOut size={13} style={{ marginRight: '0.3rem' }} /> Sign out
            </button>
          </div>
        </div>
      )}
    </header>
  );
};

