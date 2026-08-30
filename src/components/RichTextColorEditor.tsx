import { useEffect, useRef, type FormEvent } from "react";

import {
  applyRichTextColor,
  getRichTextRuns,
  parseRichText,
  RICH_TEXT_COLORS,
  serializeRichText,
  type RichTextColorRange,
} from "../utils/richText";

interface RichTextColorEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  minHeightClassName?: string;
  focusClassName?: string;
  textSizeClassName?: string;
}

const getInheritedColor = (node: Node, root: HTMLElement): string | undefined => {
  let element = node.parentElement;
  while (element && element !== root) {
    const color = element.dataset.richTextColor;
    if (color) return color;
    element = element.parentElement;
  }
  return undefined;
};

const readEditorDocument = (root: HTMLElement) => {
  let text = "";
  const colors: RichTextColorRange[] = [];

  const appendText = (value: string, color?: string) => {
    if (!value) return;
    const start = text.length;
    text += value.replace(/\u00a0/g, " ");
    if (color) colors.push({ start, end: text.length, color });
  };

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      appendText(node.textContent ?? "", getInheritedColor(node, root));
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    if (node.tagName === "BR") {
      appendText("\n");
      return;
    }

    const startLength = text.length;
    node.childNodes.forEach(walk);
    if (
      node !== root &&
      (node.tagName === "DIV" || node.tagName === "P") &&
      text.length > startLength &&
      !text.endsWith("\n")
    ) {
      appendText("\n");
    }
  };

  root.childNodes.forEach(walk);
  return { text: text.replace(/\n$/, ""), colors };
};

const renderEditorValue = (root: HTMLElement, value: string) => {
  root.replaceChildren();
  const runs = getRichTextRuns(value);
  runs.forEach((run) => {
    const parts = run.text.split("\n");
    parts.forEach((part, index) => {
      if (part) {
        const node = run.color ? document.createElement("span") : document.createTextNode(part);
        if (node instanceof HTMLElement) {
          node.dataset.richTextColor = run.color;
          node.style.color = run.color ?? "";
          node.textContent = part;
        }
        root.append(node);
      }
      if (index < parts.length - 1) root.append(document.createElement("br"));
    });
  });
};

const getSelectionOffsets = (
  root: HTMLElement,
): { start: number; end: number } | null => {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) {
    return null;
  }

  const startRange = range.cloneRange();
  startRange.selectNodeContents(root);
  startRange.setEnd(range.startContainer, range.startOffset);
  const endRange = range.cloneRange();
  endRange.selectNodeContents(root);
  endRange.setEnd(range.endContainer, range.endOffset);

  const getRangeTextLength = (targetRange: Range) => {
    const holder = document.createElement("div");
    holder.append(targetRange.cloneContents());
    return readEditorDocument(holder).text.length;
  };

  return {
    start: getRangeTextLength(startRange),
    end: getRangeTextLength(endRange),
  };
};

export const RichTextColorEditor = ({
  value,
  onChange,
  placeholder,
  minHeightClassName = "min-h-32",
  focusClassName = "focus:border-stone-500",
  textSizeClassName = "text-sm",
}: RichTextColorEditorProps) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const paletteRef = useRef<HTMLDetailsElement>(null);
  const lastEmittedValueRef = useRef(value);
  const selectionRef = useRef<{ start: number; end: number } | null>(null);
  const plainText = parseRichText(value).text;

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || value === lastEmittedValueRef.current) return;
    renderEditorValue(editor, value);
    lastEmittedValueRef.current = value;
  }, [value]);

  useEffect(() => {
    const editor = editorRef.current;
    if (editor) renderEditorValue(editor, value);
    // The initial DOM is intentionally populated outside React so native
    // contentEditable selection is not reset by controlled re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const updateSelection = () => {
      const editor = editorRef.current;
      if (!editor) return;
      const offsets = getSelectionOffsets(editor);
      if (offsets && offsets.start !== offsets.end) {
        selectionRef.current = offsets;
      }
    };
    document.addEventListener("selectionchange", updateSelection);
    return () => document.removeEventListener("selectionchange", updateSelection);
  }, []);

  useEffect(() => {
    const closePaletteOnOutsidePointerDown = (event: PointerEvent) => {
      const palette = paletteRef.current;
      if (palette?.open && !palette.contains(event.target as Node)) {
        palette.open = false;
      }
    };

    document.addEventListener("pointerdown", closePaletteOnOutsidePointerDown);
    return () =>
      document.removeEventListener("pointerdown", closePaletteOnOutsidePointerDown);
  }, []);

  const emitEditorValue = (event: FormEvent<HTMLDivElement>) => {
    const documentValue = readEditorDocument(event.currentTarget);
    const nextValue = serializeRichText(documentValue.text, documentValue.colors);
    lastEmittedValueRef.current = nextValue;
    onChange(nextValue);
  };

  const applyColor = (color: string) => {
    const editor = editorRef.current;
    const selection = selectionRef.current;
    if (!editor || !selection || selection.start === selection.end) return;

    const currentDocument = readEditorDocument(editor);
    const currentValue = serializeRichText(currentDocument.text, currentDocument.colors);
    const nextValue = applyRichTextColor(
      currentValue,
      selection.start,
      selection.end,
      color,
    );
    renderEditorValue(editor, nextValue);
    lastEmittedValueRef.current = nextValue;
    onChange(nextValue);
    if (paletteRef.current) paletteRef.current.open = false;
    editor.focus();
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="relative">
        {!plainText && (
          <span className="pointer-events-none absolute left-3 top-2 text-sm text-slate-400">
            {placeholder}
          </span>
        )}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={emitEditorValue}
          className={`${minHeightClassName} w-full whitespace-pre-wrap break-words px-3 py-2 leading-relaxed text-slate-700 outline-none ${textSizeClassName} ${focusClassName}`}
          role="textbox"
          aria-multiline="true"
          aria-label={placeholder}
        />
      </div>

      <div className="relative flex items-center border-t border-slate-200 px-2 py-1.5">
        <details ref={paletteRef} className="relative">
          <summary
            role="button"
            aria-haspopup="true"
            onMouseDown={(event) => event.preventDefault()}
            onClick={(event) => {
              event.preventDefault();
              if (paletteRef.current) {
                paletteRef.current.open = !paletteRef.current.open;
              }
            }}
            className="inline-flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-md border border-slate-200 bg-white text-base font-bold text-slate-700 hover:bg-slate-50 [&::-webkit-details-marker]:hidden"
            aria-label="文字顏色"
            title="文字顏色"
          >
            <span className="border-b-2 border-red-600 leading-none">A</span>
          </summary>

          <div
            className="absolute bottom-0 left-11 z-20 grid w-44 grid-cols-4 gap-2 rounded-lg border border-slate-200 bg-white p-3 shadow-xl"
            role="group"
            aria-label="選擇文字顏色"
          >
            {RICH_TEXT_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => applyColor(color)}
                className="h-7 w-7 rounded-full border-2 border-white shadow ring-1 ring-slate-200"
                style={{ backgroundColor: color }}
                aria-label={`套用文字顏色 ${color}`}
                title={color === "#475569" ? "恢復預設文字顏色" : `文字顏色 ${color}`}
              />
            ))}
          </div>
        </details>
        <span className="pointer-events-none absolute left-14 right-2 top-1/2 -translate-y-1/2 text-[11px] leading-snug text-slate-500">
          請先選取要強調的說明文字內容後，再選取要套用的顏色
        </span>
      </div>

    </div>
  );
};
