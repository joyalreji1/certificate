import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';

const FIXTURES_DIR = path.resolve(__dirname, '../../../tests/fixtures');
fs.mkdirSync(FIXTURES_DIR, { recursive: true });

export async function generateSamplePdf(): Promise<string> {
  const doc = await PDFDocument.create();
  // Landscape A4: 841.89 x 595.28 pt
  const page = doc.addPage([841.89, 595.28]);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);

  // Outer border
  page.drawRectangle({
    x: 30,
    y: 30,
    width: 841.89 - 60,
    height: 595.28 - 60,
    borderColor: rgb(0.7, 0.54, 0.29), // Gold border
    borderWidth: 3
  });

  // Inner border
  page.drawRectangle({
    x: 40,
    y: 40,
    width: 841.89 - 80,
    height: 595.28 - 80,
    borderColor: rgb(0.2, 0.2, 0.2),
    borderWidth: 1
  });

  // Certificate Header
  page.drawText('ACADEMY OF ARTS & TECHNOLOGY', {
    x: 260,
    y: 510,
    size: 18,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1)
  });

  page.drawText('CERTIFICATE OF RECOGNITION', {
    x: 230,
    y: 460,
    size: 26,
    font: fontBold,
    color: rgb(0.7, 0.54, 0.29)
  });

  page.drawText('This certificate is proudly awarded to', {
    x: 310,
    y: 420,
    size: 14,
    font: fontRegular,
    color: rgb(0.3, 0.3, 0.3)
  });

  // Footer labels
  page.drawText('Authorized Signature', {
    x: 120,
    y: 80,
    size: 11,
    font: fontRegular,
    color: rgb(0.3, 0.3, 0.3)
  });

  page.drawText('Program Director', {
    x: 620,
    y: 80,
    size: 11,
    font: fontRegular,
    color: rgb(0.3, 0.3, 0.3)
  });

  const pdfBytes = await doc.save();
  const filePath = path.join(FIXTURES_DIR, 'sample-certificate-template.pdf');
  fs.writeFileSync(filePath, pdfBytes);
  console.log('[Fixtures] Generated sample PDF template at:', filePath);
  return filePath;
}

