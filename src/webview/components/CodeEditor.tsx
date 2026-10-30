import { type MutableRefObject, useEffect, useRef } from 'react';
import { monaco, THEME_NAME } from '../monaco/setup';
import { readClipboard, writeClipboard } from '../utils/clipboard';

/** Lets a parent drive the editor, e.g. move the cursor to a syntax problem. */
export interface CodeEditorApi {
  /** Selects text by offsets, scrolls it into view and focuses the editor. */
  selectRange(start: number, end: number): void;
  /** Formats the text with the `formatter` prop, as one edit that can be undone. */
  format(): void;
}

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
  /** Returns the text formatted, or undefined if it can't be. Enables Shift+Alt+F. */
  formatter?: (text: string) => string | undefined;
  autoFocus?: boolean;
  apiRef?: MutableRefObject<CodeEditorApi | undefined>;
}

/** A Monaco editor that follows the VS Code theme and editor font. */
export function CodeEditor({
  value,
  onChange,
  language,
  ariaLabel,
  onExecute,
  onSave,
  formatter,
  autoFocus = false,
  apiRef,
}: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | undefined>(undefined);
  // Monaco callbacks are registered once, so route them through refs to the latest props.
  const onChangeRef = useRef(onChange);
  const onExecuteRef = useRef(onExecute);
  const onSaveRef = useRef(onSave);
  const formatterRef = useRef(formatter);
  useEffect(() => {
    onChangeRef.current = onChange;
    onExecuteRef.current = onExecute;
    onSaveRef.current = onSave;
    formatterRef.current = formatter;
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
    // Applied directly rather than through Monaco's Format Document, which waits on the worker.
    const format = () => {
      const model = editor.getModel();
      const text = editor.getValue();
      const formatted = formatterRef.current?.(text);
      if (model && formatted !== undefined && formatted !== text) {
        editor.pushUndoStop();
        editor.executeEdits('format', [{ range: model.getFullModelRange(), text: formatted }]);
        editor.pushUndoStop();
      }
    };
    editor.addCommand(monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF, format);
    const disposeClipboard = addClipboardCommands(editor, containerRef.current!);
    const subscription = editor.onDidChangeModelContent(() =>
      onChangeRef.current(editor.getValue()),
    );
    editorRef.current = editor;
    if (apiRef) {
      apiRef.current = {
        selectRange(start, end) {
          const model = editor.getModel();
          if (!model) {
            return;
          }
          const from = model.getPositionAt(start);
          const to = model.getPositionAt(Math.max(start, end));
          const selection = new monaco.Selection(
            from.lineNumber,
            from.column,
            to.lineNumber,
            to.column,
          );
          editor.setSelection(selection);
          editor.revealRangeInCenterIfOutsideViewport(selection);
          editor.focus();
        },
        format() {
          format();
          editor.focus();
        },
      };
    }
    if (autoFocus) {
      editor.focus();
    }

    return () => {
      subscription.dispose();
      disposeClipboard();
      editor.getModel()?.dispose();
      editor.dispose();
      editorRef.current = undefined;
      if (apiRef) {
        apiRef.current = undefined;
      }
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

/** How long after our own cut/copy/paste a browser clipboard event counts as a duplicate. */
const DUPLICATE_EVENT_MS = 1000;

/**
 * Cut, copy and paste with the keyboard through the extension host's clipboard (see
 * utils/clipboard.ts). Like VS Code, cut or copy with nothing selected takes the whole line.
 * Returns a function that removes the listeners added to `container`.
 */
function addClipboardCommands(
  editor: monaco.editor.IStandaloneCodeEditor,
  container: HTMLElement,
): () => void {
  let handledAt = 0;

  /** The text to copy, and the ranges it came from (whole lines for empty selections). */
  const copied = () => {
    const model = editor.getModel();
    const selections = editor.getSelections();
    if (!model || !selections?.length) {
      return undefined;
    }
    const wholeLines = selections.every((s) => s.isEmpty());
    const ranges = selections.map((s) =>
      wholeLines
        ? new monaco.Range(s.startLineNumber, 1, s.startLineNumber + 1, 1)
        : (s as monaco.Range),
    );
    const parts = ranges.map((r, i) =>
      wholeLines
        ? `${model.getLineContent(selections[i].startLineNumber)}${model.getEOL()}`
        : model.getValueInRange(r),
    );
    return { text: parts.join(wholeLines ? '' : model.getEOL()), ranges };
  };

  const copy = () => {
    handledAt = Date.now();
    const result = copied();
    if (result) {
      writeClipboard(result.text);
    }
  };

  const cut = () => {
    handledAt = Date.now();
    const result = copied();
    if (!result || editor.getOption(monaco.editor.EditorOption.readOnly)) {
      return;
    }
    writeClipboard(result.text);
    editor.pushUndoStop();
    editor.executeEdits(
      'cut',
      result.ranges.map((range) => ({ range, text: '' })),
    );
    editor.pushUndoStop();
  };

  const paste = () => {
    handledAt = Date.now();
    void readClipboard().then((text) => {
      if (text) {
        editor.focus();
        // The editor's own paste handling: undo, multiple cursors, auto-indent.
        editor.trigger('keyboard', 'paste', { text });
      }
    });
  };

  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyC, copy);
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyX, cut);
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyV, paste);

  // Where VS Code does manage to replay the key as a browser clipboard event, ignore it, so the
  // text isn't pasted (or the line cut) twice.
  const ignoreDuplicate = (event: Event) => {
    if (Date.now() - handledAt < DUPLICATE_EVENT_MS) {
      event.preventDefault();
      event.stopPropagation();
    }
  };
  const events = ['copy', 'cut', 'paste'] as const;
  events.forEach((type) => container.addEventListener(type, ignoreDuplicate, true));
  return () => events.forEach((type) => container.removeEventListener(type, ignoreDuplicate, true));
}
