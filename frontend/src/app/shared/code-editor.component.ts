import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild,
  forwardRef,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { Compartment } from '@codemirror/state';
import { EditorView, placeholder as editorPlaceholder } from '@codemirror/view';
import { basicSetup } from 'codemirror';

@Component({
  selector: 'app-code-editor',
  standalone: true,
  template: '<div class="editor-shell" #host></div>',
  styles: [
    `
      :host {
        display: block;
        height: 100%;
        min-height: 0;
        overflow: hidden;
      }

      .editor-shell {
        height: 100%;
        min-height: 0;
        max-height: 100%;
        border-radius: 8px;
        overflow: hidden;
        border: 1px solid var(--outline);
        background: var(--surface);
      }

      :host ::ng-deep .cm-editor {
        height: 100%;
        min-height: 0;
        max-height: 100%;
        font-size: 0.92rem;
      }

      :host ::ng-deep .cm-scroller {
        height: 100%;
        overflow: auto;
        font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
      }

      :host ::ng-deep .cm-focused {
        outline: none;
      }
    `,
  ],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => CodeEditorComponent),
      multi: true,
    },
  ],
})
export class CodeEditorComponent
  implements AfterViewInit, OnChanges, OnDestroy, ControlValueAccessor
{
  @ViewChild('host', { static: true }) private readonly host!: ElementRef<HTMLDivElement>;
  @Input() ariaLabel = 'Text editor';
  @Input() placeholder = '';

  private view?: EditorView;
  private value = '';
  private disabled = false;
  private writing = false;
  private readonly languageCompartment = new Compartment();
  private readonly editableCompartment = new Compartment();
  private readonly placeholderCompartment = new Compartment();

  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  ngAfterViewInit(): void {
    this.view = new EditorView({
      doc: this.value,
      parent: this.host.nativeElement,
      extensions: [
        basicSetup,
        EditorView.lineWrapping,
        this.languageCompartment.of([]),
        this.editableCompartment.of(EditorView.editable.of(!this.disabled)),
        this.placeholderCompartment.of(editorPlaceholder(this.placeholder)),
        EditorView.updateListener.of((update) => {
          if (update.focusChanged && !update.view.hasFocus) {
            this.onTouched();
          }
          if (!update.docChanged || this.writing) {
            return;
          }
          this.value = update.state.doc.toString();
          this.onChange(this.value);
        }),
        EditorView.domEventHandlers({
          blur: () => {
            this.onTouched();
          },
        }),
        EditorView.theme({
          '&': {
            backgroundColor: 'var(--surface)',
            color: 'var(--ink)',
          },
          '.cm-gutters': {
            backgroundColor: 'var(--muted-surface)',
            color: 'var(--muted-ink)',
            borderRightColor: 'var(--outline)',
          },
          '.cm-activeLine, .cm-activeLineGutter': {
            backgroundColor: 'transparent',
          },
          '.cm-line': {
            overflowWrap: 'anywhere',
            wordBreak: 'break-word',
          },
          '.cm-placeholder': {
            color: 'var(--muted-ink)',
          },
        }),
      ],
    });
    this.view.dom.setAttribute('aria-label', this.ariaLabel);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['ariaLabel'] && this.view) {
      this.view.dom.setAttribute('aria-label', this.ariaLabel);
    }
    if (changes['placeholder'] && this.view) {
      this.view.dispatch({
        effects: this.placeholderCompartment.reconfigure(editorPlaceholder(this.placeholder)),
      });
    }
  }

  ngOnDestroy(): void {
    this.view?.destroy();
  }

  writeValue(value: string | null): void {
    this.value = value ?? '';
    if (!this.view) {
      return;
    }
    this.writing = true;
    this.view.dispatch({
      changes: {
        from: 0,
        to: this.view.state.doc.length,
        insert: this.value,
      },
    });
    this.writing = false;
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
    this.view?.dispatch({
      effects: this.editableCompartment.reconfigure(EditorView.editable.of(!isDisabled)),
    });
  }
}
