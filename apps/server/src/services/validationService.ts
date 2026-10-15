import {
  FieldMapping,
  RowValidationError,
  RowValidationSummary,
  StandardFieldKeys,
  DuplicateRecord
} from '@bulk-cert/shared';

export class ValidationService {
  /**
   * Auto-suggests column mappings based on detected header names
   */
  static suggestMappings(headers: string[]): FieldMapping[] {
    const suggestions: FieldMapping[] = [
      {
        fieldKey: StandardFieldKeys.STUDENT_NAME,
        label: 'Student Name',
        isRequired: true,
        spreadsheetColumn: null,
        transform: 'none'
      },
      {
        fieldKey: StandardFieldKeys.PROGRAM_CATEGORY,
        label: 'Program / Category',
        isRequired: false, // Only student names are strictly required unless a program column is mapped
        spreadsheetColumn: null,
        transform: 'none'
      },
      {
        fieldKey: StandardFieldKeys.INSTITUTION,
        label: 'Institution / Organization',
        isRequired: false,
        spreadsheetColumn: null,
        transform: 'none'
      },
      {
        fieldKey: StandardFieldKeys.CLASS_GRADE,
        label: 'Class / Grade / Year',
        isRequired: false,
        spreadsheetColumn: null,
        transform: 'none'
      },
      {
        fieldKey: StandardFieldKeys.POSITION,
        label: 'Position / Rank / Award',
        isRequired: false,
        spreadsheetColumn: null,
        transform: 'none'
      },
      {
        fieldKey: StandardFieldKeys.EVENT_NAME,
        label: 'Event Name',
        isRequired: false,
        spreadsheetColumn: null,
        transform: 'none'
      },
      {
        fieldKey: StandardFieldKeys.DATE,
        label: 'Date of Issue',
        isRequired: false,
        spreadsheetColumn: null,
        transform: 'none'
      },
      {
        fieldKey: StandardFieldKeys.CERTIFICATE_ID,
        label: 'Certificate ID / Serial',
        isRequired: false,
        spreadsheetColumn: null,
        transform: 'none'
      }
    ];

    const lowerHeaders = headers.map((h) => h.toLowerCase().trim());

    for (const mapping of suggestions) {
      if (mapping.fieldKey === StandardFieldKeys.STUDENT_NAME) {
        const idx = lowerHeaders.findIndex((h) =>
          h.includes('student') || h.includes('name') || h.includes('candidate') || h.includes('participant')
        );
        if (idx !== -1) mapping.spreadsheetColumn = headers[idx];
      } else if (mapping.fieldKey === StandardFieldKeys.PROGRAM_CATEGORY) {
        const idx = lowerHeaders.findIndex((h) =>
          h.includes('program') || h.includes('category') || h.includes('course') || h.includes('track') || h.includes('event')
        );
        if (idx !== -1) {
          mapping.spreadsheetColumn = headers[idx];
          mapping.isRequired = true;
        }
      } else if (mapping.fieldKey === StandardFieldKeys.INSTITUTION) {
        const idx = lowerHeaders.findIndex((h) =>
          h.includes('college') || h.includes('institution') || h.includes('school') || h.includes('university') || h.includes('org')
        );
        if (idx !== -1) mapping.spreadsheetColumn = headers[idx];
      } else if (mapping.fieldKey === StandardFieldKeys.CLASS_GRADE) {
        const idx = lowerHeaders.findIndex((h) =>
          h.includes('class') || h.includes('grade') || h.includes('dept') || h.includes('department') || h.includes('year')
        );
        if (idx !== -1) mapping.spreadsheetColumn = headers[idx];
      } else if (mapping.fieldKey === StandardFieldKeys.POSITION) {
        const idx = lowerHeaders.findIndex((h) =>
          h.includes('position') || h.includes('rank') || h.includes('place') || h.includes('prize') || h.includes('award')
        );
        if (idx !== -1) mapping.spreadsheetColumn = headers[idx];
      } else if (mapping.fieldKey === StandardFieldKeys.EVENT_NAME) {
        const idx = lowerHeaders.findIndex((h) =>
          h.includes('event name') || h.includes('fest') || h.includes('workshop')
        );
        if (idx !== -1) mapping.spreadsheetColumn = headers[idx];
      } else if (mapping.fieldKey === StandardFieldKeys.DATE) {
        const idx = lowerHeaders.findIndex((h) =>
          h.includes('date') || h.includes('issued') || h.includes('day')
        );
        if (idx !== -1) mapping.spreadsheetColumn = headers[idx];
      } else if (mapping.fieldKey === StandardFieldKeys.CERTIFICATE_ID) {
        const idx = lowerHeaders.findIndex((h) =>
          h.includes('cert') || h.includes('serial') || h.includes('reg') || h.includes('roll') || h === 'id' || h === 'sl no'
        );
        if (idx !== -1) mapping.spreadsheetColumn = headers[idx];
      }
    }

    return suggestions;
  }

