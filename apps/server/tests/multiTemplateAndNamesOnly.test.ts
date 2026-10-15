import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { db } from '../src/db/database';
import { seedAdminUser } from '../src/db/seed';
import { TemplateService } from '../src/services/templateService';
import { SpreadsheetService } from '../src/services/spreadsheetService';
import { ValidationService } from '../src/services/validationService';
import { BulkJobService } from '../src/services/bulkJobService';
import { GoogleDriveService, encryptToken, decryptToken } from '../src/services/googleDriveService';
import { config } from '../src/config';
import { app } from '../src/index';
import { Batch, FieldPosition, OverlayField } from '@bulk-cert/shared';

const FIXTURES_DIR = path.resolve(__dirname, '../../../tests/fixtures');
const LANDSCAPE_PDF = path.join(FIXTURES_DIR, 'sample-certificate-template.pdf');
const PORTRAIT_PDF = path.join(FIXTURES_DIR, 'modern-portrait-template.pdf');
const NAMES_ONLY_CSV = path.join(FIXTURES_DIR, 'students-names-only.csv');

test('Multi-Template & Names-Only Workflow Suite', async (t) => {
  seedAdminUser();
  const admin = db.prepare('SELECT id FROM users WHERE login_name = ?').get('joyalregi8@gmail.com') as any;

  let landscapeTemplateId = '';
  let portraitTemplateId = '';
  let spreadsheetId = '';

  // 1. Template inspection: Landscape layout
  await t.test('1. Inspect and store landscape certificate template (842 x 595 pt)', async () => {
    const tempCopy = path.join(config.uploadDir, `test-landscape-${Date.now()}.pdf`);
    fs.copyFileSync(LANDSCAPE_PDF, tempCopy);

    const templateInfo = await TemplateService.inspectAndSaveTemplate(
      admin.id,
      'sample-landscape.pdf',
      tempCopy
    );

    assert.ok(templateInfo.id);
    landscapeTemplateId = templateInfo.id;
    assert.equal(templateInfo.rotation, 0);
    assert.equal(Math.round(templateInfo.pageSizePoints.width), 842);
    assert.equal(Math.round(templateInfo.pageSizePoints.height), 595);
  });

  // 2. Template inspection: Portrait layout
  await t.test('2. Inspect and store distinct portrait certificate template (595 x 842 pt)', async () => {
    const tempCopy = path.join(config.uploadDir, `test-portrait-${Date.now()}.pdf`);
    fs.copyFileSync(PORTRAIT_PDF, tempCopy);

    const templateInfo = await TemplateService.inspectAndSaveTemplate(
      admin.id,
      'modern-portrait.pdf',
      tempCopy
    );

    assert.ok(templateInfo.id);
    portraitTemplateId = templateInfo.id;
    assert.equal(Math.round(templateInfo.pageSizePoints.width), 595);
    assert.equal(Math.round(templateInfo.pageSizePoints.height), 842);
  });

  // 3. Save and retrieve separate field position presets for each template
  await t.test('3. Save and retrieve distinct field presets for Landscape vs Portrait templates', () => {
    // Landscape positions
    const landscapeFields: OverlayField[] = [
      {
        id: 'f_name_land',
        fieldKey: 'STUDENT_NAME',
        label: 'Student Name',
        x: 421, // Centered on 842pt width
        y: 320,
        pageNumber: 1,
        fontFamily: 'HelveticaBold',
        fontSize: 32,
        colorHex: '#0f172a',
        alignment: 'center',
      },
      {
        id: 'f_prog_land',
        fieldKey: 'PROGRAM_CATEGORY',
        label: 'Program Participated',
        x: 421,
        y: 240,
        pageNumber: 1,
        fontFamily: 'Helvetica',
        fontSize: 16,
        colorHex: '#475569',
        alignment: 'center',
      },
    ];

    TemplateService.saveTemplatePreset(landscapeTemplateId, admin.id, landscapeFields, 1);
    const landscapeTemplate = TemplateService.getTemplate(landscapeTemplateId, admin.id);
    assert.ok(landscapeTemplate);
    assert.equal(landscapeTemplate?.overlayFields.length, 2);
    assert.equal(landscapeTemplate?.overlayFields[0].fontSize, 32);

    // Portrait positions (different X/Y coordinates suited for 595 x 842 portrait)
    const portraitFields: OverlayField[] = [
      {
        id: 'f_name_port',
        fieldKey: 'STUDENT_NAME',
        label: 'Student Name',
        x: 297, // Centered on 595pt width
        y: 580,
        pageNumber: 1,
        fontFamily: 'HelveticaBold',
        fontSize: 28,
        colorHex: '#1e293b',
        alignment: 'center',
      },
      {
        id: 'f_prog_port',
        fieldKey: 'PROGRAM_CATEGORY',
        label: 'Program Participated',
        x: 297,
        y: 470,
        pageNumber: 1,
        fontFamily: 'TimesRoman',
        fontSize: 20,
        colorHex: '#b45309',
        alignment: 'center',
      },
    ];

    TemplateService.saveTemplatePreset(portraitTemplateId, admin.id, portraitFields, 1);
    const portraitTemplate = TemplateService.getTemplate(portraitTemplateId, admin.id);
    assert.ok(portraitTemplate);
    assert.equal(portraitTemplate?.overlayFields.length, 2);
    assert.equal(portraitTemplate?.overlayFields[1].fontSize, 20);
    assert.equal(portraitTemplate?.overlayFields[1].colorHex, '#b45309');
  });

  // 4. Student data import: names-only file (no program column)
  await t.test('4. Upload and validate names-only CSV without requiring a program column', () => {
    const tempCopy = path.join(config.uploadDir, `test-names-only-${Date.now()}.csv`);
    fs.copyFileSync(NAMES_ONLY_CSV, tempCopy);

    const spreadsheetInfo = SpreadsheetService.inspectAndSaveSpreadsheet(
      admin.id,
      'students-names-only.csv',
      tempCopy
    );

    assert.ok(spreadsheetInfo.id);
    spreadsheetId = spreadsheetInfo.id;
    assert.equal(spreadsheetInfo.totalRows, 8);
    assert.deepEqual(spreadsheetInfo.headers, ['Student Name']);

    // Check suggested mappings: PROGRAM_CATEGORY is NOT required because there is no program column in spreadsheet
    const mappings = ValidationService.suggestMappings(spreadsheetInfo.headers);
    const progMapping = mappings.find((m) => m.fieldKey === 'PROGRAM_CATEGORY');
    assert.equal(progMapping?.isRequired, false, 'Program column must not be required when not present in headers');

    // Full row validation with globalProgramName option: passes with 0 errors
    const { rows } = SpreadsheetService.getAllRows(spreadsheetInfo);
    const summary = ValidationService.validateRows(rows, mappings, {
      globalProgramName: 'AI & Robotics Innovation Summit 2026',
    });

    assert.equal(summary.totalRows, 8);
    assert.equal(summary.validRows, 8, 'All 8 names must be valid');
    assert.equal(summary.invalidRows, 0, 'No errors when globalProgramName is supplied');
  });

  // 5. Batch creation with global program name and name overrides (Landscape layout)
  await t.test('5. Generate certificates for Landscape template using global program and name overrides', async () => {
    const batchId = `test_batch_land_${Date.now()}`;
    const globalProgram = 'AI & Robotics Innovation Summit 2026';
    const nowIso = new Date().toISOString();
    const expiryIso = new Date(Date.now() + 86400000).toISOString();

    const landscapeFields: OverlayField[] = [
      {
        id: 'f_name',
        fieldKey: 'STUDENT_NAME',
        label: 'Student Name',
        x: 421,
        y: 320,
        pageNumber: 1,
        fontFamily: 'HelveticaBold',
        fontSize: 30,
        colorHex: '#000000',
        alignment: 'center',
      },
      {
        id: 'f_prog',
        fieldKey: 'PROGRAM_CATEGORY',
        label: 'Program Participated',
        x: 421,
        y: 240,
        pageNumber: 1,
        fontFamily: 'Helvetica',
        fontSize: 18,
        colorHex: '#334155',
        alignment: 'center',
      },
    ];

    // Override student name for row index 2 (Benjamin Clark -> Dr. Benjamin Clark, PhD)
    const nameOverrides: Record<number, string> = {
      2: 'Dr. Benjamin Clark, PhD',
    };

    // Exclude row 8 (Ibrahim Diallo)
    const excludedRows = [8];

    const batch: Batch = {
      id: batchId,
      userId: admin.id,
      name: 'Landscape Batch Names Only',
      programName: globalProgram,
      templateId: landscapeTemplateId,
      spreadsheetId: spreadsheetId,
      activeSheet: '',
      selectedPage: 1,
      fieldMappings: [{ fieldKey: 'STUDENT_NAME', spreadsheetColumn: 'Student Name', isRequired: true }],
      overlayFields: landscapeFields,
      excludedRows: excludedRows,
      nameOverrides: nameOverrides,
      status: 'draft',
      createdAt: nowIso,
      updatedAt: nowIso,
      expiresAt: expiryIso,
    };

    db.prepare(`
      INSERT INTO batches (id, user_id, name, program_name, template_id, spreadsheet_id, active_sheet, selected_page, field_mappings, overlay_fields, excluded_rows, name_overrides, status, created_at, updated_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      batch.id,
      batch.userId,
      batch.name,
      batch.programName,
      batch.templateId,
      batch.spreadsheetId,
      batch.activeSheet,
      batch.selectedPage,
      JSON.stringify(batch.fieldMappings),
      JSON.stringify(batch.overlayFields),
      JSON.stringify(batch.excludedRows),
      JSON.stringify(batch.nameOverrides),
      batch.status,
      batch.createdAt,
      batch.updatedAt,
      batch.expiresAt
    );

    // Run generation job
    const jobId = await BulkJobService.startBulkJob(batch, admin.id);
    assert.ok(jobId);

    // Wait for completion (with timeout)
    const startTime = Date.now();
    let jobRecord: any = null;
    while (Date.now() - startTime < 10000) {
      jobRecord = BulkJobService.getJobByBatchId(batchId, admin.id);
      if (jobRecord && (jobRecord.status === 'completed' || jobRecord.status === 'failed')) {
        break;
      }
      await new Promise((r) => setTimeout(r, 40));
    }

    assert.ok(jobRecord, 'Job record must exist');
    assert.equal(jobRecord.status, 'completed');
    assert.equal(jobRecord.succeededRows, 7, '8 total - 1 excluded = 7 generated certificates');
    assert.ok(jobRecord);
    assert.ok(jobRecord?.zipPath && fs.existsSync(jobRecord.zipPath));
    assert.ok(jobRecord?.combinedPdfPath && fs.existsSync(jobRecord.combinedPdfPath));

    // Inspect combined PDF: must have 7 pages, each 842 x 595 pt (landscape)
    const combinedBytes = fs.readFileSync(jobRecord!.combinedPdfPath!);
    const combinedDoc = await PDFDocument.load(combinedBytes);
    assert.equal(combinedDoc.getPageCount(), 7);
    const firstPage = combinedDoc.getPage(0);
    assert.equal(Math.round(firstPage.getWidth()), 842);
    assert.equal(Math.round(firstPage.getHeight()), 595);
  });

  // 6. Batch creation with Portrait template
  await t.test('6. Generate certificates for Portrait template preserving portrait layout', async () => {
    const batchId = `test_batch_port_${Date.now()}`;
    const globalProgram = 'Youth Leadership & Civic Innovation 2026';
    const nowIso = new Date().toISOString();
    const expiryIso = new Date(Date.now() + 86400000).toISOString();

    const portraitFields: OverlayField[] = [
      {
        id: 'f_name_p',
        fieldKey: 'STUDENT_NAME',
        label: 'Student Name',
        x: 297,
        y: 580,
        pageNumber: 1,
        fontFamily: 'HelveticaBold',
        fontSize: 26,
        colorHex: '#1e293b',
        alignment: 'center',
      },
      {
        id: 'f_prog_p',
        fieldKey: 'PROGRAM_CATEGORY',
        label: 'Program Participated',
        x: 297,
        y: 470,
        pageNumber: 1,
        fontFamily: 'Helvetica',
        fontSize: 18,
        colorHex: '#b45309',
        alignment: 'center',
      },
    ];

    const batch: Batch = {
      id: batchId,
      userId: admin.id,
      name: 'Portrait Batch Names Only',
      programName: globalProgram,
      templateId: portraitTemplateId,
      spreadsheetId: spreadsheetId,
      activeSheet: '',
      selectedPage: 1,
      fieldMappings: [{ fieldKey: 'STUDENT_NAME', spreadsheetColumn: 'Student Name', isRequired: true }],
      overlayFields: portraitFields,
      excludedRows: [],
      nameOverrides: {},
      status: 'draft',
      createdAt: nowIso,
      updatedAt: nowIso,
      expiresAt: expiryIso,
    };

    db.prepare(`
      INSERT INTO batches (id, user_id, name, program_name, template_id, spreadsheet_id, active_sheet, selected_page, field_mappings, overlay_fields, excluded_rows, name_overrides, status, created_at, updated_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      batch.id,
      batch.userId,
      batch.name,
      batch.programName,
      batch.templateId,
      batch.spreadsheetId,
      batch.activeSheet,
      batch.selectedPage,
      JSON.stringify(batch.fieldMappings),
      JSON.stringify(batch.overlayFields),
      JSON.stringify(batch.excludedRows),
      JSON.stringify(batch.nameOverrides),
      batch.status,
      batch.createdAt,
      batch.updatedAt,
      batch.expiresAt
    );

    const jobId = await BulkJobService.startBulkJob(batch, admin.id);
    assert.ok(jobId);

    // Wait for completion (with timeout)
    const startTime = Date.now();
    let jobRecord: any = null;
    while (Date.now() - startTime < 10000) {
      jobRecord = BulkJobService.getJobByBatchId(batchId, admin.id);
      if (jobRecord && (jobRecord.status === 'completed' || jobRecord.status === 'failed')) {
        break;
      }
      await new Promise((r) => setTimeout(r, 40));
    }

    assert.ok(jobRecord, 'Job record must exist');
    assert.equal(jobRecord.status, 'completed');
    assert.equal(jobRecord.succeededRows, 8);
    assert.ok(jobRecord?.combinedPdfPath && fs.existsSync(jobRecord.combinedPdfPath));

    // Verify combined PDF has 8 pages, each 595 x 842 pt (portrait)
    const combinedBytes = fs.readFileSync(jobRecord!.combinedPdfPath!);
    const combinedDoc = await PDFDocument.load(combinedBytes);
    assert.equal(combinedDoc.getPageCount(), 8);
    const firstPage = combinedDoc.getPage(0);
    assert.equal(Math.round(firstPage.getWidth()), 595);
    assert.equal(Math.round(firstPage.getHeight()), 842);
  });

  // 7. Google Drive status check and graceful error handling when disconnected
  await t.test('7. Google Drive status check and graceful error handling when disconnected', async () => {
    // Check status: user has not connected Drive
    const status = GoogleDriveService.getStatus(admin.id);
    assert.equal(status.connected, false, 'Drive should report not connected');

    // Attempting upload when not connected must throw a descriptive user-friendly error
    await assert.rejects(
      async () => {
        await GoogleDriveService.uploadBatchArtifacts('non_existent_batch', admin.id);
      },
      (err: any) => {
        assert.ok(
          err.message.includes('Google Drive is not connected') ||
          err.message.includes('not connected'),
          `Expected disconnected error message, got: ${err.message}`
        );
        return true;
      }
    );
  });

  // 8. Google Drive AES-256-GCM token encryption security check
  await t.test('8. AES-256-GCM token encryption security verification', () => {
    const rawSecret = '1//0gXYZ_sample_mock_oauth_refresh_token_secret_12345';
    
    // Encrypt token
    const encrypted = encryptToken(rawSecret);
    assert.notEqual(encrypted, rawSecret, 'Encrypted token must never match plaintext');
    assert.ok(encrypted.includes(':'), 'Encrypted token format must have iv:authTag:cipher components');

    // Decrypt token
    const decrypted = decryptToken(encrypted);
    assert.equal(decrypted, rawSecret, 'Decrypted token must exactly match original plaintext');

    // Save token to DB and verify disconnect purges it
    const nowIso = new Date().toISOString();
    db.prepare(`
      INSERT INTO google_drive_tokens (user_id, encrypted_access_token, encrypted_refresh_token, token_expiry, account_email, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(admin.id, encryptToken('access123'), encrypted, nowIso, 'admin@institution.edu', nowIso, nowIso);

    const savedRow = db.prepare('SELECT encrypted_refresh_token FROM google_drive_tokens WHERE user_id = ?').get(admin.id) as any;
    assert.ok(savedRow);
    assert.notEqual(savedRow.encrypted_refresh_token, rawSecret, 'Token in DB must be encrypted');

    // Disconnect cleans up the token completely
    GoogleDriveService.disconnect(admin.id);
    const afterDisconnect = db.prepare('SELECT * FROM google_drive_tokens WHERE user_id = ?').get(admin.id);
    assert.equal(afterDisconnect, undefined, 'Tokens must be completely deleted upon disconnect');
  });

  // 9. Regression test: Save batch from /mapping via PUT /api/batches/:id with partial body (no status)
  await t.test('9. Regression: Save batch from /mapping without status parameter binds null and succeeds without SQLite error', async () => {
    const server = app.listen(0);
    const addr = server.address() as any;
    const baseUrl = `http://localhost:${addr.port}`;

    try {
      // Authenticate via login to obtain session cookie & CSRF tokens
      const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loginName: 'joyalregi8@gmail.com', password: 'Admin@123' })
      });
      assert.equal(loginRes.status, 200, 'Admin login must succeed');

      const cookies = loginRes.headers.getSetCookie ? loginRes.headers.getSetCookie() : [loginRes.headers.get('set-cookie') || ''];
      const sidHeader = cookies.find((c) => c.startsWith('sid='));
      const csrfHeader = cookies.find((c) => c.startsWith('csrf_token='));
      const sid = sidHeader ? sidHeader.split(';')[0] : '';
      const csrfToken = csrfHeader ? csrfHeader.split(';')[0].split('=')[1] : '';

      const authHeaders = {
        'Content-Type': 'application/json',
        Cookie: `${sid}; csrf_token=${csrfToken}`,
        'x-csrf-token': csrfToken
      };

      // 1. Create a draft batch first
      const batchRes = await fetch(`${baseUrl}/api/batches`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          name: 'Mapping Page Save Test Batch',
          programName: 'Robotics Champions 2026',
          spreadsheetId: spreadsheetId,
        }),
      });

      assert.equal(batchRes.status, 201, 'Batch creation must succeed');
      const { batch: createdBatch } = (await batchRes.json()) as any;
      assert.ok(createdBatch.id);
      assert.equal(createdBatch.status, 'draft');

      // 2. Simulate clicking "Proceed to Template Editor" on /mapping page
      // Notice: `status` is intentionally undefined / omitted (which previously triggered parameter 11 error)
      const mappingSavePayload = {
        name: createdBatch.name,
        programName: 'Robotics Champions 2026',
        templateId: landscapeTemplateId,
        spreadsheetId: spreadsheetId,
        activeSheet: '',
        selectedPage: 1,
        fieldMappings: [{ fieldKey: 'STUDENT_NAME', spreadsheetColumn: 'Student Name', isRequired: true }],
        overlayFields: [],
        excludedRows: [4],
        nameOverrides: { 2: 'Dr. Jane Doe, PhD' }
      };

      const putRes = await fetch(`${baseUrl}/api/batches/${createdBatch.id}`, {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify(mappingSavePayload),
      });

      assert.equal(putRes.status, 200, 'PUT /api/batches/:id must return 200 without SQLite parameter binding error');
      const { batch: updatedBatch } = (await putRes.json()) as any;

      assert.equal(updatedBatch.id, createdBatch.id);
      assert.equal(updatedBatch.status, 'draft', 'Status draft must be preserved via COALESCE');
      assert.equal(updatedBatch.programName, 'Robotics Champions 2026');
      assert.equal(updatedBatch.templateId, landscapeTemplateId);
      assert.deepEqual(updatedBatch.nameOverrides, { '2': 'Dr. Jane Doe, PhD' });
      assert.deepEqual(updatedBatch.excludedRows, [4]);

      // 3. Verify SQLite DB row directly
      const dbRow = db.prepare('SELECT * FROM batches WHERE id = ?').get(createdBatch.id) as any;
      assert.equal(dbRow.status, 'draft');
      assert.equal(dbRow.program_name, 'Robotics Champions 2026');
      assert.equal(JSON.parse(dbRow.name_overrides)['2'], 'Dr. Jane Doe, PhD');
      assert.equal(JSON.parse(dbRow.excluded_rows)[0], 4);
    } finally {
      server.close();
    }
  });
});
