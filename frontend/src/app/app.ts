import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { finalize, startWith } from 'rxjs';

import { TraceLineApiService } from './core/traceline-api.service';
import {
  CompareRequest,
  CompareResult,
  DiffOperation,
  DiffSegment,
  TextStats,
  UploadedFileInfo,
} from './models';
import { CodeEditorComponent } from './shared/code-editor.component';

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = [
  '.txt',
  '.md',
  '.markdown',
  '.json',
  '.csv',
  '.tsv',
  '.html',
  '.htm',
  '.xml',
  '.yaml',
  '.yml',
  '.log',
  '.sql',
  '.js',
  '.ts',
  '.css',
  '.scss',
  '.go',
  '.py',
  '.java',
  '.cs',
  '.cpp',
  '.c',
  '.rs',
  '.rb',
  '.php',
];
const ACCEPTED_ATTRIBUTE = ACCEPTED_EXTENSIONS.join(',');
const ACCEPTED_TOOLTIP = `Supported formats: ${ACCEPTED_EXTENSIONS.join(', ')}. Maximum file size: 25 MB.`;

type DisplayOperation = DiffOperation & {
  leftLineNumber: string;
  rightLineNumber: string;
};

type LogoAssets = {
  svgDataUrl: string;
  png32DataUrl: string | null;
  png180DataUrl: string | null;
};

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatChipsModule,
    MatIconModule,
    MatProgressBarModule,
    MatSnackBarModule,
    MatTooltipModule,
    CodeEditorComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly api = inject(TraceLineApiService);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly form = this.fb.group({
    leftText: [''],
    rightText: [''],
  });

  protected readonly loading = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly result = signal<CompareResult | null>(null);
  protected readonly leftFile = signal<UploadedFileInfo | null>(null);
  protected readonly rightFile = signal<UploadedFileInfo | null>(null);
  protected readonly acceptedFileTypes = ACCEPTED_ATTRIBUTE;
  protected readonly acceptedFileTooltip = ACCEPTED_TOOLTIP;
  protected readonly currentYear = new Date().getFullYear();

  private leftFileRef: File | null = null;
  private rightFileRef: File | null = null;

  protected readonly leftText = toSignal(
    this.form.controls.leftText.valueChanges.pipe(startWith(this.form.controls.leftText.value)),
    { initialValue: this.form.controls.leftText.value },
  );
  protected readonly rightText = toSignal(
    this.form.controls.rightText.valueChanges.pipe(startWith(this.form.controls.rightText.value)),
    { initialValue: this.form.controls.rightText.value },
  );
  protected readonly leftStats = computed(() => statsFor(this.leftText()));
  protected readonly rightStats = computed(() => statsFor(this.rightText()));
  protected readonly canCompare = computed(() => {
    return this.leftText().trim().length > 0 || this.rightText().trim().length > 0;
  });
  protected readonly hasUploadedFile = computed(() => Boolean(this.leftFile() || this.rightFile()));
  protected readonly displayedOperations = computed<DisplayOperation[]>(() => {
    const result = this.result();
    if (!result) {
      return [];
    }
    let leftLine = 1;
    let rightLine = 1;
    return result.operations.map((operation) => {
      const hasLeftLine = operation.type !== 'added';
      const hasRightLine = operation.type !== 'removed';
      const displayOperation: DisplayOperation = {
        ...operation,
        leftLineNumber: hasLeftLine ? String(leftLine) : '',
        rightLineNumber: hasRightLine ? String(rightLine) : '',
      };
      if (hasLeftLine) {
        leftLine++;
      }
      if (hasRightLine) {
        rightLine++;
      }
      return displayOperation;
    });
  });
  protected readonly isIdentical = computed(() => {
    const result = this.result();
    if (!result) {
      return false;
    }
    return (
      result.operations.length > 0 &&
      result.operations.every((operation) => operation.type === 'equal')
    );
  });
  @HostListener('window:keydown', ['$event'])
  protected handleKeyboard(event: KeyboardEvent): void {
    const command = event.metaKey || event.ctrlKey;
    if (command && event.key === 'Enter') {
      event.preventDefault();
      this.compare();
    }
    if (command && event.shiftKey && event.key.toLowerCase() === 'x') {
      event.preventDefault();
      this.swapSides();
    }
  }

  protected compare(): void {
    if (!this.canCompare()) {
      this.showError('Add text on at least one side before comparing.');
      return;
    }

    this.errorMessage.set('');
    this.loading.set(true);
    const request = this.compareRequest();
    const source =
      this.leftFileRef && this.rightFileRef
        ? this.api.compareFiles(this.filePayload())
        : this.api.compare(request);

    source.pipe(finalize(() => this.loading.set(false))).subscribe({
      next: (result) => {
        this.result.set(result);
        this.snackBar.open('Comparison complete', 'Close', { duration: 2200 });
      },
      error: (error: HttpErrorResponse) => this.showError(messageFromError(error)),
    });
  }

  protected clearAll(): void {
    this.form.patchValue({ leftText: '', rightText: '' });
    this.leftFileRef = null;
    this.rightFileRef = null;
    this.leftFile.set(null);
    this.rightFile.set(null);
    this.result.set(null);
    this.errorMessage.set('');
  }

  protected swapSides(): void {
    const leftText = this.form.controls.leftText.value;
    const rightText = this.form.controls.rightText.value;
    this.form.patchValue({ leftText: rightText, rightText: leftText });

    const leftInfo = this.leftFile();
    const rightInfo = this.rightFile();
    const leftRef = this.leftFileRef;
    this.leftFile.set(rightInfo);
    this.rightFile.set(leftInfo);
    this.leftFileRef = this.rightFileRef;
    this.rightFileRef = leftRef;
  }

  protected async exportResult(): Promise<void> {
    const result = this.result();
    if (!result) {
      return;
    }
    this.downloadHtml('traceline-comparison.html', await this.snapshotHtml());
    this.snackBar.open('Export ready', 'Close', { duration: 1800 });
  }

  protected selectFile(side: 'left' | 'right', event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      this.loadFile(side, file);
    }
    input.value = '';
  }

  protected handleDrop(side: 'left' | 'right', event: DragEvent): void {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      this.loadFile(side, file);
    }
  }

  protected allowDrop(event: DragEvent): void {
    event.preventDefault();
  }

  protected clearFile(side: 'left' | 'right'): void {
    if (side === 'left') {
      this.leftFileRef = null;
      this.leftFile.set(null);
      return;
    }
    this.rightFileRef = null;
    this.rightFile.set(null);
  }

  protected operationText(operation: DiffOperation, side: 'left' | 'right'): string {
    if (operation.type === 'added') {
      return side === 'right' ? (operation.right ?? '') : '';
    }
    if (operation.type === 'removed') {
      return side === 'left' ? (operation.left ?? '') : '';
    }
    if (operation.type === 'changed') {
      return side === 'left' ? (operation.left ?? '') : (operation.right ?? '');
    }
    return side === 'left' ? (operation.left ?? '') : (operation.right ?? '');
  }

  protected operationSegments(operation: DiffOperation, side: 'left' | 'right'): DiffSegment[] {
    const segments = side === 'left' ? operation.leftSegments : operation.rightSegments;
    if (segments?.length) {
      return segments;
    }
    const text = this.operationText(operation, side);
    if (!text) {
      return [];
    }
    return [{ type: operation.type, text }];
  }

  protected trackOperation(index: number, operation: DisplayOperation): string {
    return `${index}-${operation.type}-${operation.leftIndex ?? 0}-${operation.rightIndex ?? 0}`;
  }

  private loadFile(side: 'left' | 'right', file: File): void {
    const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (!ACCEPTED_EXTENSIONS.includes(extension)) {
      this.showError(`${file.name} is not a supported file type.`);
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      this.showError(`${file.name} is larger than the 25 MB limit.`);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      const fileInfo = { name: file.name, size: file.size, ...statsFor(text) };
      if (side === 'left') {
        this.leftFileRef = file;
        this.leftFile.set(fileInfo);
        this.form.controls.leftText.setValue(text);
      } else {
        this.rightFileRef = file;
        this.rightFile.set(fileInfo);
        this.form.controls.rightText.setValue(text);
      }
      this.snackBar.open(`${file.name} loaded`, 'Close', { duration: 1800 });
    };
    reader.onerror = () => this.showError(`${file.name} could not be read.`);
    reader.readAsText(file);
  }

  private compareRequest(): CompareRequest {
    const raw = this.form.getRawValue();
    return {
      leftText: raw.leftText,
      rightText: raw.rightText,
    };
  }

  private filePayload(): FormData {
    const formData = new FormData();
    formData.append('leftFile', this.leftFileRef as File);
    formData.append('rightFile', this.rightFileRef as File);
    return formData;
  }

  private downloadHtml(fileName: string, content: string): void {
    const blob = new Blob([content], { type: 'text/html; charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  }

  private async snapshotHtml(): Promise<string> {
    const styles = Array.from(document.styleSheets)
      .map((sheet) => {
        try {
          return Array.from(sheet.cssRules)
            .map((rule) => rule.cssText)
            .join('\n');
        } catch {
          return '';
        }
      })
      .join('\n');
    const logoAssets = await this.logoAssets();
    const body = document.body.cloneNode(true) as HTMLElement;
    const logo = body.querySelector<HTMLImageElement>('img.brand-mark');
    if (logoAssets && logo) {
      logo.src = logoAssets.svgDataUrl;
    }
    body
      .querySelectorAll(
        [
          'script',
          'button',
          'input',
          '.top-actions',
          '.icon-row',
          '.file-slot',
          '.cdk-overlay-container',
          '.cdk-describedby-message-container',
          '.mat-mdc-snack-bar-container',
          '.mat-ripple-element',
        ].join(','),
      )
      .forEach((element) => element.remove());

    return [
      '<!doctype html>',
      '<html lang="en">',
      '<head>',
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      '<title>TraceLine Comparison</title>',
      ...this.faviconLinks(logoAssets),
      `<style>${styles}\n${this.exportSafetyCss()}</style>`,
      '</head>',
      body.outerHTML,
      '</html>',
    ].join('');
  }

  private exportSafetyCss(): string {
    return `
.drop-zone {
  height: clamp(380px, 46vh, 540px) !important;
  grid-template-rows: minmax(0, 1fr) !important;
  gap: 0 !important;
  overflow: hidden !important;
}
.panel-header {
  align-items: flex-start !important;
}
.top-actions,
.icon-row,
.file-slot,
button,
input {
  display: none !important;
}
app-code-editor,
.editor-shell,
.cm-editor {
  height: 100% !important;
  min-height: 0 !important;
  max-height: 100% !important;
  overflow: hidden !important;
}
.cm-scroller {
  height: 100% !important;
  overflow: auto !important;
}
`;
  }

  private faviconLinks(logoAssets: LogoAssets | null): string[] {
    if (!logoAssets) {
      return [];
    }

    return [
      logoAssets.png32DataUrl
        ? `<link rel="icon" type="image/png" sizes="32x32" href="${logoAssets.png32DataUrl}">`
        : '',
      `<link rel="icon" type="image/svg+xml" sizes="any" href="${logoAssets.svgDataUrl}">`,
      logoAssets.png180DataUrl
        ? `<link rel="apple-touch-icon" sizes="180x180" href="${logoAssets.png180DataUrl}">`
        : '',
    ].filter(Boolean);
  }

  private async logoAssets(): Promise<LogoAssets | null> {
    if (typeof fetch !== 'function') {
      return null;
    }

    try {
      const response = await fetch('TraceLine.svg');
      if (!response.ok) {
        return null;
      }
      const svg = await response.text();
      const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.trim())}`;
      const [png32DataUrl, png180DataUrl] = await Promise.all([
        this.svgToPngDataUrl(svgDataUrl, 32),
        this.svgToPngDataUrl(svgDataUrl, 180),
      ]);
      return { svgDataUrl, png32DataUrl, png180DataUrl };
    } catch {
      return null;
    }
  }

  private async svgToPngDataUrl(svgDataUrl: string, size: number): Promise<string | null> {
    if (typeof Image === 'undefined' || typeof document === 'undefined') {
      return null;
    }

    return new Promise((resolve) => {
      const image = new Image();
      image.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = size;
          canvas.height = size;
          const context = canvas.getContext('2d');
          if (!context) {
            resolve(null);
            return;
          }
          context.clearRect(0, 0, size, size);
          context.drawImage(image, 0, 0, size, size);
          resolve(canvas.toDataURL('image/png'));
        } catch {
          resolve(null);
        }
      };
      image.onerror = () => resolve(null);
      image.src = svgDataUrl;
    });
  }

  private showError(message: string): void {
    this.loading.set(false);
    this.errorMessage.set(message);
    this.snackBar.open(message, 'Close', { duration: 3600 });
  }
}

function statsFor(value: string): TextStats {
  const trimmed = value.trim();
  return {
    characters: value.length,
    words: trimmed ? trimmed.split(/\s+/).length : 0,
    lines: value ? value.split(/\r\n|\r|\n/).length : 0,
  };
}

function messageFromError(error: HttpErrorResponse): string {
  return error.error?.error ?? error.message ?? 'TraceLine could not complete the request.';
}
