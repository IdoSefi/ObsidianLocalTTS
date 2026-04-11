import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, ViewPlugin } from "@codemirror/view";
import { editorInfoField } from "obsidian";

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

const trackedSourceEditorViews = new Set<EditorView>();

const sourceEditorTrackingPlugin = ViewPlugin.fromClass(
  class {
    constructor(private readonly view: EditorView) {
      trackedSourceEditorViews.add(view);
    }

    destroy(): void {
      trackedSourceEditorViews.delete(this.view);
    }
  },
);

export const sourcePlaybackHighlightExtension = [sourcePlaybackHighlightField, sourceEditorTrackingPlugin];

function getEditorNotePath(view: EditorView): string | null {
  const info = view.state.field(editorInfoField, false);
  return info?.file?.path ?? null;
}

function editorHasFocus(view: EditorView): boolean {
  const activeElement = view.dom.ownerDocument.activeElement;
  return activeElement !== null && view.dom.contains(activeElement);
}

export function getTrackedSourceEditorViewForNote(notePath: string): EditorView | null {
  let fallback: EditorView | null = null;

  for (const view of trackedSourceEditorViews) {
    if (getEditorNotePath(view) !== notePath) {
      continue;
    }

    if (editorHasFocus(view)) {
      return view;
    }

    fallback ??= view;
  }

  return fallback;
}
