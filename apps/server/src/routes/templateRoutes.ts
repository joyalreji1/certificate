import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { TemplateService } from '../services/templateService';
import { authMiddleware } from '../middleware/auth';
import { config } from '../config';

export const templateRouter = Router();

const upload = multer({
  dest: config.uploadDir,
  limits: {
    fileSize: 30 * 1024 * 1024 // 30MB limit
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.pdf') {
      return cb(new Error('Only PDF templates are accepted.'));
    }
    cb(null, true);
  }
});

templateRouter.post('/upload', authMiddleware, upload.single('template'), async (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: 'No template PDF file provided.' });
    return;
  }

  try {
    const templateInfo = await TemplateService.inspectAndSaveTemplate(
      req.user!.id,
      req.file.originalname,
      req.file.path
    );
    res.status(201).json({ template: templateInfo });
  } catch (err: any) {
    if (req.file && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch {}
    }
    res.status(400).json({ error: err.message || 'Failed to inspect PDF template.' });
  }
});

templateRouter.get('/:id', authMiddleware, (req: Request, res: Response) => {
  const template = TemplateService.getTemplate(req.params.id as string, req.user!.id);
  if (!template) {
    res.status(404).json({ error: 'Template not found.' });
    return;
  }
  res.json({ template });
});

templateRouter.get('/:id/file', authMiddleware, (req: Request, res: Response) => {
  const template = TemplateService.getTemplate(req.params.id as string, req.user!.id);
  if (!template || !fs.existsSync(template.filePath)) {
    res.status(404).json({ error: 'Template file not found.' });
    return;
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${template.filename}"`);
  fs.createReadStream(template.filePath).pipe(res);
});
