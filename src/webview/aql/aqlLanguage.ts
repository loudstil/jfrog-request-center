// Registers the "aql" language with Monaco: syntax highlighting, brackets and completions.
import type * as Monaco from 'monaco-editor/editor/editor.api';
import {
  AQL_DOMAINS,
  AQL_METHODS,
  type AqlSuggestionKind,
  getAqlCompletions,
} from './aqlCompletions';
import { validateAql } from './aqlValidator';

export const AQL_LANGUAGE_ID = 'aql';

const methodNames = AQL_METHODS.map((m) => m.label).join('|');

const monarch: Monaco.languages.IMonarchLanguage = {
  defaultToken: '',
  domains: [...AQL_DOMAINS],
  tokenizer: {
    root: [
      { include: '@whitespace' },
      [new RegExp(`(\\.)(${methodNames})\\b`), ['delimiter', 'method']],
      [/"\$[a-z]+"/, 'operator'],
      [/"(?:[^"\\]|\\.)*"(?=\s*:)/, 'key'],
      [/"(?:[^"\\]|\\.)*"/, 'string'],
      [/"(?:[^"\\]|\\.)*$/, 'string.invalid'],
      [/-?\d+(?:\.\d+)?/, 'number'],
      [/\b(?:true|false|null)\b/, 'keyword.constant'],
      // Only the dotted domains may contain a dot; otherwise ".find" must stay a separate token.
      [
        /(?:archive\.entries|build\.promotions|[a-z_]+)/,
        { cases: { '@domains': 'keyword', '@default': 'identifier' } },
      ],
      [/[{}()[\]]/, '@brackets'],
      [/[,:.]/, 'delimiter'],
    ],
    whitespace: [[/\s+/, 'white']],
  },
};

const languageConfiguration: Monaco.languages.LanguageConfiguration = {
  brackets: [
    ['{', '}'],
    ['[', ']'],
    ['(', ')'],
  ],
  autoClosingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '"', close: '"', notIn: ['string'] },
  ],
  surroundingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '"', close: '"' },
  ],
};

/** Token colors added on top of the base theme, for tokens the built-in themes don't color. */
export function aqlTokenRules(dark: boolean): Monaco.editor.ITokenThemeRule[] {
  return dark
    ? [
        { token: 'key', foreground: '9CDCFE' },
        { token: 'method', foreground: 'DCDCAA' },
        { token: 'operator', foreground: 'C586C0' },
      ]
    : [
        { token: 'key', foreground: '0451A5' },
        { token: 'method', foreground: '795E26' },
        { token: 'operator', foreground: 'AF00DB' },
      ];
}

export function registerAqlLanguage(monaco: typeof Monaco): void {
  monaco.languages.register({ id: AQL_LANGUAGE_ID, extensions: ['.aql'] });
  monaco.languages.setMonarchTokensProvider(AQL_LANGUAGE_ID, monarch);
  monaco.languages.setLanguageConfiguration(AQL_LANGUAGE_ID, languageConfiguration);

  const kinds: Record<AqlSuggestionKind, Monaco.languages.CompletionItemKind> = {
    domain: monaco.languages.CompletionItemKind.Module,
    method: monaco.languages.CompletionItemKind.Method,
    operator: monaco.languages.CompletionItemKind.Operator,
    field: monaco.languages.CompletionItemKind.Field,
  };

  monaco.languages.registerCompletionItemProvider(AQL_LANGUAGE_ID, {
    triggerCharacters: ['.', '"', '$'],
    provideCompletionItems(model, position) {
      const textBefore = model.getValueInRange({
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      });
      const { partial, suggestions } = getAqlCompletions(textBefore);
      // A partial never spans lines, so the replaced range stays on the cursor's line.
      const range = new monaco.Range(
        position.lineNumber,
        position.column - partial.length,
        position.lineNumber,
        position.column,
      );
      return {
        suggestions: suggestions.map((s) => ({
          label: s.label,
          kind: kinds[s.kind],
          detail: s.detail,
          insertText: s.insertText,
          insertTextRules: s.snippet
            ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
            : undefined,
          range,
        })),
      };
    },
  });
}

const MARKER_OWNER = 'aql-syntax';
const VALIDATION_DELAY_MS = 250;

/** Keeps syntax-check markers (squiggles with hover messages) on every AQL model up to date. */
export function enableAqlValidation(monaco: typeof Monaco): void {
  const watch = (model: Monaco.editor.ITextModel) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const validate = () => {
      if (model.isDisposed() || model.getLanguageId() !== AQL_LANGUAGE_ID) {
        return;
      }
      monaco.editor.setModelMarkers(model, MARKER_OWNER, toMarkers(monaco, model));
    };
    validate();
    const changes = model.onDidChangeContent(() => {
      clearTimeout(timer);
      timer = setTimeout(validate, VALIDATION_DELAY_MS);
    });
    model.onWillDispose(() => {
      clearTimeout(timer);
      changes.dispose();
    });
  };

  monaco.editor.onDidCreateModel((model) => {
    if (model.getLanguageId() === AQL_LANGUAGE_ID) {
      watch(model);
    }
  });
  monaco.editor.onDidChangeModelLanguage(({ model, oldLanguage }) => {
    if (model.getLanguageId() === AQL_LANGUAGE_ID) {
      watch(model);
    } else if (oldLanguage === AQL_LANGUAGE_ID) {
      monaco.editor.setModelMarkers(model, MARKER_OWNER, []);
    }
  });
}

function toMarkers(
  monaco: typeof Monaco,
  model: Monaco.editor.ITextModel,
): Monaco.editor.IMarkerData[] {
  return validateAql(model.getValue()).map((d) => {
    // Problems at the very end ("missing }") have no width; mark the last character instead.
    const start = d.end > d.start ? d.start : Math.max(0, d.start - 1);
    const end = Math.max(d.end, start + 1);
    const from = model.getPositionAt(start);
    const to = model.getPositionAt(end);
    return {
      severity:
        d.severity === 'error' ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
      message: d.message,
      source: 'AQL',
      startLineNumber: from.lineNumber,
      startColumn: from.column,
      endLineNumber: to.lineNumber,
      endColumn: to.column,
    };
  });
}
