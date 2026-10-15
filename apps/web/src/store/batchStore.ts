import { create } from 'zustand';
import {
  Batch,
  TemplateInfo,
  SpreadsheetInfo,
  FieldMapping,
  RowValidationSummary,
  OverlayField
} from '@bulk-cert/shared';
import { apiRequest } from '../api/client';

interface BatchState {
  currentBatch: Batch | null;
  template: TemplateInfo | null;
  spreadsheet: SpreadsheetInfo | null;
  mappings: FieldMapping[];
  overlayFields: OverlayField[];
  validationSummary: RowValidationSummary | null;
  excludedRows: number[];
  isLoading: boolean;
  error: string | null;

  setError: (error: string | null) => void;
  setTemplate: (template: TemplateInfo) => void;
  setSpreadsheet: (spreadsheet: SpreadsheetInfo, suggestedMappings?: FieldMapping[]) => void;
  setMappings: (mappings: FieldMapping[]) => void;
  setOverlayFields: (fields: OverlayField[]) => void;

  uploadTemplate: (file: File) => Promise<TemplateInfo>;
  uploadSpreadsheet: (file: File) => Promise<SpreadsheetInfo>;
  switchSheet: (sheetName: string) => Promise<void>;
  createOrUpdateBatch: (name: string) => Promise<Batch>;
  validateBatch: (mappings?: FieldMapping[]) => Promise<RowValidationSummary>;
  toggleExcludeRow: (rowIndex: number) => Promise<void>;
  resetBatch: () => void;
}

export const useBatchStore = create<BatchState>((set, get) => ({
  currentBatch: null,
  template: null,
  spreadsheet: null,
  mappings: [],
  overlayFields: [],
  validationSummary: null,
  excludedRows: [],
  isLoading: false,
  error: null,

  setError: (error) => set({ error }),
  setTemplate: (template) => set({ template }),
  setSpreadsheet: (spreadsheet, suggestedMappings) =>
    set({
      spreadsheet,
      mappings: suggestedMappings || get().mappings
    }),
  setMappings: (mappings) => set({ mappings }),
  setOverlayFields: (overlayFields) => set({ overlayFields }),

  uploadTemplate: async (file: File) => {
    set({ isLoading: true, error: null });
    try {
      const formData = new FormData();
      formData.append('template', file);
      const res = await apiRequest<{ template: TemplateInfo }>('/api/templates/upload', {
        method: 'POST',
        body: formData
      });
      set({ template: res.template, isLoading: false });
      return res.template;
    } catch (err: any) {
      set({ error: err.message || 'Failed to upload template', isLoading: false });
      throw err;
    }
  },

  uploadSpreadsheet: async (file: File) => {
    set({ isLoading: true, error: null });
    try {
      const formData = new FormData();
      formData.append('spreadsheet', file);
      const res = await apiRequest<{ spreadsheet: SpreadsheetInfo; suggestedMappings: FieldMapping[] }>(
        '/api/spreadsheets/upload',
        {
          method: 'POST',
          body: formData
        }
      );
      set({
        spreadsheet: res.spreadsheet,
        mappings: res.suggestedMappings,
        isLoading: false
      });
      return res.spreadsheet;
    } catch (err: any) {
      set({ error: err.message || 'Failed to upload spreadsheet', isLoading: false });
      throw err;
    }
  },

  switchSheet: async (sheetName: string) => {
    const spreadsheet = get().spreadsheet;
    if (!spreadsheet) return;
    set({ isLoading: true, error: null });
    try {
      const res = await apiRequest<{ spreadsheet: SpreadsheetInfo; suggestedMappings: FieldMapping[] }>(
        `/api/spreadsheets/${spreadsheet.id}/sheet`,
        {
          method: 'POST',
          body: JSON.stringify({ sheetName })
        }
      );
      set({
        spreadsheet: res.spreadsheet,
        mappings: res.suggestedMappings,
        validationSummary: null,
        isLoading: false
      });
    } catch (err: any) {
      set({ error: err.message || 'Failed to switch sheet', isLoading: false });
      throw err;
    }
  },

  createOrUpdateBatch: async (name: string) => {
    const { template, spreadsheet, mappings, overlayFields, excludedRows, currentBatch } = get();
    set({ isLoading: true, error: null });
    try {
      let batch: Batch;
      if (currentBatch?.id) {
        const res = await apiRequest<{ batch: Batch }>(`/api/batches/${currentBatch.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            name,
            templateId: template?.id,
            spreadsheetId: spreadsheet?.id,
            activeSheet: spreadsheet?.activeSheet,
            fieldMappings: mappings,
            overlayFields,
            excludedRows
          })
        });
        batch = res.batch;
      } else {
        const res = await apiRequest<{ batch: Batch }>('/api/batches', {
          method: 'POST',
          body: JSON.stringify({
            name,
            templateId: template?.id,
            spreadsheetId: spreadsheet?.id,
            activeSheet: spreadsheet?.activeSheet,
            fieldMappings: mappings,
            overlayFields,
            excludedRows
          })
        });
        batch = res.batch;
      }
      set({ currentBatch: batch, isLoading: false });
      return batch;
    } catch (err: any) {
      set({ error: err.message || 'Failed to save batch', isLoading: false });
      throw err;
    }
  },

  validateBatch: async (overrideMappings?: FieldMapping[]) => {
    const { currentBatch, mappings, excludedRows } = get();
    if (!currentBatch?.id) {
      throw new Error('Please save the batch before validating.');
    }
    set({ isLoading: true, error: null });
    try {
      const mappingsToUse = overrideMappings || mappings;
      const res = await apiRequest<{ validationSummary: RowValidationSummary }>(
        `/api/batches/${currentBatch.id}/validate`,
        {
          method: 'POST',
          body: JSON.stringify({
            fieldMappings: mappingsToUse,
            excludedRows
          })
        }
      );
      set({
        validationSummary: res.validationSummary,
        mappings: mappingsToUse,
        isLoading: false
      });
      return res.validationSummary;
    } catch (err: any) {
      set({ error: err.message || 'Failed to validate batch', isLoading: false });
      throw err;
    }
  },

  toggleExcludeRow: async (rowIndex: number) => {
    const { excludedRows, currentBatch, mappings } = get();
    const newExcluded = excludedRows.includes(rowIndex)
      ? excludedRows.filter((r) => r !== rowIndex)
      : [...excludedRows, rowIndex];

    set({ excludedRows: newExcluded });

    if (currentBatch?.id) {
      try {
        const res = await apiRequest<{ validationSummary: RowValidationSummary }>(
          `/api/batches/${currentBatch.id}/validate`,
          {
            method: 'POST',
            body: JSON.stringify({
              fieldMappings: mappings,
              excludedRows: newExcluded
            })
          }
        );
        set({ validationSummary: res.validationSummary });
      } catch (err) {
        console.error('Failed to revalidate after excluding row', err);
      }
    }
  },

  resetBatch: () => {
    set({
      currentBatch: null,
      template: null,
      spreadsheet: null,
      mappings: [],
      overlayFields: [],
      validationSummary: null,
      excludedRows: [],
      error: null
    });
  }
}));
