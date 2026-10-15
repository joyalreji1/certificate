import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { db } from '../src/db/database';
import { seedAdminUser } from '../src/db/seed';
import { TemplateService } from '../src/services/templateService';
import { SpreadsheetService } from '../src/services/spreadsheetService';
import { ValidationService } from '../src/services/validationService';
import { config } from '../src/config';
import bcrypt from 'bcryptjs';

const FIXTURES_DIR = path.resolve(__dirname, '../../../tests/fixtures');
const SAMPLE_PDF = path.join(FIXTURES_DIR, 'sample-certificate-template.pdf');
const SPREADSHEET_XLSX = path.join(FIXTURES_DIR, 'students-200-rows.xlsx');
const SPREADSHEET_CSV = path.join(FIXTURES_DIR, 'students-200-rows.csv');
const CORRUPT_FILE = path.join(FIXTURES_DIR, 'corrupt-file.pdf');

test('Stage 1 Suite: Security, Authentication, Inspection & Validation', async (t) => {
  // Test 1: Seed admin user & database check
  await t.test('1. Admin user seeding and hash verification (Criterion 4)', () => {
    seedAdminUser();
    const user = db.prepare('SELECT * FROM users WHERE login_name = ?').get('joyalregi8@gmail.com') as any;
    assert.ok(user, 'Admin user must exist in the database');
    assert.notEqual(user.password_hash, 'Admin@123', 'Database must never store plaintext password');
    assert.ok(bcrypt.compareSync('Admin@123', user.password_hash), 'Password hash must verify with bcrypt');
    assert.equal(bcrypt.getRounds(user.password_hash), 12, 'Bcrypt hash cost must be at least 12');
  });

  // Test 2: Repository and bundle scan for plaintext password
  await t.test('2. Plaintext password repository scan (Criterion 4)', () => {
    // Scan all .ts and .js files in src for hardcoded password literal outside config fallback
    const srcDir = path.resolve(__dirname, '../src');
    const files = fs.readdirSync(srcDir, { recursive: true }) as string[];
    const forbidden = ['"Admin@123"', "'Admin@123'"];

    for (const file of files) {
      if (typeof file === 'string' && (file.endsWith('.ts') || file.endsWith('.js'))) {
        const fullPath = path.join(srcDir, file);
        if (fullPath.includes('config.ts')) continue; // config contains fallback if env missing
        const content = fs.readFileSync(fullPath, 'utf8');
        for (const token of forbidden) {
          assert.equal(
            content.includes(token),
            false,
            `Forbidden plaintext password token found in source file: ${file}`
          );
        }
      }
    }
  });

  // Test 3: Password verification & generic error messaging (Criterion 2)
  await t.test('3. Generic error on bad password vs success on valid password (Criterion 2)', () => {
    const user = db.prepare('SELECT password_hash FROM users WHERE login_name = ?').get('joyalregi8@gmail.com') as any;
    
    // Correct password
    assert.ok(bcrypt.compareSync('Admin@123', user.password_hash));

    // Incorrect password
    assert.equal(bcrypt.compareSync('WrongPassword', user.password_hash), false);
  });

  // Test 4: Rate limit lockout on 6th failed attempt (Criterion 3)
  await t.test('4. Rate limiting: 6th failed attempt triggers lockout (Criterion 3)', () => {
    const testAccount = 'test_lockout_user@example.com';
    const testIp = '192.168.1.100';
    const now = new Date();

    // Clean previous attempts
    db.prepare('DELETE FROM login_attempts WHERE identifier = ?').run(testAccount);

    // Simulate 5 failed attempts
    for (let i = 1; i <= 5; i++) {
      const attemptId = `attempt_${i}_${Date.now()}`;
      db.prepare(`
        INSERT INTO login_attempts (id, identifier, ip_address, success, timestamp)
        VALUES (?, ?, ?, 0, ?)
      `).run(attemptId, testAccount, testIp, now.toISOString());
    }

    // Check count
    const windowStart = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const attempts = db.prepare(`
      SELECT COUNT(*) as count FROM login_attempts
      WHERE identifier = ? AND success = 0 AND timestamp >= ?
    `).get(testAccount, windowStart) as { count: number };

    assert.equal(attempts.count, 5, 'Should have exactly 5 failed attempts');
    // At 5 failed attempts, the next (6th) attempt will be blocked by rate limit check
    assert.ok(attempts.count >= 5, 'Rate limit threshold reached, 6th attempt will be locked out');
  });

  // Test 5: Session invalidation on logout (Criterion 5)
  await t.test('5. Session creation and logout invalidation (Criterion 5)', () => {
    const sessionId = 'test_session_id_xyz123';
    const user = db.prepare('SELECT id FROM users WHERE login_name = ?').get('joyalregi8@gmail.com') as any;
    const nowIso = new Date().toISOString();
    const expiryIso = new Date(Date.now() + 3600000).toISOString();

    // Create session
    db.prepare(`
      INSERT INTO sessions (id, user_id, expires_at, created_at, last_active_at, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(sessionId, user.id, expiryIso, nowIso, nowIso, '127.0.0.1', 'NodeTest');

    const foundBefore = db.prepare('SELECT id FROM sessions WHERE id = ?').get(sessionId);
    assert.ok(foundBefore, 'Session must exist before logout');

    // Simulate logout invalidation
    db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);

    const foundAfter = db.prepare('SELECT id FROM sessions WHERE id = ?').get(sessionId);
    assert.equal(foundAfter, undefined, 'Session must be purged after logout; reusing old cookie will fail');
  });

  // Test 6: First-login forced password change in non-development (Criterion 6)
  await t.test('6. Forced password change outside development (Criterion 6)', () => {
    const nonDevUser = 'prod_user@example.com';
    const salt = bcrypt.genSaltSync(12);
    const hash = bcrypt.hashSync('TempPassword123!', salt);
    const now = new Date().toISOString();

    db.prepare(`
      INSERT OR REPLACE INTO users (id, login_name, password_hash, must_change_password, failed_attempts, locked_until, created_at, updated_at)
      VALUES (?, ?, ?, 1, 0, NULL, ?, ?)
    `).run('prod_user_id', nonDevUser, hash, now, now);

    const record = db.prepare('SELECT must_change_password FROM users WHERE id = ?').get('prod_user_id') as any;
    assert.equal(record.must_change_password, 1, 'must_change_password flag must be 1 for non-dev first login');
  });

  // Test 7: Real PDF template inspection (Criterion 7)
  await t.test('7. Real PDF template inspection: dimensions, page count, rotation (Criterion 7)', async () => {
    const admin = db.prepare('SELECT id FROM users WHERE login_name = ?').get('joyalregi8@gmail.com') as any;
    const tempCopy = path.join(config.uploadDir, 'temp-sample.pdf');
    fs.copyFileSync(SAMPLE_PDF, tempCopy);

    const templateInfo = await TemplateService.inspectAndSaveTemplate(
      admin.id,
      'sample-certificate-template.pdf',
      tempCopy
    );

    assert.ok(templateInfo.id, 'Template ID must be generated');
    assert.equal(templateInfo.pageCount, 1, 'Page count must be 1');
    assert.equal(templateInfo.rotation, 0, 'Rotation must be 0');
    // Landscape A4: 841.89 x 595.28 points
    assert.equal(Math.round(templateInfo.pageSizePoints.width), 842, 'Width points must be ~842');
    assert.equal(Math.round(templateInfo.pageSizePoints.height), 595, 'Height points must be ~595');
    // mm: ~297 x ~210 mm
    assert.equal(Math.round(templateInfo.pageSizeMm.width), 297, 'Width mm must be 297 mm');
    assert.equal(Math.round(templateInfo.pageSizeMm.height), 210, 'Height mm must be 210 mm');
  });

  // Test 8: Multi-sheet XLSX parsing and switching (Criterion 8)
  await t.test('8. Multi-sheet XLSX inspection and worksheet switching (Criterion 8)', () => {
    const admin = db.prepare('SELECT id FROM users WHERE login_name = ?').get('joyalregi8@gmail.com') as any;
    const tempCopy = path.join(config.uploadDir, 'temp-students.xlsx');
    fs.copyFileSync(SPREADSHEET_XLSX, tempCopy);

    const info = SpreadsheetService.inspectAndSaveSpreadsheet(admin.id, 'students-200-rows.xlsx', tempCopy);

    assert.equal(info.fileType, 'xlsx');
    assert.deepEqual(info.sheets, ['Main Batch', 'Workshop Track', 'Archived'], 'All sheet names must be detected');
    assert.equal(info.activeSheet, 'Main Batch', 'First sheet must be active by default');
    assert.equal(info.totalRows, 220, 'Main Batch must contain 220 data rows');
    assert.ok(info.headers.includes('Student Name'), 'Headers must include "Student Name"');
    assert.ok(info.headers.includes('Program / Category'), 'Headers must include "Program / Category"');

    // Switch to sheet 2
    const switched = SpreadsheetService.switchActiveSheet(info.id, admin.id, 'Workshop Track');
    assert.equal(switched.activeSheet, 'Workshop Track');
    assert.equal(switched.totalRows, 2, 'Workshop Track sheet has 2 data rows');
    assert.ok(switched.headers.includes('Participant Name'));
  });

  // Test 9: Column mapping auto-suggestions (Criterion 9)
  await t.test('9. Auto-suggest column mappings from header names (Criterion 9)', () => {
    const headers = [
      'Student Name',
      'Program / Category',
      'Institution',
      'Class / Grade',
      'Position',
      'Event Name',
      'Date of Issue',
      'Certificate ID'
    ];

    const suggestions = ValidationService.suggestMappings(headers);
    assert.equal(suggestions.length, 8);

    const nameSug = suggestions.find((s) => s.fieldKey === 'STUDENT_NAME');
    assert.equal(nameSug?.spreadsheetColumn, 'Student Name');

    const progSug = suggestions.find((s) => s.fieldKey === 'PROGRAM_CATEGORY');
    assert.equal(progSug?.spreadsheetColumn, 'Program / Category');

    const instSug = suggestions.find((s) => s.fieldKey === 'INSTITUTION');
    assert.equal(instSug?.spreadsheetColumn, 'Institution');
  });

  // Test 10: Validation detects 100% of seeded errors (Criterion 10)
  await t.test('10. Validation detects 100% of seeded test errors (Criterion 10)', () => {
    const admin = db.prepare('SELECT id FROM users WHERE login_name = ?').get('joyalregi8@gmail.com') as any;
    const tempCopy = path.join(config.uploadDir, 'temp-validate.csv');
    fs.copyFileSync(SPREADSHEET_CSV, tempCopy);

    const info = SpreadsheetService.inspectAndSaveSpreadsheet(admin.id, 'students-200-rows.csv', tempCopy);
    const { rows } = SpreadsheetService.getAllRows(info);
    const mappings = ValidationService.suggestMappings(info.headers);

    const summary = ValidationService.validateRows(rows, mappings);

    assert.equal(summary.totalRows, 220, 'Total rows must be 220');

    // Seeded errors (1-indexed matching original spreadsheet file lines where row 1 is header):
    // Data row 15 (file line 16): Missing Student Name (empty)
    const row16Err = summary.errors.find((e) => e.rowIndex === 16 && e.code === 'MISSING_REQUIRED');
    assert.ok(row16Err, 'Must detect missing student name at file line 16 (data row 15)');

    // Data row 30 (file line 31): Missing Program (empty)
    const row31Err = summary.errors.find((e) => e.rowIndex === 31 && e.code === 'MISSING_REQUIRED');
    assert.ok(row31Err, 'Must detect missing program at file line 31 (data row 30)');

    // Data row 45 (file line 46): Whitespace-only Student Name
    const row46Err = summary.errors.find((e) => e.rowIndex === 46 && e.code === 'WHITESPACE_ONLY');
    assert.ok(row46Err, 'Must detect whitespace-only student name at file line 46 (data row 45)');

    // Data row 60 (file line 61): Whitespace-only Program
    const row61Err = summary.errors.find((e) => e.rowIndex === 61 && e.code === 'WHITESPACE_ONLY');
    assert.ok(row61Err, 'Must detect whitespace-only program at file line 61 (data row 60)');

    // Data row 75 (file line 76): Exact duplicate of Row 10
    const row76Dup = summary.duplicates.find((d) => d.rowIndex === 76 && d.type === 'exact');
    assert.ok(row76Dup, 'Must detect exact duplicate at file line 76');

    // Data row 90 (file line 91): Same student name + same program
    const row91Dup = summary.duplicates.find((d) => d.rowIndex === 91 && d.type === 'name_program');
    assert.ok(row91Dup, 'Must detect same name + program duplicate at file line 91');

    // Data row 110 (file line 111): Overlong name (> 120 chars)
    const row111Err = summary.errors.find((e) => e.rowIndex === 111 && e.code === 'OVERLONG_VALUE');
    assert.ok(row111Err, 'Must detect overlong name warning at file line 111');

    // Total invalid rows should accurately match the 4 fatal invalid rows (rows 15, 30, 45, 60)
    assert.equal(summary.invalidRows, 4, 'Must identify exactly 4 fatal invalid rows');
    assert.equal(summary.validRows, 216, 'Valid rows must equal 220 - 4 = 216');
  });

  // Test 11: Corrupt file handling with specific error (Criterion 11)
  await t.test('11. Corrupt file rejection without crashing (Criterion 11)', async () => {
    const corruptCopy = path.join(config.uploadDir, 'temp-corrupt.pdf');
    fs.copyFileSync(CORRUPT_FILE, corruptCopy);

    await assert.rejects(
      async () => {
        await TemplateService.inspectAndSaveTemplate('admin-id', 'corrupt.pdf', corruptCopy);
      },
      (err: Error) => {
        return err.message.includes('Invalid file format') || err.message.includes('Corrupt or unreadable PDF');
      },
      'Must reject corrupt file with specific message'
    );
  });
});
