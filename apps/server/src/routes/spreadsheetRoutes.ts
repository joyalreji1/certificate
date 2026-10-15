import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { SpreadsheetService } from '../services/spreadsheetService';
import { ValidationService } from '../services/validationService';
import { authMiddleware } from '../middleware/auth';
import { config } from '../config';

export const spreadsheetRouter = Router();

const upload = multer({
  dest: config.uploadDir,
  limits: {
    fileSize: 30 * 1024 * 1024 // 30MB limit
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!['.xlsx', '.xls', '.csv'].includes(ext)) {
      return cb(new Error('Only Excel (.xlsx, .xls) and CSV (.csv) files are supported.'));
    }
    cb(null, true);
  }
});

spreadsheetRouter.post('/upload', authMiddleware, upload.single('spreadsheet'), (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: 'No spreadsheet file provided.' });
    return;
  }

  try {
    const spreadsheetInfo = SpreadsheetService.inspectAndSaveSpreadsheet(
      req.user!.id,
      req.file.originalname,
      req.file.path
    );
    const suggestedMappings = ValidationService.suggestMappings(spreadsheetInfo.headers);
    res.status(201).json({ spreadsheet: spreadsheetInfo, suggestedMappings });
  } catch (err: any) {
    if (req.file && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch {}
    }
    res.status(400).json({ error: err.message || 'Failed to inspect spreadsheet.' });
  }
});

spreadsheetRouter.get('/:id', authMiddleware, (req: Request, res: Response) => {
  const spreadsheet = SpreadsheetService.getSpreadsheet(req.params.id as string, req.user!.id);
  if (!spreadsheet) {
    res.status(404).json({ error: 'Spreadsheet not found.' });
    return;
  }
  const suggestedMappings = ValidationService.suggestMappings(spreadsheet.headers);
  res.json({ spreadsheet, suggestedMappings });
});

spreadsheetRouter.post('/:id/sheet', authMiddleware, (req: Request, res: Response) => {
  const { sheetName } = req.body || {};
  if (!sheetName || typeof sheetName !== 'string') {
    res.status(400).json({ error: 'sheetName is required.' });
    return;
  }

  try {
    const updated = SpreadsheetService.switchActiveSheet(req.params.id as string, req.user!.id, sheetName);
    const suggestedMappings = ValidationService.suggestMappings(updated.headers);
    res.json({ spreadsheet: updated, suggestedMappings });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to switch sheet.' });
  }
});

spreadsheetRouter.get('/:id/rows', authMiddleware, (req: Request, res: Response) => {
  const spreadsheet = SpreadsheetService.getSpreadsheet(req.params.id as string, req.user!.id);
  if (!spreadsheet) {
    res.status(404).json({ error: 'Spreadsheet not found.' });
    return;
  }
  const sheetName = (req.query.sheet as string) || spreadsheet.activeSheet;
  const { headers, rows } = SpreadsheetService.getAllRows(spreadsheet, sheetName);
  res.json({ headers, rows, totalRows: rows.length });
});

