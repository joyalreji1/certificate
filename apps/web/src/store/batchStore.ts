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
  availableTemplates: TemplateInfo[];
  spreadsheet: SpreadsheetInfo | null;
  programName: string;
  mappings: FieldMapping[];
  overlayFields: OverlayField[];
  validationSummary: RowValidationSummary | null;
  excludedRows: number[];
  nameOverrides: Record<number, string>;
  isLoading: boolean;
  error: string | null;

  setError: (error: string | null) => void;
  setProgramName: (programName: string) => void;
  setTemplate: (template: TemplateInfo) => void;
  setSelectedPage: (page: number) => void;
  fetchAvailableTemplates: () => Promise<TemplateInfo[]>;
  selectExistingTemplate: (template: TemplateInfo) => void;
  setSpreadsheet: (spreadsheet: SpreadsheetInfo, suggestedMappings?: FieldMapping[]) => void;
  setMappings: (mappings: FieldMapping[]) => void;
  setOverlayFields: (fields: OverlayField[]) => void;
  setNameOverride: (rowIndex: number, name: string) => Promise<void>;

  uploadTemplate: (file: File) => Promise<TemplateInfo>;
  uploadSpreadsheet: (file: File) => Promise<SpreadsheetInfo>;
  switchSheet: (sheetName: string) => Promise<void>;
  createOrUpdateBatch: (name: string, customProgramName?: string) => Promise<Batch>;
  loadBatch: (batchId: string) => Promise<Batch>;
  validateBatch: (mappings?: FieldMapping[]) => Promise<RowValidationSummary>;
  toggleExcludeRow: (rowIndex: number) => Promise<void>;
  saveTemplatePreset: (templateId: string, overlayFields: OverlayField[], selectedPage?: number) => Promise<void>;
  loadTemplatePreset: (templateId: string) => Promise<OverlayField[]>;
  resetBatch: () => void;
}

