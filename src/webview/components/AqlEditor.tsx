import { useEffect, useRef } from 'react';
import { AQL_LANGUAGE_ID, monaco, THEME_NAME } from '../monaco/setup';

interface AqlEditorProps {
  value: string;
  onChange: (value: string) => void;
  /** Called on Ctrl/Cmd+Enter. */
  onExecute: () => void;
}

/** A Monaco editor for AQL that follows the VS Code theme and editor font. */
export function AqlEditor({ value, onChange, onExecute }: AqlEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | undefined>(undefined);
  // Monaco callbacks are registered once, so route them through refs to the latest props.
  const onChangeRef = useRef(onChange);
  const onExecuteRef = useRef(onExecute);
  useEffect(() => {
    onChangeRef.current = onChange;
    onExecuteRef.current = onExecute;
  });

  useEffect(() => {
    const style = getComputedStyle(document.documentElement);
    const editor = monaco.editor.create(containerRef.current!, {
      value,
      language: AQL_LANGUAGE_ID,
      theme: THEME_NAME,
      ariaLabel: 'AQL query',
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
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => onExecuteRef.current());
    const subscription = editor.onDidChangeModelContent(() =>
      onChangeRef.current(editor.getValue()),
    );
    editorRef.current = editor;
    editor.focus();

    return () => {
      subscription.dispose();
      editor.getModel()?.dispose();
      editor.dispose();
      editorRef.current = undefined;
    };
    // Created once with the initial value; later changes are synced by the effect below.
  }, []);

  // Sync changes made outside the editor, e.g. the Clear button.
  useEffect(() => {
    const editor = editorRef.current;
    if (editor && editor.getValue() !== value) {
      editor.setValue(value);
    }
  }, [value]);

  return <div className="editor" ref={containerRef} />;
}