export function generateSpreadsheetFixtures(): { xlsxPath: string; csvPath: string } {
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

  const firstNames = ['Aarav', 'Ananya', 'Rohan', 'Priya', 'Kavya', 'Rahul', 'Sneha', 'Vikram', 'Meera', 'Arjun', 'Isha', 'Aditya', 'Devi', 'Karthik', 'Sanjana'];
  const lastNames = ['Sharma', 'Iyer', 'Patel', 'Menon', 'Verma', 'Nair', 'Reddy', 'Rao', 'Singh', 'Deshmukh', 'Gupta', 'Pillai', 'Kumar', 'Joshi', 'Bose'];
  const programs = ['Artificial Intelligence Workshop', 'Classical Dance Solo', 'Robotics Grand Prix', 'Web Development Hackathon', 'Debate Championship', 'Western Vocals Competition'];
  const institutions = ['Apex Institute of Technology', 'National Arts College', 'Metropolitan University', 'St. Xavier Science Academy', 'Horizon Tech Campus'];
  const positions = ['First Prize', 'Second Prize', 'Third Prize', 'Outstanding Performer', 'Special Mention', 'Participant'];

  const rows: string[][] = [headers];

  // Generate 220 total rows with explicit seeded test cases
  for (let i = 1; i <= 220; i++) {
    const certId = `CERT-2026-${String(i).padStart(4, '0')}`;
    const fn = firstNames[i % firstNames.length];
    const ln = lastNames[(i * 3) % lastNames.length];
    const name = `${fn} ${ln}`;
    const program = programs[i % programs.length];
    const inst = institutions[i % institutions.length];
    const cls = `Year ${(i % 4) + 1}`;
    const pos = positions[i % positions.length];
    const date = '2026-10-15';

    // Seeded Edge Cases
    if (i === 15) {
      // Missing Student Name (empty)
      rows.push(['', program, inst, cls, pos, 'TechFest 2026', date, certId]);
    } else if (i === 30) {
      // Missing Program (empty)
      rows.push([name, '', inst, cls, pos, 'TechFest 2026', date, certId]);
    } else if (i === 45) {
      // Whitespace-only Student Name
      rows.push(['   \t   ', program, inst, cls, pos, 'TechFest 2026', date, certId]);
    } else if (i === 60) {
      // Whitespace-only Program
      rows.push([name, '     ', inst, cls, pos, 'TechFest 2026', date, certId]);
    } else if (i === 75) {
      // Exact duplicate of Row 10 (data row 10 is spreadsheet row 11)
      const row10 = [...rows[10]];
      rows.push(row10);
    } else if (i === 90) {
      // Same student name + same program as Row 12, but different certId/date
      const row12 = rows[12];
      rows.push([row12[0], row12[1], inst, cls, 'Consolation Prize', 'TechFest 2026', '2026-10-16', certId]);
    } else if (i === 110) {
      // Overlong name (> 120 chars)
      const longName = 'Princess Maria Francesca Gabriella Alessandra De La Tour D Auvergne De Bouillon De Rohan-Chabot Of The Grand Duchy Of Luxembourg';
      rows.push([longName, program, inst, cls, pos, 'TechFest 2026', date, certId]);
    } else if (i === 130) {
      // Formula injection attempt
      rows.push(['=cmd|"/c calc"!A0', program, inst, cls, pos, 'TechFest 2026', date, certId]);
    } else if (i === 150) {
      // Special characters & Unicode
      rows.push(['Zoë Chloë Björn-O\'Connor & François', program, inst, cls, pos, 'TechFest 2026', date, certId]);
    } else {
      // Regular valid row
      rows.push([name, program, inst, cls, pos, 'TechFest 2026', date, certId]);
    }
  }

  // Create XLSX with multiple sheets
  const wb = XLSX.utils.book_new();

  // Sheet 1: Main Batch (220 rows)
  const ws1 = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws1, 'Main Batch');

  // Sheet 2: Workshop Participants (25 rows)
  const ws2Data = [
    ['Participant Name', 'Workshop Topic', 'College', 'Date'],
    ['Devanathan K', 'Quantum Computing', 'National Tech', '2026-10-14'],
    ['Sara Johnson', 'Design Systems', 'Apex University', '2026-10-14']
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(ws2Data);
  XLSX.utils.book_append_sheet(wb, ws2, 'Workshop Track');

  // Sheet 3: Empty Sheet
  const ws3 = XLSX.utils.aoa_to_sheet([]);
  XLSX.utils.book_append_sheet(wb, ws3, 'Archived');

  const xlsxPath = path.join(FIXTURES_DIR, 'students-200-rows.xlsx');
  XLSX.writeFile(wb, xlsxPath);
  console.log('[Fixtures] Generated multi-sheet XLSX at:', xlsxPath);

  // Generate CSV from rows
  const csvContent = Papa.unparse(rows);
  const csvPath = path.join(FIXTURES_DIR, 'students-200-rows.csv');
  fs.writeFileSync(csvPath, csvContent, 'utf8');
  console.log('[Fixtures] Generated CSV at:', csvPath);

  // Generate corrupt PDF
  const corruptPath = path.join(FIXTURES_DIR, 'corrupt-file.pdf');
  fs.writeFileSync(corruptPath, 'THIS_IS_NOT_A_VALID_PDF_HEADER_OR_DATA', 'utf8');

  return { xlsxPath, csvPath };
}

if (require.main === module) {
  (async () => {
    await generateSamplePdf();
    generateSpreadsheetFixtures();
    console.log('[Fixtures] All test fixtures created successfully.');
  })();
}
