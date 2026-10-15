import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { db } from '../src/db/database';
import { TemplateService } from '../src/services/templateService';
import { SpreadsheetService } from '../src/services/spreadsheetService';
import { BulkJobService } from '../src/services/bulkJobService';
import { ValidationService } from '../src/services/validationService';
import { Batch, OverlayField, StandardFieldKeys } from '@bulk-cert/shared';

import { config } from '../src/config';

const FIXTURES_DIR = path.resolve(__dirname, '../../../tests/fixtures');
const SAMPLE_PDF = path.join(FIXTURES_DIR, 'sample-certificate-template.pdf');
const SAMPLE_XLSX = path.join(FIXTURES_DIR, 'students-200-rows.xlsx');

test('Stage 3 Suite: Bulk Generation, Merged PDF, Streaming ZIP, and Fault-Tolerance', async (t) => {
  // Ensure admin user exists
  let user = db.prepare(`SELECT * FROM users WHERE login_name = 'joyalregi8@gmail.com'`).get() as any;
  if (!user) {
    user = { id: 'test_admin_user_stage3' };
    db.prepare(`
      INSERT INTO users (id, login_name, password_hash, must_change_password, created_at, updated_at)
      VALUES (?, 'joyalregi8@gmail.com', 'dummy_hash', 0, datetime('now'), datetime('now'))
    `).run(user.id);
  }

  // Copy template fixture to temp file and inspect
  const tempPdfPath = path.join(config.uploadDir, `test_stage3_template_${Date.now()}.pdf`);
  fs.copyFileSync(SAMPLE_PDF, tempPdfPath);
  const template = await TemplateService.inspectAndSaveTemplate(
    user.id,
    'sample-certificate-template.pdf',
    tempPdfPath
  );

  // Copy spreadsheet fixture to temp file and inspect
  const tempXlsxPath = path.join(config.uploadDir, `test_stage3_sheet_${Date.now()}.xlsx`);
  fs.copyFileSync(SAMPLE_XLSX, tempXlsxPath);
  const spreadsheet = SpreadsheetService.inspectAndSaveSpreadsheet(
    user.id,
    'students-200-rows.xlsx',
    tempXlsxPath
  );

  const mappings = ValidationService.suggestMappings(spreadsheet.headers);

  const overlayFields: OverlayField[] = [
    {
      id: 'field_name',
      key: StandardFieldKeys.STUDENT_NAME,
      label: 'Student Name',
      x: 100,
      y: 200,
      width: 641.89,
      height: 60,
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
    },
    {
      id: 'field_prog',
      key: StandardFieldKeys.PROGRAM_CATEGORY,
      label: 'Program / Category',
      x: 150,
      y: 300,
      width: 541.89,
      height: 40,
      fontFamily: 'Inter',
      fontSize: 18,
      fontWeight: 'normal',
      fontColorHex: '#54504A',
      align: 'center',
      verticalAnchor: 'top',
      wrap: true,
      lineSpacing: 1.2,
      letterSpacing: 0,
      autoShrink: true,
      minFontSize: 10
    }
  ];

  // Test 1: Full batch generation with 200 rows
  await t.test('1. Bulk batch generation processes all rows and produces valid ZIP and Merged PDF', async () => {
    const batchId = 'batch_bulk_test_' + Date.now();
    const batch: Batch = {
      id: batchId,
      userId: user.id,
      name: 'Annual Tech Fest 2026',
      templateId: template.id,
      spreadsheetId: spreadsheet.id,
      activeSheet: spreadsheet.activeSheet,
      selectedPage: 1,
      fieldMappings: mappings,
      overlayFields,
      excludedRows: [],
      status: 'draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString()
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

    const jobId = await BulkJobService.startBulkJob(batch, user.id);
    assert.ok(jobId, 'Job ID must be generated');

    // Wait for completion via events
    const events = BulkJobService.getJobEvents(batchId);
    assert.ok(events, 'Job event emitter must be active');

    const completionPromise = new Promise<any>((resolve) => {
      events!.on('done', (doneData) => resolve(doneData));
    });

    const doneData = await completionPromise;

    assert.equal(doneData.status, 'completed', 'Job must complete successfully');
    assert.equal(doneData.totalRows, 220, 'All 220 rows must be queued');
    assert.equal(doneData.processedRows, 220, 'All 220 rows must be processed');
    assert.equal(doneData.succeededRows, 220, 'All 220 rows must succeed');
    assert.equal(doneData.failedRows, 0, 'Zero failures expected for valid fixture');

    // Inspect job record in DB
    const jobRecord = BulkJobService.getJobByBatchId(batchId, user.id);
    assert.ok(jobRecord, 'Job record must be saved in database');
    assert.equal(jobRecord.status, 'completed');
    assert.equal(jobRecord.succeededRows, 220);

    // Verify ZIP archive artifact
    assert.ok(jobRecord.zipPath && fs.existsSync(jobRecord.zipPath), 'ZIP archive must exist on disk');
    const zipStats = fs.statSync(jobRecord.zipPath);
    assert.ok(zipStats.size > 50000, `ZIP size must be substantial (${zipStats.size} bytes)`);

    // Verify Combined PDF artifact
    assert.ok(jobRecord.combinedPdfPath && fs.existsSync(jobRecord.combinedPdfPath), 'Combined PDF must exist on disk');
    const combinedBytes = fs.readFileSync(jobRecord.combinedPdfPath);
    const combinedDoc = await PDFDocument.load(combinedBytes);
    assert.equal(combinedDoc.getPageCount(), 220, 'Combined PDF must contain exactly 220 merged pages');
  });

  // Test 2: Injected failure isolation - failed row does not abort the batch
  await t.test('2. Injected failure isolation: individual failure does not abort batch and records reason', async () => {
    // Create temporary CSV with 5 rows where row 4 injects an error
    const testCsvPath = path.join(config.uploadDir, `test_failure_inject_${Date.now()}.csv`);
    const csvData = [
      'Student Name,Program / Category,Date of Issue,__inject_error',
      'Row One Success,AI Track,2026-10-15,false',
      'Row Two Success,Design Track,2026-10-15,false',
      'Row Three Failing,Corrupt Track,2026-10-15,true',
      'Row Four Success,Music Track,2026-10-15,false',
      'Row Five Success,Art Track,2026-10-15,false'
    ].join('\n');
    fs.writeFileSync(testCsvPath, csvData, 'utf-8');

    const failSpreadsheet = SpreadsheetService.inspectAndSaveSpreadsheet(
      user.id,
      'test_failures.csv',
      testCsvPath
    );

    const failMappings = ValidationService.suggestMappings(failSpreadsheet.headers);

    const batchId = 'batch_failure_test_' + Date.now();
    const batch: Batch = {
      id: batchId,
      userId: user.id,
      name: 'Failure Isolation Test',
      templateId: template.id,
      spreadsheetId: failSpreadsheet.id,
      activeSheet: failSpreadsheet.activeSheet,
      selectedPage: 1,
      fieldMappings: failMappings,
      overlayFields,
      excludedRows: [],
      status: 'draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString()
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

    await BulkJobService.startBulkJob(batch, user.id);
    const events = BulkJobService.getJobEvents(batchId);

    const completionPromise = new Promise<any>((resolve) => {
      events!.on('done', (doneData) => resolve(doneData));
    });

    const doneData = await completionPromise;

    // 5 rows total: 4 succeed, 1 fails
    assert.equal(doneData.totalRows, 5, 'Must queue 5 rows');
    assert.equal(doneData.processedRows, 5, 'Must process all 5 rows');
    assert.equal(doneData.succeededRows, 4, '4 valid rows must succeed');
    assert.equal(doneData.failedRows, 1, '1 injected failure row must fail');
    assert.equal(doneData.hasFailuresCsv, true, 'Failures CSV must be produced');

    const jobRecord = BulkJobService.getJobByBatchId(batchId, user.id);
    assert.ok(jobRecord);
    assert.equal(jobRecord.rowResults.length, 5);

    const failedRow = jobRecord.rowResults.find((r) => r.status === 'failed');
    assert.ok(failedRow, 'Failed row must be recorded');
    assert.equal(failedRow.studentName, 'Row Three Failing');
    assert.ok(failedRow.errorMessage?.includes('Simulated processing fault'));

    // Verify failures CSV exists on disk and contains failure details
    const failuresCsvPath = path.join(config.jobsDir, `batch_${batchId}_failures.csv`);
    assert.ok(fs.existsSync(failuresCsvPath), 'Failures CSV file must exist on disk');
    const csvContent = fs.readFileSync(failuresCsvPath, 'utf-8');
    assert.ok(csvContent.includes('Row Three Failing'), 'Failures CSV must contain failing student name');
    assert.ok(csvContent.includes('Simulated processing fault'), 'Failures CSV must contain error reason');
  });

  // Test 3: Pause, Resume, and Cancel job controls
  await t.test('3. Pause, resume, and cancel state transitions', async () => {
    const batchId = 'batch_controls_test_' + Date.now();
    const batch: Batch = {
      id: batchId,
      userId: user.id,
      name: 'Controls Test',
      templateId: template.id,
      spreadsheetId: spreadsheet.id,
      activeSheet: spreadsheet.activeSheet,
      selectedPage: 1,
      fieldMappings: mappings,
      overlayFields,
      excludedRows: [],
      status: 'draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString()
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

    await BulkJobService.startBulkJob(batch, user.id);

    // Pause job
    const paused = BulkJobService.pauseJob(batchId, user.id);
    assert.equal(paused, true, 'Pause job must return true');

    // Resume job
    const resumed = BulkJobService.resumeJob(batchId, user.id);
    assert.equal(resumed, true, 'Resume job must return true');

    // Cancel job
    const cancelled = BulkJobService.cancelJob(batchId, user.id);
    assert.equal(cancelled, true, 'Cancel job must return true');

    const jobRecord = BulkJobService.getJobByBatchId(batchId, user.id);
    assert.ok(jobRecord);
    assert.equal(jobRecord.status, 'cancelled');
  });
});
