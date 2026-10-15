import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBatchStore } from '../store/batchStore';
import { Stepper } from '../components/Stepper';
import {
  Upload as UploadIcon,
  FileText,
  Table as TableIcon,
  CheckCircle,
  AlertCircle,
  ArrowRight
} from 'lucide-react';

export const Upload: React.FC = () => {
  const [batchName, setBatchName] = useState('Certificate Batch — ' + new Date().toLocaleDateString());
  const [pdfDragOver, setPdfDragOver] = useState(false);
  const [sheetDragOver, setSheetDragOver] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [uploadingSheet, setUploadingSheet] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [sheetError, setSheetError] = useState<string | null>(null);

  const pdfInputRef = useRef<HTMLInputElement>(null);
  const sheetInputRef = useRef<HTMLInputElement>(null);

  const {
    template,
    spreadsheet,
    uploadTemplate,
    uploadSpreadsheet,
    switchSheet,
    createOrUpdateBatch
  } = useBatchStore();

  const navigate = useNavigate();

  const handlePdfFile = async (file: File) => {
    setPdfError(null);
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setPdfError('Only PDF files are supported for certificate templates.');
      return;
    }
    setUploadingPdf(true);
    try {
      await uploadTemplate(file);
    } catch (err: any) {
      setPdfError(err.message || 'Failed to inspect PDF template.');
    } finally {
      setUploadingPdf(false);
    }
  };

  const handleSpreadsheetFile = async (file: File) => {
    setSheetError(null);
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext || '')) {
      setSheetError('Only Excel (.xlsx, .xls) and CSV (.csv) files are supported.');
      return;
    }
    setUploadingSheet(true);
    try {
      await uploadSpreadsheet(file);
    } catch (err: any) {
      setSheetError(err.message || 'Failed to inspect spreadsheet.');
    } finally {
      setUploadingSheet(false);
    }
  };

  const handleContinue = async () => {
    if (!template || !spreadsheet) return;
    try {
      await createOrUpdateBatch(batchName);
      navigate('/mapping');
    } catch (err: any) {
      alert(err.message || 'Failed to proceed.');
    }
  };

  const canContinue = !!template && !!spreadsheet && !uploadingPdf && !uploadingSheet;

  return (
    <div>
      <Stepper currentStep={1} />

      <div className="app-container" style={{ maxWidth: '1000px' }}>
        <div style={{ marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '2.2rem', marginBottom: '0.35rem' }}>Upload Certificate Assets</h1>
          <p style={{ fontSize: '0.95rem', color: 'var(--text-2)' }}>
            Provide your original PDF certificate artwork and the participant list in Excel or CSV format.
          </p>
        </div>

        {/* Batch Name */}
        <div className="card" style={{ marginBottom: '1.75rem', padding: '1.25rem 1.75rem' }}>
          <label htmlFor="batchName" className="form-label">
            Batch Name
          </label>
          <input
            id="batchName"
            type="text"
            className="form-input"
            value={batchName}
            onChange={(e) => setBatchName(e.target.value)}
            style={{ width: '100%', marginTop: '0.25rem' }}
            placeholder="e.g. Arts Fest 2026 Merit Awards"
          />
        </div>

        {/* Two Upload Dropzones */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.75rem', marginBottom: '2rem' }}>
          {/* 1. Template PDF Dropzone */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <FileText size={15} style={{ color: 'var(--gold)' }} />
                1. Certificate Template (PDF)
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-2)' }}>Max 30MB</span>
            </div>

            <div
              onDragOver={(e) => { e.preventDefault(); setPdfDragOver(true); }}
              onDragLeave={() => setPdfDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setPdfDragOver(false);
                if (e.dataTransfer.files?.[0]) handlePdfFile(e.dataTransfer.files[0]);
              }}
              onClick={() => pdfInputRef.current?.click()}
              style={{
                border: `2px dashed ${pdfDragOver ? 'var(--gold)' : 'var(--border)'}`,
                backgroundColor: pdfDragOver ? 'var(--gold-light)' : 'var(--surface)',
                borderRadius: 'var(--radius-sm)',
                padding: '2.5rem 1.5rem',
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all var(--transition-fast)'
              }}
            >
              <input
                ref={pdfInputRef}
                type="file"
                accept=".pdf"
                style={{ display: 'none' }}
                onChange={(e) => {
                  if (e.target.files?.[0]) handlePdfFile(e.target.files[0]);
                }}
              />
              <UploadIcon size={32} style={{ color: 'var(--gold)', marginBottom: '0.75rem' }} />
              <p style={{ fontWeight: 600, color: 'var(--ink)', marginBottom: '0.25rem' }}>
                {uploadingPdf ? 'Inspecting PDF document...' : 'Click or drag PDF template here'}
              </p>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-2)' }}>
                Exact vector artwork will be preserved
              </p>
            </div>

            {pdfError && (
              <div className="badge badge-error" style={{ width: '100%', marginTop: '0.75rem', padding: '0.5rem', textTransform: 'none' }}>
                <AlertCircle size={14} style={{ marginRight: '0.35rem' }} />
                <span>{pdfError}</span>
              </div>
            )}

            {/* Template Inspection Result */}
            {template && (
              <div className="card" style={{ marginTop: '1rem', padding: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <CheckCircle size={16} style={{ color: 'var(--success)' }} />
                  <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{template.filename}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--text-2)' }}>
                  <div>
                    <strong>Dimensions:</strong> {template.pageSizePoints.width} × {template.pageSizePoints.height} pt
                  </div>
                  <div>
                    <strong>Physical:</strong> {template.pageSizeMm.width} × {template.pageSizeMm.height} mm
                  </div>
                  <div>
                    <strong>Pages:</strong> {template.pageCount} page(s)
                  </div>
                  <div>
                    <strong>Rotation:</strong> {template.rotation}°
                  </div>
                </div>
                {template.pageCount > 1 && (
                  <p style={{ fontSize: '0.75rem', color: 'var(--gold)', marginTop: '0.5rem' }}>
                    Note: Multi-page PDF detected. Page 1 will be used as default.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* 2. Student List Spreadsheet Dropzone */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <TableIcon size={15} style={{ color: 'var(--gold)' }} />
                2. Participant List (XLSX / CSV)
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-2)' }}>Max 30MB</span>
            </div>

            <div
              onDragOver={(e) => { e.preventDefault(); setSheetDragOver(true); }}
              onDragLeave={() => setSheetDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setSheetDragOver(false);
                if (e.dataTransfer.files?.[0]) handleSpreadsheetFile(e.dataTransfer.files[0]);
              }}
              onClick={() => sheetInputRef.current?.click()}
              style={{
                border: `2px dashed ${sheetDragOver ? 'var(--gold)' : 'var(--border)'}`,
                backgroundColor: sheetDragOver ? 'var(--gold-light)' : 'var(--surface)',
                borderRadius: 'var(--radius-sm)',
                padding: '2.5rem 1.5rem',
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all var(--transition-fast)'
              }}
            >
              <input
                ref={sheetInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                style={{ display: 'none' }}
                onChange={(e) => {
                  if (e.target.files?.[0]) handleSpreadsheetFile(e.target.files[0]);
                }}
              />
              <TableIcon size={32} style={{ color: 'var(--gold)', marginBottom: '0.75rem' }} />
              <p style={{ fontWeight: 600, color: 'var(--ink)', marginBottom: '0.25rem' }}>
                {uploadingSheet ? 'Parsing spreadsheet rows...' : 'Click or drag XLSX / CSV here'}
              </p>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-2)' }}>
                Multi-sheet Excel & CSV with UTF-8 supported
              </p>
            </div>

            {sheetError && (
              <div className="badge badge-error" style={{ width: '100%', marginTop: '0.75rem', padding: '0.5rem', textTransform: 'none' }}>
                <AlertCircle size={14} style={{ marginRight: '0.35rem' }} />
                <span>{sheetError}</span>
              </div>
            )}

            {/* Spreadsheet Inspection Result */}
            {spreadsheet && (
              <div className="card" style={{ marginTop: '1rem', padding: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <CheckCircle size={16} style={{ color: 'var(--success)' }} />
                    <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{spreadsheet.filename}</span>
                  </div>
                  <span className="badge badge-gold">{spreadsheet.totalRows} Rows</span>
                </div>

                {/* Worksheet Selector if multi-sheet */}
                {spreadsheet.sheets.length > 1 && (
                  <div style={{ margin: '0.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>Active Sheet:</label>
                    <select
                      className="form-select"
                      style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
                      value={spreadsheet.activeSheet}
                      onChange={(e) => switchSheet(e.target.value)}
                    >
                      {spreadsheet.sheets.map((sheet) => (
                        <option key={sheet} value={sheet}>{sheet}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div style={{ fontSize: '0.78rem', color: 'var(--text-2)', marginTop: '0.4rem' }}>
                  <strong>Headers detected ({spreadsheet.headers.length}):</strong> {spreadsheet.headers.slice(0, 4).join(', ')}
                  {spreadsheet.headers.length > 4 && ` + ${spreadsheet.headers.length - 4} more`}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Action Button */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: '1.5rem' }}>
          <button
            onClick={handleContinue}
            disabled={!canContinue}
            className="btn btn-primary"
            style={{ padding: '0.75rem 1.75rem', fontSize: '1rem' }}
          >
            <span>Continue to Column Mapping</span>
            <ArrowRight size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};
