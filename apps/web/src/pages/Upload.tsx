import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBatchStore } from '../store/batchStore';
import { Stepper } from '../components/Stepper';
import {
  Upload as UploadIcon,
  FileText,
  Table as TableIcon,
  CheckCircle,
  AlertCircle,
  ArrowRight,
  Award,
  Sparkles
} from 'lucide-react';

export const Upload: React.FC = () => {
  const [batchName, setBatchName] = useState('Certificate Batch — ' + new Date().toLocaleDateString());
  const [localProgramName, setLocalProgramName] = useState('');
  const [templateSourceTab, setTemplateSourceTab] = useState<'upload' | 'existing'>('upload');
  const [pdfDragOver, setPdfDragOver] = useState(false);
  const [sheetDragOver, setSheetDragOver] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [uploadingSheet, setUploadingSheet] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const pdfInputRef = useRef<HTMLInputElement>(null);
  const sheetInputRef = useRef<HTMLInputElement>(null);

  const {
    template,
    availableTemplates,
    spreadsheet,
    programName,
    uploadTemplate,
    fetchAvailableTemplates,
    selectExistingTemplate,
    uploadSpreadsheet,
    switchSheet,
    setProgramName,
    createOrUpdateBatch
  } = useBatchStore();

  const navigate = useNavigate();

  // Load existing templates on mount
  useEffect(() => {
    fetchAvailableTemplates();
    if (programName) {
      setLocalProgramName(programName);
    }
  }, []);

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
    if (isSubmitting) return; // Prevent double-clicks
    setFormError(null);

    if (!template) {
      setFormError('Please select or upload a certificate PDF template.');
      return;
    }
    if (!spreadsheet) {
      setFormError('Please upload a student participant list.');
      return;
    }
    if (!localProgramName.trim()) {
      setFormError('Please enter the "Program Participated" name that will appear on all certificates in this batch.');
      return;
    }

    setIsSubmitting(true);
    try {
      setProgramName(localProgramName.trim());
      await createOrUpdateBatch(batchName.trim(), localProgramName.trim());
      navigate('/mapping');
    } catch (err: any) {
      setFormError(err.message || 'Failed to initialize batch.');
      setIsSubmitting(false);
    }
  };

  const canContinue = !!template && !!spreadsheet && !!localProgramName.trim() && !uploadingPdf && !uploadingSheet && !isSubmitting;

  return (
    <div>
      <Stepper currentStep={1} />

      <div className="app-container" style={{ maxWidth: '1000px' }}>
        <div style={{ marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '2.2rem', marginBottom: '0.35rem' }}>Create Certificate Batch</h1>
          <p style={{ fontSize: '0.95rem', color: 'var(--text-2)' }}>
            Configure your batch details, choose or upload your certificate template, and import student names.
          </p>
        </div>

        {formError && (
          <div className="badge badge-error" style={{ width: '100%', marginBottom: '1.5rem', padding: '0.75rem 1rem', fontSize: '0.875rem', textTransform: 'none' }}>
            <AlertCircle size={16} style={{ marginRight: '0.5rem', flexShrink: 0 }} />
            <span>{formError}</span>
          </div>
        )}

        {/* Batch Info Card */}
        <div className="card" style={{ marginBottom: '1.75rem', padding: '1.5rem 1.75rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            <div>
              <label htmlFor="batchName" className="form-label" style={{ fontWeight: 600 }}>
                Batch Title
              </label>
              <input
                id="batchName"
                type="text"
                className="form-input"
                value={batchName}
                onChange={(e) => setBatchName(e.target.value)}
                style={{ width: '100%', marginTop: '0.35rem' }}
                placeholder="e.g. National Arts & Music Fest 2026"
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-2)', display: 'block', marginTop: '0.35rem' }}>
                Used for file naming and organizing your jobs.
              </span>
            </div>

            <div>
              <label htmlFor="programName" className="form-label" style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Award size={15} style={{ color: 'var(--gold)' }} />
                <span>Program Participated (Global for Batch)</span>
                <span style={{ color: 'var(--error)' }}>*</span>
              </label>
              <input
                id="programName"
                type="text"
                className="form-input"
                value={localProgramName}
                onChange={(e) => setLocalProgramName(e.target.value)}
                style={{ width: '100%', marginTop: '0.35rem', borderColor: !localProgramName.trim() ? 'var(--gold)' : 'var(--border)' }}
                placeholder="e.g. Classical Dance Solo — Grade A"
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-2)', display: 'block', marginTop: '0.35rem' }}>
                This single program name will be printed on every certificate in this batch.
              </span>
            </div>
          </div>
        </div>

        {/* Two Upload / Selection Dropzones */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.75rem', marginBottom: '2rem' }}>
          {/* 1. Certificate Template Support: Upload OR Select Existing */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', margin: 0 }}>
                <FileText size={15} style={{ color: 'var(--gold)' }} />
                1. Certificate Template (PDF)
              </span>
              <div style={{ display: 'flex', gap: '0.35rem' }}>
                <button
                  type="button"
                  onClick={() => setTemplateSourceTab('upload')}
                  className={`btn ${templateSourceTab === 'upload' ? 'btn-primary' : 'btn-quiet'}`}
                  style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem' }}
                >
                  Upload New
                </button>
                {availableTemplates.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setTemplateSourceTab('existing')}
                    className={`btn ${templateSourceTab === 'existing' ? 'btn-primary' : 'btn-quiet'}`}
                    style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem' }}
                  >
                    Select Saved ({availableTemplates.length})
                  </button>
                )}
              </div>
            </div>

            {templateSourceTab === 'upload' ? (
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
                  padding: '2.25rem 1.25rem',
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
                <UploadIcon size={30} style={{ color: 'var(--gold)', marginBottom: '0.5rem' }} />
                <p style={{ fontWeight: 600, color: 'var(--ink)', marginBottom: '0.25rem', fontSize: '0.9rem' }}>
                  {uploadingPdf ? 'Inspecting PDF template...' : 'Click or drag PDF template here'}
                </p>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-2)', margin: 0 }}>
                  Landscape, portrait & custom dimensions supported
                </p>
              </div>
            ) : (
              <div className="card" style={{ padding: '1.25rem' }}>
                <label className="form-label" style={{ fontSize: '0.8rem', marginBottom: '0.5rem' }}>
                  Choose a previously saved template:
                </label>
                <select
                  className="form-select"
                  value={template?.id || ''}
                  onChange={(e) => {
                    const chosen = availableTemplates.find((t) => t.id === e.target.value);
                    if (chosen) selectExistingTemplate(chosen);
                  }}
                  style={{ width: '100%', marginBottom: '0.75rem' }}
                >
                  <option value="">— Select a saved template —</option>
                  {availableTemplates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.filename} ({t.pageSizePoints.width} × {t.pageSizePoints.height} pt, {t.pageCount} pg)
                    </option>
                  ))}
                </select>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-2)' }}>
                  Selecting a template automatically restores its saved text positions & font presets.
                </span>
              </div>
            )}

            {pdfError && (
              <div className="badge badge-error" style={{ width: '100%', marginTop: '0.75rem', padding: '0.5rem', textTransform: 'none' }}>
                <AlertCircle size={14} style={{ marginRight: '0.35rem', flexShrink: 0 }} />
                <span>{pdfError}</span>
              </div>
            )}

            {/* Template Inspection Result */}
            {template && (
              <div className="card" style={{ marginTop: '0.85rem', padding: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <CheckCircle size={16} style={{ color: 'var(--success)' }} />
                    <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{template.filename}</span>
                  </div>
                  {template.overlayFields && template.overlayFields.length > 0 && (
                    <span className="badge badge-gold" style={{ fontSize: '0.7rem' }}>
                      <Sparkles size={11} style={{ marginRight: '0.25rem' }} /> Saved Layout Preset Available
                    </span>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.4rem', fontSize: '0.78rem', color: 'var(--text-2)' }}>
                  <div>
                    <strong>Points:</strong> {template.pageSizePoints.width} × {template.pageSizePoints.height} pt
                  </div>
                  <div>
                    <strong>Physical:</strong> {template.pageSizeMm.width} × {template.pageSizeMm.height} mm
                  </div>
                  <div>
                    <strong>Orientation:</strong> {template.pageSizePoints.width >= template.pageSizePoints.height ? 'Landscape' : 'Portrait'}
                  </div>
                  <div>
                    <strong>Pages:</strong> {template.pageCount}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 2. Student List Spreadsheet Dropzone */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', margin: 0 }}>
                <TableIcon size={15} style={{ color: 'var(--gold)' }} />
                2. Student Names List (XLSX / CSV)
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-2)' }}>Names only required</span>
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
                padding: '2.25rem 1.25rem',
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
              <TableIcon size={30} style={{ color: 'var(--gold)', marginBottom: '0.5rem' }} />
              <p style={{ fontWeight: 600, color: 'var(--ink)', marginBottom: '0.25rem', fontSize: '0.9rem' }}>
                {uploadingSheet ? 'Parsing student names...' : 'Click or drag XLSX / CSV here'}
              </p>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-2)', margin: 0 }}>
                Only student names required &bull; Single or multi-column files supported
              </p>
            </div>

            {sheetError && (
              <div className="badge badge-error" style={{ width: '100%', marginTop: '0.75rem', padding: '0.5rem', textTransform: 'none' }}>
                <AlertCircle size={14} style={{ marginRight: '0.35rem', flexShrink: 0 }} />
                <span>{sheetError}</span>
              </div>
            )}

            {/* Spreadsheet Inspection Result */}
            {spreadsheet && (
              <div className="card" style={{ marginTop: '0.85rem', padding: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <CheckCircle size={16} style={{ color: 'var(--success)' }} />
                    <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{spreadsheet.filename}</span>
                  </div>
                  <span className="badge badge-gold">{spreadsheet.totalRows} Students Found</span>
                </div>

                {/* Worksheet Selector if multi-sheet */}
                {spreadsheet.sheets.length > 1 && (
                  <div style={{ margin: '0.4rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>Active Sheet:</label>
                    <select
                      className="form-select"
                      style={{ padding: '0.2rem 0.4rem', fontSize: '0.75rem' }}
                      value={spreadsheet.activeSheet}
                      onChange={(e) => switchSheet(e.target.value)}
                    >
                      {spreadsheet.sheets.map((sheet) => (
                        <option key={sheet} value={sheet}>{sheet}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div style={{ fontSize: '0.75rem', color: 'var(--text-2)', marginTop: '0.35rem' }}>
                  <strong>Columns detected:</strong> {spreadsheet.headers.join(', ')}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Confirmation Preview Banner */}
        {spreadsheet && localProgramName.trim() && (
          <div
            className="card"
            style={{
              backgroundColor: 'var(--surface-alt)',
              border: '1px solid var(--gold)',
              padding: '1.25rem 1.5rem',
              marginBottom: '2rem',
              display: 'flex',
              alignItems: 'center',
              gap: '1rem'
            }}
          >
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                backgroundColor: 'var(--gold-light)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
            >
              <Award size={20} style={{ color: 'var(--gold)' }} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--ink)', marginBottom: '0.15rem' }}>
                Batch Confirmation Preview
              </div>
              <div style={{ fontSize: '0.9rem', color: 'var(--ink)' }}>
                This program: <strong style={{ color: 'var(--gold)' }}>"{localProgramName.trim()}"</strong> will be printed on all{' '}
                <strong>{spreadsheet.totalRows}</strong> certificates.
              </div>
            </div>
          </div>
        )}

        {/* Action Button */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: '1.5rem' }}>
          <button
            onClick={handleContinue}
            disabled={!canContinue}
            className="btn btn-primary"
            style={{ padding: '0.75rem 1.75rem', fontSize: '1rem' }}
          >
            <span>{isSubmitting ? 'Saving Batch...' : 'Continue to Column Mapping'}</span>
            <ArrowRight size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};