  /**
   * Validates all rows against the given field mappings
   */
  static validateRows(
    rows: Record<string, string>[],
    mappings: FieldMapping[],
    excludedRowIndicesOrOptions: number[] | { globalProgramName?: string } = [],
    options?: { globalProgramName?: string }
  ): RowValidationSummary {
    let excludedRowIndices: number[] = [];
    let opts = options;
    if (Array.isArray(excludedRowIndicesOrOptions)) {
      excludedRowIndices = excludedRowIndicesOrOptions;
    } else if (excludedRowIndicesOrOptions && typeof excludedRowIndicesOrOptions === 'object') {
      opts = excludedRowIndicesOrOptions;
    }

    const errors: RowValidationError[] = [];
    const duplicates: DuplicateRecord[] = [];
    const excludedSet = new Set(excludedRowIndices);
    const hasGlobalProgram = !!(opts?.globalProgramName && opts.globalProgramName.trim());

    const nameMapping = mappings.find((m) => m.fieldKey === StandardFieldKeys.STUDENT_NAME);
    const programMapping = mappings.find((m) => m.fieldKey === StandardFieldKeys.PROGRAM_CATEGORY);

    // Maps for duplicate tracking: string hash -> original source row index
    const exactRowMap = new Map<string, number>();
    const nameProgramMap = new Map<string, number>();

    const invalidRowIndices = new Set<number>();

    rows.forEach((row, idx) => {
      // 1-indexed spreadsheet data row number (Row 1 was header in original spreadsheet, data starts at Row 2)
      const sourceRowIndex = idx + 2;

      // Skip validation checks for explicitly user-excluded rows, but keep count
      if (excludedSet.has(sourceRowIndex)) {
        return;
      }

      let rowHasFatalError = false;

      // 1. Check required fields and whitespace
      for (const mapping of mappings) {
        if (mapping.fieldKey === StandardFieldKeys.PROGRAM_CATEGORY && hasGlobalProgram) {
          // Program is satisfied by the batch-wide global program setting
          continue;
        }

        if (!mapping.spreadsheetColumn) {
          if (mapping.isRequired) {
            rowHasFatalError = true;
            errors.push({
              rowIndex: sourceRowIndex,
              column: mapping.label,
              value: '',
              code: 'MISSING_REQUIRED',
              message: `Required field "${mapping.label}" is not mapped to any spreadsheet column.`,
              severity: 'error'
            });
          }
          continue;
        }

        const rawValue = row[mapping.spreadsheetColumn];
        const trimmedValue = (rawValue ?? '').trim();

        if (rawValue !== undefined && rawValue !== null && rawValue.length > 0 && trimmedValue.length === 0) {
          // Whitespace-only
          if (mapping.isRequired) {
            rowHasFatalError = true;
            errors.push({
              rowIndex: sourceRowIndex,
              column: mapping.spreadsheetColumn,
              value: rawValue,
              code: 'WHITESPACE_ONLY',
              message: `Column "${mapping.spreadsheetColumn}" contains only whitespace for required field "${mapping.label}".`,
              severity: 'error'
            });
          } else {
            errors.push({
              rowIndex: sourceRowIndex,
              column: mapping.spreadsheetColumn,
              value: rawValue,
              code: 'WHITESPACE_ONLY',
              message: `Column "${mapping.spreadsheetColumn}" contains whitespace-only characters.`,
              severity: 'warning'
            });
          }
        } else if (trimmedValue.length === 0) {
          if (mapping.isRequired) {
            rowHasFatalError = true;
            errors.push({
              rowIndex: sourceRowIndex,
              column: mapping.spreadsheetColumn,
              value: '',
              code: 'MISSING_REQUIRED',
              message: `Missing required value for "${mapping.label}".`,
              severity: 'error'
            });
          }
        } else {
          // Overlong value check
          if (trimmedValue.length > 120) {
            errors.push({
              rowIndex: sourceRowIndex,
              column: mapping.spreadsheetColumn,
              value: trimmedValue.substring(0, 30) + '...',
              code: 'OVERLONG_VALUE',
              message: `Value in "${mapping.spreadsheetColumn}" exceeds 120 characters (${trimmedValue.length} chars). May overflow layout.`,
              severity: 'warning'
            });
          }
        }
      }

      // 2. Exact duplicate check across all mapped columns
      const mappedValuesList = mappings
        .filter((m) => m.spreadsheetColumn)
        .map((m) => (row[m.spreadsheetColumn!] || '').trim().toLowerCase());
      const exactHash = mappedValuesList.join('|||');

      if (exactRowMap.has(exactHash)) {
        const originalRow = exactRowMap.get(exactHash)!;
        duplicates.push({
          rowIndex: sourceRowIndex,
          duplicateOf: originalRow,
          type: 'exact'
        });
        errors.push({
          rowIndex: sourceRowIndex,
          column: 'All Mapped Columns',
          value: exactHash.replace(/\|\|\|/g, ' / '),
          code: 'EXACT_DUPLICATE',
          message: `Exact duplicate of Row ${originalRow}.`,
          severity: 'warning'
        });
      } else {
        exactRowMap.set(exactHash, sourceRowIndex);
      }

      // 3. Same Name + Program duplicate check
      const studentName = nameMapping?.spreadsheetColumn ? (row[nameMapping.spreadsheetColumn] || '').trim().toLowerCase() : '';
      const programName = hasGlobalProgram
        ? opts!.globalProgramName!.trim().toLowerCase()
        : programMapping?.spreadsheetColumn
        ? (row[programMapping.spreadsheetColumn] || '').trim().toLowerCase()
        : '';

      if (studentName && programName) {
        const nameProgramHash = `${studentName}:::${programName}`;
        if (nameProgramMap.has(nameProgramHash)) {
          const originalRow = nameProgramMap.get(nameProgramHash)!;
          if (!exactRowMap.has(exactHash) || exactRowMap.get(exactHash) === sourceRowIndex) {
            duplicates.push({
              rowIndex: sourceRowIndex,
              duplicateOf: originalRow,
              type: 'name_program'
            });
            const progDisplay = hasGlobalProgram ? opts!.globalProgramName!.trim() : row[programMapping!.spreadsheetColumn!];
            errors.push({
              rowIndex: sourceRowIndex,
              column: `${nameMapping?.label} + ${programMapping?.label || 'Program'}`,
              value: `${row[nameMapping!.spreadsheetColumn!]} (${progDisplay})`,
              code: 'DUPLICATE_NAME_PROGRAM',
              message: `Same student and program as Row ${originalRow}.`,
              severity: 'warning'
            });
          }
        } else {
          nameProgramMap.set(nameProgramHash, sourceRowIndex);
        }
      }

      if (rowHasFatalError) {
        invalidRowIndices.add(sourceRowIndex);
      }
    });

    const totalRows = rows.length;
    const invalidRows = invalidRowIndices.size;
    const validRows = totalRows - invalidRows - excludedSet.size;

    return {
      totalRows,
      validRows: Math.max(0, validRows),
      invalidRows,
      excludedRows: Array.from(excludedSet),
      errors,
      duplicates
    };
  }
}
