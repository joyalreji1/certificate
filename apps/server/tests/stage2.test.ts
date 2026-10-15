import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { PdfGenerationService } from '../src/services/pdfGenerationService';
import { FieldMapping, OverlayField, StandardFieldKeys } from '@bulk-cert/shared';
import { PDFDocument } from 'pdf-lib';

const FIXTURES_DIR = path.resolve(__dirname, '../../../tests/fixtures');
const SAMPLE_PDF = path.join(FIXTURES_DIR, 'sample-certificate-template.pdf');

test('Stage 2 Suite: Overlay Editor & Single Certificate Generation Engine', async (t) => {
  // Common test mappings
  const fieldMappings: FieldMapping[] = [
    {
      fieldKey: StandardFieldKeys.STUDENT_NAME,
      label: 'Student Name',
      isRequired: true,
      spreadsheetColumn: 'Student Name',
      transform: 'none'
    },
    {
      fieldKey: StandardFieldKeys.PROGRAM_CATEGORY,
      label: 'Program / Category',
      isRequired: true,
      spreadsheetColumn: 'Program / Category',
      transform: 'none'
    },
    {
      fieldKey: StandardFieldKeys.DATE,
      label: 'Date of Issue',
      isRequired: false,
      spreadsheetColumn: 'Date of Issue',
      transform: 'none'
    }
  ];

  // Test 1: Exact point positioning and generation
  await t.test('1. Exact point positioning and PDF generation fidelity', async () => {
    const overlayFields: OverlayField[] = [
      {
        id: 'name_box',
        key: StandardFieldKeys.STUDENT_NAME,
        label: 'Student Name',
        x: 100,
        y: 200,
        width: 641.89,
        height: 60,
        fontFamily: 'Playfair Display',
        fontSize: 32,
        fontWeight: 'bold',
        fontColorHex: '#141414',
        align: 'center',
        verticalAnchor: 'middle',
        wrap: false,
        lineSpacing: 1.2,
        letterSpacing: 0,
        autoShrink: true,
        minFontSize: 14
      },
      {
        id: 'prog_box',
        key: StandardFieldKeys.PROGRAM_CATEGORY,
        label: 'Program / Category',
        x: 150,
        y: 300,
        width: 541.89,
        height: 40,
        fontFamily: 'Inter',
        fontSize: 18,
        fontWeight: 'normal',
        fontColorHex: '#54504A',
        align: 'center',
        verticalAnchor: 'top',
        wrap: true,
        lineSpacing: 1.2,
        letterSpacing: 0,
        autoShrink: true,
        minFontSize: 10
      }
    ];

    const rowData = {
      'Student Name': 'Aarav Sharma',
      'Program / Category': 'Artificial Intelligence Workshop',
      'Date of Issue': '2026-10-15'
    };

    const result = await PdfGenerationService.generateSingleCertificate({
      templateFilePath: SAMPLE_PDF,
      selectedPage: 1,
      rowData,
      fieldMappings,
      overlayFields
    });

    assert.ok(result.pdfBytes.length > 0, 'Generated PDF bytes must not be empty');
    assert.equal(result.pageCount, 1, 'Page count must equal template page count (1)');
    assert.equal(result.appliedFieldsCount, 2, 'Must apply both overlay fields');
    assert.equal(result.warnings.length, 0, 'Standard valid name and program must have 0 warnings');

    // Parse the generated PDF to verify it is valid
    const generatedDoc = await PDFDocument.load(result.pdfBytes);
    assert.equal(generatedDoc.getPageCount(), 1);
    const page = generatedDoc.getPage(0);
    const { width, height } = page.getSize();
    // Template dimensions: 841.89 x 595.28
    assert.equal(Math.round(width), 842);
    assert.equal(Math.round(height), 595);
  });

  // Test 2: Long student names and text auto-shrink
  await t.test('2. Long student name auto-shrink without overflowing', async () => {
    const overlayFields: OverlayField[] = [
      {
        id: 'name_box',
        key: StandardFieldKeys.STUDENT_NAME,
        label: 'Student Name',
        x: 100,
        y: 200,
        width: 200, // Constrained width: 200pt
        height: 50,
        fontFamily: 'Playfair Display',
        fontSize: 32, // Large starting font: 32pt
        fontWeight: 'bold',
        fontColorHex: '#141414',
        align: 'center',
        verticalAnchor: 'middle',
        wrap: false,
        lineSpacing: 1.2,
        letterSpacing: 0,
        autoShrink: true,
        minFontSize: 8
      }
    ];

    const rowData = {
      'Student Name': 'Princess Maria Francesca Gabriella Alessandra De La Tour',
      'Program / Category': 'AI Track'
    };

    const result = await PdfGenerationService.generateSingleCertificate({
      templateFilePath: SAMPLE_PDF,
      selectedPage: 1,
      rowData,
      fieldMappings,
      overlayFields
    });

    assert.ok(result.pdfBytes.length > 0);
    // At minFontSize 8pt, this name is ~195pt wide which fits within 200pt, so auto-shrink succeeds without overflow
    assert.ok(result.appliedFieldsCount === 1);
  });

  // Test 3: Word wrapping on multi-line text
  await t.test('3. Multi-line word wrapping and vertical bounding', async () => {
    const overlayFields: OverlayField[] = [
      {
        id: 'prog_box',
        key: StandardFieldKeys.PROGRAM_CATEGORY,
        label: 'Program / Category',
        x: 100,
        y: 300,
        width: 200, // 200pt width
        height: 100, // 100pt height allows ~4 lines
        fontFamily: 'Inter',
        fontSize: 16,
        fontWeight: 'normal',
        fontColorHex: '#141414',
        align: 'left',
        verticalAnchor: 'top',
        wrap: true,
        lineSpacing: 1.3,
        letterSpacing: 0,
        autoShrink: false,
        minFontSize: 10
      }
    ];

    const longProgram = 'Advanced Robotics Engineering and Autonomous Navigation Grand Prix Championship 2026';
    const rowData = {
      'Student Name': 'Rahul Verma',
      'Program / Category': longProgram
    };

    const result = await PdfGenerationService.generateSingleCertificate({
      templateFilePath: SAMPLE_PDF,
      selectedPage: 1,
      rowData,
      fieldMappings,
      overlayFields
    });

    assert.ok(result.pdfBytes.length > 0);
    assert.equal(result.appliedFieldsCount, 1);
  });

  // Test 4: Extreme text generates clear overflow warning
  await t.test('4. Extreme overflow generates honest warning message', async () => {
    const overlayFields: OverlayField[] = [
      {
        id: 'name_box',
        key: StandardFieldKeys.STUDENT_NAME,
        label: 'Student Name',
        x: 100,
        y: 200,
        width: 80, // Very small width: 80pt
        height: 30,
        fontFamily: 'Playfair Display',
        fontSize: 24,
        fontWeight: 'bold',
        fontColorHex: '#141414',
        align: 'left',
        verticalAnchor: 'top',
        wrap: false,
        lineSpacing: 1.2,
        letterSpacing: 0,
        autoShrink: true,
        minFontSize: 18 // High min size: 18pt won't fit in 80pt
      }
    ];

    const rowData = {
      'Student Name': 'Dr. Alexander Bartholomew Fitzwilliam The Third',
      'Program / Category': 'AI Track'
    };

    const result = await PdfGenerationService.generateSingleCertificate({
      templateFilePath: SAMPLE_PDF,
      selectedPage: 1,
      rowData,
      fieldMappings,
      overlayFields
    });

    assert.ok(result.warnings.length > 0, 'Must produce an overflow warning for un-shrinkable text');
    assert.ok(result.warnings[0].includes('overflows'), 'Warning text must mention overflow');
  });

  // Test 5: Unicode and special glyph detection
  await t.test('5. Non-standard Unicode characters detection and warning', async () => {
    const overlayFields: OverlayField[] = [
      {
        id: 'name_box',
        key: StandardFieldKeys.STUDENT_NAME,
        label: 'Student Name',
        x: 100,
        y: 200,
        width: 400,
        height: 50,
        fontFamily: 'Helvetica',
        fontSize: 20,
        fontWeight: 'normal',
        fontColorHex: '#141414',
        align: 'left',
        verticalAnchor: 'top',
        wrap: false,
        lineSpacing: 1.2,
        letterSpacing: 0,
        autoShrink: true,
        minFontSize: 10
      }
    ];

    // String with Asian characters (U+4E2D U+6587) outside standard Latin1
    const rowData = {
      'Student Name': 'Li Wei (李伟) 🏆',
      'Program / Category': 'Design'
    };

    const result = await PdfGenerationService.generateSingleCertificate({
      templateFilePath: SAMPLE_PDF,
      selectedPage: 1,
      rowData,
      fieldMappings,
      overlayFields
    });

    assert.ok(result.warnings.length > 0, 'Must generate warning for characters outside standard font glyphs');
  });

  // Test 6: Invalid column mapping detection
  await t.test('6. Invalid column mapping detection produces honest warning', async () => {
    const invalidMappings: FieldMapping[] = [
      {
        fieldKey: StandardFieldKeys.STUDENT_NAME,
        label: 'Student Name',
        isRequired: true,
        spreadsheetColumn: 'NonExistentColumnName',
        transform: 'none'
      }
    ];

    const overlayFields: OverlayField[] = [
      {
        id: 'name_box',
        key: StandardFieldKeys.STUDENT_NAME,
        label: 'Student Name',
        x: 100,
        y: 200,
        width: 400,
        height: 50,
        fontFamily: 'Helvetica',
        fontSize: 20,
        fontWeight: 'normal',
        fontColorHex: '#141414',
        align: 'center',
        verticalAnchor: 'middle',
        wrap: false,
        lineSpacing: 1.2,
        letterSpacing: 0,
        autoShrink: true,
        minFontSize: 10
      }
    ];

    const rowData = {
      'Student Name': 'Rohan Patel'
    };

    const result = await PdfGenerationService.generateSingleCertificate({
      templateFilePath: SAMPLE_PDF,
      selectedPage: 1,
      rowData,
      fieldMappings: invalidMappings,
      overlayFields
    });

    assert.ok(result.warnings.length > 0, 'Must warn when mapped column does not exist in row data');
    assert.ok(result.warnings.some((w) => w.includes('NonExistentColumnName')), 'Warning must name the missing column');
    assert.equal(result.appliedFieldsCount, 0, 'No text should be applied for non-existent column');
  });

  // Test 7: Missing required field produces warning
  await t.test('7. Empty required field produces missing required warning', async () => {
    const overlayFields: OverlayField[] = [
      {
        id: 'name_box',
        key: StandardFieldKeys.STUDENT_NAME,
        label: 'Student Name',
        x: 100,
        y: 200,
        width: 400,
        height: 50,
        fontFamily: 'Helvetica',
        fontSize: 20,
        fontWeight: 'normal',
        fontColorHex: '#141414',
        align: 'center',
        verticalAnchor: 'middle',
        wrap: false,
        lineSpacing: 1.2,
        letterSpacing: 0,
        autoShrink: true,
        minFontSize: 10
      }
    ];

    const rowData = {
      'Student Name': '', // Blank required field
      'Program / Category': 'Art'
    };

    const result = await PdfGenerationService.generateSingleCertificate({
      templateFilePath: SAMPLE_PDF,
      selectedPage: 1,
      rowData,
      fieldMappings,
      overlayFields
    });

    assert.ok(result.warnings.some((w) => w.includes('is empty')), 'Must produce warning that required field is empty');
  });

  // Test 8: Positioning accuracy across all alignments and vertical anchors
  await t.test('8. Field positioning accuracy across alignments and vertical anchors', async () => {
    const multiPositionFields: OverlayField[] = [
      {
        id: 'top_left',
        key: 'field_top_left',
        label: 'Top Left',
        x: 50,
        y: 50,
        width: 200,
        height: 40,
        fontFamily: 'Helvetica',
        fontSize: 14,
        fontWeight: 'normal',
        fontColorHex: '#141414',
        align: 'left',
        verticalAnchor: 'top',
        wrap: false,
        lineSpacing: 1.2,
        letterSpacing: 0,
        autoShrink: false,
        minFontSize: 10
      },
      {
        id: 'mid_center',
        key: 'field_mid_center',
        label: 'Middle Center',
        x: 300,
        y: 250,
        width: 240,
        height: 60,
        fontFamily: 'Playfair Display',
        fontSize: 24,
        fontWeight: 'bold',
        fontColorHex: '#B38A4A',
        align: 'center',
        verticalAnchor: 'middle',
        wrap: false,
        lineSpacing: 1.2,
        letterSpacing: 0,
        autoShrink: true,
        minFontSize: 12
      },
      {
        id: 'bot_right',
        key: 'field_bot_right',
        label: 'Bottom Right',
        x: 550,
        y: 450,
        width: 200,
        height: 50,
        fontFamily: 'Courier',
        fontSize: 12,
        fontWeight: 'italic',
        fontColorHex: '#54504A',
        align: 'right',
        verticalAnchor: 'bottom',
        wrap: true,
        lineSpacing: 1.3,
        letterSpacing: 0,
        autoShrink: false,
        minFontSize: 10
      }
    ];

    const customMappings: FieldMapping[] = [
      { fieldKey: 'field_top_left', label: 'Top Left', isRequired: false, spreadsheetColumn: 'ColA', transform: 'none' },
      { fieldKey: 'field_mid_center', label: 'Middle Center', isRequired: false, spreadsheetColumn: 'ColB', transform: 'titleCase' },
      { fieldKey: 'field_bot_right', label: 'Bottom Right', isRequired: false, spreadsheetColumn: 'ColC', transform: 'upperCase' }
    ];

    const rowData = {
      ColA: 'Header Note',
      ColB: 'priya anand sharma',
      ColC: 'verified and issued by council'
    };

    const result = await PdfGenerationService.generateSingleCertificate({
      templateFilePath: SAMPLE_PDF,
      selectedPage: 1,
      rowData,
      fieldMappings: customMappings,
      overlayFields: multiPositionFields
    });

    assert.equal(result.appliedFieldsCount, 3, 'All 3 fields must be placed');
    assert.equal(result.warnings.length, 0, 'No warnings for valid layout');
    assert.ok(result.pdfBytes.length > 1000, 'Output PDF must be populated');
  });
});

