import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fs from 'node:fs';
import path from 'node:path';

async function createPortraitTemplate() {
  const doc = await PDFDocument.create();
  // A4 portrait: 595.28 x 841.89 points
  const page = doc.addPage([595.28, 841.89]);
  const fontHelvetica = await doc.embedFont(StandardFonts.Helvetica);
  const fontHelveticaBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontTimes = await doc.embedFont(StandardFonts.TimesRomanItalic);

  const { width, height } = page.getSize();

  // Outer border
  page.drawRectangle({
    x: 20,
    y: 20,
    width: width - 40,
    height: height - 40,
    borderColor: rgb(0.12, 0.16, 0.24), // Dark navy
    borderWidth: 3,
  });

  // Inner gold border
  page.drawRectangle({
    x: 28,
    y: 28,
    width: width - 56,
    height: height - 56,
    borderColor: rgb(0.83, 0.68, 0.21), // Gold
    borderWidth: 1.5,
  });

  // Header Title
  const title = 'CERTIFICATE OF ACHIEVEMENT';
  const titleWidth = fontHelveticaBold.widthOfTextAtSize(title, 26);
  page.drawText(title, {
    x: (width - titleWidth) / 2,
    y: height - 120,
    size: 26,
    font: fontHelveticaBold,
    color: rgb(0.12, 0.16, 0.24),
  });

  // Subtitle
  const sub = 'THIS IS PROUDLY PRESENTED TO';
  const subWidth = fontHelvetica.widthOfTextAtSize(sub, 12);
  page.drawText(sub, {
    x: (width - subWidth) / 2,
    y: height - 160,
    size: 12,
    font: fontHelvetica,
    color: rgb(0.4, 0.45, 0.5),
  });

  // Middle text
  const middle = 'for successful participation and exceptional contributions in';
  const middleWidth = fontTimes.widthOfTextAtSize(middle, 14);
  page.drawText(middle, {
    x: (width - middleWidth) / 2,
    y: height - 320,
    size: 14,
    font: fontTimes,
    color: rgb(0.3, 0.3, 0.3),
  });

  // Date and signature placeholders at bottom
  page.drawLine({
    start: { x: 80, y: 150 },
    end: { x: 230, y: 150 },
    thickness: 1,
    color: rgb(0.5, 0.5, 0.5),
  });
  page.drawText('DATE OF CONFERRAL', {
    x: 100,
    y: 135,
    size: 9,
    font: fontHelvetica,
    color: rgb(0.5, 0.5, 0.5),
  });

  page.drawLine({
    start: { x: width - 230, y: 150 },
    end: { x: width - 80, y: 150 },
    thickness: 1,
    color: rgb(0.5, 0.5, 0.5),
  });
  page.drawText('AUTHORIZED SIGNATURE', {
    x: width - 215,
    y: 135,
    size: 9,
    font: fontHelvetica,
    color: rgb(0.5, 0.5, 0.5),
  });

  const pdfBytes = await doc.save();
  const outputPath = path.resolve(__dirname, '../../../tests/fixtures/modern-portrait-template.pdf');
  fs.writeFileSync(outputPath, pdfBytes);
  console.log('Successfully generated modern-portrait-template.pdf at', outputPath);
}

createPortraitTemplate().catch(console.error);
