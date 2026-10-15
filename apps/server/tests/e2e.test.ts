import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { app } from '../src/index';
import { db } from '../src/db/database';
import { Server } from 'node:http';

const FIXTURES_DIR = path.resolve(__dirname, '../../../tests/fixtures');
const SAMPLE_PDF = path.join(FIXTURES_DIR, 'sample-certificate-template.pdf');
const SPREADSHEET_CSV = path.join(FIXTURES_DIR, 'students-200-rows.csv');

test('Stage 1 E2E HTTP Integration Suite', async (t) => {
  let server: Server;
  let baseUrl: string;

  await new Promise<void>((resolve) => {
    // Reset rate limiter and lockout state for clean test isolation
    db.prepare('DELETE FROM login_attempts').run();
    db.prepare('UPDATE users SET failed_attempts = 0, locked_until = NULL').run();

    server = app.listen(0, () => {
      const addr = server.address() as any;
      baseUrl = `http://localhost:${addr.port}`;
      resolve();
    });
  });

  t.after(() => {
    server.close();
  });

  // 1. Unauthenticated requests to protected endpoints return 401
  await t.test('Unauthenticated request to /api/auth/me returns 401', async () => {
    const res = await fetch(`${baseUrl}/api/auth/me`);
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error, 'Unauthorized. Please sign in.');
  });

  // 2. Incorrect credentials return 401 with generic error message
  await t.test('Incorrect credentials show generic error message', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loginName: 'joyalregi8@gmail.com', password: 'WrongPassword123' })
    });
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error, 'Incorrect login name or password.');
  });

  // 3. Successful login sets httpOnly sid cookie and returns user DTO
  let sessionCookie = '';
  let csrfToken = '';
  await t.test('Successful login sets sid cookie and returns user', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loginName: 'joyalregi8@gmail.com', password: 'Admin@123' })
    });
    assert.equal(res.status, 200);

    const cookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie') || ''];
    const sidHeader = cookies.find((c) => c.startsWith('sid='));
    const csrfHeader = cookies.find((c) => c.startsWith('csrf_token='));

    assert.ok(sidHeader, 'Must set sid cookie');
    sessionCookie = sidHeader.split(';')[0];
    if (csrfHeader) {
      csrfToken = csrfHeader.split(';')[0].split('=')[1];
    }

    const body = await res.json();
    assert.equal(body.user.loginName, 'joyalregi8@gmail.com');
  });

  // Helper for auth headers
  const getAuthHeaders = () => ({
    Cookie: `${sessionCookie}; csrf_token=${csrfToken}`,
    'x-csrf-token': csrfToken
  });

  // 4. Authenticated request succeeds with sid cookie
  await t.test('Authenticated request succeeds with sid cookie', async () => {
    const res = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Cookie: sessionCookie }
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.user.loginName, 'joyalregi8@gmail.com');
  });

  // 5. Upload PDF template via authenticated multipart request
  let templateId = '';
  await t.test('Upload PDF template via multipart form data', async () => {
    const pdfBytes = fs.readFileSync(SAMPLE_PDF);
    const formData = new FormData();
    formData.append('template', new Blob([pdfBytes], { type: 'application/pdf' }), 'test-cert.pdf');

    const res = await fetch(`${baseUrl}/api/templates/upload`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: formData
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.ok(body.template.id);
    templateId = body.template.id;
    assert.equal(body.template.pageCount, 1);
  });

  // 6. Upload Spreadsheet via authenticated multipart request
  let spreadsheetId = '';
  await t.test('Upload Spreadsheet via multipart form data', async () => {
    const csvBytes = fs.readFileSync(SPREADSHEET_CSV);
    const formData = new FormData();
    formData.append('spreadsheet', new Blob([csvBytes], { type: 'text/csv' }), 'test-students.csv');

    const res = await fetch(`${baseUrl}/api/spreadsheets/upload`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: formData
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.ok(body.spreadsheet.id);
    spreadsheetId = body.spreadsheet.id;
    assert.equal(body.spreadsheet.totalRows, 220);
    assert.ok(body.suggestedMappings.length > 0);
  });

  // 7. Create batch and run validation endpoint
  await t.test('Create batch and validate 220 rows with seeded errors', async () => {
    // Create batch
    const createRes = await fetch(`${baseUrl}/api/batches`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders()
      },
      body: JSON.stringify({
        name: 'E2E Test Batch',
        templateId,
        spreadsheetId
      })
    });
    assert.equal(createRes.status, 201);
    const batch = (await createRes.json()).batch;

    // Validate
    const valRes = await fetch(`${baseUrl}/api/batches/${batch.id}/validate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders()
      },
      body: JSON.stringify({})
    });
    assert.equal(valRes.status, 200);
    const valBody = await valRes.json();
    const summary = valBody.validationSummary;
    assert.equal(summary.totalRows, 220);
    assert.equal(summary.invalidRows, 4);
    assert.equal(summary.validRows, 216);
  });

  // 8. Logout invalidates session
  await t.test('Logout invalidates session and subsequent request returns 401', async () => {
    const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    assert.equal(logoutRes.status, 200);

    // Reusing old cookie must now fail
    const meRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Cookie: sessionCookie }
    });
    assert.equal(meRes.status, 401);
  });
});
