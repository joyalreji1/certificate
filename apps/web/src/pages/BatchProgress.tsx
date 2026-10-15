import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBatchStore } from '../store/batchStore';
import { Stepper } from '../components/Stepper';
import { apiRequest } from '../api/client';
import {
  Play,
  Pause,
  XCircle,
  CheckCircle2,
  AlertCircle,
  Clock,
  Zap,
  FileCheck,
  ArrowRight,
  ShieldAlert
} from 'lucide-react';

interface JobProgressEvent {
  jobId: string;
  batchId: string;
  totalRows: number;
  processedRows: number;
  succeededRows: number;
  failedRows: number;
  currentRow: number;
  percent: number;
  elapsedSeconds: number;
  estimatedRemainingSeconds: number;
  throughputCertsPerSec: number;
  latestResult?: {
    rowIndex: number;
    studentName: string;
    status: 'success' | 'failed';
    warnings: string[];
    errorMessage?: string;
  };
}

export const BatchProgress: React.FC = () => {
  const { currentBatch } = useBatchStore();
  const navigate = useNavigate();

  const [jobStatus, setJobStatus] = useState<'pending' | 'processing' | 'paused' | 'completed' | 'failed' | 'cancelled'>('processing');
  const [progress, setProgress] = useState<JobProgressEvent>({
    jobId: '',
    batchId: currentBatch?.id || '',
    totalRows: 0,
    processedRows: 0,
    succeededRows: 0,
    failedRows: 0,
    currentRow: 0,
    percent: 0,
    elapsedSeconds: 0,
    estimatedRemainingSeconds: 0,
    throughputCertsPerSec: 0
  });

  const [activityLog, setActivityLog] = useState<string[]>([]);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  // Auto-scroll activity log
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [activityLog]);

  // Start job & establish SSE stream
  useEffect(() => {
    if (!currentBatch?.id) {
      navigate('/dashboard');
      return;
    }

    let isMounted = true;

    const startAndConnect = async () => {
      try {
        // Trigger job start
        await apiRequest(`/api/batches/${currentBatch.id}/start-job`, { method: 'POST' });
        setActivityLog((prev) => [...prev, `[${new Date().toLocaleTimeString()}] Bulk generation job dispatched.`]);

        // Connect SSE
        const sseUrl = `/api/batches/${currentBatch.id}/events`;
        const es = new EventSource(sseUrl, { withCredentials: true });
        eventSourceRef.current = es;

        es.addEventListener('initial', (e: MessageEvent) => {
          if (!isMounted) return;
          try {
            const data = JSON.parse(e.data);
            setJobStatus(data.status);
            setProgress((p) => ({
              ...p,
              totalRows: data.totalRows || p.totalRows,
              processedRows: data.processedRows || p.processedRows,
              succeededRows: data.succeededRows || p.succeededRows,
              failedRows: data.failedRows || p.failedRows,
              elapsedSeconds: data.elapsedSeconds || p.elapsedSeconds,
              percent: data.totalRows ? Math.round((data.processedRows / data.totalRows) * 100) : 0
            }));
          } catch {
            // ignore parse err
          }
        });

        es.addEventListener('progress', (e: MessageEvent) => {
          if (!isMounted) return;
          try {
            const data: JobProgressEvent = JSON.parse(e.data);
            setProgress(data);

            if (data.latestResult) {
              const res = data.latestResult;
              const msg = res.status === 'success'
                ? `✓ Row #${res.rowIndex}: Generated certificate for "${res.studentName}"`
                : `✗ Row #${res.rowIndex}: Failed for "${res.studentName}" (${res.errorMessage || 'Error'})`;
              setActivityLog((prev) => [...prev.slice(-100), `[${new Date().toLocaleTimeString()}] ${msg}`]);
            }
          } catch {
            // ignore parse err
          }
        });

        es.addEventListener('status', (e: MessageEvent) => {
          if (!isMounted) return;
          try {
            const data = JSON.parse(e.data);
            setJobStatus(data.status);
            setActivityLog((prev) => [...prev, `[${new Date().toLocaleTimeString()}] Job status updated: ${data.status.toUpperCase()}`]);
          } catch {
            // ignore parse err
          }
        });

        es.addEventListener('done', (e: MessageEvent) => {
          if (!isMounted) return;
          try {
            const data = JSON.parse(e.data);
            setJobStatus(data.status);
            setActivityLog((prev) => [
              ...prev,
              `[${new Date().toLocaleTimeString()}] Batch generation complete. ${data.succeededRows} certificates generated successfully.`
            ]);
            es.close();

            // Give user 1.5 seconds to see 100% completion before navigating to results
            setTimeout(() => {
              if (isMounted) navigate('/results');
            }, 1500);
          } catch {
            // ignore parse err
          }
        });

        es.onerror = () => {
          // If SSE fails or disconnects, fall back to periodic polling
          console.warn('[SSE] EventSource disconnected; falling back to status polling.');
        };
      } catch (err: any) {
        if (isMounted) {
          setErrorNotice(err.message || 'Failed to dispatch bulk job.');
        }
      }
    };

    startAndConnect();

    // Fallback status poller every 2.5s
    const poller = setInterval(async () => {
      if (!isMounted || jobStatus === 'completed' || jobStatus === 'cancelled') return;
      try {
        const res = await apiRequest<{ job: any }>(`/api/batches/${currentBatch.id}/job`);
        if (res.job) {
          setJobStatus(res.job.status);
          setProgress((prev) => ({
            ...prev,
            totalRows: res.job.totalRows,
            processedRows: res.job.processedRows,
            succeededRows: res.job.succeededRows,
            failedRows: res.job.failedRows,
            elapsedSeconds: res.job.elapsedSeconds,
            estimatedRemainingSeconds: res.job.estimatedRemainingSeconds,
            percent: res.job.totalRows ? Math.round((res.job.processedRows / res.job.totalRows) * 100) : 0
          }));

          if (res.job.status === 'completed' || res.job.status === 'cancelled') {
            clearInterval(poller);
            if (eventSourceRef.current) eventSourceRef.current.close();
            setTimeout(() => navigate('/results'), 1200);
          }
        }
      } catch {
        // silence polling error
      }
    }, 2500);

    return () => {
      isMounted = false;
      clearInterval(poller);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [currentBatch?.id]);

  const handlePause = async () => {
    if (!currentBatch?.id) return;
    try {
      await apiRequest(`/api/batches/${currentBatch.id}/pause`, { method: 'POST' });
      setJobStatus('paused');
    } catch (err: any) {
      setErrorNotice(err.message);
    }
  };

  const handleResume = async () => {
    if (!currentBatch?.id) return;
    try {
      await apiRequest(`/api/batches/${currentBatch.id}/resume`, { method: 'POST' });
      setJobStatus('processing');
    } catch (err: any) {
      setErrorNotice(err.message);
    }
  };

  const handleCancel = async () => {
    if (!currentBatch?.id) return;
    if (!window.confirm('Are you sure you want to cancel bulk generation? All progress made so far will be saved.')) {
      return;
    }
    try {
      await apiRequest(`/api/batches/${currentBatch.id}/cancel`, { method: 'POST' });
      setJobStatus('cancelled');
      if (eventSourceRef.current) eventSourceRef.current.close();
      navigate('/results');
    } catch (err: any) {
      setErrorNotice(err.message);
    }
  };

  return (
    <div>
      <Stepper currentStep={5} />

      <div className="app-container" style={{ maxWidth: '1000px' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1.75rem' }}>
          <div>
            <h1 style={{ fontSize: '2.2rem', marginBottom: '0.35rem' }}>Generating Certificates</h1>
            <p style={{ fontSize: '0.95rem', color: 'var(--text-2)' }}>
              Batch: <strong>{currentBatch?.name || 'Untitled'}</strong> &bull; Streaming high-fidelity PDF overlays directly into ZIP and combined archive.
            </p>
          </div>

          {/* Job State Badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span
              className={`badge badge-${jobStatus === 'processing' ? 'gold' : jobStatus === 'paused' ? 'neutral' : 'success'}`}
              style={{ fontSize: '0.85rem', padding: '0.4rem 0.85rem', textTransform: 'capitalize' }}
            >
              {jobStatus === 'processing' && <span className="spin" style={{ display: 'inline-block', marginRight: '6px' }}>●</span>}
              {jobStatus}
            </span>
          </div>
        </div>

        {errorNotice && (
          <div className="alert alert-error" style={{ marginBottom: '1.5rem' }}>
            <ShieldAlert size={18} />
            <span>{errorNotice}</span>
          </div>
        )}

        {/* Primary Progress Card */}
        <div className="card" style={{ marginBottom: '1.75rem', padding: '2rem' }}>
          {/* Large percentage display */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.75rem' }}>
            <span style={{ fontFamily: 'var(--font-serif)', fontSize: '2.4rem', fontWeight: 600, color: 'var(--ink)' }}>
              {progress.percent}%
            </span>
            <span style={{ fontSize: '0.95rem', color: 'var(--text-2)' }}>
              <strong>{progress.processedRows}</strong> of <strong>{progress.totalRows}</strong> records processed
            </span>
          </div>

          {/* Progress Track */}
          <div
            style={{
              width: '100%',
              height: '14px',
              backgroundColor: 'var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              overflow: 'hidden',
              marginBottom: '2rem'
            }}
          >
            <div
              style={{
                width: `${progress.percent}%`,
                height: '100%',
                backgroundColor: jobStatus === 'paused' ? 'var(--text-2)' : 'var(--gold)',
                transition: 'width 250ms ease-out'
              }}
            />
          </div>

          {/* Metric Tiles */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '1.25rem',
              paddingTop: '1.25rem',
              borderTop: '1px solid var(--border-subtle)'
            }}
          >
            {/* Succeeded */}
            <div style={{ textAlign: 'center', padding: '0.75rem', backgroundColor: 'var(--surface-alt)', borderRadius: 'var(--radius-sm)' }}>
              <div style={{ color: 'var(--success)', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.85rem', marginBottom: '0.35rem' }}>
                <CheckCircle2 size={15} /> Succeeded
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--ink)' }}>{progress.succeededRows}</div>
            </div>

            {/* Failed */}
            <div style={{ textAlign: 'center', padding: '0.75rem', backgroundColor: 'var(--surface-alt)', borderRadius: 'var(--radius-sm)' }}>
              <div style={{ color: progress.failedRows > 0 ? 'var(--error)' : 'var(--text-2)', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.85rem', marginBottom: '0.35rem' }}>
                <AlertCircle size={15} /> Failed / Skipped
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 600, color: progress.failedRows > 0 ? 'var(--error)' : 'var(--ink)' }}>{progress.failedRows}</div>
            </div>

            {/* Throughput */}
            <div style={{ textAlign: 'center', padding: '0.75rem', backgroundColor: 'var(--surface-alt)', borderRadius: 'var(--radius-sm)' }}>
              <div style={{ color: 'var(--gold)', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.85rem', marginBottom: '0.35rem' }}>
                <Zap size={15} /> Throughput
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--ink)' }}>
                {progress.throughputCertsPerSec} <span style={{ fontSize: '0.85rem', fontWeight: 400, color: 'var(--text-2)' }}>certs/sec</span>
              </div>
            </div>

            {/* Estimated Remaining */}
            <div style={{ textAlign: 'center', padding: '0.75rem', backgroundColor: 'var(--surface-alt)', borderRadius: 'var(--radius-sm)' }}>
              <div style={{ color: 'var(--text-2)', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.85rem', marginBottom: '0.35rem' }}>
                <Clock size={15} /> Remaining ETA
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--ink)' }}>
                {progress.percent >= 100 ? '0:00' : formatTime(progress.estimatedRemainingSeconds)}
              </div>
            </div>
          </div>
        </div>

        {/* Action Controls & Live Activity Log */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '1.5rem', marginBottom: '2rem' }}>
          {/* Live Activity Log */}
          <div className="card" style={{ padding: '1.25rem' }}>
            <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <FileCheck size={16} /> Live Batch Event Log
            </h3>
            <div
              ref={logContainerRef}
              style={{
                height: '180px',
                overflowY: 'auto',
                backgroundColor: 'var(--surface-alt)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                padding: '0.75rem',
                fontFamily: 'monospace',
                fontSize: '0.8rem',
                lineHeight: 1.6,
                color: 'var(--text-2)'
              }}
            >
              {activityLog.length === 0 ? (
                <div style={{ color: 'var(--text-2)', fontStyle: 'italic' }}>Initializing stream...</div>
              ) : (
                activityLog.map((log, idx) => (
                  <div key={idx} style={{ color: log.includes('✗') ? 'var(--error)' : 'var(--ink)' }}>
                    {log}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Job Control Panel */}
          <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Job Controls</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-2)', marginBottom: '1.25rem' }}>
                You can pause to inspect system load or cancel cleanly without corrupting generated archives.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {jobStatus === 'paused' ? (
                <button onClick={handleResume} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
                  <Play size={15} /> Resume Job
                </button>
              ) : (
                <button
                  onClick={handlePause}
                  disabled={jobStatus !== 'processing'}
                  className="btn btn-secondary"
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  <Pause size={15} /> Pause Job
                </button>
              )}

              <button
                onClick={handleCancel}
                disabled={jobStatus === 'completed' || jobStatus === 'cancelled'}
                className="btn btn-secondary"
                style={{ width: '100%', justifyContent: 'center', color: 'var(--error)', borderColor: 'var(--error)' }}
              >
                <XCircle size={15} /> Cancel Batch
              </button>

              {jobStatus === 'completed' && (
                <button
                  onClick={() => navigate('/results')}
                  className="btn btn-primary"
                  style={{ width: '100%', justifyContent: 'center', marginTop: '0.5rem' }}
                >
                  <span>View Results</span> <ArrowRight size={15} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
