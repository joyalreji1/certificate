import fs from 'node:fs';
import { PDFDocument, rgb, StandardFonts, PDFFont } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { FieldMapping, OverlayField, StandardFieldKeys } from '@bulk-cert/shared';

export interface SingleCertificateOptions {
  templateFilePath: string;
  selectedPage?: number;
  rowData: Record<string, string>;
  fieldMappings: FieldMapping[];
  overlayFields: OverlayField[];
}

export interface GenerationResult {
  pdfBytes: Uint8Array;
  warnings: string[];
  pageCount: number;
  fileSize: number;
  appliedFieldsCount: number;
}

export class PdfGenerationService {
  /**
   * Converts Hex color string (#RRGGBB) to pdf-lib rgb(r, g, b)
   */
  static hexToRgb(hex: string) {
    let cleanHex = hex.replace('#', '').trim();
    if (cleanHex.length === 3) {
      cleanHex = cleanHex.split('').map((c) => c + c).join('');
    }
    const num = parseInt(cleanHex, 16);
    if (isNaN(num)) return rgb(0.08, 0.08, 0.08); // default near-black
    const r = ((num >> 16) & 255) / 255;
    const g = ((num >> 8) & 255) / 255;
    const b = (num & 255) / 255;
    return rgb(r, g, b);
  }

  /**
   * Resolves text transform (trim, uppercase, title case)
   */
  static applyTransform(text: string, transform?: string): string {
    if (!text) return '';
    let res = text.trim();
    if (transform === 'upperCase') return res.toUpperCase();
    if (transform === 'lowerCase') return res.toLowerCase();
    if (transform === 'titleCase') {
      return res.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
    }
    return res;
  }

  /**
   * Word-wrapping helper
   */
  static wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
    if (!text) return [];
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      const candidate = currentLine ? `${currentLine} ${word}` : word;
      const width = font.widthOfTextAtSize(candidate, fontSize);

