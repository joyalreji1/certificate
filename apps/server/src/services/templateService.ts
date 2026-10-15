import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { db } from '../db/database';
import { TemplateInfo } from '@bulk-cert/shared';
import { config } from '../config';

const PT_TO_MM = 25.4 / 72;

export class TemplateService {
  static async inspectAndSaveTemplate(
    userId: string,
    originalFilename: string,
    tempFilePath: string
  ): Promise<TemplateInfo> {
    const fileBuffer = fs.readFileSync(tempFilePath);

    // Magic bytes check (%PDF-)
    if (fileBuffer.length < 5 || fileBuffer.toString('utf8', 0, 5) !== '%PDF-') {
      fs.unlinkSync(tempFilePath);
      throw new Error('Invalid file format: File does not have a valid PDF header (%PDF-).');
    }

    let pdfDoc: PDFDocument;
    try {
      pdfDoc = await PDFDocument.load(fileBuffer, { updateMetadata: false });
    } catch (err: any) {
      fs.unlinkSync(tempFilePath);
      if (err.message && err.message.toLowerCase().includes('encrypt')) {
        throw new Error('Encrypted or password-protected PDF templates are not supported. Please upload an unencrypted PDF.');
      }
      throw new Error(`Corrupt or unreadable PDF: ${err.message || 'Failed to parse PDF document.'}`);
    }

    if (pdfDoc.isEncrypted) {
      fs.unlinkSync(tempFilePath);
      throw new Error('Encrypted or password-protected PDF templates are not supported. Please upload an unencrypted PDF.');
    }

    const pageCount = pdfDoc.getPageCount();
    if (pageCount < 1) {
      fs.unlinkSync(tempFilePath);
      throw new Error('PDF contains no pages.');
    }

    // Inspect first page
    const firstPage = pdfDoc.getPage(0);
    const { width, height } = firstPage.getSize();
    const rotation = firstPage.getRotation().angle;

    // Detect embedded font names if available in internal catalog
    const embeddedFonts: string[] = [];

    const id = crypto.randomUUID();
    const ext = path.extname(originalFilename) || '.pdf';
    const targetFilename = `${id}${ext}`;
    const targetFilePath = path.join(config.uploadDir, targetFilename);

    fs.renameSync(tempFilePath, targetFilePath);

    const stats = fs.statSync(targetFilePath);
    const nowIso = new Date().toISOString();

    const templateInfo: TemplateInfo = {
      id,
      userId,
      filename: originalFilename,
      fileSize: stats.size,
      filePath: targetFilePath,
      pageCount,
      pageSizePoints: {
        width: Math.round(width * 100) / 100,
        height: Math.round(height * 100) / 100
      },
      pageSizeMm: {
        width: Math.round(width * PT_TO_MM * 10) / 10,
        height: Math.round(height * PT_TO_MM * 10) / 10
      },
      rotation,
      embeddedFonts,
      isEncrypted: false,
      createdAt: nowIso
    };

    db.prepare(`
      INSERT INTO templates (
        id, user_id, filename, file_size, file_path, page_count,
        page_width_pts, page_height_pts, page_width_mm, page_height_mm,
        rotation, embedded_fonts, is_encrypted, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      templateInfo.id,
      templateInfo.userId,
      templateInfo.filename,
      templateInfo.fileSize,
      templateInfo.filePath,
      templateInfo.pageCount,
      templateInfo.pageSizePoints.width,
      templateInfo.pageSizePoints.height,
      templateInfo.pageSizeMm.width,
      templateInfo.pageSizeMm.height,
      templateInfo.rotation,
      JSON.stringify(templateInfo.embeddedFonts),
      0,
      templateInfo.createdAt
    );

    return templateInfo;
  }

  static getTemplate(id: string, userId: string): TemplateInfo | null {
    const row = db.prepare(`
      SELECT * FROM templates WHERE id = ? AND user_id = ?
    `).get(id, userId) as any;

    if (!row) return null;

    return {
      id: row.id,
      userId: row.user_id,
      filename: row.filename,
      fileSize: row.file_size,
      filePath: row.file_path,
      pageCount: row.page_count,
      pageSizePoints: {
        width: row.page_width_pts,
        height: row.page_height_pts
      },
      pageSizeMm: {
        width: row.page_width_mm,
        height: row.page_height_mm
      },
      rotation: row.rotation,
      embeddedFonts: JSON.parse(row.embedded_fonts || '[]'),
      isEncrypted: row.is_encrypted === 1,
      createdAt: row.created_at
    };
  }
}
