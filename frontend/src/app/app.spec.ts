import { Component, Input, forwardRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';

import { App } from './app';
import { CompareResult } from './models';
import { CodeEditorComponent } from './shared/code-editor.component';

@Component({
  selector: 'app-code-editor',
  standalone: true,
  template:
    '<textarea [attr.aria-label]="ariaLabel" [attr.placeholder]="placeholder" [value]="value" (input)="update($event)"></textarea>',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => MockCodeEditorComponent),
      multi: true,
    },
  ],
})
class MockCodeEditorComponent implements ControlValueAccessor {
  @Input() ariaLabel = 'Mock editor';
  @Input() placeholder = '';

  value = '';
  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  writeValue(value: string | null): void {
    this.value = value ?? '';
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  update(event: Event): void {
    this.value = (event.target as HTMLTextAreaElement).value;
    this.onChange(this.value);
    this.onTouched();
  }
}

describe('App', () => {
  let fixture: ComponentFixture<App>;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideNoopAnimations()],
    })
      .overrideComponent(App, {
        remove: { imports: [CodeEditorComponent] },
        add: { imports: [MockCodeEditorComponent] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(App);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
  });

  it('renders the product name and empty result guidance', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const app = fixture.componentInstance as any;

    expect(compiled.querySelector('h1')?.textContent).toContain('TraceLine');
    expect(compiled.textContent).toContain('Compare text blocks line by line.');
    expect(compiled.textContent).toContain('Version A');
    expect(compiled.textContent).toContain('Version B');
    expect(app.form.controls.leftText.value).toBe('');
    expect(app.form.controls.rightText.value).toBe('');
    expect(
      compiled.querySelector('[aria-label="Version A text input"]')?.getAttribute('placeholder'),
    ).toBe('Add the text you want to compare');
    expect(
      compiled.querySelector('[aria-label="Version B text input"]')?.getAttribute('placeholder'),
    ).toBe('Add another text block to compare against');
    expect(compiled.textContent).toContain(
      `Copyright © ${new Date().getFullYear()} Asher Bloom. All rights reserved.`,
    );
    expect(compiled.textContent).toContain(
      'Place one text block on each side to review the differences.',
    );
    expect(compiled.textContent).not.toContain('Allowed:');
    expect(app.acceptedFileTooltip).toContain('.json');
    expect(app.acceptedFileTooltip).toContain('25 MB');
    expect(compiled.textContent).not.toContain('Logo ideas');
    expect(compiled.querySelector('app-logo-gallery')).toBeNull();
  });

  it('sends line compare requests', () => {
    const app = fixture.componentInstance as unknown as { form: App['form']; compare: () => void };
    app.form.patchValue({
      leftText: 'Alpha',
      rightText: 'alpha',
    });

    app.compare();

    const request = http.expectOne('/api/compare');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toMatchObject({
      leftText: 'Alpha',
      rightText: 'alpha',
    });
    expect(request.request.body.mode).toBeUndefined();
    request.flush(compareResultFixture);
  });

  it('shows validation feedback for empty input', () => {
    const app = fixture.componentInstance as unknown as {
      form: App['form'];
      compare: () => void;
      errorMessage: () => string;
    };
    app.form.patchValue({ leftText: '', rightText: '' });

    app.compare();

    expect(app.errorMessage()).toContain('Add text');
  });

  it('updates the result view after a successful comparison', () => {
    const app = fixture.componentInstance as unknown as {
      form: App['form'];
      compare: () => void;
      result: () => CompareResult | null;
    };
    app.form.patchValue({ leftText: 'Alpha', rightText: 'Beta' });

    app.compare();
    http.expectOne('/api/compare').flush(compareResultFixture);

    expect(app.result()?.summary.similarityScore).toBe(75);
  });

  it('swaps the Version A and Version B text values', () => {
    const app = fixture.componentInstance as any;
    app.form.patchValue({ leftText: 'left value', rightText: 'right value' });

    app.swapSides();

    expect(app.form.controls.leftText.value).toBe('right value');
    expect(app.form.controls.rightText.value).toBe('left value');
  });

  it('returns all displayed operations', () => {
    const app = fixture.componentInstance as any;
    app.result.set({
      ...compareResultFixture,
      operations: [
        { type: 'equal', left: 'same', right: 'same' },
        { type: 'changed', left: 'old', right: 'new' },
      ],
    });
    fixture.detectChanges();

    expect(app.displayedOperations()).toEqual([
      { type: 'equal', left: 'same', right: 'same', leftLineNumber: '1', rightLineNumber: '1' },
      { type: 'changed', left: 'old', right: 'new', leftLineNumber: '2', rightLineNumber: '2' },
    ]);
  });

  it('reports identical text in the result section', () => {
    const app = fixture.componentInstance as any;
    app.result.set({
      ...compareResultFixture,
      operations: [{ type: 'equal', left: 'same', right: 'same' }],
      summary: { ...compareResultFixture.summary, similarityScore: 100, changedCount: 0 },
    });
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(app.isIdentical()).toBe(true);
    expect(compiled.textContent).toContain('Texts are identical.');
  });

  it('exports the current result as a downloadable HTML file', async () => {
    const app = fixture.componentInstance as any;
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:diff');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"></svg>', {
        status: 200,
      }),
    );
    app.result.set(compareResultFixture);
    fixture.detectChanges();

    await app.exportResult();

    expect(createObjectURL).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:diff');
    expect(createObjectURL.mock.calls[0][0]).toBeInstanceOf(Blob);
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    const html = await blob.text();
    const exportedDocument = new DOMParser().parseFromString(html, 'text/html');
    expect(html).toContain('Comparison View');
    expect(html).toContain('app-code-editor');
    expect(html).toContain('data:image/svg+xml;charset=utf-8');
    expect(html).toContain('grid-template-rows: minmax(0, 1fr) !important');
    expect(exportedDocument.querySelector('img.brand-mark')?.getAttribute('src')).toContain(
      'data:image/svg+xml;charset=utf-8',
    );
    expect(exportedDocument.querySelector('button')).toBeNull();
    expect(exportedDocument.querySelector('input')).toBeNull();
    expect(exportedDocument.querySelector('.file-slot')).toBeNull();
  });

  it('loads valid files and sends multipart compare requests', async () => {
    const app = fixture.componentInstance as any;
    app.leftFileRef = new File(['alpha'], 'left.txt', { type: 'text/plain' });
    app.rightFileRef = new File(['beta'], 'right.txt', { type: 'text/plain' });
    app.leftFile.set({ name: 'left.txt', size: 5, characters: 5, words: 1, lines: 1 });
    app.rightFile.set({ name: 'right.txt', size: 4, characters: 4, words: 1, lines: 1 });
    app.form.patchValue({ leftText: 'alpha', rightText: 'beta' });

    app.compare();

    const request = http.expectOne('/api/compare/files');
    expect(request.request.method).toBe('POST');
    expect(request.request.body instanceof FormData).toBe(true);
    request.flush(compareResultFixture);
    expect(app.leftFile()?.name).toBe('left.txt');
    expect(app.rightFile()?.name).toBe('right.txt');
    expect(app.hasUploadedFile()).toBe(true);
  });

  it('rejects invalid file types before upload', () => {
    const app = fixture.componentInstance as any;

    app.selectFile('left', fileEvent(new File(['bad'], 'malware.exe')));

    expect(app.errorMessage()).toContain('not a supported file type');
  });

  it('clears uploaded file metadata per side', async () => {
    const app = fixture.componentInstance as any;
    app.selectFile('left', fileEvent(new File(['alpha'], 'left.txt')));
    await new Promise((resolve) => setTimeout(resolve));

    app.clearFile('left');

    expect(app.leftFile()).toBeNull();
  });

  it('loads a right-side file into the editor', async () => {
    const app = fixture.componentInstance as any;

    app.selectFile('right', fileEvent(new File(['{"name":"TraceLine"}'], 'right.json')));
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(app.rightFile()?.name).toBe('right.json');
    expect(app.form.controls.rightText.value).toBe('{"name":"TraceLine"}');
  });

  it('rejects oversized files', () => {
    const app = fixture.componentInstance as any;
    const largeFile = new File([new Uint8Array(25 * 1024 * 1024 + 1)], 'large.txt');

    app.selectFile('left', fileEvent(largeFile));

    expect(app.errorMessage()).toContain('larger than the 25 MB limit');
  });

  it('prevents default drag behavior', () => {
    const app = fixture.componentInstance as any;
    const preventDefault = vi.fn();

    app.allowDrop({ preventDefault } as unknown as DragEvent);

    expect(preventDefault).toHaveBeenCalled();
  });

  it('formats operation text for every diff state', () => {
    const app = fixture.componentInstance as any;

    expect(app.operationText({ type: 'added', right: 'new' }, 'right')).toBe('new');
    expect(app.operationText({ type: 'removed', left: 'old' }, 'left')).toBe('old');
    expect(app.operationText({ type: 'equal', left: 'same', right: 'same' }, 'left')).toBe('same');
    expect(
      app.operationSegments(
        { type: 'changed', leftSegments: [{ type: 'removed', text: 'old' }] },
        'left',
      ),
    ).toEqual([{ type: 'removed', text: 'old' }]);
    expect(app.operationSegments({ type: 'added', right: 'new' }, 'right')).toEqual([
      { type: 'added', text: 'new' },
    ]);
  });

  it('handles compare API errors', () => {
    const app = fixture.componentInstance as any;
    app.form.patchValue({ leftText: 'Alpha', rightText: 'Beta' });

    app.compare();
    http
      .expectOne('/api/compare')
      .flush({ error: 'backend failed' }, { status: 500, statusText: 'Server Error' });

    expect(app.errorMessage()).toBe('backend failed');
  });

  it('handles keyboard shortcuts', () => {
    const app = fixture.componentInstance as any;
    app.form.patchValue({ leftText: 'Alpha', rightText: 'Beta' });
    const compare = vi.spyOn(app, 'compare');
    const swap = vi.spyOn(app, 'swapSides');

    app.handleKeyboard(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true }));
    app.handleKeyboard(new KeyboardEvent('keydown', { key: 'X', ctrlKey: true, shiftKey: true }));

    expect(compare).toHaveBeenCalled();
    expect(swap).toHaveBeenCalled();
    http.expectOne('/api/compare').flush(compareResultFixture);
  });
});

function fileEvent(file: File): Event {
  return {
    target: {
      files: [file],
      value: '',
    },
  } as unknown as Event;
}

const compareResultFixture: CompareResult = {
  mode: 'line',
  leftText: 'Alpha',
  rightText: 'Beta',
  operations: [
    {
      type: 'changed',
      left: 'Alpha',
      right: 'Beta',
      leftSegments: [{ type: 'removed', text: 'Alpha' }],
      rightSegments: [{ type: 'added', text: 'Beta' }],
      leftIndex: 0,
      rightIndex: 0,
    },
  ],
  summary: {
    similarityScore: 75,
    addedCount: 0,
    removedCount: 0,
    changedCount: 1,
    totalLines: 1,
    addedLines: 0,
    removedLines: 0,
    changedLines: 1,
    totalWords: 1,
    changedWords: 1,
    totalCharacters: 5,
    changedCharacters: 5,
    processingTimeMillis: 2,
  },
};