      if (width <= maxWidth) {
        currentLine = candidate;
      } else {
        if (currentLine) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          // Word itself is wider than maxWidth; push it anyway
          lines.push(word);
          currentLine = '';
        }
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    return lines.length > 0 ? lines : [text];
  }

  /**
   * Resolves font from StandardFonts based on family and weight
   */
  static async resolveFont(doc: PDFDocument, fontFamily: string, fontWeight: string): Promise<PDFFont> {
    const family = (fontFamily || '').toLowerCase();
    const isBold = fontWeight === 'bold';
    const isItalic = fontWeight === 'italic';

    if (family.includes('times') || family.includes('garamond') || family.includes('serif') || family.includes('playfair')) {
      if (isBold) return await doc.embedFont(StandardFonts.TimesRomanBold);
      if (isItalic) return await doc.embedFont(StandardFonts.TimesRomanItalic);
      return await doc.embedFont(StandardFonts.TimesRoman);
    }

    if (family.includes('courier') || family.includes('mono') || family.includes('code')) {
      if (isBold) return await doc.embedFont(StandardFonts.CourierBold);
      if (isItalic) return await doc.embedFont(StandardFonts.CourierOblique);
      return await doc.embedFont(StandardFonts.Courier);
    }

    // Default sans-serif (Inter, Helvetica, etc.)
    if (isBold) return await doc.embedFont(StandardFonts.HelveticaBold);
    if (isItalic) return await doc.embedFont(StandardFonts.HelveticaOblique);
    return await doc.embedFont(StandardFonts.Helvetica);
  }

  static isCharEncodable(char: string): boolean {
    const code = char.charCodeAt(0);
    if (code >= 32 && code <= 126) return true;
    if (code >= 160 && code <= 255) return true;
    const winAnsiAllowed = [0x20AC, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2013, 0x2014, 0x0152, 0x0153, 0x0160, 0x0161, 0x0178, 0x017D, 0x017E];
    return winAnsiAllowed.includes(code);
  }

  static sanitizeForStandardFont(text: string, warnings: string[], fieldLabel: string): string {
    let hasUnencodable = false;
    let sanitized = '';
    for (const char of text) {
      if (this.isCharEncodable(char)) {
        sanitized += char;
      } else {
        hasUnencodable = true;
        sanitized += '?';
      }
    }
    if (hasUnencodable) {
      warnings.push(`Field "${fieldLabel}" contains characters that cannot be encoded in standard fonts and were replaced with '?'.`);
    }
    return sanitized;
  }

  /**
   * Generates a single personalized PDF certificate with precise overlay positioning
   */
  static async generateSingleCertificate(options: SingleCertificateOptions): Promise<GenerationResult> {
    const { templateFilePath, selectedPage = 1, rowData, fieldMappings, overlayFields } = options;

    if (!fs.existsSync(templateFilePath)) {
      throw new Error(`Template file not found at: ${templateFilePath}`);
    }

    if (rowData['__inject_error'] === 'true') {
      throw new Error('Simulated processing fault for row.');
    }

    const templateBytes = fs.readFileSync(templateFilePath);
    const doc = await PDFDocument.load(templateBytes, { updateMetadata: false });
    doc.registerFontkit(fontkit);

    const pageCount = doc.getPageCount();
    const pageIdx = Math.max(0, Math.min(selectedPage - 1, pageCount - 1));
    const page = doc.getPage(pageIdx);
    const { height: pageHeight } = page.getSize();

    const warnings: string[] = [];
    let appliedCount = 0;

    for (const field of overlayFields) {
      // 1. Resolve field value from mappings and row data
      const mapping = fieldMappings.find((m) => m.fieldKey === field.key);
      let rawValue = '';

      if (mapping?.spreadsheetColumn) {
        if (!(mapping.spreadsheetColumn in rowData)) {
          warnings.push(`Mapped column "${mapping.spreadsheetColumn}" for field "${field.label}" was not found in spreadsheet.`);
        } else {
          rawValue = rowData[mapping.spreadsheetColumn] ?? '';
        }
      } else if (field.label) {
        rawValue = rowData[field.label] ?? '';
      }

      let text = this.applyTransform(rawValue, mapping?.transform);
      if (!text) {
        if (mapping?.isRequired) {
          warnings.push(`Required field "${mapping.label || field.label}" is empty in row data.`);
        }
        continue;
      }

      // 2. Resolve font & color
      const font = await this.resolveFont(doc, field.fontFamily, field.fontWeight);
      const color = this.hexToRgb(field.fontColorHex || '#141414');

      // 3. Glyphs / Unicode Check & safe replacement for standard fonts
      text = this.sanitizeForStandardFont(text, warnings, field.label);

      // 4. Auto-shrink & Wrapping calculation
      let fontSize = field.fontSize || 16;
      const minFontSize = field.minFontSize || 8;
      const lineSpacing = field.lineSpacing || 1.2;
      let lines: string[] = [];

      if (field.wrap) {
        lines = this.wrapText(text, font, fontSize, field.width);

        if (field.autoShrink) {
          let totalHeight = lines.length * fontSize * lineSpacing;
          while ((totalHeight > field.height || lines.some((l) => font.widthOfTextAtSize(l, fontSize) > field.width)) && fontSize > minFontSize) {
            fontSize = Math.max(minFontSize, fontSize - 0.5);
            lines = this.wrapText(text, font, fontSize, field.width);
            totalHeight = lines.length * fontSize * lineSpacing;
          }
        }

        const totalHeight = lines.length * fontSize * lineSpacing;
        if (totalHeight > field.height + 2) {
          warnings.push(`Field "${field.label}" overflows vertical height by ${Math.round(totalHeight - field.height)}pt at minimum font size (${fontSize}pt).`);
        }
      } else {
        // Single line
        lines = [text];
        let textWidth = font.widthOfTextAtSize(text, fontSize);

        if (field.autoShrink && textWidth > field.width) {
          while (textWidth > field.width && fontSize > minFontSize) {
            fontSize = Math.max(minFontSize, fontSize - 0.5);
            textWidth = font.widthOfTextAtSize(text, fontSize);
          }
        }

        if (textWidth > field.width + 2) {
          warnings.push(`Field "${field.label}" overflows bounding box by ${Math.round(textWidth - field.width)}pt (Text: "${text.substring(0, 30)}...").`);
        }
      }

      // 5. Precise coordinate placement
      // In PDF coordinates: origin (0,0) is at Bottom-Left.
      // In Editor coordinates: origin (0,0) is at Top-Left.
      // Box top is at `field.y` from top of page => PDF Y = pageHeight - field.y
      // Box bottom is at `pageHeight - field.y - field.height`
      const lineHeight = fontSize * lineSpacing;
      const totalBlockHeight = lines.length * lineHeight;

      let startY: number;
      if (field.verticalAnchor === 'middle') {
        // Center the block within box
        startY = pageHeight - field.y - (field.height - totalBlockHeight) / 2 - fontSize * 0.85;
      } else if (field.verticalAnchor === 'bottom') {
        startY = pageHeight - field.y - field.height + totalBlockHeight - fontSize * 0.85;
      } else {
        // top anchor
        startY = pageHeight - field.y - fontSize * 0.85;
      }

      let currentY = startY;

      for (const line of lines) {
        const lineWidth = font.widthOfTextAtSize(line, fontSize);
        let lineX = field.x;

        if (field.align === 'center') {
          lineX = field.x + (field.width - lineWidth) / 2;
        } else if (field.align === 'right') {
          lineX = field.x + (field.width - lineWidth);
        }

        page.drawText(line, {
          x: lineX,
          y: currentY,
          size: fontSize,
          font,
          color
        });

        currentY -= lineHeight;
      }

      appliedCount++;
    }

    const pdfBytes = await doc.save();

    return {
      pdfBytes,
      warnings,
      pageCount: doc.getPageCount(),
      fileSize: pdfBytes.length,
      appliedFieldsCount: appliedCount
    };
  }
}
