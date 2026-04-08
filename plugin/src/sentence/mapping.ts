export interface TextOffsetMappingResult {
  offset: number | null;
}

/**
 * Placeholder for Reading-view click -> text offset mapping.
 * Codex should replace this with a real DOM traversal implementation.
 */
export function resolveRenderedClickToTextOffset(_root: HTMLElement, _target: EventTarget | null): TextOffsetMappingResult {
  return { offset: null };
}