export const useBatchStore = create<BatchState>((set, get) => ({
  currentBatch: null,
  template: null,
  availableTemplates: [],
  spreadsheet: null,
  programName: '',
  mappings: [],
  overlayFields: [],
  validationSummary: null,
  excludedRows: [],
  nameOverrides: {},
  isLoading: false,
  error: null,

  setError: (error) => set({ error }),
  setProgramName: (programName) => set({ programName }),
  setTemplate: (template) => {
    const updates: Partial<BatchState> = { template };
    if (template.overlayFields && template.overlayFields.length > 0 && get().overlayFields.length === 0) {
      updates.overlayFields = template.overlayFields;
    }
    set(updates);
  },

  setSelectedPage: (page: number) => {
    const { currentBatch } = get();
    if (currentBatch) {
      set({ currentBatch: { ...currentBatch, selectedPage: page } });
    }
  },

  fetchAvailableTemplates: async () => {
    try {
      const res = await apiRequest<{ templates: TemplateInfo[] }>('/api/templates');
      set({ availableTemplates: res.templates || [] });
      return res.templates || [];
    } catch (err: any) {
      console.warn('Failed to fetch available templates', err);
      return [];
    }
  },

  selectExistingTemplate: (template: TemplateInfo) => {
    const updates: Partial<BatchState> = { template };
    if (template.overlayFields && template.overlayFields.length > 0) {
      updates.overlayFields = template.overlayFields;
    }
    const current = get().currentBatch;
    if (current) {
      updates.currentBatch = {
        ...current,
        templateId: template.id,
        selectedPage: template.selectedPage || 1
      };
    }
    set(updates);
  },

  setSpreadsheet: (spreadsheet, suggestedMappings) =>
    set({
      spreadsheet,
      mappings: suggestedMappings || get().mappings
    }),
  setMappings: (mappings) => set({ mappings }),
  setOverlayFields: (overlayFields) => set({ overlayFields }),

  setNameOverride: async (rowIndex: number, name: string) => {
    const { nameOverrides, currentBatch } = get();
    const updated = { ...nameOverrides, [rowIndex]: name.trim() };
    set({ nameOverrides: updated });
    if (currentBatch?.id) {
      try {
        await apiRequest(`/api/batches/${currentBatch.id}`, {
          method: 'PUT',
          body: JSON.stringify({ nameOverrides: updated })
        });
      } catch (err) {
        console.error('Failed to save name override to server', err);
      }
    }
  },

  uploadTemplate: async (file: File) => {
    set({ isLoading: true, error: null });
    try {
      const formData = new FormData();
      formData.append('template', file);
      const res = await apiRequest<{ template: TemplateInfo }>('/api/templates/upload', {
        method: 'POST',
        body: formData
      });
      const t = res.template;
      const updates: Partial<BatchState> = {
        template: t,
        isLoading: false,
        availableTemplates: [t, ...get().availableTemplates.filter((item) => item.id !== t.id)]
      };
      if (t.overlayFields && t.overlayFields.length > 0 && get().overlayFields.length === 0) {
        updates.overlayFields = t.overlayFields;
      }
      set(updates);
      return t;
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

  createOrUpdateBatch: async (name: string, customProgramName?: string) => {
    const { template, spreadsheet, mappings, overlayFields, excludedRows, currentBatch, programName, nameOverrides } = get();
    const effectiveProgramName = (customProgramName !== undefined ? customProgramName : programName || '').trim();
    set({ isLoading: true, error: null });
    try {
      let batch: Batch;
      if (currentBatch?.id) {
        const res = await apiRequest<{ batch: Batch }>(`/api/batches/${currentBatch.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            name,
            programName: effectiveProgramName,
            templateId: template?.id,
            spreadsheetId: spreadsheet?.id,
            activeSheet: spreadsheet?.activeSheet,
            selectedPage: currentBatch.selectedPage || 1,
            fieldMappings: mappings,
            overlayFields,
            excludedRows,
            nameOverrides
          })
        });
        batch = res.batch;
      } else {
        const res = await apiRequest<{ batch: Batch }>('/api/batches', {
          method: 'POST',
          body: JSON.stringify({
            name,
            programName: effectiveProgramName,
            templateId: template?.id,
            spreadsheetId: spreadsheet?.id,
            activeSheet: spreadsheet?.activeSheet,
            selectedPage: 1,
            fieldMappings: mappings,
            overlayFields,
            excludedRows,
            nameOverrides
          })
        });
        batch = res.batch;
      }
      set({
        currentBatch: batch,
        programName: batch.programName || effectiveProgramName,
        nameOverrides: batch.nameOverrides || nameOverrides || {},
        isLoading: false
      });
      return batch;
    } catch (err: any) {
      set({ error: err.message || 'Failed to save batch', isLoading: false });
      throw err;
    }
  },

  loadBatch: async (batchId: string) => {
    set({ isLoading: true, error: null });
    try {
      const res = await apiRequest<{ batch: Batch }>(`/api/batches/${batchId}`);
      const batch = res.batch;
      let template: TemplateInfo | null = null;
      let spreadsheet: SpreadsheetInfo | null = null;

      if (batch.templateId) {
        try {
          const tRes = await apiRequest<{ template: TemplateInfo }>(`/api/templates/${batch.templateId}`);
          template = tRes.template;
        } catch {}
      }

      if (batch.spreadsheetId) {
        try {
          const sRes = await apiRequest<{ spreadsheet: SpreadsheetInfo }>(`/api/spreadsheets/${batch.spreadsheetId}`);
          spreadsheet = sRes.spreadsheet;
        } catch {}
      }

      set({
        currentBatch: batch,
        template,
        spreadsheet,
        programName: batch.programName || '',
        mappings: batch.fieldMappings || [],
        overlayFields: batch.overlayFields || [],
        excludedRows: batch.excludedRows || [],
        nameOverrides: batch.nameOverrides || {},
        isLoading: false
      });
      return batch;
    } catch (err: any) {
      set({ error: err.message || 'Failed to load batch', isLoading: false });
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

  saveTemplatePreset: async (templateId: string, overlayFields: OverlayField[], selectedPage: number = 1) => {
    try {
      await apiRequest(`/api/templates/${templateId}/preset`, {
        method: 'POST',
        body: JSON.stringify({ overlayFields, selectedPage })
      });
      // Update local availableTemplates
      set((state) => ({
        availableTemplates: state.availableTemplates.map((t) =>
          t.id === templateId ? { ...t, overlayFields, selectedPage } : t
        )
      }));
    } catch (err: any) {
      throw new Error(err.message || 'Failed to save template preset to server.');
    }
  },

  loadTemplatePreset: async (templateId: string) => {
    try {
      const res = await apiRequest<{ overlayFields: OverlayField[]; selectedPage: number }>(
        `/api/templates/${templateId}/preset`
      );
      if (res.overlayFields && res.overlayFields.length > 0) {
        set({ overlayFields: res.overlayFields });
        return res.overlayFields;
      }
      return [];
    } catch (err: any) {
      throw new Error(err.message || 'Failed to load template preset from server.');
    }
  },

  resetBatch: () => {
    set({
      currentBatch: null,
      template: null,
      spreadsheet: null,
      programName: '',
      mappings: [],
      overlayFields: [],
      validationSummary: null,
      excludedRows: [],
      nameOverrides: {},
      error: null
    });
  }
}));
