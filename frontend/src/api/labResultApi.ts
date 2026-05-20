import { getDemoAuthHeaders } from '../auth/demoAuth';

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

export type LabResultFlag = 'LOW' | 'NORMAL' | 'HIGH' | 'UNKNOWN';
export type LabResultSeverity =
  | 'NORMAL'
  | 'MILD_LOW'
  | 'MODERATE_LOW'
  | 'MARKED_LOW'
  | 'MILD_HIGH'
  | 'MODERATE_HIGH'
  | 'MARKED_HIGH'
  | 'UNKNOWN';
export type ParseConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export type ParsedLabResultItem = {
  code: string;
  nameVi: string;
  group: string;
  value: number;
  unit?: string;
  referenceRangeRaw?: string;
  referenceLow: number | null;
  referenceHigh: number | null;
  flag: LabResultFlag;
  severity: LabResultSeverity;
  evidenceText?: string;
  parseConfidence: ParseConfidence;
};

export type LabResultGroupSummary = {
  group: string;
  groupNameVi?: string;
  total?: number;
  abnormalCount?: number;
  normalCount?: number;
  unknownCount?: number;
  highlightsVi?: string[];
  summaryVi?: string;
};

export type LabResultItemInterpretation = {
  code: string;
  nameVi: string;
  group: string;
  flag: LabResultFlag;
  severity: LabResultSeverity;
  summaryVi?: string;
  whatItIsVi?: string;
  comparisonVi?: string;
  generalMeaningVi?: string;
  readWithContextVi?: string;
  nonDiagnosisNoteVi?: string;
  evidenceText?: string;
};

export type LabResultProfessionalSummary = {
  totalParsed: number;
  abnormalCount: number;
  normalCount: number;
  unknownCount: number;
  overviewVi?: string;
  conclusionVi?: string;
  groupSummaries?: LabResultGroupSummary[];
  itemInterpretations?: LabResultItemInterpretation[];
  safetyNotes?: string[];
  limitations?: string[];
};

export type LabResultInterpretationData = {
  file: {
    originalName: string;
    mimetype: string;
    size: number;
  };
  extraction: {
    pageCount: number | null;
    extractedTextPreview?: string;
  };
  parsedItems: ParsedLabResultItem[];
  professionalSummary: LabResultProfessionalSummary;
  timestamp?: string;
};

type ApiResponse<T> = {
  success: boolean;
  data?: T;
  message?: string;
  code?: string;
};

export class LabResultApiError extends Error {
  code?: string;
  status?: number;

  constructor(message: string, code?: string, status?: number) {
    super(message);
    this.name = 'LabResultApiError';
    this.code = code;
    this.status = status;
  }
}

export async function interpretLabResultPdf(file: File) {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE_URL}/api/lab-results/interpret`, {
    method: 'POST',
    headers: {
      ...getDemoAuthHeaders(),
    },
    body: formData,
  });
  const payload: ApiResponse<LabResultInterpretationData> = await response.json();

  if (!response.ok || !payload.success || !payload.data) {
    throw new LabResultApiError(
      payload.message || 'Không thể phân tích file PDF này. Vui lòng thử lại.',
      payload.code,
      response.status,
    );
  }

  return payload.data;
}
