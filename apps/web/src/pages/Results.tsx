import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBatchStore } from '../store/batchStore';
import { Stepper } from '../components/Stepper';
import { apiRequest } from '../api/client';
import {
  Download,
  FileArchive,
  FileText,
  AlertTriangle,
  CheckCircle2,
  PlusCircle,
  Home,
  ShieldCheck,
  FileDown,
  Cloud,
  CloudOff,
  ExternalLink,
  RefreshCw
} from 'lucide-react';

interface RowExecutionResult {
  rowIndex: number;
  studentName: string;
  status: 'success' | 'failed';
  warnings: string[];
  errorMessage?: string;
  pdfFileName?: string;
}

interface JobRecord {
  id: string;
  batchId: string;
  status: string;
  totalRows: number;
  processedRows: number;
  succeededRows: number;
  failedRows: number;
  elapsedSeconds: number;
  completedAt: string;
  rowResults: RowExecutionResult[];
}

interface DriveStatus {
  connected: boolean;
  configured: boolean;
  accountEmail?: string;
}

interface DriveUploadResult {
  folderId?: string;
  folderUrl?: string;
  uploads: Array<{ target: string; fileId: string; webViewLink: string; name: string }>;
}

export const Results: React.FC = () => {
  const { currentBatch, resetBatch } = useBatchStore();
  const navigate = useNavigate();

  const [job, setJob] = useState<JobRecord | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Drive state
  const [driveStatus, setDriveStatus] = useState<DriveStatus>({ connected: false, configured: false });
  const [uploadingDrive, setUploadingDrive] = useState<boolean>(false);
  const [driveSuccess, setDriveSuccess] = useState<DriveUploadResult | null>(null);
  const [driveError, setDriveError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentBatch?.id) {
      navigate('/');
      return;
    }

    const fetchJobAndDrive = async () => {
      try {
        const res = await apiRequest<{ job: JobRecord }>(`/api/batches/${currentBatch.id}/job`);
        setJob(res.job);
      } catch (err: any) {
        setError(err.message || 'Failed to retrieve batch results.');
      } finally {
        setLoading(false);
      }

      // Check Drive status
      try {
        const dRes = await apiRequest<DriveStatus>('/api/drive/status');
        setDriveStatus(dRes);
      } catch {
        // Drive status check failure is non-fatal
      }
    };

    fetchJobAndDrive();
  }, [currentBatch?.id]);

  const handleDownloadZip = () => {
    if (!currentBatch?.id) return;
    window.location.href = `/api/batches/${currentBatch.id}/download/zip`;
  };

  const handleDownloadCombined = () => {
    if (!currentBatch?.id) return;
    window.location.href = `/api/batches/${currentBatch.id}/download/combined-pdf`;
  };

  const handleDownloadFailures = () => {
    if (!currentBatch?.id) return;
    window.location.href = `/api/batches/${currentBatch.id}/download/failures-csv`;
  };

  const handleDriveUpload = async () => {
    if (!currentBatch?.id || uploadingDrive) return;
    setDriveError(null);
    setDriveSuccess(null);

    if (!driveStatus.connected) {
      setDriveError(
        'Google Drive is not connected. Operating in Download-First mode. You can connect your Google account in Settings, or download files locally using the buttons below.'
      );
      return;
    }

    setUploadingDrive(true);
    try {
      const res = await apiRequest<DriveUploadResult>(`/api/batches/${currentBatch.id}/upload-drive`, {
        method: 'POST',
        body: JSON.stringify({ target: 'all' })
      });
      setDriveSuccess(res);
    } catch (err: any) {
      setDriveError(err.message || 'Google Drive upload failed.');
    } finally {
      setUploadingDrive(false);
    }
  };

  const handleStartNewBatch = () => {
    resetBatch();
    navigate('/upload');
  };

  const failedItems = job?.rowResults?.filter((r) => r.status === 'failed') || [];

  return (
    <div>
      <Stepper currentStep={5} />

      <div className="app-container" style={{ maxWidth: '1080px' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1.75rem' }}>
          <div>
            <h1 style={{ fontSize: '2.2rem', marginBottom: '0.35rem' }}>Batch Generation Results</h1>
            <p style={{ fontSize: '0.95rem', color: 'var(--text-2)' }}>
              Batch: <strong>{currentBatch?.name || 'Untitled'}</strong> &bull; Personalized certificates are ready for download or archival.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button onClick={() => navigate('/')} className="btn btn-secondary">
              <Home size={15} /> Dashboard
            </button>
            <button onClick={handleStartNewBatch} className="btn btn-primary">
              <PlusCircle size={15} /> New Batch
            </button>
          </div>
        </div>

        {error && (
          <div className="alert alert-error" style={{ marginBottom: '1.5rem' }}>
            <AlertTriangle size={18} />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="card" style={{ padding: '3rem', textAlign: 'center' }}>
            <RefreshCw size={28} className="spin" style={{ color: 'var(--gold)', margin: '0 auto 0.75rem auto' }} />
            <p style={{ fontFamily: 'var(--font-serif)', fontSize: '1.2rem', color: 'var(--text-2)' }}>
              Finalizing generation results...
            </p>
          </div>
        ) : (
          <>
            {/* Status Summary Banner */}
            <div
              className="card"
              style={{
                marginBottom: '2rem',
                padding: '1.75rem',
                borderLeft: `4px solid ${failedItems.length > 0 ? 'var(--gold)' : 'var(--success)'}`
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div
                    style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '50%',
                      backgroundColor: failedItems.length > 0 ? 'var(--gold-light)' : 'var(--success-bg)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: failedItems.length > 0 ? 'var(--gold)' : 'var(--success)'
                    }}
                  >
                    {failedItems.length > 0 ? <AlertTriangle size={24} /> : <CheckCircle2 size={24} />}
                  </div>
                  <div>
                    <h2 style={{ fontSize: '1.3rem', marginBottom: '0.2rem' }}>
                      {failedItems.length === 0
                        ? 'Generation Completed with 100% Success'
                        : `Generation Completed with ${failedItems.length} Noticeable Exception${failedItems.length > 1 ? 's' : ''}`}
                    </h2>
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-2)', margin: 0 }}>
                      Generated {job?.succeededRows} certificates in {Math.round(job?.elapsedSeconds || 0)} seconds with zero rasterization.
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '1.5rem', textAlign: 'right' }}>
                  <div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-2)' }}>Succeeded</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 600, color: 'var(--success)' }}>{job?.succeededRows}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-2)' }}>Skipped / Failed</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 600, color: failedItems.length > 0 ? 'var(--error)' : 'var(--ink)' }}>
                      {job?.failedRows}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-2)' }}>Total Time</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 600, color: 'var(--ink)' }}>
                      {Math.round(job?.elapsedSeconds || 0)}s
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Primary Download & Archival Cards */}
            <h2 style={{ fontSize: '1.3rem', marginBottom: '1rem' }}>Download & Archival Artifacts</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem', marginBottom: '2.5rem' }}>
              {/* ZIP Archive Card */}
              <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.85rem' }}>
                    <FileArchive size={22} color="var(--gold)" />
                    <h3 style={{ fontSize: '1.1rem', margin: 0 }}>ZIP Archive</h3>
                  </div>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-2)', lineHeight: 1.5, marginBottom: '1.25rem' }}>
                    Individual personalized PDF for each recipient, cleanly named by student name and row index.
                  </p>
                </div>
                <button
                  onClick={handleDownloadZip}
                  disabled={!job || job.succeededRows === 0}
                  className="btn btn-primary"
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  <Download size={16} /> Download All (.ZIP)
                </button>
              </div>

              {/* Combined PDF Card */}
              <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.85rem' }}>
                    <FileText size={22} color="var(--gold)" />
                    <h3 style={{ fontSize: '1.1rem', margin: 0 }}>Combined PDF</h3>
                  </div>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-2)', lineHeight: 1.5, marginBottom: '1.25rem' }}>
                    Single unified multi-page document preserving exact spreadsheet print order for batch printing.
                  </p>
                </div>
                <button
                  onClick={handleDownloadCombined}
                  disabled={!job || job.succeededRows === 0}
                  className="btn btn-primary"
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  <Download size={16} /> Download Combined PDF
                </button>
              </div>

              {/* Google Drive Upload Card */}
              <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.85rem' }}>
                    <Cloud size={22} color="var(--gold)" />
                    <h3 style={{ fontSize: '1.1rem', margin: 0 }}>Google Drive</h3>
                  </div>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-2)', lineHeight: 1.5, marginBottom: '1.25rem' }}>
                    {driveStatus.connected
                      ? `Upload batch directly to Google Drive as "${driveStatus.accountEmail}".`
                      : 'Download-first: Google Drive is optional. Connect in Settings or download locally.'}
                  </p>
                </div>
                {driveStatus.connected ? (
                  <button
                    onClick={handleDriveUpload}
                    disabled={uploadingDrive || !job || job.succeededRows === 0}
                    className="btn btn-secondary"
                    style={{ width: '100%', justifyContent: 'center' }}
                  >
                    <Cloud size={16} />
                    <span>{uploadingDrive ? 'Uploading to Drive...' : 'Upload to Google Drive'}</span>
                  </button>
                ) : (
                  <button
                    onClick={() => navigate('/settings')}
                    className="btn btn-quiet"
                    style={{ width: '100%', justifyContent: 'center', fontSize: '0.85rem', border: '1px solid var(--border)' }}
                  >
                    <CloudOff size={15} style={{ marginRight: '0.35rem' }} />
                    <span>Drive Not Connected (Settings)</span>
                  </button>
                )}
              </div>

              {/* Error Report Card */}
              <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.85rem' }}>
                    <FileDown size={22} color={failedItems.length > 0 ? 'var(--error)' : 'var(--text-2)'} />
                    <h3 style={{ fontSize: '1.1rem', margin: 0 }}>Failure Report</h3>
                  </div>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-2)', lineHeight: 1.5, marginBottom: '1.25rem' }}>
                    {failedItems.length > 0
                      ? 'Detailed CSV report describing every skipped row and specific failure reason.'
                      : 'Zero failures were encountered during this batch generation.'}
                  </p>
                </div>
                <button
                  onClick={handleDownloadFailures}
                  disabled={failedItems.length === 0}
                  className="btn btn-secondary"
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  <Download size={16} /> Download Errors (.CSV)
                </button>
              </div>
            </div>

            {/* Google Drive Upload Feedback Banner */}
            {driveSuccess && (
              <div className="card" style={{ marginBottom: '2rem', padding: '1.25rem', borderLeft: '4px solid var(--success)', backgroundColor: 'var(--success-bg)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                  <CheckCircle2 size={20} style={{ color: 'var(--success)' }} />
                  <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--ink)' }}>
                    Artifacts Successfully Uploaded to Google Drive
                  </span>
                </div>
                <div style={{ fontSize: '0.875rem', color: 'var(--ink)', marginBottom: '0.75rem' }}>
                  A dedicated folder was created on Google Drive with your batch certificates:
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  {driveSuccess.folderUrl && (
                    <a
                      href={driveSuccess.folderUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-primary"
                      style={{ fontSize: '0.85rem', padding: '0.35rem 0.75rem' }}
                    >
                      <ExternalLink size={14} /> Open Drive Folder
                    </a>
                  )}
                  {driveSuccess.uploads.map((u, i) => (
                    <a
                      key={i}
                      href={u.webViewLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-secondary"
                      style={{ fontSize: '0.85rem', padding: '0.35rem 0.75rem' }}
                    >
                      <ExternalLink size={14} /> View {u.name}
                    </a>
                  ))}
                </div>
              </div>
            )}

            {driveError && (
              <div className="card" style={{ marginBottom: '2rem', padding: '1.25rem', borderLeft: '4px solid var(--gold)', backgroundColor: 'var(--surface-alt)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                  <CloudOff size={20} style={{ color: 'var(--gold)', flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <span style={{ fontWeight: 600, fontSize: '0.95rem', display: 'block', marginBottom: '0.25rem' }}>
                      Google Drive Status Notice
                    </span>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-2)', margin: '0 0 0.75rem 0' }}>
                      {driveError}
                    </p>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button onClick={() => navigate('/settings')} className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.35rem 0.65rem' }}>
                        Go to Settings
                      </button>
                      <button onClick={handleDownloadZip} className="btn btn-primary" style={{ fontSize: '0.8rem', padding: '0.35rem 0.65rem' }}>
                        Download ZIP Locally
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Failure Inspection Table (if any) */}
            {failedItems.length > 0 && (
              <div className="card" style={{ marginBottom: '2.5rem', padding: '1.5rem' }}>
                <h3 style={{ fontSize: '1.15rem', marginBottom: '0.5rem', color: 'var(--error)' }}>
                  Failed Rows Inspection ({failedItems.length})
                </h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-2)', marginBottom: '1.25rem' }}>
                  The rows below were not generated. You can download the error CSV report or edit your spreadsheet to correct these records.
                </p>

                <div style={{ overflowX: 'auto' }}>
                  <table className="table" style={{ width: '100%' }}>
                    <thead>
                      <tr>
                        <th style={{ width: '80px' }}>Row #</th>
                        <th>Student / Identifier</th>
                        <th>Failure Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {failedItems.map((item, idx) => (
                        <tr key={idx}>
                          <td style={{ fontWeight: 600 }}>{item.rowIndex}</td>
                          <td>{item.studentName || '—'}</td>
                          <td style={{ color: 'var(--error)' }}>{item.errorMessage || 'Unknown error'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Retention & Privacy Notice */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '1rem',
                backgroundColor: 'var(--surface-alt)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.825rem',
                color: 'var(--text-2)'
              }}
            >
              <ShieldCheck size={18} color="var(--gold)" />
              <span>
                Generated ZIP and PDF downloads are retained on this server for 24 hours under our automated cleanup policy.
                You can download your copies now or delete the batch anytime from the Dashboard.
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
