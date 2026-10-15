import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBatchStore } from '../store/batchStore';
import { Stepper } from '../components/Stepper';
import { StandardFieldKeys } from '@bulk-cert/shared';
import { apiRequest } from '../api/client';
import {
  CheckCircle,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  Sliders,
  Award,
  Users,
  UserX,
  UserCheck,
  Edit2,
  Check,
  X,
  Search
} from 'lucide-react';

export const MappingValidation: React.FC = () => {
  const {
    currentBatch,
    spreadsheet,
    programName,
    mappings,
    validationSummary,
    excludedRows,
    nameOverrides,
    setMappings,
    setProgramName,
    setNameOverride,
    createOrUpdateBatch,
    validateBatch,
    toggleExcludeRow,
    isLoading
  } = useBatchStore();

  const [activeTab, setActiveTab] = useState<'students' | 'issues' | 'errors' | 'warnings' | 'excluded'>('students');
  const [editingProgram, setEditingProgram] = useState(false);
  const [tempProgramName, setTempProgramName] = useState(programName || currentBatch?.programName || '');
  const [editingRowIndex, setEditingRowIndex] = useState<number | null>(null);
  const [tempStudentName, setTempStudentName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [fullRows, setFullRows] = useState<Record<string, string>[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();

  // Validate on mount if not yet validated
  useEffect(() => {
    if (currentBatch?.id && spreadsheet && !validationSummary) {
      validateBatch();
    }
    if (currentBatch?.programName && !programName) {
      setProgramName(currentBatch.programName);
      setTempProgramName(currentBatch.programName);
    }
  }, [currentBatch?.id, spreadsheet]);

  // Load full rows from spreadsheet API
  useEffect(() => {
    if (!spreadsheet?.id) return;
    let isCancelled = false;

    const fetchAllRows = async () => {
      setLoadingRows(true);
      try {
        const res = await apiRequest<{ headers: string[]; rows: Record<string, string>[] }>(
          `/api/spreadsheets/${spreadsheet.id}/rows`
        );
        if (!isCancelled && res.rows && res.rows.length > 0) {
          setFullRows(res.rows);
        }
      } catch (err) {
        console.warn('Could not fetch full rows, falling back to preview rows', err);
      } finally {
        if (!isCancelled) setLoadingRows(false);
      }
    };

    fetchAllRows();
    return () => {
      isCancelled = true;
    };
  }, [spreadsheet?.id]);

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

  const handleSaveProgramName = async () => {
    if (!tempProgramName.trim()) return;
    setProgramName(tempProgramName.trim());
    if (currentBatch?.id) {
      await createOrUpdateBatch(currentBatch.name, tempProgramName.trim());
    }
    setEditingProgram(false);
  };

  const handleStartEditStudent = (rowIndex: number, currentName: string) => {
    setEditingRowIndex(rowIndex);
    setTempStudentName(nameOverrides[rowIndex] || currentName);
  };

  const handleSaveStudentName = async (rowIndex: number) => {
    if (tempStudentName.trim()) {
      await setNameOverride(rowIndex, tempStudentName.trim());
    }
    setEditingRowIndex(null);
  };

  const handleCancelEditStudent = () => {
    setEditingRowIndex(null);
    setTempStudentName('');
  };

  const handleProceed = async () => {
    if (isSubmitting) return;

    if (!effectiveProgramName) {
      alert('Please enter a Program Participated value before proceeding to the template editor.');
      return;
    }

    if (!hasStudentNameMapping) {
      alert('Please map the Student Name column before proceeding to the template editor.');
      return;
    }

    if (validRowCount === 0) {
      alert('No valid student recipients found to generate certificates. Please check exclusions or data.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (currentBatch?.id) {
        await createOrUpdateBatch(currentBatch.name, effectiveProgramName);
      }
      navigate('/editor');
    } catch (err: any) {
      alert(err.message || 'Failed to proceed to editor.');
      setIsSubmitting(false);
    }
  };

  // Only Student Name mapping is required! Program is shared globally.
  const studentNameMapping = mappings.find((m) => m.fieldKey === StandardFieldKeys.STUDENT_NAME);
  const hasStudentNameMapping = !!studentNameMapping?.spreadsheetColumn;

  const validRowCount = validationSummary?.validRows ?? (spreadsheet?.totalRows || 0);
  const effectiveProgramName = (programName || currentBatch?.programName || tempProgramName).trim();
  const canProceed = hasStudentNameMapping && validRowCount > 0 && !!effectiveProgramName;

  // Filter issues
  const errorsList = validationSummary?.errors || [];
  const filteredErrors = errorsList.filter((e) => {
    const isExcluded = excludedRows.includes(e.rowIndex);
    if (activeTab === 'excluded') return isExcluded;
    if (activeTab === 'errors') return e.severity === 'error';
    if (activeTab === 'warnings') return e.severity === 'warning';
    return true;
  });

  const displayRows = fullRows.length > 0 ? fullRows : (spreadsheet?.previewRows || []);
  const nameColumn = studentNameMapping?.spreadsheetColumn || spreadsheet?.headers[0] || 'Name';

  const filteredStudentRows = displayRows
    .map((row, idx) => ({ row, lineNum: idx + 2 }))
    .filter(({ row, lineNum }) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      const currentName = nameOverrides[lineNum] || row[nameColumn] || row['student_name'] || row['name'] || '';
      return currentName.toLowerCase().includes(q) || String(lineNum).includes(q);
    });

  return (
    <div>
      <Stepper currentStep={2} />

      <div className="app-container" style={{ maxWidth: '1100px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1.75rem' }}>
          <div>
            <h1 style={{ fontSize: '2.2rem', marginBottom: '0.35rem' }}>Student Data & Column Mapping</h1>
            <p style={{ fontSize: '0.95rem', color: 'var(--text-2)' }}>
              Verify student recipients, edit names, remove exclusions, and confirm the shared program value before designing text overlays.
            </p>
          </div>
          <button
            onClick={() => validateBatch()}
            disabled={isLoading || isSubmitting}
            className="btn btn-secondary"
            style={{ fontSize: '0.85rem' }}
          >
            <RefreshCw size={14} className={isLoading ? 'spin' : ''} />
            <span>Re-validate Rows</span>
          </button>
        </div>

        {/* Global Program Participated Confirmation Banner */}
        <div
          className="card"
          style={{
            backgroundColor: 'var(--surface)',
            border: '1.5px solid var(--gold)',
            padding: '1.25rem 1.5rem',
            marginBottom: '1.75rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '50%',
                backgroundColor: 'var(--gold-light)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
            >
              <Award size={22} style={{ color: 'var(--gold)' }} />
            </div>
            <div>
              <div style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-2)', letterSpacing: '0.05em', fontWeight: 600 }}>
                Program Participated (Global for Batch)
              </div>
              {editingProgram ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                  <input
                    type="text"
                    value={tempProgramName}
                    onChange={(e) => setTempProgramName(e.target.value)}
                    className="form-input"
                    style={{ minWidth: '320px', padding: '0.35rem 0.65rem', fontSize: '0.95rem' }}
                  />
                  <button onClick={handleSaveProgramName} className="btn btn-primary" style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}>
                    Save
                  </button>
                  <button onClick={() => setEditingProgram(false)} className="btn btn-quiet" style={{ fontSize: '0.8rem' }}>
                    Cancel
                  </button>
                </div>
              ) : (
                <div style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--ink)', marginTop: '0.15rem' }}>
                  "{effectiveProgramName || 'Not Set'}"
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ textAlign: 'right', marginRight: '0.5rem' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-2)' }}>Confirmation Status</div>
              <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--gold)' }}>
                Printed on all {validRowCount} certificates
              </div>
            </div>
            {!editingProgram && (
              <button
                onClick={() => { setEditingProgram(true); setTempProgramName(effectiveProgramName); }}
                className="btn btn-secondary"
                style={{ fontSize: '0.78rem', padding: '0.35rem 0.65rem' }}
              >
                <Edit2 size={13} style={{ marginRight: '0.3rem' }} />
                Edit Program
              </button>
            )}
          </div>
        </div>

        {/* Validation Summary Stat Cards */}
        {validationSummary && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '1rem',
            marginBottom: '1.75rem'
          }}>
            <div className="card" style={{ padding: '1rem 1.25rem' }}>
              <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-2)', letterSpacing: '0.05em' }}>
                Imported Students
              </span>
              <div style={{ fontSize: '1.85rem', fontWeight: 700, color: 'var(--ink)' }}>
                {validationSummary.totalRows}
              </div>
            </div>

            <div className="card" style={{ padding: '1rem 1.25rem', borderLeft: '4px solid var(--success)' }}>
              <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--success)', letterSpacing: '0.05em', fontWeight: 600 }}>
                Certificates to Generate
              </span>
              <div style={{ fontSize: '1.85rem', fontWeight: 700, color: 'var(--success)' }}>
                {validationSummary.validRows}
              </div>
            </div>

            <div className="card" style={{ padding: '1rem 1.25rem' }}>
              <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-2)', letterSpacing: '0.05em' }}>
                Excluded / Removed
              </span>
              <div style={{ fontSize: '1.85rem', fontWeight: 700, color: 'var(--ink)' }}>
                {validationSummary.excludedRows.length}
              </div>
            </div>

            <div className="card" style={{ padding: '1rem 1.25rem', borderLeft: validationSummary.invalidRows > 0 ? '4px solid var(--error)' : '1px solid var(--border)' }}>
              <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: validationSummary.invalidRows > 0 ? 'var(--error)' : 'var(--text-2)', letterSpacing: '0.05em', fontWeight: 600 }}>
                Invalid Rows
              </span>
              <div style={{ fontSize: '1.85rem', fontWeight: 700, color: validationSummary.invalidRows > 0 ? 'var(--error)' : 'var(--ink)' }}>
                {validationSummary.invalidRows}
              </div>
            </div>
          </div>
        )}

        {/* Warning Alert if Missing Student Name Mapping */}
        {!hasStudentNameMapping && (
          <div className="badge badge-error" style={{ width: '100%', padding: '0.85rem 1rem', marginBottom: '1.5rem', fontSize: '0.875rem', textTransform: 'none' }}>
            <AlertTriangle size={16} style={{ marginRight: '0.5rem', flexShrink: 0 }} />
            <span>
              Required mapping missing: Please map the <strong>Student Name</strong> field below to proceed.
            </span>
          </div>
        )}

        {/* Warning Alert if Missing Program Name */}
        {!effectiveProgramName && (
          <div className="badge badge-error" style={{ width: '100%', padding: '0.85rem 1rem', marginBottom: '1.5rem', fontSize: '0.875rem', textTransform: 'none' }}>
            <AlertTriangle size={16} style={{ marginRight: '0.5rem', flexShrink: 0 }} />
            <span>
              Program Participated missing: Please enter the program name in the banner above before proceeding.
            </span>
          </div>
        )}

        {/* Column Mapping Section */}
        <div className="card" style={{ marginBottom: '1.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <Sliders size={18} style={{ color: 'var(--gold)' }} />
            <h2 style={{ fontSize: '1.25rem', margin: 0 }}>Column Assignments</h2>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-2)', marginBottom: '1.25rem' }}>
            Only <strong>Student Name</strong> is required from your spreadsheet. The program name is shared globally for this batch.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
            {mappings.map((mapping) => (
              <div key={mapping.fieldKey} className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{mapping.label}</span>
                  {mapping.fieldKey === StandardFieldKeys.STUDENT_NAME && (
                    <span style={{ color: 'var(--error)', fontSize: '0.75rem' }}>* Required</span>
                  )}
                  {mapping.fieldKey === StandardFieldKeys.PROGRAM_CATEGORY && (
                    <span style={{ color: 'var(--gold)', fontSize: '0.75rem' }}>Using Global Program</span>
                  )}
                </label>
                <select
                  className="form-select"
                  value={mapping.spreadsheetColumn || ''}
                  onChange={(e) => handleMappingChange(mapping.fieldKey, e.target.value)}
                  style={{
                    borderColor: mapping.fieldKey === StandardFieldKeys.STUDENT_NAME && !mapping.spreadsheetColumn ? 'var(--error)' : 'var(--border)'
                  }}
                >
                  <option value="">
                    {mapping.fieldKey === StandardFieldKeys.PROGRAM_CATEGORY
                      ? `— Global: "${effectiveProgramName || 'Program'}" —`
                      : '— Not Mapped —'}
                  </option>
                  {spreadsheet?.headers.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>

        {/* Primary Tabbed View: Editable Student List vs. Validation Issues */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <h2 style={{ fontSize: '1.25rem', margin: 0 }}>
                {activeTab === 'students' ? 'Editable Student Recipients List' : 'Validation Audit & Issues'}
              </h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-2)', margin: '0.2rem 0 0 0' }}>
                {activeTab === 'students'
                  ? 'Review and edit names before generation. You can edit typos or remove incorrect names with one click.'
                  : 'Source line numbers correspond exactly to your uploaded file.'}
              </p>
            </div>

            {/* Filter Tabs */}
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              <button
                onClick={() => setActiveTab('students')}
                className={`btn ${activeTab === 'students' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}
              >
                <Users size={13} style={{ marginRight: '0.25rem' }} />
                Student Recipients ({displayRows.length || validationSummary?.totalRows || 0})
              </button>
              <button
                onClick={() => setActiveTab('issues')}
                className={`btn ${activeTab === 'issues' ? 'btn-primary' : 'btn-secondary'}`}
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
                onClick={() => setActiveTab('excluded')}
                className={`btn ${activeTab === 'excluded' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}
              >
                Excluded ({excludedRows.length})
              </button>
            </div>
          </div>

          {/* Search Bar for Student Recipients */}
          {activeTab === 'students' && (
            <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-2)' }} />
                <input
                  type="text"
                  placeholder="Search students by name or row number..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="form-input"
                  style={{ width: '100%', paddingLeft: '32px', fontSize: '0.85rem' }}
                />
              </div>
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="btn btn-quiet" style={{ fontSize: '0.75rem' }}>
                  Clear
                </button>
              )}
            </div>
          )}

          {/* VIEW 1: Editable Student List */}
          {activeTab === 'students' && (
            <div className="table-container" style={{ maxHeight: '480px', overflowY: 'auto' }}>
              {loadingRows && (
                <div style={{ padding: '0.5rem', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-2)' }}>
                  Loading all rows from spreadsheet...
                </div>
              )}
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: '80px' }}>Row #</th>
                    <th>Student Name (Click to edit)</th>
                    <th>Program on Certificate</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudentRows.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-2)' }}>
                        No students match your search query.
                      </td>
                    </tr>
                  ) : (
                    filteredStudentRows.map(({ row, lineNum }) => {
                      const isExcluded = excludedRows.includes(lineNum);
                      const originalName = row[nameColumn] || row['student_name'] || row['name'] || Object.values(row)[0] || `Student #${lineNum}`;
                      const studentName = nameOverrides[lineNum] || originalName;
                      const isEditing = editingRowIndex === lineNum;

                      return (
                        <tr
                          key={lineNum}
                          style={{
                            backgroundColor: isExcluded ? 'var(--surface-alt)' : 'transparent',
                            opacity: isExcluded ? 0.6 : 1
                          }}
                        >
                          <td style={{ fontWeight: 600 }}>Line {lineNum}</td>
                          <td>
                            {isEditing ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                <input
                                  type="text"
                                  value={tempStudentName}
                                  onChange={(e) => setTempStudentName(e.target.value)}
                                  className="form-input"
                                  style={{ padding: '0.2rem 0.4rem', fontSize: '0.85rem', width: '220px' }}
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSaveStudentName(lineNum);
                                    if (e.key === 'Escape') handleCancelEditStudent();
                                  }}
                                />
                                <button
                                  type="button"
                                  onClick={() => handleSaveStudentName(lineNum)}
                                  className="btn btn-primary"
                                  style={{ padding: '0.2rem 0.4rem' }}
                                  title="Save Name"
                                >
                                  <Check size={13} />
                                </button>
                                <button
                                  type="button"
                                  onClick={handleCancelEditStudent}
                                  className="btn btn-quiet"
                                  style={{ padding: '0.2rem 0.4rem' }}
                                  title="Cancel"
                                >
                                  <X size={13} />
                                </button>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span style={{ fontWeight: isExcluded ? 400 : 600, textDecoration: isExcluded ? 'line-through' : 'none' }}>
                                  {studentName}
                                </span>
                                {nameOverrides[lineNum] && (
                                  <span className="badge badge-gold" style={{ fontSize: '0.65rem' }}>Edited</span>
                                )}
                                {!isExcluded && (
                                  <button
                                    type="button"
                                    onClick={() => handleStartEditStudent(lineNum, originalName)}
                                    className="btn btn-quiet"
                                    style={{ padding: '0.15rem 0.35rem', opacity: 0.6 }}
                                    title="Edit student name"
                                  >
                                    <Edit2 size={12} />
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                          <td style={{ color: 'var(--text-2)', fontSize: '0.85rem' }}>
                            {effectiveProgramName}
                          </td>
                          <td>
                            {isExcluded ? (
                              <span className="badge badge-quiet" style={{ fontSize: '0.7rem' }}>Excluded</span>
                            ) : (
                              <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>Will Generate</span>
                            )}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <button
                              type="button"
                              onClick={() => toggleExcludeRow(lineNum)}
                              className={`btn ${isExcluded ? 'btn-secondary' : 'btn-quiet'}`}
                              style={{
                                fontSize: '0.75rem',
                                padding: '0.25rem 0.55rem',
                                color: isExcluded ? 'var(--success)' : 'var(--error)'
                              }}
                            >
                              {isExcluded ? (
                                <>
                                  <UserCheck size={13} style={{ marginRight: '0.25rem' }} />
                                  Restore Student
                                </>
                              ) : (
                                <>
                                  <UserX size={13} style={{ marginRight: '0.25rem' }} />
                                  Remove Student
                                </>
                              )}
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* VIEW 2: Validation Audit Issues */}
          {activeTab !== 'students' && (
            filteredErrors.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--success)' }}>
                <CheckCircle size={28} style={{ margin: '0 auto 0.5rem auto' }} />
                <p style={{ fontWeight: 600 }}>No issues found in this category.</p>
              </div>
            ) : (
              <div className="table-container" style={{ maxHeight: '420px', overflowY: 'auto' }}>
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
                          <td style={{ fontWeight: 600 }}>{err.column}</td>
                          <td>{err.message}</td>
                          <td style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-2)' }}>
                            {err.value ? `"${err.value}"` : '—'}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <button
                              type="button"
                              onClick={() => toggleExcludeRow(err.rowIndex)}
                              className={`btn ${isRowExcluded ? 'btn-secondary' : 'btn-quiet'}`}
                              style={{
                                fontSize: '0.75rem',
                                padding: '0.25rem 0.55rem',
                                color: isRowExcluded ? 'var(--success)' : 'var(--error)'
                              }}
                            >
                              {isRowExcluded ? 'Restore' : 'Exclude'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>

        {/* Footer Actions */}
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
            disabled={!canProceed || isSubmitting}
            className="btn btn-primary"
            style={{ padding: '0.75rem 1.75rem', fontSize: '1rem' }}
          >
            <span>{isSubmitting ? 'Saving Batch...' : 'Proceed to Template Editor'}</span>
            <ArrowRight size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};
