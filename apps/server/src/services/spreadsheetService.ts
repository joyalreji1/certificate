import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { db } from '../db/database';
import { SpreadsheetInfo } from '@bulk-cert/shared';
import { config } from '../config';

// Sanitize formulas to prevent CSV/Formula injection attacks while preserving raw whitespace for validation
export function sanitizeCellValue(val: any): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  const trimmed = str.trim();
  // If starts with =, +, -, @, prepend single quote for safe display/export
  if (/^[=+\-@]/.test(trimmed)) {
    return `'${str}`;
  }
  return str;
}

export class SpreadsheetService {
  static inspectAndSaveSpreadsheet(
    userId: string,
    originalFilename: string,
    tempFilePath: string
  ): SpreadsheetInfo {
    const ext = path.extname(originalFilename).toLowerCase();
    let fileType: 'csv' | 'xlsx' | 'xls';

    if (ext === '.csv') {
      fileType = 'csv';
    } else if (ext === '.xlsx') {
      fileType = 'xlsx';
    } else if (ext === '.xls') {
      fileType = 'xls';
    } else {
      fs.unlinkSync(tempFilePath);
      throw new Error(`Unsupported spreadsheet format: ${ext}. Supported formats are .xlsx, .xls, and .csv.`);
    }

    const fileBuffer = fs.readFileSync(tempFilePath);
    let sheets: string[] = [];
    let activeSheet: string = '';
    let headers: string[] = [];
    let totalRows: number = 0;
    let previewRows: Record<string, string>[] = [];

    if (fileType === 'csv') {
      const csvString = fileBuffer.toString('utf8');
      const parsed = Papa.parse<string[]>(csvString, {
        skipEmptyLines: 'greedy'
      });

      if (parsed.errors && parsed.errors.length > 0 && (!parsed.data || parsed.data.length === 0)) {
        fs.unlinkSync(tempFilePath);
        throw new Error(`Failed to parse CSV file: ${parsed.errors[0]?.message || 'Corrupt CSV format.'}`);
      }

      const rows = parsed.data.filter((r) => r && r.some((c) => String(c).trim().length > 0));
      if (rows.length === 0) {
        fs.unlinkSync(tempFilePath);
        throw new Error('Spreadsheet is empty or contains only blank lines.');
      }

      headers = rows[0].map((h, i) => (h && String(h).trim().length > 0 ? String(h).trim() : `Column_${i + 1}`));
      sheets = ['Sheet1'];
      activeSheet = 'Sheet1';
      totalRows = rows.length - 1;

      previewRows = rows.slice(1, 11).map((row) => {
        const rowObj: Record<string, string> = {};
        headers.forEach((h, idx) => {
          rowObj[h] = sanitizeCellValue(row[idx] ?? '');
        });
        return rowObj;
      });
    } else {
      // XLSX / XLS
      let workbook: XLSX.WorkBook;
      try {
        workbook = XLSX.read(fileBuffer, { type: 'buffer', cellDates: true });
      } catch (err: any) {
        fs.unlinkSync(tempFilePath);
        throw new Error(`Corrupt or unreadable Excel spreadsheet: ${err.message || 'Failed to read workbook.'}`);
      }

      sheets = workbook.SheetNames;
      if (!sheets || sheets.length === 0) {
        fs.unlinkSync(tempFilePath);
        throw new Error('Excel workbook contains no visible sheets.');
      }

      activeSheet = sheets[0];
      const worksheet = workbook.Sheets[activeSheet];
      const sheetData = this.parseWorksheet(worksheet);

      headers = sheetData.headers;
      totalRows = sheetData.totalRows;
      previewRows = sheetData.previewRows;
    }

    const id = crypto.randomUUID();
    const targetFilename = `${id}${ext}`;
    const targetFilePath = path.join(config.uploadDir, targetFilename);

    fs.renameSync(tempFilePath, targetFilePath);
    const stats = fs.statSync(targetFilePath);
    const nowIso = new Date().toISOString();

    const info: SpreadsheetInfo = {
      id,
      userId,
      filename: originalFilename,
      fileSize: stats.size,
      filePath: targetFilePath,
      fileType,
      sheets,
      activeSheet,
      headers,
      totalRows,
      previewRows,
      createdAt: nowIso
    };

    db.prepare(`
      INSERT INTO spreadsheets (
        id, user_id, filename, file_size, file_path, file_type,
        sheets, active_sheet, headers, total_rows, preview_rows, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      info.id,
      info.userId,
      info.filename,
      info.fileSize,
      info.filePath,
      info.fileType,
      JSON.stringify(info.sheets),
      info.activeSheet,
      JSON.stringify(info.headers),
      info.totalRows,
      JSON.stringify(info.previewRows),
      info.createdAt
    );

    return info;
  }

  static parseWorksheet(worksheet: XLSX.WorkSheet): {
    headers: string[];
    totalRows: number;
    previewRows: Record<string, string>[];
  } {
    // Convert worksheet to array of arrays
    const rawData = XLSX.utils.sheet_to_json<string[]>(worksheet, {
      header: 1,
      defval: '',
      blankrows: false
    });

    // Filter out completely blank rows
    const rows = rawData.filter((r) => Array.isArray(r) && r.some((c) => String(c).trim().length > 0));
    if (rows.length === 0) {
      return { headers: [], totalRows: 0, previewRows: [] };
    }

    const headers = rows[0].map((h, i) => (h && String(h).trim().length > 0 ? String(h).trim() : `Column_${i + 1}`));
    const dataRows = rows.slice(1);
    const totalRows = dataRows.length;

    const previewRows = dataRows.slice(0, 10).map((row) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, idx) => {
        obj[h] = sanitizeCellValue(row[idx] ?? '');
      });
      return obj;
    });

    return { headers, totalRows, previewRows };
  }

  static switchActiveSheet(id: string, userId: string, sheetName: string): SpreadsheetInfo {
    const spreadsheet = this.getSpreadsheet(id, userId);
    if (!spreadsheet) {
      throw new Error('Spreadsheet not found.');
    }

    if (!spreadsheet.sheets.includes(sheetName)) {
      throw new Error(`Sheet "${sheetName}" not found in workbook.`);
    }

    const fileBuffer = fs.readFileSync(spreadsheet.filePath);
    const workbook = XLSX.read(fileBuffer, { type: 'buffer', cellDates: true });
    const worksheet = workbook.Sheets[sheetName];

    if (!worksheet) {
      throw new Error(`Cannot access sheet "${sheetName}".`);
    }

    const { headers, totalRows, previewRows } = this.parseWorksheet(worksheet);

    db.prepare(`
      UPDATE spreadsheets
      SET active_sheet = ?, headers = ?, total_rows = ?, preview_rows = ?
      WHERE id = ? AND user_id = ?
    `).run(
      sheetName,
      JSON.stringify(headers),
      totalRows,
      JSON.stringify(previewRows),
      id,
      userId
    );

    return {
      ...spreadsheet,
      activeSheet: sheetName,
      headers,
      totalRows,
      previewRows
    };
  }

  static getSpreadsheet(id: string, userId: string): SpreadsheetInfo | null {
    const row = db.prepare(`
      SELECT * FROM spreadsheets WHERE id = ? AND user_id = ?
    `).get(id, userId) as any;

    if (!row) return null;

    return {
      id: row.id,
      userId: row.user_id,
      filename: row.filename,
      fileSize: row.file_size,
      filePath: row.file_path,
      fileType: row.file_type,
      sheets: JSON.parse(row.sheets || '[]'),
      activeSheet: row.active_sheet,
      headers: JSON.parse(row.headers || '[]'),
      totalRows: row.total_rows,
      previewRows: JSON.parse(row.preview_rows || '[]'),
      createdAt: row.created_at
    };
  }

  static getAllRows(
    spreadsheet: SpreadsheetInfo,
    sheetName?: string
  ): { headers: string[]; rows: Record<string, string>[] } {
    const fileBuffer = fs.readFileSync(spreadsheet.filePath);

    if (spreadsheet.fileType === 'csv') {
      const csvString = fileBuffer.toString('utf8');
      const parsed = Papa.parse<string[]>(csvString, { skipEmptyLines: 'greedy' });
      const rawRows = parsed.data.filter((r) => r && r.some((c) => String(c).trim().length > 0));
      if (rawRows.length === 0) return { headers: [], rows: [] };

      const headers = rawRows[0].map((h, i) => (h && String(h).trim().length > 0 ? String(h).trim() : `Column_${i + 1}`));
      const rows = rawRows.slice(1).map((r) => {
        const obj: Record<string, string> = {};
        headers.forEach((h, idx) => {
          obj[h] = sanitizeCellValue(r[idx] ?? '');
        });
        return obj;
      });
      return { headers, rows };
    } else {
      const workbook = XLSX.read(fileBuffer, { type: 'buffer', cellDates: true });
      const sheet = sheetName || spreadsheet.activeSheet;
      const worksheet = workbook.Sheets[sheet];
      if (!worksheet) return { headers: [], rows: [] };

      const rawData = XLSX.utils.sheet_to_json<string[]>(worksheet, {
        header: 1,
        defval: '',
        blankrows: false
      });
      const validRows = rawData.filter((r) => Array.isArray(r) && r.some((c) => String(c).trim().length > 0));
      if (validRows.length === 0) return { headers: [], rows: [] };

      const headers = validRows[0].map((h, i) => (h && String(h).trim().length > 0 ? String(h).trim() : `Column_${i + 1}`));
      const rows = validRows.slice(1).map((r) => {
        const obj: Record<string, string> = {};
        headers.forEach((h, idx) => {
          obj[h] = sanitizeCellValue(r[idx] ?? '');
        });
        return obj;
      });
      return { headers, rows };
    }
  }
}
