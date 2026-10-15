import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { useBatchStore } from '../store/batchStore';
import { Stepper } from '../components/Stepper';
import { OverlayField, StandardFieldKeys } from '@bulk-cert/shared';
import {
  ZoomIn,
  ZoomOut,
  Grid,
  Undo2,
  Redo2,
  AlignLeft,
  AlignCenter,
  AlignRight,
  ArrowRight,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Save,
  Plus,
  Trash2
} from 'lucide-react';

// Configure pdfjs worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const DEFAULT_FONTS = [
  'Playfair Display',
  'Cormorant Garamond',
  'EB Garamond',
  'Inter',
  'Helvetica',
  'Times New Roman',
  'Great Vibes',
  'Courier'
];

export const TemplateEditor: React.FC = () => {
  const {
    currentBatch,
    template,
    spreadsheet,
    programName,
    mappings,
    overlayFields,
    nameOverrides,
    setOverlayFields,
    setSelectedPage,
    createOrUpdateBatch,
    saveTemplatePreset,
    loadTemplatePreset
  } = useBatchStore();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const [zoom, setZoom] = useState<number>(1.0); // 1.0 = 100%
  const [scale, setScale] = useState<number>(1.0); // pixels per PDF point
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [showGrid, setShowGrid] = useState<boolean>(false);
  const [currentRowIndex, setCurrentRowIndex] = useState<number>(2); // 1-indexed spreadsheet line (data row 1 is line 2)
  const [history, setHistory] = useState<OverlayField[][]>([]);
  const [historyIdx, setHistoryIdx] = useState<number>(-1);
  const [draggingFieldId, setDraggingFieldId] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number; fieldX: number; fieldY: number } | null>(null);
  const [resizing, setResizing] = useState<{ handle: string; initialW: number; initialH: number; initialX: number; initialY: number; mouseX: number; mouseY: number } | null>(null);
  const [presetSavedNotice, setPresetSavedNotice] = useState(false);
  const [isSavingPreset, setIsSavingPreset] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialize overlay fields if none exist
  useEffect(() => {
    if (!template) return;
    const pWidth = template.pageSizePoints.width || 842;
    const pHeight = template.pageSizePoints.height || 595;

    if (overlayFields.length === 0) {
      if (template.overlayFields && template.overlayFields.length > 0) {
        setOverlayFields(template.overlayFields);
        setSelectedFieldId(template.overlayFields[0]?.id || null);
        setHistory([template.overlayFields]);
        setHistoryIdx(0);
        return;
      }

      const initialFields: OverlayField[] = [];

      // 1. Guaranteed Student Name Field
      const nameY = Math.round(pHeight * 0.42);
      initialFields.push({
        id: `field_${StandardFieldKeys.STUDENT_NAME}_${Date.now()}`,
        key: StandardFieldKeys.STUDENT_NAME,
        label: 'Student Name',
        x: Math.round((pWidth - 500) / 2),
        y: nameY,
        width: 500,
        height: 55,
        fontFamily: 'Playfair Display',
        fontSize: 32,
        fontWeight: 'bold',
        fontColorHex: '#141414',
        align: 'center',
        verticalAnchor: 'middle',
        wrap: false,
        lineSpacing: 1.2,
        letterSpacing: 0,
        autoShrink: true,
        minFontSize: 14
      });

      // 2. Guaranteed Program Participated Field
      const programY = Math.round(pHeight * 0.56);
      initialFields.push({
        id: `field_${StandardFieldKeys.PROGRAM_CATEGORY}_${Date.now() + 1}`,
        key: StandardFieldKeys.PROGRAM_CATEGORY,
        label: 'Program Participated',
        x: Math.round((pWidth - 460) / 2),
        y: programY,
        width: 460,
        height: 45,
        fontFamily: 'Inter',
        fontSize: 20,
        fontWeight: 'normal',
        fontColorHex: '#54504A',
        align: 'center',
        verticalAnchor: 'middle',
        wrap: true,
        lineSpacing: 1.2,
        letterSpacing: 0,
        autoShrink: true,
        minFontSize: 10
      });

      // 3. Other mapped fields (e.g. Institution, Date, Position)
      const otherMapped = mappings.filter(
        (m) =>
          m.spreadsheetColumn &&
          m.fieldKey !== StandardFieldKeys.STUDENT_NAME &&
          m.fieldKey !== StandardFieldKeys.PROGRAM_CATEGORY
      );

      otherMapped.forEach((m, idx) => {
        initialFields.push({
          id: `field_${m.fieldKey}_${Date.now() + 2 + idx}`,
          key: m.fieldKey,
          label: m.label,
          x: Math.round((pWidth - 400) / 2),
          y: Math.round(pHeight * 0.72 + idx * 45),
          width: 400,
          height: 35,
          fontFamily: 'Inter',
          fontSize: 15,
          fontWeight: 'normal',
          fontColorHex: '#666666',
          align: 'center',
          verticalAnchor: 'middle',
          wrap: false,
          lineSpacing: 1.2,
          letterSpacing: 0,
          autoShrink: true,
          minFontSize: 9
        });
      });

      setOverlayFields(initialFields);
      setSelectedFieldId(initialFields[0]?.id || null);
      setHistory([initialFields]);
      setHistoryIdx(0);
    } else if (!selectedFieldId && overlayFields.length > 0) {
      setSelectedFieldId(overlayFields[0].id);
    }
  }, [template, mappings]);

  // Load and render PDF using pdf.js
  useEffect(() => {
    if (!template?.id) return;
    let isCancelled = false;

    const renderPdf = async () => {
      try {
        const loadingTask = pdfjsLib.getDocument({
          url: `/api/templates/${template.id}/file`,
          withCredentials: true
        });
        const doc = await loadingTask.promise;
        const pageToRender = Math.max(1, Math.min(currentBatch?.selectedPage || 1, doc.numPages));
        const page = await doc.getPage(pageToRender);
        if (isCancelled) return;

        const viewport = page.getViewport({ scale: zoom });
        const canvas = canvasRef.current;
        if (!canvas) return;

        const context = canvas.getContext('2d');
        if (!context) return;

        canvas.width = viewport.width;
        canvas.height = viewport.height;
        setScale(viewport.width / (template.pageSizePoints.width || 842));

        const renderContext = {
          canvasContext: context,
          viewport: viewport
        };
        await page.render(renderContext).promise;
      } catch (err) {
        console.error('Failed to render PDF in editor', err);
      }
    };

    renderPdf();

    return () => {
      isCancelled = true;
    };
  }, [template?.id, zoom, currentBatch?.selectedPage]);

  // Update history for undo/redo
  const pushHistory = (newFields: OverlayField[]) => {
    const updated = history.slice(0, historyIdx + 1);
    updated.push(newFields);
    setHistory(updated);
    setHistoryIdx(updated.length - 1);
    setOverlayFields(newFields);
  };

  const handleUndo = () => {
    if (historyIdx > 0) {
      setHistoryIdx(historyIdx - 1);
      setOverlayFields(history[historyIdx - 1]);
    }
  };

  const handleRedo = () => {
    if (historyIdx < history.length - 1) {
      setHistoryIdx(historyIdx + 1);
      setOverlayFields(history[historyIdx + 1]);
    }
  };

  // Keyboard nudging: arrows = 1pt, Shift+arrows = 10pt
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!selectedFieldId) return;
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        return;
      }

      const step = e.shiftKey ? 10 : 1;
      let dx = 0;
      let dy = 0;

      if (e.key === 'ArrowLeft') dx = -step;
      else if (e.key === 'ArrowRight') dx = step;
      else if (e.key === 'ArrowUp') dy = -step;
      else if (e.key === 'ArrowDown') dy = step;
      else return;

      e.preventDefault();
      const updated = overlayFields.map((f) => {
        if (f.id === selectedFieldId) {
          return {
            ...f,
            x: Math.max(0, Math.round(f.x + dx)),
            y: Math.max(0, Math.round(f.y + dy))
          };
        }
        return f;
      });
      pushHistory(updated);
    },
    [selectedFieldId, overlayFields, history, historyIdx]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Active selected field
  const selectedField = overlayFields.find((f) => f.id === selectedFieldId) || overlayFields[0];

  const updateSelectedField = (updates: Partial<OverlayField>) => {
    if (!selectedField) return;
    const updated = overlayFields.map((f) => (f.id === selectedField.id ? { ...f, ...updates } : f));
    pushHistory(updated);
  };

  const handleAddField = () => {
    if (!template) return;
    const pWidth = template.pageSizePoints.width || 842;
    const pHeight = template.pageSizePoints.height || 595;

    const newField: OverlayField = {
      id: `field_custom_${Date.now()}`,
      key: `CUSTOM_${Date.now()}`,
      label: 'Custom Field',
      x: Math.round((pWidth - 300) / 2),
      y: Math.round(pHeight * 0.7),
      width: 300,
      height: 35,
      fontFamily: 'Inter',
      fontSize: 16,
      fontWeight: 'normal',
      fontColorHex: '#141414',
      align: 'center',
      verticalAnchor: 'middle',
      wrap: false,
      lineSpacing: 1.2,
      letterSpacing: 0,
      autoShrink: true,
      minFontSize: 10
    };

    const updated = [...overlayFields, newField];
    pushHistory(updated);
    setSelectedFieldId(newField.id);
  };

  const handleDeleteField = (fieldId: string) => {
    const field = overlayFields.find((f) => f.id === fieldId);
    if (!field) return;

    if (field.key === StandardFieldKeys.STUDENT_NAME) {
      alert('Student Name field is required on all certificates and cannot be removed.');
      return;
    }
    if (field.key === StandardFieldKeys.PROGRAM_CATEGORY) {
      alert('Program Participated field is required and cannot be removed.');
      return;
    }

    const updated = overlayFields.filter((f) => f.id !== fieldId);
    pushHistory(updated);
    setSelectedFieldId(updated[0]?.id || null);
  };

  // Mouse & Touch drag handling
  const handleStartDrag = (clientX: number, clientY: number, fieldId: string) => {
    setSelectedFieldId(fieldId);
    const field = overlayFields.find((f) => f.id === fieldId);
    if (!field) return;

    setDraggingFieldId(fieldId);
    setDragStart({
      x: clientX,
      y: clientY,
      fieldX: field.x,
      fieldY: field.y
    });
  };

  const handleMouseDown = (e: React.MouseEvent, fieldId: string) => {
    e.stopPropagation();
    handleStartDrag(e.clientX, e.clientY, fieldId);
  };

  const handleTouchStart = (e: React.TouchEvent, fieldId: string) => {
    e.stopPropagation();
    if (e.touches[0]) {
      handleStartDrag(e.touches[0].clientX, e.touches[0].clientY, fieldId);
    }
  };

  const handleStartResize = (clientX: number, clientY: number, handle: string, field: OverlayField) => {
    setResizing({
      handle,
      initialW: field.width,
      initialH: field.height,
      initialX: field.x,
      initialY: field.y,
      mouseX: clientX,
      mouseY: clientY
    });
  };

  const handleResizeStart = (e: React.MouseEvent, handle: string, field: OverlayField) => {
    e.stopPropagation();
    handleStartResize(e.clientX, e.clientY, handle, field);
  };

  const handleResizeTouchStart = (e: React.TouchEvent, handle: string, field: OverlayField) => {
    e.stopPropagation();
    if (e.touches[0]) {
      handleStartResize(e.touches[0].clientX, e.touches[0].clientY, handle, field);
    }
  };

  const processMove = (clientX: number, clientY: number) => {
    if (draggingFieldId && dragStart) {
      const deltaX = (clientX - dragStart.x) / scale;
      const deltaY = (clientY - dragStart.y) / scale;

      const updated = overlayFields.map((f) => {
        if (f.id === draggingFieldId) {
          return {
            ...f,
            x: Math.max(0, Math.round(dragStart.fieldX + deltaX)),
            y: Math.max(0, Math.round(dragStart.fieldY + deltaY))
          };
        }
        return f;
      });
      setOverlayFields(updated);
    } else if (resizing && selectedField) {
      const deltaX = (clientX - resizing.mouseX) / scale;
      const deltaY = (clientY - resizing.mouseY) / scale;
      let newW = resizing.initialW;
      let newH = resizing.initialH;
      let newX = resizing.initialX;
      let newY = resizing.initialY;

      if (resizing.handle.includes('e')) newW = Math.max(40, Math.round(resizing.initialW + deltaX));
      if (resizing.handle.includes('s')) newH = Math.max(20, Math.round(resizing.initialH + deltaY));
      if (resizing.handle.includes('w')) {
        const potentialW = Math.max(40, Math.round(resizing.initialW - deltaX));
        newX = resizing.initialX + (resizing.initialW - potentialW);
        newW = potentialW;
      }
      if (resizing.handle.includes('n')) {
        const potentialH = Math.max(20, Math.round(resizing.initialH - deltaY));
        newY = resizing.initialY + (resizing.initialH - potentialH);
        newH = potentialH;
      }

      const updated = overlayFields.map((f) => (f.id === selectedField.id ? { ...f, width: newW, height: newH, x: newX, y: newY } : f));
      setOverlayFields(updated);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    processMove(e.clientX, e.clientY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (draggingFieldId || resizing) {
      if (e.touches[0]) {
        processMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    }
  };

  const handleMouseUp = () => {
    if (draggingFieldId || resizing) {
      setDraggingFieldId(null);
      setDragStart(null);
      setResizing(null);
      pushHistory(overlayFields);
    }
  };

  const handleTouchEnd = () => {
    handleMouseUp();
  };

  // Sample data row preview resolution
  const previewRows = spreadsheet?.previewRows || [];
  const activeRowData = previewRows[(currentRowIndex - 2) % (previewRows.length || 1)] || {};

  const getSampleTextForField = (field: OverlayField): string => {
    const isProgram =
      field.key === StandardFieldKeys.PROGRAM_CATEGORY ||
      field.key?.toLowerCase().includes('program') ||
      field.label?.toLowerCase().includes('program');

    if (isProgram) {
      return programName || currentBatch?.programName || 'Annual Arts Festival 2026';
    }

    const isName =
      field.key === StandardFieldKeys.STUDENT_NAME ||
      field.key?.toLowerCase().includes('name') ||
      field.label?.toLowerCase().includes('name');

    if (isName && nameOverrides[currentRowIndex]) {
      return nameOverrides[currentRowIndex];
    }

    const mapping = mappings.find((m) => m.fieldKey === field.key);
    if (mapping?.spreadsheetColumn && activeRowData[mapping.spreadsheetColumn]) {
      return activeRowData[mapping.spreadsheetColumn];
    }
    return `[${field.label}]`;
  };

  // Save current preset to template on server
  const handleSavePreset = async () => {
    if (!template?.id) return;
    setIsSavingPreset(true);
    try {
      await saveTemplatePreset(template.id, overlayFields, currentBatch?.selectedPage || 1);
      setPresetSavedNotice(true);
      setTimeout(() => setPresetSavedNotice(false), 3500);
    } catch (err: any) {
      alert(err.message || 'Failed to save preset to server.');
    } finally {
      setIsSavingPreset(false);
    }
  };

  const handleLoadPreset = async () => {
    if (!template?.id) return;
    try {
      const loaded = await loadTemplatePreset(template.id);
      if (loaded && loaded.length > 0) {
        pushHistory(loaded);
      } else {
        alert('No preset saved on the server for this template.');
      }
    } catch (err: any) {
      alert(err.message || 'Failed to load preset.');
    }
  };

  const handleProceedToPreview = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      if (currentBatch?.id) {
        await createOrUpdateBatch(currentBatch.name);
      }
      navigate('/preview');
    } catch (err: any) {
      alert(err.message || 'Failed to save batch fields.');
      setIsSubmitting(false);
    }
  };

  return (
    <div
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}
    >
      <Stepper currentStep={3} />

      {/* Editor Control Toolbar */}
      <div style={{
        backgroundColor: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        padding: '0.65rem 1.5rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '1rem'
      }}>
        {/* Left: Zoom, Undo, Redo, Grid, Multi-Page */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => navigate('/mapping')}
            className="btn btn-secondary"
            style={{ fontSize: '0.78rem', padding: '0.35rem 0.65rem' }}
          >
            <ArrowLeft size={14} />
            <span>Mapping</span>
          </button>

          <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
            <button
              onClick={() => setZoom((z) => Math.max(0.5, Math.round((z - 0.15) * 100) / 100))}
              className="btn btn-quiet"
              style={{ padding: '0.35rem 0.5rem' }}
              title="Zoom Out"
            >
              <ZoomOut size={16} />
            </button>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, padding: '0 0.5rem', minWidth: '48px', textAlign: 'center' }}>
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => setZoom((z) => Math.min(2.0, Math.round((z + 0.15) * 100) / 100))}
              className="btn btn-quiet"
              style={{ padding: '0.35rem 0.5rem' }}
              title="Zoom In"
            >
              <ZoomIn size={16} />
            </button>
          </div>

          <button
            onClick={() => setZoom(1.0)}
            className="btn btn-secondary"
            style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}
          >
            Fit 100%
          </button>

          <button
            onClick={() => setShowGrid(!showGrid)}
            className={`btn ${showGrid ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}
            title="Toggle alignment grid"
          >
            <Grid size={14} />
            <span>Grid</span>
          </button>

          <div style={{ display: 'flex', gap: '0.25rem', borderLeft: '1px solid var(--border)', paddingLeft: '0.75rem' }}>
            <button
              onClick={handleUndo}
              disabled={historyIdx <= 0}
              className="btn btn-quiet"
              style={{ padding: '0.35rem 0.5rem' }}
              title="Undo (Ctrl+Z)"
            >
              <Undo2 size={16} />
            </button>
            <button
              onClick={handleRedo}
              disabled={historyIdx >= history.length - 1}
              className="btn btn-quiet"
              style={{ padding: '0.35rem 0.5rem' }}
              title="Redo (Ctrl+Y)"
            >
              <Redo2 size={16} />
            </button>
          </div>

          {/* Multi-page Navigation if template has > 1 page */}
          {(template?.pageCount || 1) > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', borderLeft: '1px solid var(--border)', paddingLeft: '0.75rem' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-2)' }}>Page:</span>
              <button
                onClick={() => {
                  const newP = Math.max(1, (currentBatch?.selectedPage || 1) - 1);
                  setSelectedPage(newP);
                }}
                disabled={(currentBatch?.selectedPage || 1) <= 1}
                className="btn btn-secondary"
                style={{ padding: '0.2rem 0.4rem' }}
              >
                <ChevronLeft size={14} />
              </button>
              <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                {currentBatch?.selectedPage || 1} / {template?.pageCount}
              </span>
              <button
                onClick={() => {
                  const newP = Math.min(template?.pageCount || 1, (currentBatch?.selectedPage || 1) + 1);
                  setSelectedPage(newP);
                }}
                disabled={(currentBatch?.selectedPage || 1) >= (template?.pageCount || 1)}
                className="btn btn-secondary"
                style={{ padding: '0.2rem 0.4rem' }}
              >
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>

        {/* Center: Row Selector for Real-Time Testing */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-2)' }}>Sample Row:</span>
          <button
            onClick={() => setCurrentRowIndex((r) => Math.max(2, r - 1))}
            className="btn btn-secondary"
            style={{ padding: '0.25rem 0.4rem' }}
            title="Previous Row"
          >
            <ChevronLeft size={15} />
          </button>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, minWidth: '60px', textAlign: 'center' }}>
            Row {currentRowIndex}
          </span>
          <button
            onClick={() => setCurrentRowIndex((r) => r + 1)}
            className="btn btn-secondary"
            style={{ padding: '0.25rem 0.4rem' }}
            title="Next Row"
          >
            <ChevronRight size={15} />
          </button>

          <button
            onClick={() => setCurrentRowIndex(111)}
            className="btn btn-quiet"
            style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', color: 'var(--gold)' }}
          >
            <Sparkles size={13} style={{ marginRight: '0.25rem' }} />
            Test Longest Name
          </button>
        </div>

        {/* Right: Presets & Proceed */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            onClick={handleSavePreset}
            disabled={isSavingPreset}
            className="btn btn-secondary"
            style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}
            title="Save these text positions and styling as the default template preset"
          >
            <Save size={13} />
            <span>{isSavingPreset ? 'Saving Preset...' : 'Save Preset to Template'}</span>
          </button>
          <button
            onClick={handleLoadPreset}
            disabled={isSavingPreset}
            className="btn btn-quiet"
            style={{ fontSize: '0.75rem', padding: '0.35rem 0.5rem' }}
            title="Restore saved preset coordinates for this template"
          >
            Load Saved Preset
          </button>
          {presetSavedNotice && (
            <span style={{ fontSize: '0.75rem', color: 'var(--success)', fontWeight: 600 }}>✓ Preset Saved!</span>
          )}

          <button
            onClick={handleProceedToPreview}
            disabled={isSubmitting}
            className="btn btn-primary"
            style={{ padding: '0.45rem 1rem', fontSize: '0.85rem' }}
          >
            <span>{isSubmitting ? 'Saving...' : 'Preview Sample'}</span>
            <ArrowRight size={15} />
          </button>
        </div>
      </div>

      {/* Main Workspace (Editor Canvas on Left + Properties on Right, stacked on mobile) */}
      <div className="template-editor-workspace" style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <style>{`
          @media (max-width: 900px) {
            .template-editor-workspace {
              flex-direction: column !important;
              overflow-y: auto !important;
            }
            .template-editor-sidebar {
              width: 100% !important;
              border-left: none !important;
              border-top: 1px solid var(--border) !important;
            }
            .template-editor-toolbar {
              flex-wrap: wrap !important;
              height: auto !important;
              padding: 0.75rem 1rem !important;
              gap: 0.75rem !important;
            }
          }
        `}</style>
        {/* Left: Canvas Viewport */}
        <div
          ref={containerRef}
          style={{
            flex: 1,
            backgroundColor: '#EAE3D6',
            overflow: 'auto',
            padding: '2.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative'
          }}
        >
          {/* Certificate Page Artboard */}
          <div
            style={{
              position: 'relative',
              boxShadow: '0 8px 30px rgba(0, 0, 0, 0.15)',
              backgroundColor: '#fff',
              lineHeight: 0,
              userSelect: 'none'
            }}
          >
            {/* The True PDF Render Canvas */}
            <canvas ref={canvasRef} style={{ display: 'block' }} />

            {/* Subtle Alignment Grid */}
            {showGrid && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  backgroundImage: `linear-gradient(to right, rgba(179, 138, 74, 0.15) 1px, transparent 1px),
                                    linear-gradient(to bottom, rgba(179, 138, 74, 0.15) 1px, transparent 1px)`,
                  backgroundSize: `${20 * scale}px ${20 * scale}px`,
                  pointerEvents: 'none'
                }}
              />
            )}

            {/* Draggable & Resizable Overlay Boxes */}
            {overlayFields.map((field) => {
              const isSelected = field.id === selectedFieldId;
              const sampleText = getSampleTextForField(field);

              // Calculate screen coordinates from points
              const leftPx = field.x * scale;
              const topPx = field.y * scale;
              const widthPx = field.width * scale;
              const heightPx = field.height * scale;

              return (
                <div
                  key={field.id}
                  onMouseDown={(e) => handleMouseDown(e, field.id)}
                  onTouchStart={(e) => handleTouchStart(e, field.id)}
                  style={{
                    position: 'absolute',
                    left: leftPx,
                    top: topPx,
                    width: widthPx,
                    height: heightPx,
                    border: isSelected ? '2px solid var(--gold)' : '1px dashed rgba(20, 20, 20, 0.35)',
                    backgroundColor: isSelected ? 'rgba(179, 138, 74, 0.1)' : 'rgba(255, 255, 255, 0.05)',
                    cursor: draggingFieldId === field.id ? 'grabbing' : 'grab',
                    touchAction: 'none',
                    display: 'flex',
                    alignItems:
                      field.verticalAnchor === 'middle'
                        ? 'center'
                        : field.verticalAnchor === 'bottom'
                        ? 'flex-end'
                        : 'flex-start',
                    justifyContent:
                      field.align === 'center'
                        ? 'center'
                        : field.align === 'right'
                        ? 'flex-end'
                        : 'flex-start',
                    padding: '2px 4px',
                    boxSizing: 'border-box',
                    overflow: 'hidden',
                    lineHeight: 1.2
                  }}
                >
                  {/* Field Label Badge on selection */}
                  {isSelected && (
                    <div
                      style={{
                        position: 'absolute',
                        top: -22,
                        left: 0,
                        backgroundColor: 'var(--ink)',
                        color: 'var(--gold)',
                        fontSize: '0.68rem',
                        fontWeight: 600,
                        padding: '1px 6px',
                        borderRadius: '3px',
                        whiteSpace: 'nowrap',
                        pointerEvents: 'none',
                        zIndex: 10
                      }}
                    >
                      {field.label} ({field.width} × {field.height} pt)
                    </div>
                  )}

                  {/* Sample Text Rendered in True Point Scale */}
                  <div
                    style={{
                      fontFamily: field.fontFamily,
                      fontSize: `${field.fontSize * scale}px`,
                      fontWeight: field.fontWeight === 'bold' ? 700 : 400,
                      fontStyle: field.fontWeight === 'italic' ? 'italic' : 'normal',
                      color: field.fontColorHex,
                      textAlign: field.align,
                      whiteSpace: field.wrap ? 'normal' : 'nowrap',
                      width: '100%',
                      pointerEvents: 'none',
                      userSelect: 'none'
                    }}
                  >
                    {sampleText}
                  </div>

                  {/* Resize Handles (Only for selected field) */}
                  {isSelected && (
                    <>
                      <div
                        onMouseDown={(e) => handleResizeStart(e, 'se', field)}
                        onTouchStart={(e) => handleResizeTouchStart(e, 'se', field)}
                        style={{
                          position: 'absolute',
                          right: -6,
                          bottom: -6,
                          width: 14,
                          height: 14,
                          backgroundColor: 'var(--gold)',
                          border: '2px solid #fff',
                          borderRadius: '2px',
                          cursor: 'se-resize',
                          touchAction: 'none'
                        }}
                      />
                      <div
                        onMouseDown={(e) => handleResizeStart(e, 'e', field)}
                        onTouchStart={(e) => handleResizeTouchStart(e, 'e', field)}
                        style={{
                          position: 'absolute',
                          right: -6,
                          top: '50%',
                          transform: 'translateY(-50%)',
                          width: 14,
                          height: 14,
                          backgroundColor: 'var(--gold)',
                          border: '2px solid #fff',
                          borderRadius: '2px',
                          cursor: 'e-resize',
                          touchAction: 'none'
                        }}
                      />
                      <div
                        onMouseDown={(e) => handleResizeStart(e, 's', field)}
                        onTouchStart={(e) => handleResizeTouchStart(e, 's', field)}
                        style={{
                          position: 'absolute',
                          bottom: -6,
                          left: '50%',
                          transform: 'translateX(-50%)',
                          width: 14,
                          height: 14,
                          backgroundColor: 'var(--gold)',
                          border: '2px solid #fff',
                          borderRadius: '2px',
                          cursor: 's-resize',
                          touchAction: 'none'
                        }}
                      />
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Properties Inspector Panel */}
        <aside
          className="template-editor-sidebar"
          style={{
            width: '320px',
            backgroundColor: 'var(--surface)',
            borderLeft: '1px solid var(--border)',
            padding: '1.25rem',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem'
          }}
        >
          <div>
            <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--gold)', letterSpacing: '0.08em', fontWeight: 600 }}>
              Visual Layout Editor
            </span>
            <h3 style={{ fontSize: '1.2rem', marginTop: '0.2rem', marginBottom: '0.5rem' }}>
              Field Positioning
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-2)', margin: 0 }}>
              Select a field below to position the text separately on this template.
            </p>
          </div>

          {/* Quick Field Selection Pills */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
              <label className="form-label" style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-2)', margin: 0 }}>
                Active Field
              </label>
              <button
                type="button"
                onClick={handleAddField}
                className="btn btn-quiet"
                style={{ fontSize: '0.72rem', padding: '0.15rem 0.4rem', color: 'var(--gold)' }}
              >
                <Plus size={12} style={{ marginRight: '0.2rem' }} /> Add Field
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {overlayFields.map((f) => {
                const isSelected = selectedField?.id === f.id;
                const isPrimary = f.key === StandardFieldKeys.STUDENT_NAME || f.key === StandardFieldKeys.PROGRAM_CATEGORY;

                return (
                  <button
                    key={f.id}
                    onClick={() => setSelectedFieldId(f.id)}
                    className={`btn ${isSelected ? 'btn-primary' : 'btn-secondary'}`}
                    style={{
                      fontSize: '0.8rem',
                      padding: '0.4rem 0.65rem',
                      justifyContent: 'space-between',
                      textAlign: 'left',
                      borderColor: isSelected ? 'var(--gold)' : undefined
                    }}
                  >
                    <span style={{ fontWeight: isSelected ? 700 : 500 }}>
                      {f.label}
                      {isPrimary && <span style={{ color: isSelected ? '#fff' : 'var(--gold)', marginLeft: '4px' }}>*</span>}
                    </span>
                    <span style={{ fontSize: '0.7rem', opacity: 0.8 }}>
                      ({f.x}, {f.y}) pt
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {selectedField ? (
            <>
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{selectedField.label} Settings</span>
                  {selectedField.key !== StandardFieldKeys.STUDENT_NAME &&
                   selectedField.key !== StandardFieldKeys.PROGRAM_CATEGORY && (
                    <button
                      type="button"
                      onClick={() => handleDeleteField(selectedField.id)}
                      className="btn btn-quiet"
                      style={{ padding: '0.2rem 0.4rem', color: 'var(--error)' }}
                      title="Delete Field"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>

                {/* Typography Controls */}
                <div style={{ marginBottom: '0.75rem' }}>
                  <label className="form-label">Font Family</label>
                  <select
                    className="form-select"
                    style={{ width: '100%', marginTop: '0.25rem' }}
                    value={selectedField.fontFamily}
                    onChange={(e) => updateSelectedField({ fontFamily: e.target.value })}
                  >
                    {DEFAULT_FONTS.map((font) => (
                      <option key={font} value={font}>
                        {font}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Font Size & Weight */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <div>
                    <label className="form-label">Size (pt)</label>
                    <input
                      type="number"
                      min={8}
                      max={120}
                      className="form-input"
                      style={{ width: '100%', marginTop: '0.25rem' }}
                      value={selectedField.fontSize}
                      onChange={(e) => updateSelectedField({ fontSize: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <label className="form-label">Style / Weight</label>
                    <select
                      className="form-select"
                      style={{ width: '100%', marginTop: '0.25rem' }}
                      value={selectedField.fontWeight}
                      onChange={(e) => updateSelectedField({ fontWeight: e.target.value as any })}
                    >
                      <option value="normal">Regular</option>
                      <option value="bold">Bold</option>
                      <option value="italic">Italic</option>
                    </select>
                  </div>
                </div>

                {/* Text Color */}
                <div style={{ marginBottom: '0.75rem' }}>
                  <label className="form-label">Color</label>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.25rem' }}>
                    <input
                      type="color"
                      value={selectedField.fontColorHex}
                      onChange={(e) => updateSelectedField({ fontColorHex: e.target.value })}
                      style={{
                        width: '36px',
                        height: '36px',
                        padding: 0,
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)',
                        cursor: 'pointer'
                      }}
                    />
                    <input
                      type="text"
                      value={selectedField.fontColorHex}
                      onChange={(e) => updateSelectedField({ fontColorHex: e.target.value })}
                      className="form-input"
                      style={{ flex: 1, fontFamily: 'monospace' }}
                    />
                  </div>
                </div>

                {/* Alignment */}
                <div style={{ marginBottom: '0.75rem' }}>
                  <label className="form-label">Horizontal Alignment</label>
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                    <button
                      onClick={() => updateSelectedField({ align: 'left' })}
                      className={`btn ${selectedField.align === 'left' ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ flex: 1, padding: '0.4rem' }}
                      title="Align Left"
                    >
                      <AlignLeft size={16} />
                    </button>
                    <button
                      onClick={() => updateSelectedField({ align: 'center' })}
                      className={`btn ${selectedField.align === 'center' ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ flex: 1, padding: '0.4rem' }}
                      title="Align Center"
                    >
                      <AlignCenter size={16} />
                    </button>
                    <button
                      onClick={() => updateSelectedField({ align: 'right' })}
                      className={`btn ${selectedField.align === 'right' ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ flex: 1, padding: '0.4rem' }}
                      title="Align Right"
                    >
                      <AlignRight size={16} />
                    </button>
                  </div>
                </div>

                {/* Vertical Anchor */}
                <div style={{ marginBottom: '0.75rem' }}>
                  <label className="form-label">Vertical Anchor</label>
                  <select
                    className="form-select"
                    style={{ width: '100%', marginTop: '0.25rem' }}
                    value={selectedField.verticalAnchor}
                    onChange={(e) => updateSelectedField({ verticalAnchor: e.target.value as any })}
                  >
                    <option value="top">Top</option>
                    <option value="middle">Middle (Center)</option>
                    <option value="bottom">Bottom</option>
                  </select>
                </div>

                {/* Coordinates in PDF Points */}
                <div style={{ marginBottom: '0.75rem' }}>
                  <label className="form-label">Position & Dimensions (PDF Points)</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem', marginTop: '0.25rem' }}>
                    <div>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-2)' }}>X (from left):</span>
                      <input
                        type="number"
                        value={selectedField.x}
                        onChange={(e) => updateSelectedField({ x: Number(e.target.value) })}
                        className="form-input"
                        style={{ width: '100%' }}
                      />
                    </div>
                    <div>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-2)' }}>Y (from top):</span>
                      <input
                        type="number"
                        value={selectedField.y}
                        onChange={(e) => updateSelectedField({ y: Number(e.target.value) })}
                        className="form-input"
                        style={{ width: '100%' }}
                      />
                    </div>
                    <div>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-2)' }}>Width:</span>
                      <input
                        type="number"
                        value={selectedField.width}
                        onChange={(e) => updateSelectedField({ width: Number(e.target.value) })}
                        className="form-input"
                        style={{ width: '100%' }}
                      />
                    </div>
                    <div>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-2)' }}>Height:</span>
                      <input
                        type="number"
                        value={selectedField.height}
                        onChange={(e) => updateSelectedField({ height: Number(e.target.value) })}
                        className="form-input"
                        style={{ width: '100%' }}
                      />
                    </div>
                  </div>
                </div>

                {/* Auto-Shrink & Wrapping */}
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <label htmlFor="autoShrink" className="form-label" style={{ margin: 0, fontSize: '0.825rem' }}>
                      Auto-Shrink to Fit
                    </label>
                    <input
                      id="autoShrink"
                      type="checkbox"
                      checked={selectedField.autoShrink}
                      onChange={(e) => updateSelectedField({ autoShrink: e.target.checked })}
                    />
                  </div>

                  {selectedField.autoShrink && (
                    <div style={{ marginBottom: '0.5rem' }}>
                      <label className="form-label" style={{ fontSize: '0.75rem' }}>Minimum Font Size (pt)</label>
                      <input
                        type="number"
                        min={6}
                        max={selectedField.fontSize}
                        className="form-input"
                        style={{ width: '100%', marginTop: '0.2rem' }}
                        value={selectedField.minFontSize}
                        onChange={(e) => updateSelectedField({ minFontSize: Number(e.target.value) })}
                      />
                    </div>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <label htmlFor="wrapToggle" className="form-label" style={{ margin: 0, fontSize: '0.825rem' }}>
                      Enable Word Wrapping
                    </label>
                    <input
                      id="wrapToggle"
                      type="checkbox"
                      checked={selectedField.wrap}
                      onChange={(e) => updateSelectedField({ wrap: e.target.checked })}
                    />
                  </div>
                </div>

                {/* Keyboard tip */}
                <div style={{ marginTop: '0.75rem', fontSize: '0.72rem', color: 'var(--text-2)', backgroundColor: 'var(--surface-alt)', padding: '0.5rem', borderRadius: 'var(--radius-sm)' }}>
                  💡 <strong>Tip:</strong> Drag box directly on canvas or use arrow keys (Shift+arrows for 10pt) to nudge.
                </div>
              </div>
            </>
          ) : (
            <p style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>
              Click on an overlay box on the certificate to inspect its styling.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
};
