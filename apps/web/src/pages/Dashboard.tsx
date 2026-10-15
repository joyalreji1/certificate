import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Batch } from '@bulk-cert/shared';
import { apiRequest } from '../api/client';
import { useBatchStore } from '../store/batchStore';
import { Plus, Clock, FileText, Trash2, Shield, CloudOff } from 'lucide-react';

export const Dashboard: React.FC = () => {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const { resetBatch } = useBatchStore();
  const navigate = useNavigate();

  const fetchBatches = async () => {
    try {
      const res = await apiRequest<{ batches: Batch[] }>('/api/batches');
      setBatches(res.batches || []);
    } catch (err) {
      console.error('Failed to load batches', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBatches();
  }, []);

  const handleStartNew = () => {
    resetBatch();
    navigate('/upload');
  };

  const handleDeleteBatch = async (batchId: string) => {
    if (!window.confirm('Are you sure you want to delete this batch and its temporary files?')) return;
    try {
      await apiRequest(`/api/batches/${batchId}`, { method: 'DELETE' });
      setBatches((prev) => prev.filter((b) => b.id !== batchId));
    } catch (err: any) {
      alert(err.message || 'Failed to delete batch.');
    }
  };

  const formatExpiry = (expiresAt: string) => {
    const msRemaining = new Date(expiresAt).getTime() - Date.now();
    if (msRemaining <= 0) return 'Expired';
    const hours = Math.floor(msRemaining / (1000 * 60 * 60));
    const mins = Math.floor((msRemaining % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${mins}m remaining`;
  };

  return (
    <div className="app-container">
      {/* Editorial Hero */}
      <section style={{
        padding: '3rem 0 2.5rem 0',
        borderBottom: '1px solid var(--border)',
        marginBottom: '2.5rem'
      }}>
        <div style={{ maxWidth: '780px' }}>
          <span style={{
            fontSize: '0.8rem',
            fontWeight: 600,
            color: 'var(--gold)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            display: 'block',
            marginBottom: '0.5rem'
          }}>
            Batch Publishing Suite
          </span>
          <h1 style={{ fontSize: '2.8rem', marginBottom: '1rem', color: 'var(--ink)' }}>
            Precision Certificate Production
          </h1>
          <p style={{ fontSize: '1.1rem', color: 'var(--text-2)', lineHeight: 1.6, marginBottom: '2rem' }}>
            Generate personalized certificate batches for arts festivals, hackathons, academic programs, and workshops. Your original artwork is preserved with exact vector fidelity.
          </p>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <button onClick={handleStartNew} className="btn btn-primary" style={{ padding: '0.75rem 1.5rem', fontSize: '1rem' }}>
              <Plus size={18} />
              <span>Create Certificate Batch</span>
            </button>
            <button onClick={() => navigate('/settings')} className="btn btn-secondary" style={{ padding: '0.75rem 1.25rem' }}>
              View Documentation
            </button>
          </div>
        </div>
      </section>

      {/* Info & Status Strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem', marginBottom: '2.5rem' }}>
        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <Shield size={18} style={{ color: 'var(--gold)' }} />
            <h3 style={{ fontSize: '1.05rem', margin: 0 }}>Template Fidelity Guarantee</h3>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>
            PDF templates are overlaid in native vector coordinate points without rasterization or re-rendering.
          </p>
        </div>

        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <Clock size={18} style={{ color: 'var(--gold)' }} />
            <h3 style={{ fontSize: '1.05rem', margin: 0 }}>24-Hour Ephemeral Retention</h3>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>
            Batches and files are automatically purged after 24 hours, or immediately upon your command.
          </p>
        </div>

        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <CloudOff size={18} style={{ color: 'var(--text-2)' }} />
            <h3 style={{ fontSize: '1.05rem', margin: 0 }}>Download-First Workflow</h3>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>
            Everything operates independently of external cloud storage. Google Drive connection is optional.
          </p>
        </div>
      </div>

      {/* Recent Batches Section */}
      <section>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1.25rem' }}>
          <div>
            <h2 style={{ fontSize: '1.65rem' }}>Recent Batches</h2>
            <p style={{ fontSize: '0.875rem' }}>Active jobs within their retention window</p>
          </div>
          <button onClick={fetchBatches} className="btn btn-quiet" style={{ fontSize: '0.8rem' }}>
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
            <p>Loading your batches...</p>
          </div>
        ) : batches.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '3.5rem 2rem' }}>
            <div style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              backgroundColor: 'var(--surface-alt)',
              border: '1px solid var(--border)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--gold)',
              marginBottom: '1rem'
            }}>
              <FileText size={22} />
            </div>
            <h3 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>No Active Batches</h3>
            <p style={{ maxWidth: '400px', margin: '0 auto 1.5rem auto', fontSize: '0.9rem' }}>
              You don’t have any active certificate batches right now. Upload a template and student list to begin.
            </p>
            <button onClick={handleStartNew} className="btn btn-primary">
              <Plus size={16} />
              <span>Create Your First Batch</span>
            </button>
          </div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Batch Name</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Retention</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((batch) => (
                  <tr key={batch.id}>
                    <td>
                      <span style={{ fontWeight: 600, display: 'block' }}>{batch.name}</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-2)' }}>ID: {batch.id.substring(0, 8)}</span>
                    </td>
                    <td>
                      <span className={`badge ${
                        batch.status === 'completed' ? 'badge-success' :
                        batch.status === 'processing' ? 'badge-gold' :
                        'badge-neutral'
                      }`}>
                        {batch.status}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>
                      {new Date(batch.createdAt).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </td>
                    <td>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-2)', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                        <Clock size={13} style={{ color: 'var(--gold)' }} />
                        {formatExpiry(batch.expiresAt)}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '0.5rem' }}>
                        <button
                          onClick={() => handleDeleteBatch(batch.id)}
                          className="btn btn-quiet"
                          style={{ padding: '0.35rem 0.5rem', color: 'var(--error)' }}
                          title="Delete now"
                          aria-label={`Delete batch ${batch.name}`}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
