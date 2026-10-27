// One-time Monaco setup for the webview: editor features, worker, AQL language and theme sync.
import * as monaco from 'monaco-editor/editor/editor.api';
// Every editor feature (suggest, find, bracket matching, ...) but none of the built-in languages.
import 'monaco-editor/features/register.all';
import {
  AQL_LANGUAGE_ID,
  aqlTokenRules,
  enableAqlValidation,
  registerAqlLanguage,
} from '../aql/aqlLanguage';
import { registerJsonLanguage } from './jsonLanguage';

export { monaco, AQL_LANGUAGE_ID };

export const THEME_NAME = 'vscode-webview';

// The host page passes the worker script's URL. Webviews can't start a worker directly from a
// vscode-resource URL (different origin), so fetch the script and start it from a blob URL.
const workerUrl = document.getElementById('root')?.dataset.monacoWorkerUrl;
let workerBlobUrl: Promise<string> | undefined;

(globalThis as { MonacoEnvironment?: object }).MonacoEnvironment = {
  getWorker(_moduleId: string, label: string): Promise<Worker> {
    if (!workerUrl) {
      return Promise.reject(new Error('Monaco worker URL is missing'));
    }
    workerBlobUrl ??= fetch(workerUrl)
      .then((response) => response.blob())
      .then((blob) => URL.createObjectURL(blob));
    return workerBlobUrl.then((url) => new Worker(url, { name: label }));
  },
};

// Monaco color id -> VS Code CSS variable that the webview exposes.
const COLOR_VARIABLES: Record<string, string> = {
  'editor.background': '--vscode-editor-background',
  'editor.foreground': '--vscode-editor-foreground',
  'editorLineNumber.foreground': '--vscode-editorLineNumber-foreground',
  'editorLineNumber.activeForeground': '--vscode-editorLineNumber-activeForeground',
  'editorCursor.foreground': '--vscode-editorCursor-foreground',
  'editor.selectionBackground': '--vscode-editor-selectionBackground',
  'editor.inactiveSelectionBackground': '--vscode-editor-inactiveSelectionBackground',
  'editor.lineHighlightBackground': '--vscode-editor-lineHighlightBackground',
  'editor.lineHighlightBorder': '--vscode-editor-lineHighlightBorder',
  'editorBracketMatch.background': '--vscode-editorBracketMatch-background',
  'editorBracketMatch.border': '--vscode-editorBracketMatch-border',
  'editorWidget.background': '--vscode-editorWidget-background',
  'editorWidget.border': '--vscode-editorWidget-border',
  'editorSuggestWidget.background': '--vscode-editorSuggestWidget-background',
  'editorSuggestWidget.border': '--vscode-editorSuggestWidget-border',
  'editorSuggestWidget.foreground': '--vscode-editorSuggestWidget-foreground',
  'editorSuggestWidget.selectedBackground': '--vscode-editorSuggestWidget-selectedBackground',
  'editorSuggestWidget.highlightForeground': '--vscode-editorSuggestWidget-highlightForeground',
  focusBorder: '--vscode-focusBorder',
};

/** Rebuilds the Monaco theme from the current VS Code theme. */
function applyVsCodeTheme(): void {
  const classes = document.body.classList;
  const base: monaco.editor.BuiltinTheme = classes.contains('vscode-high-contrast-light')
    ? 'hc-light'
    : classes.contains('vscode-high-contrast')
      ? 'hc-black'
      : classes.contains('vscode-light')
        ? 'vs'
        : 'vs-dark';
  const dark = base === 'vs-dark' || base === 'hc-black';

  const style = getComputedStyle(document.documentElement);
  const colors: Record<string, string> = {};
  for (const [colorId, variable] of Object.entries(COLOR_VARIABLES)) {
    const value = style.getPropertyValue(variable).trim();
    // Monaco only accepts hex colors.
    if (/^#[0-9a-f]{3,8}$/i.test(value)) {
      colors[colorId] = value;
    }
  }

  monaco.editor.defineTheme(THEME_NAME, {
    base,
    inherit: true,
    rules: aqlTokenRules(dark),
    colors,
  });
  monaco.editor.setTheme(THEME_NAME);
}

registerAqlLanguage(monaco);
enableAqlValidation(monaco);
registerJsonLanguage(monaco);
applyVsCodeTheme();
// VS Code toggles body classes (vscode-light, vscode-dark, ...) when the user switches themes.
new MutationObserver(applyVsCodeTheme).observe(document.body, {
  attributes: true,
  attributeFilter: ['class'],
});
