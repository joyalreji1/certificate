import fs from 'node:fs';
import path from 'node:path';
import archiver from 'archiver';
import { PDFDocument } from 'pdf-lib';
import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';
import { db } from '../db/database';
import { config } from '../config';
import { TemplateService } from './templateService';
import { SpreadsheetService } from './spreadsheetService';
import { PdfGenerationService } from './pdfGenerationService';
import { Batch, FieldMapping, OverlayField, StandardFieldKeys } from '@bulk-cert/shared';

export interface RowExecutionResult {
  rowIndex: number; // 1-indexed spreadsheet line number
  studentName: string;
  status: 'success' | 'failed';
  warnings: string[];
  errorMessage?: string;
  pdfFileName?: string;
}

export interface ActiveJobControl {
  jobId: string;
  batchId: string;
  userId: string;
  isPaused: boolean;
  isCancelled: boolean;
  events: EventEmitter;
}

export class BulkJobService {
  private static activeJobs = new Map<string, ActiveJobControl>();

  /**
   * Get or register the EventEmitter for an active or queued job
   */
  static getJobEvents(batchId: string): EventEmitter | null {
    const active = this.activeJobs.get(batchId);
    return active ? active.events : null;
  }

  /**
   * Retrieves the latest job record from SQLite for a batch
   */
  static getJobByBatchId(batchId: string, userId: string) {
    const row = db.prepare(`
      SELECT * FROM jobs WHERE batch_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1
    `).get(batchId, userId) as any;

    if (!row) return null;

    return {
      id: row.id,
      batchId: row.batch_id,
      userId: row.user_id,
      status: row.status,
      totalRows: row.total_rows,
      processedRows: row.processed_rows,
      succeededRows: row.succeeded_rows,
      failedRows: row.failed_rows,
      currentRow: row.current_row,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      elapsedSeconds: row.elapsed_seconds,
      estimatedRemainingSeconds: row.estimated_remaining_seconds,
      combinedPdfPath: row.combined_pdf_path,
      zipPath: row.zip_path,
      rowResults: JSON.parse(row.row_results || '[]') as RowExecutionResult[],
      createdAt: row.created_at
    };
  }

  /**
   * Pause an in-progress job
   */
  static pauseJob(batchId: string, userId: string): boolean {
    const active = this.activeJobs.get(batchId);
    if (!active || active.userId !== userId) return false;

    active.isPaused = true;
    db.prepare(`UPDATE jobs SET status = 'paused' WHERE id = ?`).run(active.jobId);
    active.events.emit('status', { status: 'paused' });
    return true;
  }

  /**
   * Resume a paused job
   */
  static resumeJob(batchId: string, userId: string): boolean {
    const active = this.activeJobs.get(batchId);
    if (!active || active.userId !== userId) return false;

    active.isPaused = false;
    db.prepare(`UPDATE jobs SET status = 'processing' WHERE id = ?`).run(active.jobId);
    active.events.emit('status', { status: 'processing' });
    return true;
  }

  /**
   * Cancel an in-progress or paused job
   */
  static cancelJob(batchId: string, userId: string): boolean {
    const active = this.activeJobs.get(batchId);
    if (!active || active.userId !== userId) return false;

    active.isCancelled = true;
    db.prepare(`UPDATE jobs SET status = 'cancelled' WHERE id = ?`).run(active.jobId);
    active.events.emit('status', { status: 'cancelled' });
    return true;
  }

