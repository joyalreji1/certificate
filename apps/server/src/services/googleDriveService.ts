import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { db } from '../db/database';
import { config } from '../config';

function getEncryptionKey(): Buffer {
  let keyHex = config.tokenEncryptionKey;
  if (!keyHex || keyHex.length < 32) {
    keyHex = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  }
  return crypto.createHash('sha256').update(keyHex).digest();
}

export function encryptToken(plainText: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

export function decryptToken(cipherText: string): string {
  const parts = cipherText.split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted token format');
  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];
  const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export interface DriveTokenRecord {
  userId: string;
  encryptedAccessToken: string;
  encryptedRefreshToken: string | null;
  tokenExpiry: string | null;
  accountEmail: string | null;
}

export class GoogleDriveService {
  static isConfigured(): boolean {
    return !!(config.googleClientId && config.googleClientSecret);
  }

  static getStatus(userId: string): { connected: boolean; configured: boolean; accountEmail?: string } {
    const configured = this.isConfigured();
    const row = db.prepare('SELECT account_email, token_expiry FROM google_drive_tokens WHERE user_id = ?').get(userId) as any;
    if (!row) {
      return { connected: false, configured };
    }
    return {
      connected: true,
      configured,
      accountEmail: row.account_email || 'Connected Google Account'
    };
  }

  static getAuthUrl(state: string = ''): string {
    if (!this.isConfigured()) {
      throw new Error('Google OAuth credentials (GOOGLE_CLIENT_ID & GOOGLE_CLIENT_SECRET) are not configured in .env.');
    }

    const params = new URLSearchParams({
      client_id: config.googleClientId,
      redirect_uri: config.googleRedirectUri,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email openid',
      access_type: 'offline',
      prompt: 'consent',
      state
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  static async handleOAuthCallback(code: string, userId: string): Promise<{ success: boolean; accountEmail?: string }> {
    if (!this.isConfigured()) {
      throw new Error('Google OAuth is not configured on this server.');
    }

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: config.googleClientId,
        client_secret: config.googleClientSecret,
        redirect_uri: config.googleRedirectUri,
        grant_type: 'authorization_code'
      }).toString()
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text();
      throw new Error(`Google token exchange failed: ${errBody}`);
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;
    const expiresIn = tokenData.expires_in || 3600;
    const expiryDate = new Date(Date.now() + expiresIn * 1000).toISOString();

    let accountEmail = '';
    try {
      const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (userRes.ok) {
        const userData = await userRes.json();
        accountEmail = userData.email || '';
      }
    } catch {
      // Non-fatal if email cannot be fetched
    }

    const encAccess = encryptToken(accessToken);
    const encRefresh = refreshToken ? encryptToken(refreshToken) : null;
    const nowIso = new Date().toISOString();

    const existing = db.prepare('SELECT encrypted_refresh_token FROM google_drive_tokens WHERE user_id = ?').get(userId) as any;
    const finalEncRefresh = encRefresh || (existing ? existing.encrypted_refresh_token : null);

    db.prepare(`
      INSERT INTO google_drive_tokens (user_id, encrypted_access_token, encrypted_refresh_token, token_expiry, account_email, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        encrypted_access_token = excluded.encrypted_access_token,
        encrypted_refresh_token = COALESCE(excluded.encrypted_refresh_token, google_drive_tokens.encrypted_refresh_token),
        token_expiry = excluded.token_expiry,
        account_email = excluded.account_email,
        updated_at = excluded.updated_at
    `).run(userId, encAccess, finalEncRefresh, expiryDate, accountEmail, nowIso, nowIso);

    return { success: true, accountEmail };
  }

  static async getValidAccessToken(userId: string): Promise<string> {
    const row = db.prepare('SELECT * FROM google_drive_tokens WHERE user_id = ?').get(userId) as any;
    if (!row) {
      const err: any = new Error('Google Drive is not connected. Please connect your Google account in Settings to upload directly to Drive, or download files locally.');
      err.statusCode = 400;
      throw err;
    }

    const isExpired = !row.token_expiry || new Date(row.token_expiry).getTime() - 60000 <= Date.now();
    if (!isExpired) {
      return decryptToken(row.encrypted_access_token);
    }

    if (!row.encrypted_refresh_token) {
      throw new Error('Google Drive authorization has expired. Please reconnect Google Drive in Settings.');
    }

    const refreshToken = decryptToken(row.encrypted_refresh_token);
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.googleClientId,
        client_secret: config.googleClientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
      }).toString()
    });

    if (!res.ok) {
      const err: any = new Error('Google Drive refresh token is invalid or revoked. Please reconnect Google Drive in Settings.');
      err.statusCode = 401;
      throw err;
    }

    const data = await res.json();
    const newAccessToken = data.access_token;
    const expiresIn = data.expires_in || 3600;
    const expiryDate = new Date(Date.now() + expiresIn * 1000).toISOString();
    const encAccess = encryptToken(newAccessToken);

    db.prepare(`
      UPDATE google_drive_tokens
      SET encrypted_access_token = ?, token_expiry = ?, updated_at = ?
      WHERE user_id = ?
    `).run(encAccess, expiryDate, new Date().toISOString(), userId);

    return newAccessToken;
  }

  static disconnect(userId: string): boolean {
    db.prepare('DELETE FROM google_drive_tokens WHERE user_id = ?').run(userId);
    return true;
  }

  static async uploadBatchArtifacts(
    batchId: string,
    userId: string,
    target: 'zip' | 'combined' | 'all' = 'all'
  ): Promise<{
    success: boolean;
    folderId?: string;
    folderUrl?: string;
    uploads: Array<{ target: string; fileId: string; webViewLink: string; name: string }>;
  }> {
    const status = this.getStatus(userId);
    if (!status.connected) {
      const err: any = new Error(
        'Google Drive is not connected. Please connect your Google account in Settings to upload directly to Drive, or download files locally.'
      );
      err.statusCode = 400;
      throw err;
    }

    const batch = db.prepare('SELECT name FROM batches WHERE id = ? AND user_id = ?').get(batchId, userId) as any;
    if (!batch) {
      const err: any = new Error('Batch not found.');
      err.statusCode = 404;
      throw err;
    }

    const accessToken = await this.getValidAccessToken(userId);
    const safeBatchName = batch.name.replace(/[^a-zA-Z0-9_\- ]/g, '_').trim();
    const folderName = `Bulk Certificates — ${safeBatchName}`;

    // 1. Create Folder in Drive
    const createFolderRes = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder'
      })
    });

    if (!createFolderRes.ok) {
      const errText = await createFolderRes.text();
      throw new Error(`Failed to create Google Drive folder: ${errText}`);
    }

    const folderData = await createFolderRes.json();
    const folderId = folderData.id;
    const folderUrl = `https://drive.google.com/drive/folders/${folderId}`;

    const filesToUpload: Array<{ path: string; name: string; mime: string; target: string }> = [];

    if (target === 'zip' || target === 'all') {
      const zipPath = path.join(config.jobsDir, `batch_${batchId}.zip`);
      if (fs.existsSync(zipPath)) {
        filesToUpload.push({
          path: zipPath,
          name: `certificates_${safeBatchName}.zip`,
          mime: 'application/zip',
          target: 'zip'
        });
      }
    }

    if (target === 'combined' || target === 'all') {
      const pdfPath = path.join(config.jobsDir, `batch_${batchId}_combined.pdf`);
      if (fs.existsSync(pdfPath)) {
        filesToUpload.push({
          path: pdfPath,
          name: `combined_certificates_${safeBatchName}.pdf`,
          mime: 'application/pdf',
          target: 'combined'
        });
      }
    }

    if (filesToUpload.length === 0) {
      throw new Error('No generated batch files were found to upload. Please ensure generation is complete.');
    }

    const uploads: Array<{ target: string; fileId: string; webViewLink: string; name: string }> = [];

    for (const item of filesToUpload) {
      const fileBuffer = fs.readFileSync(item.path);
      const boundary = `-------314159265358979323846`;
      const delimiter = `\r\n--${boundary}\r\n`;
      const closeDelimiter = `\r\n--${boundary}--`;

      const metadata = JSON.stringify({
        name: item.name,
        parents: [folderId]
      });

      const multipartRequestBody = Buffer.concat([
        Buffer.from(
          delimiter +
          'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
          metadata +
          delimiter +
          `Content-Type: ${item.mime}\r\n\r\n`
        ),
        fileBuffer,
        Buffer.from(closeDelimiter)
      ]);

      const uploadRes = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': `multipart/related; boundary=${boundary}`,
            'Content-Length': String(multipartRequestBody.length)
          },
          body: multipartRequestBody
        }
      );

      if (!uploadRes.ok) {
        const errText = await uploadRes.text();
        throw new Error(`Failed to upload ${item.name} to Google Drive: ${errText}`);
      }

      const fileData = await uploadRes.json();
      uploads.push({
        target: item.target,
        fileId: fileData.id,
        webViewLink: fileData.webViewLink || `https://drive.google.com/file/d/${fileData.id}/view`,
        name: item.name
      });
    }

    // Record drive uploads in jobs table
    try {
      db.prepare(`
        UPDATE jobs
        SET drive_uploads = ?
        WHERE batch_id = ?
      `).run(JSON.stringify(uploads), batchId);
    } catch {}

    return {
      success: true,
      folderId,
      folderUrl,
      uploads
    };
  }
}
