// Minimal JSON highlighting for request bodies. Monaco's full JSON language service needs its own
// worker and validation, which a request body editor doesn't need.
import type * as Monaco from 'monaco-editor/editor/editor.api';

export const JSON_LANGUAGE_ID = 'json';

export function registerJsonLanguage(monaco: typeof Monaco): void {
  monaco.languages.register({ id: JSON_LANGUAGE_ID });
  monaco.languages.setMonarchTokensProvider(JSON_LANGUAGE_ID, {
    defaultToken: '',
    tokenizer: {
      root: [
        [/\s+/, 'white'],
        [/"(?:[^"\\]|\\.)*"(?=\s*:)/, 'key'],
        [/"(?:[^"\\]|\\.)*"/, 'string'],
        [/"(?:[^"\\]|\\.)*$/, 'string.invalid'],
        [/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/, 'number'],
        [/\b(?:true|false|null)\b/, 'keyword'],
        [/[{}[\]]/, '@brackets'],
        [/[,:]/, 'delimiter'],
      ],
    },
  });
  monaco.languages.setLanguageConfiguration(JSON_LANGUAGE_ID, {
    brackets: [
      ['{', '}'],
      ['[', ']'],
    ],
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '"', close: '"', notIn: ['string'] },
    ],
  });
}