  /**
   * Starts bulk certificate generation for a given batch
   */
  static async startBulkJob(batch: Batch, userId: string): Promise<string> {
    // If a job is currently active for this batch, return existing job id
    const existingActive = this.activeJobs.get(batch.id);
    if (existingActive && !existingActive.isCancelled) {
      return existingActive.jobId;
    }

    const template = TemplateService.getTemplate(batch.templateId, userId);
    if (!template) {
      throw new Error('Template file not found.');
    }

    const spreadsheet = SpreadsheetService.getSpreadsheet(batch.spreadsheetId, userId);
    if (!spreadsheet) {
      throw new Error('Spreadsheet file not found.');
    }

    const { rows } = SpreadsheetService.getAllRows(spreadsheet, batch.activeSheet || spreadsheet.activeSheet);
    const excludedSet = new Set(batch.excludedRows || []);

    // Filter list of rows to process: rows with 1-indexed sheet line number (header = 1, data starts at 2)
    interface WorkRow {
      spreadsheetLine: number;
      data: Record<string, string>;
    }

    const workQueue: WorkRow[] = [];
    rows.forEach((r, idx) => {
      const lineNum = idx + 2;
      if (!excludedSet.has(lineNum)) {
        workQueue.push({
          spreadsheetLine: lineNum,
          data: r
        });
      }
    });

    if (workQueue.length === 0) {
      throw new Error('No valid rows found to process in spreadsheet.');
    }

    const jobId = crypto.randomUUID();
    const nowIso = new Date().toISOString();

    db.prepare(`
      INSERT INTO jobs (
        id, batch_id, user_id, status, total_rows, processed_rows,
        succeeded_rows, failed_rows, current_row, started_at, created_at, row_results
      ) VALUES (?, ?, ?, 'processing', ?, 0, 0, 0, 0, ?, ?, '[]')
    `).run(
      jobId,
      batch.id,
      userId,
      workQueue.length,
      nowIso,
      nowIso
    );

    db.prepare(`UPDATE batches SET status = 'generating', updated_at = ? WHERE id = ?`).run(nowIso, batch.id);

    const control: ActiveJobControl = {
      jobId,
      batchId: batch.id,
      userId,
      isPaused: false,
      isCancelled: false,
      events: new EventEmitter()
    };

    this.activeJobs.set(batch.id, control);

    // Launch background execution asynchronously
    setImmediate(() => {
      this.executeJob(control, batch, template.filePath, workQueue).catch((err) => {
        console.error(`[Job Error] Batch ${batch.id} execution failed:`, err);
      });
    });

    return jobId;
  }

  /**
   * Internal runner that generates all certificates, aggregates merged PDF, and builds ZIP archive
   */
  private static async executeJob(
    control: ActiveJobControl,
    batch: Batch,
    templateFilePath: string,
    workQueue: { spreadsheetLine: number; data: Record<string, string> }[]
  ): Promise<void> {
    const totalRows = workQueue.length;
    let processedRows = 0;
    let succeededRows = 0;
    let failedRows = 0;
    const rowResults: RowExecutionResult[] = [];
    const startTime = Date.now();

    const zipFilePath = path.join(config.jobsDir, `batch_${batch.id}.zip`);
    const combinedPdfPath = path.join(config.jobsDir, `batch_${batch.id}_combined.pdf`);
    const failuresCsvPath = path.join(config.jobsDir, `batch_${batch.id}_failures.csv`);

    // Prepare streaming ZIP archive
    const zipOutputStream = fs.createWriteStream(zipFilePath);
    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.pipe(zipOutputStream);

    // Prepare master combined PDF document
    const combinedDoc = await PDFDocument.create();

    // Student Name field key helper
    const nameMapping = batch.fieldMappings.find((m) => m.fieldKey === StandardFieldKeys.STUDENT_NAME);
    const nameCol = nameMapping?.spreadsheetColumn || 'Student Name';

    // Bounded concurrency worker pool (concurrency = 4)
    const CONCURRENCY = 4;
    let queueIndex = 0;

    const sanitizeFilename = (name: string, line: number) => {
      const clean = name.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50);
      return `Cert_${clean || 'Student'}_line${line}.pdf`;
    };

    // Helper to process one row safely
    const processRow = async (item: { spreadsheetLine: number; data: Record<string, string> }) => {
      const rawName = item.data[nameCol] || item.data['student_name'] || item.data['name'] || `Student_${item.spreadsheetLine}`;
      const studentName = rawName.trim();

      try {
        const genResult = await PdfGenerationService.generateSingleCertificate({
          templateFilePath,
          selectedPage: batch.selectedPage || 1,
          rowData: item.data,
          fieldMappings: batch.fieldMappings,
          overlayFields: batch.overlayFields
        });

        // 1. Append to ZIP archive
        const pdfFileName = sanitizeFilename(studentName, item.spreadsheetLine);
        archive.append(Buffer.from(genResult.pdfBytes), { name: pdfFileName });

        // 2. Append page to combined master PDF
        const singleDoc = await PDFDocument.load(genResult.pdfBytes);
        const [copiedPage] = await combinedDoc.copyPages(singleDoc, [0]);
        combinedDoc.addPage(copiedPage);

        succeededRows++;
        const rowRes: RowExecutionResult = {
          rowIndex: item.spreadsheetLine,
          studentName,
          status: 'success',
          warnings: genResult.warnings,
          pdfFileName
        };
        rowResults.push(rowRes);
      } catch (rowErr: any) {
        failedRows++;
        const rowRes: RowExecutionResult = {
          rowIndex: item.spreadsheetLine,
          studentName,
          status: 'failed',
          warnings: [],
          errorMessage: rowErr.message || 'Personalized certificate generation failed for row.'
        };
        rowResults.push(rowRes);
      } finally {
        processedRows++;
      }
    };

