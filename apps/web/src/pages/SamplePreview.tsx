import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBatchStore } from '../store/batchStore';
import { Stepper } from '../components/Stepper';
import { apiRequest } from '../api/client';
import {
  Download,
  CheckCircle,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Sparkles
} from 'lucide-react';

interface PreviewResponse {
  sampleUrl: string;
  warnings: string[];
  fileSize: number;
  pageCount: number;
  appliedFieldsCount: number;
  selectedRow: number;
}

export const SamplePreview: React.FC = () => {
  const { currentBatch, spreadsheet, mappings, overlayFields } = useBatchStore();
  const navigate = useNavigate();

  const [selectedRow, setSelectedRow] = useState<number>(2);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<PreviewResponse | null>(null);
  const [approved, setApproved] = useState<boolean>(false);

  const generateSample = async (rowNum: number) => {
    if (!currentBatch?.id) return;
    setLoading(true);
    setError(null);

    try {
      const res = await apiRequest<PreviewResponse>(`/api/batches/${currentBatch.id}/sample-preview`, {
        method: 'POST',
        body: JSON.stringify({
          rowIndex: rowNum,
          overlayFields,
          fieldMappings: mappings
        })
      });
      setPreviewData(res);
      setSelectedRow(rowNum);
    } catch (err: any) {
      setError(err.message || 'Failed to generate sample certificate.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    generateSample(2);
  }, [currentBatch?.id]);

  const handleDownloadSample = () => {
    if (!currentBatch?.id) return;
    window.open(`/api/batches/${currentBatch.id}/sample-pdf`, '_blank');
  };

  const handleProceedToBulk = () => {
    if (!approved) return;
    navigate('/progress');
  };

  const totalSpreadsheetRows = spreadsheet?.totalRows || 0;

  return (
    <div>
      <Stepper currentStep={4} />

      <div className="app-container" style={{ maxWidth: '1100px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1.75rem' }}>
          <div>
            <h1 style={{ fontSize: '2.2rem', marginBottom: '0.35rem' }}>Sample Certificate Verification</h1>
            <p style={{ fontSize: '0.95rem', color: 'var(--text-2)' }}>
              Inspect an actual generated PDF using the production overlay engine. Verify layout, alignment, and formatting before bulk processing.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              onClick={() => generateSample(selectedRow)}
              disabled={loading}
              className="btn btn-secondary"
              style={{ fontSize: '0.85rem' }}
            >
              <RefreshCw size={14} className={loading ? 'spin' : ''} />
              <span>Regenerate Sample</span>
            </button>
            <button
              onClick={handleDownloadSample}
              disabled={loading || !previewData}
              className="btn btn-primary"
              style={{ fontSize: '0.85rem' }}
            >
              <Download size={15} />
              <span>Download Sample PDF</span>
            </button>
          </div>
        </div>

        {/* Row Selector Bar */}
        <div className="card" style={{ padding: '0.85rem 1.25rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Active Test Row:</span>
            <button
              onClick={() => generateSample(Math.max(2, selectedRow - 1))}
              disabled={selectedRow <= 2 || loading}
              className="btn btn-secondary"
              style={{ padding: '0.25rem 0.5rem' }}
            >
              <ChevronLeft size={16} />
            </button>
            <span style={{ fontSize: '0.9rem', fontWeight: 700, minWidth: '70px', textAlign: 'center' }}>
              Row {selectedRow}
            </span>
            <button
              onClick={() => generateSample(Math.min(totalSpreadsheetRows + 1, selectedRow + 1))}
              disabled={selectedRow >= totalSpreadsheetRows + 1 || loading}
              className="btn btn-secondary"
              style={{ padding: '0.25rem 0.5rem' }}
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button
              onClick={() => generateSample(111)} // Seeded longest name row
              disabled={loading}
              className="btn btn-quiet"
              style={{ fontSize: '0.8rem', color: 'var(--gold)' }}
            >
              <Sparkles size={14} style={{ marginRight: '0.25rem' }} />
              Test Longest Name (Row 111)
            </button>
            <button
              onClick={() => generateSample(151)} // Seeded special characters
              disabled={loading}
              className="btn btn-quiet"
              style={{ fontSize: '0.8rem', color: 'var(--gold)' }}
            >
              Test Special Characters (Row 151)
            </button>
          </div>
        </div>

        {/* Warning Notification if any overflow / missing glyphs detected */}
        {previewData && previewData.warnings.length > 0 && (
          <div className="card" style={{ marginBottom: '1.5rem', borderLeft: '4px solid var(--error)', backgroundColor: 'var(--error-bg)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <AlertTriangle size={18} style={{ color: 'var(--error)' }} />
              <h3 style={{ fontSize: '1.05rem', margin: 0, color: 'var(--error)' }}>
                Fidelity Warnings Detected ({previewData.warnings.length})
              </h3>
            </div>
            <ul style={{ paddingLeft: '1.5rem', fontSize: '0.85rem', color: 'var(--ink)' }}>
              {previewData.warnings.map((w, idx) => (
                <li key={idx} style={{ marginBottom: '0.25rem' }}>
                  {w}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Main PDF Preview Display */}
        <div className="card" style={{ padding: '1.5rem', marginBottom: '1.75rem' }}>
          {loading ? (
            <div style={{ height: '520px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--surface-alt)' }}>
              <div style={{ textAlign: 'center' }}>
                <RefreshCw size={28} className="spin" style={{ color: 'var(--gold)', margin: '0 auto 0.75rem auto' }} />
                <p style={{ fontWeight: 600 }}>Composing vector overlay with pdf-lib...</p>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-2)' }}>Preserving exact template artwork stream</p>
              </div>
            </div>
          ) : error ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--error)' }}>
              <AlertTriangle size={32} style={{ margin: '0 auto 0.75rem auto' }} />
              <p style={{ fontWeight: 600 }}>{error}</p>
            </div>
          ) : (
            <div>
              <iframe
                src={`/api/batches/${currentBatch?.id}/sample-pdf#toolbar=0&navpanes=0`}
                title="Certificate Sample PDF"
                style={{
                  width: '100%',
                  height: '560px',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: '#EAE3D6'
                }}
              />

              {/* PDF Metrics Bar */}
              {previewData && (
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '0.8rem',
                  color: 'var(--text-2)',
                  marginTop: '0.75rem',
                  paddingTop: '0.5rem',
                  borderTop: '1px solid var(--border-subtle)'
                }}>
                  <div style={{ display: 'flex', gap: '1.5rem' }}>
                    <span>
                      <strong>Pages:</strong> {previewData.pageCount}
                    </span>
                    <span>
                      <strong>File Size:</strong> {Math.round(previewData.fileSize / 1024)} KB
                    </span>
                    <span>
                      <strong>Fields Applied:</strong> {previewData.appliedFieldsCount}
                    </span>
                    <span>
                      <strong>Template Fidelity:</strong> 100% Native Vector
                    </span>
                  </div>
                  <span style={{ color: 'var(--success)', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                    <CheckCircle size={14} /> Ready for generation
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* User Approval Gate */}
        <div className="card" style={{ marginBottom: '2rem', padding: '1.5rem', backgroundColor: 'var(--surface-alt)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.85rem' }}>
            <input
              id="approveGate"
              type="checkbox"
              checked={approved}
              onChange={(e) => setApproved(e.target.checked)}
              style={{ width: '18px', height: '18px', marginTop: '0.2rem', cursor: 'pointer' }}
            />
            <div>
              <label htmlFor="approveGate" style={{ fontWeight: 600, fontSize: '0.95rem', cursor: 'pointer', display: 'block', marginBottom: '0.25rem' }}>
                I have inspected the sample certificate and approve this layout for bulk batch generation.
              </label>
              <p style={{ fontSize: '0.825rem', color: 'var(--text-2)', margin: 0 }}>
                Bulk generation will execute using the exact coordinates, fonts, and auto-shrink rules configured in this preview.
              </p>
            </div>
          </div>
        </div>

        {/* Navigation Action Buttons */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: '1.5rem' }}>
          <button onClick={() => navigate('/editor')} className="btn btn-secondary">
            <ArrowLeft size={16} />
            <span>Back to Editor</span>
          </button>

          <button
            onClick={handleProceedToBulk}
            disabled={!approved}
            className="btn btn-primary"
            style={{ padding: '0.75rem 1.75rem', fontSize: '1rem' }}
          >
            <span>Proceed to Bulk Generation</span>
            <ArrowRight size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};
