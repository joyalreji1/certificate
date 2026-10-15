import { Router, Request, Response } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../db/database';
import { authMiddleware } from '../middleware/auth';
import { SpreadsheetService } from '../services/spreadsheetService';
import { ValidationService } from '../services/validationService';
import { TemplateService } from '../services/templateService';
import { PdfGenerationService } from '../services/pdfGenerationService';
import { BulkJobService } from '../services/bulkJobService';
import { config } from '../config';
import { Batch, FieldMapping, OverlayField } from '@bulk-cert/shared';

export const batchRouter = Router();

// 24 hours retention expiry
const DEFAULT_RETENTION_MS = 24 * 60 * 60 * 1000;

batchRouter.get('/', authMiddleware, (req: Request, res: Response) => {
  const rows = db.prepare(`
    SELECT * FROM batches WHERE user_id = ? ORDER BY created_at DESC LIMIT 20
  `).all(req.user!.id) as any[];

  const batches = rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    name: r.name,
    templateId: r.template_id,
    spreadsheetId: r.spreadsheet_id,
    activeSheet: r.active_sheet,
    selectedPage: r.selected_page || 1,
    fieldMappings: JSON.parse(r.field_mappings || '[]'),
    overlayFields: JSON.parse(r.overlay_fields || '[]'),
    excludedRows: JSON.parse(r.excluded_rows || '[]'),
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    expiresAt: r.expires_at
  }));

  res.json({ batches });
});

