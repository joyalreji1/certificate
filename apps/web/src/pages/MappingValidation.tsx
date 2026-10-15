import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBatchStore } from '../store/batchStore';
import { Stepper } from '../components/Stepper';
import { StandardFieldKeys } from '@bulk-cert/shared';
import {
  CheckCircle,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  Sliders
} from 'lucide-react';

export const MappingValidation: React.FC = () => {
  const {
    currentBatch,
    spreadsheet,
    mappings,
    validationSummary,
    excludedRows,
    setMappings,
    validateBatch,
    toggleExcludeRow,
    isLoading
  } = useBatchStore();

  const [activeTab, setActiveTab] = useState<'all' | 'errors' | 'warnings' | 'excluded'>('all');
  const navigate = useNavigate();

  // Validate on mount if not yet validated
  useEffect(() => {
    if (currentBatch?.id && spreadsheet && !validationSummary) {
      validateBatch();
    }
  }, [currentBatch?.id, spreadsheet]);

  const handleMappingChange = (fieldKey: string, newColumn: string | null) => {
    const updated = mappings.map((m) => {
      if (m.fieldKey === fieldKey) {
        return { ...m, spreadsheetColumn: newColumn === '' ? null : newColumn };
      }
      return m;
    });
    setMappings(updated);
    // Auto-revalidate with updated mappings
    validateBatch(updated);
  };

  const handleProceed = () => {
    if (!canProceed) return;
    navigate('/editor');
  };

  // Check required mappings
  const studentNameMapping = mappings.find((m) => m.fieldKey === StandardFieldKeys.STUDENT_NAME);
  const programMapping = mappings.find((m) => m.fieldKey === StandardFieldKeys.PROGRAM_CATEGORY);
  const hasRequiredMappings = !!studentNameMapping?.spreadsheetColumn && !!programMapping?.spreadsheetColumn;

  const validRowCount = validationSummary?.validRows ?? 0;
  const canProceed = hasRequiredMappings && validRowCount > 0;

  // Filter issues
  const errorsList = validationSummary?.errors || [];
  const filteredErrors = errorsList.filter((e) => {
    const isExcluded = excludedRows.includes(e.rowIndex);
    if (activeTab === 'excluded') return isExcluded;
    if (activeTab === 'errors') return e.severity === 'error';
    if (activeTab === 'warnings') return e.severity === 'warning';
    return true;
  });

  return (
    <div>
      <Stepper currentStep={2} />

      <div className="app-container" style={{ maxWidth: '1100px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '2rem' }}>
          <div>
            <h1 style={{ fontSize: '2.2rem', marginBottom: '0.35rem' }}>Column Mapping & Validation</h1>
            <p style={{ fontSize: '0.95rem', color: 'var(--text-2)' }}>
              Map spreadsheet headers to certificate fields. Rows are audited for completeness and formatting.
            </p>
          </div>
          <button
            onClick={() => validateBatch()}
            disabled={isLoading}
            className="btn btn-secondary"
            style={{ fontSize: '0.85rem' }}
          >
            <RefreshCw size={14} className={isLoading ? 'spin' : ''} />
            <span>Re-validate Rows</span>
          </button>
        </div>

        {/* Validation Summary Stat Cards */}
        {validationSummary && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '1rem',
            marginBottom: '2rem'
          }}>
            <div className="card" style={{ padding: '1rem 1.25rem' }}>
              <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-2)', letterSpacing: '0.05em' }}>
                Total Spreadsheet Rows
              </span>
              <div style={{ fontSize: '1.85rem', fontWeight: 700, color: 'var(--ink)' }}>
                {validationSummary.totalRows}
              </div>
            </div>

            <div className="card" style={{ padding: '1rem 1.25rem', borderLeft: '4px solid var(--success)' }}>
              <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--success)', letterSpacing: '0.05em', fontWeight: 600 }}>
                Valid Rows
              </span>
              <div style={{ fontSize: '1.85rem', fontWeight: 700, color: 'var(--success)' }}>
                {validationSummary.validRows}
              </div>
            </div>

            <div className="card" style={{ padding: '1rem 1.25rem', borderLeft: '4px solid var(--error)' }}>
              <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--error)', letterSpacing: '0.05em', fontWeight: 600 }}>
                Fatal Invalid Rows
              </span>
              <div style={{ fontSize: '1.85rem', fontWeight: 700, color: 'var(--error)' }}>
                {validationSummary.invalidRows}
              </div>
            </div>

            <div className="card" style={{ padding: '1rem 1.25rem' }}>
              <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-2)', letterSpacing: '0.05em' }}>
                Excluded Rows
              </span>
              <div style={{ fontSize: '1.85rem', fontWeight: 700, color: 'var(--ink)' }}>
                {validationSummary.excludedRows.length}
              </div>
            </div>

            <div className="card" style={{ padding: '1rem 1.25rem' }}>
              <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--gold)', letterSpacing: '0.05em', fontWeight: 600 }}>
                Duplicates Detected
              </span>
              <div style={{ fontSize: '1.85rem', fontWeight: 700, color: 'var(--gold)' }}>
                {validationSummary.duplicates.length}
              </div>
            </div>
          </div>
        )}

        {/* Warning Alert if Missing Required Mappings */}
        {!hasRequiredMappings && (
          <div className="badge badge-error" style={{ width: '100%', padding: '0.85rem 1rem', marginBottom: '1.5rem', fontSize: '0.875rem', textTransform: 'none' }}>
            <AlertTriangle size={16} style={{ marginRight: '0.5rem' }} />
            <span>
              Required mapping missing: Both <strong>Student Name</strong> and <strong>Program / Category</strong> must be mapped to proceed.
            </span>
          </div>
        )}

        {/* Column Mapping Section */}
        <div className="card" style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <Sliders size={18} style={{ color: 'var(--gold)' }} />
            <h2 style={{ fontSize: '1.35rem', margin: 0 }}>Certificate Field Mappings</h2>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-2)', marginBottom: '1.5rem' }}>
            We've auto-detected these column assignments from your headers. You can adjust any assignment below.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
            {mappings.map((mapping) => (
              <div key={mapping.fieldKey} className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{mapping.label}</span>
                  {mapping.isRequired && (
                    <span style={{ color: 'var(--error)', fontSize: '0.75rem' }}>* Required</span>
                  )}
                </label>
                <select
                  className="form-select"
                  value={mapping.spreadsheetColumn || ''}
                  onChange={(e) => handleMappingChange(mapping.fieldKey, e.target.value)}
                  style={{
                    borderColor: mapping.isRequired && !mapping.spreadsheetColumn ? 'var(--error)' : 'var(--border)'
                  }}
                >
                  <option value="">— Not Mapped —</option>
                  {spreadsheet?.headers.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>

        {/* Row-Level Error & Warning Report Table */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <div>
              <h2 style={{ fontSize: '1.35rem', margin: 0 }}>Row-Level Validation Audit</h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>
                Source line numbers correspond exactly to your uploaded file. Invalid rows are excluded from generation by default.
              </p>
            </div>

            {/* Filter Tabs */}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={() => setActiveTab('all')}
                className={`btn ${activeTab === 'all' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}
              >
                All Issues ({errorsList.length})
              </button>
              <button
                onClick={() => setActiveTab('errors')}
                className={`btn ${activeTab === 'errors' ? 'btn-danger' : 'btn-secondary'}`}
                style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}
              >
                Errors ({errorsList.filter((e) => e.severity === 'error').length})
              </button>
              <button
                onClick={() => setActiveTab('warnings')}
                className={`btn ${activeTab === 'warnings' ? 'btn-gold' : 'btn-secondary'}`}
                style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}
              >
                Warnings ({errorsList.filter((e) => e.severity === 'warning').length})
              </button>
              <button
                onClick={() => setActiveTab('excluded')}
                className={`btn ${activeTab === 'excluded' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}
              >
                Excluded ({excludedRows.length})
              </button>
            </div>
          </div>

          {filteredErrors.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--success)' }}>
              <CheckCircle size={28} style={{ margin: '0 auto 0.5rem auto' }} />
              <p style={{ fontWeight: 600 }}>No issues found in this category.</p>
            </div>
          ) : (
            <div className="table-container" style={{ maxHeight: '400px', overflowY: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Row #</th>
                    <th>Severity</th>
                    <th>Column</th>
                    <th>Issue Description</th>
                    <th>Cell Value</th>
                    <th style={{ textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredErrors.map((err, i) => {
                    const isRowExcluded = excludedRows.includes(err.rowIndex);

                    return (
                      <tr key={`${err.rowIndex}-${err.code}-${i}`} style={{ opacity: isRowExcluded ? 0.6 : 1 }}>
                        <td style={{ fontWeight: 700 }}>Line {err.rowIndex}</td>
                        <td>
                          <span className={`badge ${err.severity === 'error' ? 'badge-error' : 'badge-gold'}`}>
                            {err.severity}
                          </span>
                        </td>
                        <td>{err.column}</td>
                        <td>{err.message}</td>
                        <td style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>
                          {err.value || '<empty>'}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            onClick={() => toggleExcludeRow(err.rowIndex)}
                            className="btn btn-quiet"
                            style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                          >
                            {isRowExcluded ? 'Include Row' : 'Exclude Row'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer Navigation Actions */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: '2rem',
          borderTop: '1px solid var(--border)',
          paddingTop: '1.5rem'
        }}>
          <button onClick={() => navigate('/upload')} className="btn btn-secondary">
            <ArrowLeft size={16} />
            <span>Back to Upload</span>
          </button>

          <button
            onClick={handleProceed}
            disabled={!canProceed}
            className="btn btn-primary"
            style={{ padding: '0.75rem 1.75rem', fontSize: '1rem' }}
          >
            <span>Proceed to Template Editor</span>
            <ArrowRight size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};
