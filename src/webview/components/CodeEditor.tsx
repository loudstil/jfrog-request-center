import { useEffect, useRef } from 'react';
import { monaco, THEME_NAME } from '../monaco/setup';

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  /** A language registered in monaco/setup.ts, e.g. "aql", "json" or "plaintext". */
  language: string;
  ariaLabel: string;
  /** Called on Ctrl/Cmd+Enter. */
  onExecute?: () => void;
  /** Called on Ctrl/Cmd+S. */
  onSave?: () => void;
  autoFocus?: boolean;
}

/** A Monaco editor that follows the VS Code theme and editor font. */
export function CodeEditor({
  value,
  onChange,
  language,
  ariaLabel,
  onExecute,
  onSave,
  autoFocus = false,
}: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | undefined>(undefined);
  // Monaco callbacks are registered once, so route them through refs to the latest props.
  const onChangeRef = useRef(onChange);
  const onExecuteRef = useRef(onExecute);
  const onSaveRef = useRef(onSave);
  useEffect(() => {
    onChangeRef.current = onChange;
    onExecuteRef.current = onExecute;
    onSaveRef.current = onSave;
  });

  useEffect(() => {
    const style = getComputedStyle(document.documentElement);
    const editor = monaco.editor.create(containerRef.current!, {
      value,
      language,
      theme: THEME_NAME,
      ariaLabel,
      automaticLayout: true,
      fixedOverflowWidgets: true,
      fontFamily: style.getPropertyValue('--vscode-editor-font-family').trim() || undefined,
      fontSize: parseInt(style.getPropertyValue('--vscode-editor-font-size'), 10) || 14,
      minimap: { enabled: false },
      padding: { top: 8 },
      quickSuggestions: { other: true, strings: true, comments: false },
      scrollBeyondLastLine: false,
      tabSize: 2,
      wordBasedSuggestions: 'off',
    });
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => onExecuteRef.current?.());
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => onSaveRef.current?.());
    const subscription = editor.onDidChangeModelContent(() =>
      onChangeRef.current(editor.getValue()),
    );
    editorRef.current = editor;
    if (autoFocus) {
      editor.focus();
    }

    return () => {
      subscription.dispose();
      editor.getModel()?.dispose();
      editor.dispose();
      editorRef.current = undefined;
    };
    // Created once with the initial value; later changes are synced by the effect below.
  }, []);

  useEffect(() => {
    const model = editorRef.current?.getModel();
    if (model && model.getLanguageId() !== language) {
      monaco.editor.setModelLanguage(model, language);
    }
  }, [language]);

  // Sync changes made outside the editor, e.g. the Clear button.
  useEffect(() => {
    const editor = editorRef.current;
    if (editor && editor.getValue() !== value) {
      editor.setValue(value);
    }
  }, [value]);

  return <div className="editor" ref={containerRef} />;
}
