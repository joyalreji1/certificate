export interface User {
  id: string;
  loginName: string;
  passwordHash: string;
  mustChangePassword: boolean;
  failedAttempts: number;
  lockedUntil: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserDTO {
  id: string;
  loginName: string;
  mustChangePassword: boolean;
  createdAt: string;
}

export interface Session {
  id: string;
  userId: string;
  expiresAt: string;
  createdAt: string;
  lastActiveAt: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface TemplateInfo {
  id: string;
  userId: string;
  filename: string;
  fileSize: number;
  filePath: string;
  pageCount: number;
  pageSizePoints: {
    width: number;
    height: number;
  };
  pageSizeMm: {
    width: number;
    height: number;
  };
  rotation: number;
  embeddedFonts: string[];
  isEncrypted: boolean;
  createdAt: string;
}

export interface SpreadsheetInfo {
  id: string;
  userId: string;
  filename: string;
  fileSize: number;
  filePath: string;
  fileType: 'csv' | 'xlsx' | 'xls';
  sheets: string[];
  activeSheet: string;
  headers: string[];
  totalRows: number;
  previewRows: Record<string, string>[];
  createdAt: string;
}

export const StandardFieldKeys = {
  STUDENT_NAME: 'STUDENT_NAME',
  PROGRAM_CATEGORY: 'PROGRAM_CATEGORY',
  INSTITUTION: 'INSTITUTION',
  CLASS_GRADE: 'CLASS_GRADE',
  POSITION: 'POSITION',
  EVENT_NAME: 'EVENT_NAME',
  DATE: 'DATE',
  CERTIFICATE_ID: 'CERTIFICATE_ID'
} as const;

export type StandardFieldKey = (typeof StandardFieldKeys)[keyof typeof StandardFieldKeys];

export interface FieldMapping {
  fieldKey: string;
  label: string;
  isRequired: boolean;
  spreadsheetColumn: string | null;
  transform?: 'none' | 'titleCase' | 'upperCase' | 'lowerCase' | 'trim';
}

export interface OverlayField {
  id: string;
  key: string;
  label: string;
  x: number; // in PDF points (72 pt = 1 inch), origin from top-left or bottom-left (we store in points from bottom-left or top-left, explicitly defined)
  y: number; // in PDF points
  width: number; // in PDF points
  height: number; // in PDF points
  fontFamily: string; // e.g. 'Cormorant Garamond', 'Playfair Display', 'EB Garamond', 'Inter', 'Great Vibes'
  fontSize: number;
  fontWeight: 'normal' | 'bold' | 'italic';
  fontColorHex: string;
  align: 'left' | 'center' | 'right';
  verticalAnchor: 'top' | 'middle' | 'bottom';
  wrap: boolean;
  lineSpacing: number; // multiplier, e.g. 1.2
  letterSpacing: number; // points
  autoShrink: boolean;
  minFontSize: number;
}

export interface RowValidationError {
  rowIndex: number; // 1-indexed spreadsheet row
  column: string;
  value: string;
  code:
    | 'MISSING_REQUIRED'
    | 'WHITESPACE_ONLY'
    | 'EXACT_DUPLICATE'
    | 'DUPLICATE_NAME_PROGRAM'
    | 'OVERLONG_VALUE'
    | 'UNSUPPORTED_GLYPHS'
    | 'CUSTOM';
  message: string;
  severity: 'error' | 'warning';
}

export interface DuplicateRecord {
  rowIndex: number;
  duplicateOf: number;
  type: 'exact' | 'name_program';
}

export interface RowValidationSummary {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  excludedRows: number[];
  errors: RowValidationError[];
  duplicates: DuplicateRecord[];
}

export interface Batch {
  id: string;
  userId: string;
  name: string;
  templateId: string;
  spreadsheetId: string;
  activeSheet: string;
  selectedPage: number;
  fieldMappings: FieldMapping[];
  overlayFields: OverlayField[];
  excludedRows: number[];
  status: 'draft' | 'configured' | 'processing' | 'completed' | 'failed' | 'paused';
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

export interface RowResult {
  rowIndex: number;
  status: 'pending' | 'success' | 'failed' | 'skipped';
  error?: string;
  outputFilename?: string;
  driveFileId?: string;
  driveWebViewLink?: string;
}

export interface DriveUpload {
  target: 'individual' | 'combined' | 'zip';
  status: 'not_started' | 'pending' | 'uploading' | 'succeeded' | 'failed';
  fileId?: string;
  webViewLink?: string;
  error?: string;
  attempts: number;
}

export interface JobState {
  id: string;
  batchId: string;
  userId: string;
  status: 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  totalRows: number;
  processedRows: number;
  succeededRows: number;
  failedRows: number;
  currentRow: number;
  startedAt: string | null;
  completedAt: string | null;
  elapsedSeconds: number;
  estimatedRemainingSeconds: number;
  combinedPdfPath?: string;
  zipPath?: string;
  driveUploads: DriveUpload[];
  rowResults: RowResult[];
}