    // Worker pool loop
    const worker = async () => {
      while (queueIndex < totalRows) {
        if (control.isCancelled) break;

        // Handle pause
        while (control.isPaused && !control.isCancelled) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
        if (control.isCancelled) break;

        const currentItem = workQueue[queueIndex++];
        if (!currentItem) break;

        await processRow(currentItem);

        // Calculate metrics
        const elapsedSec = (Date.now() - startTime) / 1000;
        const certsPerSec = processedRows / Math.max(0.1, elapsedSec);
        const remainingSec = certsPerSec > 0 ? (totalRows - processedRows) / certsPerSec : 0;
        const percent = Math.round((processedRows / totalRows) * 100);

        // Update database periodically (every 5 rows or on last)
        if (processedRows % 5 === 0 || processedRows === totalRows) {
          db.prepare(`
            UPDATE jobs
            SET processed_rows = ?, succeeded_rows = ?, failed_rows = ?,
                current_row = ?, elapsed_seconds = ?, estimated_remaining_seconds = ?
            WHERE id = ?
          `).run(
            processedRows,
            succeededRows,
            failedRows,
            currentItem.spreadsheetLine,
            elapsedSec,
            remainingSec,
            control.jobId
          );
        }

        // Emit real-time progress event
        control.events.emit('progress', {
          jobId: control.jobId,
          batchId: control.batchId,
          totalRows,
          processedRows,
          succeededRows,
          failedRows,
          currentRow: currentItem.spreadsheetLine,
          percent,
          elapsedSeconds: Math.round(elapsedSec * 10) / 10,
          estimatedRemainingSeconds: Math.round(remainingSec * 10) / 10,
          throughputCertsPerSec: Math.round(certsPerSec * 10) / 10,
          latestResult: rowResults[rowResults.length - 1]
        });
      }
    };

    // Spawn concurrent workers
    const workers = Array.from({ length: Math.min(CONCURRENCY, totalRows) }, () => worker());
    await Promise.all(workers);

    // Finalize ZIP archive
    await archive.finalize();
    await new Promise<void>((resolve, reject) => {
      zipOutputStream.on('close', () => resolve());
      zipOutputStream.on('error', (err) => reject(err));
    });

    // Save combined master PDF if any row succeeded
    let finalCombinedPath: string | null = null;
    if (succeededRows > 0) {
      const combinedBytes = await combinedDoc.save();
      fs.writeFileSync(combinedPdfPath, combinedBytes);
      finalCombinedPath = combinedPdfPath;
    }

    // Generate failures CSV report if any row failed
    const failedList = rowResults.filter((r) => r.status === 'failed');
    if (failedList.length > 0) {
      let csvContent = 'Row Number,Student Name,Reason for Failure\n';
      failedList.forEach((f) => {
        const safeName = `"${(f.studentName || '').replace(/"/g, '""')}"`;
        const safeReason = `"${(f.errorMessage || 'Unknown error').replace(/"/g, '""')}"`;
        csvContent += `${f.rowIndex},${safeName},${safeReason}\n`;
      });
      fs.writeFileSync(failuresCsvPath, csvContent, 'utf-8');
    }

    const finalStatus = control.isCancelled ? 'cancelled' : succeededRows > 0 ? 'completed' : 'failed';
    const completedAt = new Date().toISOString();
    const finalElapsed = (Date.now() - startTime) / 1000;

    db.prepare(`
      UPDATE jobs
      SET status = ?, processed_rows = ?, succeeded_rows = ?, failed_rows = ?,
          completed_at = ?, elapsed_seconds = ?, estimated_remaining_seconds = 0,
          combined_pdf_path = ?, zip_path = ?, row_results = ?
      WHERE id = ?
    `).run(
      finalStatus,
      processedRows,
      succeededRows,
      failedRows,
      completedAt,
      finalElapsed,
      finalCombinedPath,
      zipFilePath,
      JSON.stringify(rowResults),
      control.jobId
    );

    db.prepare(`
      UPDATE batches
      SET status = ?, updated_at = ?
      WHERE id = ?
    `).run(finalStatus, completedAt, batch.id);

    // Emit final completion event
    control.events.emit('done', {
      jobId: control.jobId,
      batchId: batch.id,
      status: finalStatus,
      totalRows,
      processedRows,
      succeededRows,
      failedRows,
      elapsedSeconds: Math.round(finalElapsed * 10) / 10,
      hasZip: true,
      hasCombinedPdf: succeededRows > 0,
      hasFailuresCsv: failedList.length > 0
    });

    this.activeJobs.delete(batch.id);
  }
}
