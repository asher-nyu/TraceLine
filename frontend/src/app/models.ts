export type DiffMode = 'line';

export interface CompareRequest {
  leftText: string;
  rightText: string;
}

export interface DiffOperation {
  type: 'equal' | 'added' | 'removed' | 'changed';
  left?: string;
  right?: string;
  leftSegments?: DiffSegment[];
  rightSegments?: DiffSegment[];
  leftIndex?: number;
  rightIndex?: number;
}

export interface DiffSegment {
  type: 'equal' | 'added' | 'removed' | 'changed';
  text: string;
}

export interface DiffSummary {
  similarityScore: number;
  addedCount: number;
  removedCount: number;
  changedCount: number;
  totalLines: number;
  addedLines: number;
  removedLines: number;
  changedLines: number;
  totalWords: number;
  changedWords: number;
  totalCharacters: number;
  changedCharacters: number;
  processingTimeMillis: number;
}

export interface CompareResult {
  mode: DiffMode;
  operations: DiffOperation[];
  summary: DiffSummary;
  leftText: string;
  rightText: string;
}

export interface ExportResponse {
  fileName: string;
  content: string;
  contentType: string;
}

export interface TextStats {
  characters: number;
  words: number;
  lines: number;
}

export interface UploadedFileInfo extends TextStats {
  name: string;
  size: number;
}
