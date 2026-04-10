import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";
import { MarkdownView } from "obsidian";

const setPlaybackHighlightEffect = StateEffect.define<{ from: number; to: number }>();
const clearPlaybackHighlightEffect = StateEffect.define<null>();

const playbackHighlightMark = Decoration.mark({
  class: "kokoro-tts-playing-sentence",
});

const sourcePlaybackHighlightField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decorations, transaction) {
    let next = decorations.map(transaction.changes);

    for (const effect of transaction.effects) {
      if (effect.is(setPlaybackHighlightEffect)) {
        const from = Math.max(0, Math.min(effect.value.from, transaction.newDoc.length));
        const to = Math.max(from, Math.min(effect.value.to, transaction.newDoc.length));
        next = Decoration.set([playbackHighlightMark.range(from, to)]);
      }

      if (effect.is(clearPlaybackHighlightEffect)) {
        next = Decoration.none;
      }
    }

    return next;
  },
  provide(field) {
    return EditorView.decorations.from(field);
  },
});

export const sourcePlaybackHighlightExtension = [sourcePlaybackHighlightField];

export function setSourcePlaybackHighlight(view: EditorView, from: number, to: number): void {
  view.dispatch({
    effects: setPlaybackHighlightEffect.of({ from, to }),
  });
}

export function clearSourcePlaybackHighlight(view: EditorView): void {
  view.dispatch({
    effects: clearPlaybackHighlightEffect.of(null),
  });
}

type MaybeCodeMirrorEditor = {
  cm?: EditorView;
  cmEditor?: EditorView;
  editor?: {
    cm?: EditorView;
    cmEditor?: EditorView;
  };
};

export function getSourceModeEditorView(markdownView: MarkdownView): EditorView | null {
  if (markdownView.getMode() !== "source") {
    return null;
  }

  const editor = markdownView.editor as unknown as MaybeCodeMirrorEditor;
  return editor.cm ?? editor.cmEditor ?? editor.editor?.cm ?? editor.editor?.cmEditor ?? null;
}