batchRouter.post('/', authMiddleware, (req: Request, res: Response) => {
  const { name, templateId, spreadsheetId, activeSheet, selectedPage, fieldMappings, overlayFields, excludedRows } = req.body || {};

  if (!name || typeof name !== 'string') {
    res.status(400).json({ error: 'Batch name is required.' });
    return;
  }

  const id = crypto.randomUUID();
  const now = new Date();
  const nowIso = now.toISOString();
  const expiresAt = new Date(now.getTime() + DEFAULT_RETENTION_MS).toISOString();

  const batch: Batch = {
    id,
    userId: req.user!.id,
    name: name.trim(),
    templateId: templateId || '',
    spreadsheetId: spreadsheetId || '',
    activeSheet: activeSheet || '',
    selectedPage: selectedPage || 1,
    fieldMappings: fieldMappings || [],
    overlayFields: overlayFields || [],
    excludedRows: excludedRows || [],
    status: 'draft',
    createdAt: nowIso,
    updatedAt: nowIso,
    expiresAt
  };

  db.prepare(`
    INSERT INTO batches (
      id, user_id, name, template_id, spreadsheet_id, active_sheet,
      selected_page, field_mappings, overlay_fields, excluded_rows,
      status, created_at, updated_at, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    batch.id,
    batch.userId,
    batch.name,
    batch.templateId,
    batch.spreadsheetId,
    batch.activeSheet,
    batch.selectedPage,
    JSON.stringify(batch.fieldMappings),
    JSON.stringify(batch.overlayFields),
    JSON.stringify(batch.excludedRows),
    batch.status,
    batch.createdAt,
    batch.updatedAt,
    batch.expiresAt
  );

  res.status(201).json({ batch });
});

batchRouter.get('/:id', authMiddleware, (req: Request, res: Response) => {
  const batchId = req.params.id as string;
  const row = db.prepare(`
    SELECT * FROM batches WHERE id = ? AND user_id = ?
  `).get(batchId, req.user!.id) as any;

  if (!row) {
    res.status(404).json({ error: 'Batch not found.' });
    return;
  }

  const batch: Batch = {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    templateId: row.template_id,
    spreadsheetId: row.spreadsheet_id,
    activeSheet: row.active_sheet,
    selectedPage: row.selected_page || 1,
    fieldMappings: JSON.parse(row.field_mappings || '[]'),
    overlayFields: JSON.parse(row.overlay_fields || '[]'),
    excludedRows: JSON.parse(row.excluded_rows || '[]'),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at
  };

  res.json({ batch });
});

batchRouter.put('/:id', authMiddleware, (req: Request, res: Response) => {
  const batchId = req.params.id as string;
  const existing = db.prepare('SELECT id FROM batches WHERE id = ? AND user_id = ?').get(batchId, req.user!.id);
  if (!existing) {
    res.status(404).json({ error: 'Batch not found.' });
    return;
  }

  const { name, templateId, spreadsheetId, activeSheet, selectedPage, fieldMappings, overlayFields, excludedRows, status } = req.body || {};
  const nowIso = new Date().toISOString();

  db.prepare(`
    UPDATE batches
    SET name = COALESCE(?, name),
        template_id = COALESCE(?, template_id),
        spreadsheet_id = COALESCE(?, spreadsheet_id),
        active_sheet = COALESCE(?, active_sheet),
        selected_page = COALESCE(?, selected_page),
        field_mappings = COALESCE(?, field_mappings),
        overlay_fields = COALESCE(?, overlay_fields),
        excluded_rows = COALESCE(?, excluded_rows),
        status = COALESCE(?, status),
        updated_at = ?
    WHERE id = ? AND user_id = ?
  `).run(
    name,
    templateId,
    spreadsheetId,
    activeSheet,
    selectedPage,
    fieldMappings ? JSON.stringify(fieldMappings) : null,
    overlayFields ? JSON.stringify(overlayFields) : null,
    excludedRows ? JSON.stringify(excludedRows) : null,
    status,
    nowIso,
    batchId,
    req.user!.id
  );

  const updated = db.prepare('SELECT * FROM batches WHERE id = ?').get(batchId) as any;
  const batch: Batch = {
    id: updated.id,
    userId: updated.user_id,
    name: updated.name,
    templateId: updated.template_id,
    spreadsheetId: updated.spreadsheet_id,
    activeSheet: updated.active_sheet,
    selectedPage: updated.selected_page || 1,
    fieldMappings: JSON.parse(updated.field_mappings || '[]'),
    overlayFields: JSON.parse(updated.overlay_fields || '[]'),
    excludedRows: JSON.parse(updated.excluded_rows || '[]'),
    status: updated.status,
    createdAt: updated.created_at,
    updatedAt: updated.updated_at,
    expiresAt: updated.expires_at
  };

  res.json({ batch });
});

batchRouter.post('/:id/validate', authMiddleware, (req: Request, res: Response) => {
  const batchId = req.params.id as string;
  const batchRow = db.prepare('SELECT * FROM batches WHERE id = ? AND user_id = ?').get(batchId, req.user!.id) as any;
  if (!batchRow) {
    res.status(404).json({ error: 'Batch not found.' });
    return;
  }

  const { fieldMappings, excludedRows } = req.body as {
    fieldMappings?: FieldMapping[];
    excludedRows?: number[];
  };

  const spreadsheet = SpreadsheetService.getSpreadsheet(batchRow.spreadsheet_id, req.user!.id);
  if (!spreadsheet) {
    res.status(400).json({ error: 'Spreadsheet associated with this batch not found.' });
    return;
  }

  let mappingsToUse = fieldMappings || JSON.parse(batchRow.field_mappings || '[]');
  if (!mappingsToUse || mappingsToUse.length === 0) {
    mappingsToUse = ValidationService.suggestMappings(spreadsheet.headers);
  }
  const excludedToUse = excludedRows || JSON.parse(batchRow.excluded_rows || '[]');

  const { rows } = SpreadsheetService.getAllRows(spreadsheet, batchRow.active_sheet || spreadsheet.activeSheet);
  const validationSummary = ValidationService.validateRows(rows, mappingsToUse, excludedToUse);

  // Update batch mappings and excluded rows
  db.prepare(`
    UPDATE batches
    SET field_mappings = ?, excluded_rows = ?, updated_at = ?
    WHERE id = ?
  `).run(JSON.stringify(mappingsToUse), JSON.stringify(excludedToUse), new Date().toISOString(), batchId);

  res.json({ validationSummary });
});

batchRouter.delete('/:id', authMiddleware, (req: Request, res: Response) => {
  const batchId = req.params.id as string;
  const batch = db.prepare('SELECT * FROM batches WHERE id = ? AND user_id = ?').get(batchId, req.user!.id) as any;
  if (!batch) {
    res.status(404).json({ error: 'Batch not found.' });
    return;
  }

  // Delete batch record (associated jobs cascade)
  db.prepare('DELETE FROM batches WHERE id = ?').run(batchId);

  res.json({ success: true, message: 'Batch and associated resources removed.' });
});

batchRouter.post('/:id/sample-preview', authMiddleware, async (req: Request, res: Response) => {
  const batchId = req.params.id as string;
  const batchRow = db.prepare('SELECT * FROM batches WHERE id = ? AND user_id = ?').get(batchId, req.user!.id) as any;
  if (!batchRow) {
    res.status(404).json({ error: 'Batch not found.' });
    return;
  }

  const template = TemplateService.getTemplate(batchRow.template_id, req.user!.id);
  if (!template) {
    res.status(400).json({ error: 'Template associated with this batch was not found.' });
    return;
  }

  const spreadsheet = SpreadsheetService.getSpreadsheet(batchRow.spreadsheet_id, req.user!.id);
  if (!spreadsheet) {
    res.status(400).json({ error: 'Spreadsheet associated with this batch was not found.' });
    return;
  }

  const { rowIndex = 2, overlayFields, fieldMappings } = req.body || {};
  const fieldsToUse: OverlayField[] = overlayFields || JSON.parse(batchRow.overlay_fields || '[]');
  const mappingsToUse: FieldMapping[] = fieldMappings || JSON.parse(batchRow.field_mappings || '[]');

  const { rows } = SpreadsheetService.getAllRows(spreadsheet, batchRow.active_sheet || spreadsheet.activeSheet);
  // Default to first valid row or specific rowIndex (1-indexed source row, data begins at row 2)
  const targetDataIndex = Math.max(0, Math.min(rowIndex - 2, rows.length - 1));
  const rowData = rows[targetDataIndex] || {};

  try {
    const result = await PdfGenerationService.generateSingleCertificate({
      templateFilePath: template.filePath,
      selectedPage: batchRow.selected_page || 1,
      rowData,
      fieldMappings: mappingsToUse,
      overlayFields: fieldsToUse
    });

    // Save sample to disk
    const sampleFilePath = path.join(config.jobsDir, `sample_${batchId}.pdf`);
    fs.writeFileSync(sampleFilePath, result.pdfBytes);

    // Save current overlay fields to batch
    db.prepare(`
      UPDATE batches
      SET overlay_fields = ?, updated_at = ?
      WHERE id = ?
    `).run(JSON.stringify(fieldsToUse), new Date().toISOString(), batchId);

    res.json({
      sampleUrl: `/api/batches/${batchId}/sample-pdf?t=${Date.now()}`,
      warnings: result.warnings,
      fileSize: result.fileSize,
      pageCount: result.pageCount,
      appliedFieldsCount: result.appliedFieldsCount,
      selectedRow: rowIndex
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to generate sample certificate.' });
  }
});

batchRouter.get('/:id/sample-pdf', authMiddleware, (req: Request, res: Response) => {
  const batchId = req.params.id as string;
  const sampleFilePath = path.join(config.jobsDir, `sample_${batchId}.pdf`);

  if (!fs.existsSync(sampleFilePath)) {
    res.status(404).json({ error: 'Sample certificate has not been generated yet.' });
    return;
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="sample-certificate.pdf"');
  fs.createReadStream(sampleFilePath).pipe(res);
});

// STAGE 3: Bulk Job Execution Routes

// Start bulk job
batchRouter.post('/:id/start-job', authMiddleware, async (req: Request, res: Response) => {
  const batchId = req.params.id as string;
  const batchRow = db.prepare('SELECT * FROM batches WHERE id = ? AND user_id = ?').get(batchId, req.user!.id) as any;
  if (!batchRow) {
    res.status(404).json({ error: 'Batch not found.' });
    return;
  }

  const batch: Batch = {
    id: batchRow.id,
    userId: batchRow.user_id,
    name: batchRow.name,
    templateId: batchRow.template_id,
    spreadsheetId: batchRow.spreadsheet_id,
    activeSheet: batchRow.active_sheet,
    selectedPage: batchRow.selected_page || 1,
    fieldMappings: JSON.parse(batchRow.field_mappings || '[]'),
    overlayFields: JSON.parse(batchRow.overlay_fields || '[]'),
    excludedRows: JSON.parse(batchRow.excluded_rows || '[]'),
    status: batchRow.status,
    createdAt: batchRow.created_at,
    updatedAt: batchRow.updated_at,
    expiresAt: batchRow.expires_at
  };

  try {
    const jobId = await BulkJobService.startBulkJob(batch, req.user!.id);
    res.json({ jobId, batchId, status: 'processing' });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to start bulk job.' });
  }
});

// Get current job status
batchRouter.get('/:id/job', authMiddleware, (req: Request, res: Response) => {
  const batchId = req.params.id as string;
  const job = BulkJobService.getJobByBatchId(batchId, req.user!.id);
  if (!job) {
    res.status(404).json({ error: 'No job found for this batch.' });
    return;
  }
  res.json({ job });
});

// Real-time SSE progress stream
batchRouter.get('/:id/events', authMiddleware, (req: Request, res: Response) => {
  const batchId = req.params.id as string;
  const batchRow = db.prepare('SELECT id FROM batches WHERE id = ? AND user_id = ?').get(batchId, req.user!.id);
  if (!batchRow) {
    res.status(404).json({ error: 'Batch not found.' });
    return;
  }

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Send current state immediately
  const existingJob = BulkJobService.getJobByBatchId(batchId, req.user!.id);
  if (existingJob) {
    res.write(`event: initial\ndata: ${JSON.stringify(existingJob)}\n\n`);
  }

  const events = BulkJobService.getJobEvents(batchId);

  const onProgress = (data: any) => {
    res.write(`event: progress\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const onStatus = (data: any) => {
    res.write(`event: status\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const onDone = (data: any) => {
    res.write(`event: done\ndata: ${JSON.stringify(data)}\n\n`);
  };

  if (events) {
    events.on('progress', onProgress);
    events.on('status', onStatus);
    events.on('done', onDone);
  }

  req.on('close', () => {
    if (events) {
      events.off('progress', onProgress);
      events.off('status', onStatus);
      events.off('done', onDone);
    }
  });
});

// Pause job
batchRouter.post('/:id/pause', authMiddleware, (req: Request, res: Response) => {
  const batchId = req.params.id as string;
  const success = BulkJobService.pauseJob(batchId, req.user!.id);
  if (!success) {
    res.status(400).json({ error: 'Job cannot be paused or is not active.' });
    return;
  }
  res.json({ success: true, status: 'paused' });
});

// Resume job
batchRouter.post('/:id/resume', authMiddleware, (req: Request, res: Response) => {
  const batchId = req.params.id as string;
  const success = BulkJobService.resumeJob(batchId, req.user!.id);
  if (!success) {
    res.status(400).json({ error: 'Job cannot be resumed or is not active.' });
    return;
  }
  res.json({ success: true, status: 'processing' });
});

// Cancel job
batchRouter.post('/:id/cancel', authMiddleware, (req: Request, res: Response) => {
  const batchId = req.params.id as string;
  const success = BulkJobService.cancelJob(batchId, req.user!.id);
  if (!success) {
    res.status(400).json({ error: 'Job cannot be cancelled or is not active.' });
    return;
  }
  res.json({ success: true, status: 'cancelled' });
});

// Download ZIP archive
batchRouter.get('/:id/download/zip', authMiddleware, (req: Request, res: Response) => {
  const batchId = req.params.id as string;
  const batchRow = db.prepare('SELECT name FROM batches WHERE id = ? AND user_id = ?').get(batchId, req.user!.id) as any;
  if (!batchRow) {
    res.status(404).json({ error: 'Batch not found.' });
    return;
  }

  const zipPath = path.join(config.jobsDir, `batch_${batchId}.zip`);
  if (!fs.existsSync(zipPath)) {
    res.status(404).json({ error: 'ZIP archive not found or generation not finished.' });
    return;
  }

  const safeBatchName = batchRow.name.replace(/[^a-zA-Z0-9_-]/g, '_');
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="certificates_${safeBatchName}.zip"`);
  fs.createReadStream(zipPath).pipe(res);
});

// Download combined PDF
batchRouter.get('/:id/download/combined-pdf', authMiddleware, (req: Request, res: Response) => {
  const batchId = req.params.id as string;
  const batchRow = db.prepare('SELECT name FROM batches WHERE id = ? AND user_id = ?').get(batchId, req.user!.id) as any;
  if (!batchRow) {
    res.status(404).json({ error: 'Batch not found.' });
    return;
  }

  const pdfPath = path.join(config.jobsDir, `batch_${batchId}_combined.pdf`);
  if (!fs.existsSync(pdfPath)) {
    res.status(404).json({ error: 'Combined PDF not found or generation had no successful rows.' });
    return;
  }

  const safeBatchName = batchRow.name.replace(/[^a-zA-Z0-9_-]/g, '_');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="combined_certificates_${safeBatchName}.pdf"`);
  fs.createReadStream(pdfPath).pipe(res);
});

// Download failures CSV
batchRouter.get('/:id/download/failures-csv', authMiddleware, (req: Request, res: Response) => {
  const batchId = req.params.id as string;
  const batchRow = db.prepare('SELECT name FROM batches WHERE id = ? AND user_id = ?').get(batchId, req.user!.id) as any;
  if (!batchRow) {
    res.status(404).json({ error: 'Batch not found.' });
    return;
  }

  const csvPath = path.join(config.jobsDir, `batch_${batchId}_failures.csv`);
  if (!fs.existsSync(csvPath)) {
    res.status(404).json({ error: 'No failures recorded for this batch.' });
    return;
  }

  const safeBatchName = batchRow.name.replace(/[^a-zA-Z0-9_-]/g, '_');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="failures_${safeBatchName}.csv"`);
  fs.createReadStream(csvPath).pipe(res);
});
