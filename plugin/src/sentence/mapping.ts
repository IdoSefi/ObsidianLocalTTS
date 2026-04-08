export interface TextOffsetMappingResult {
  offset: number | null;
}

function textLengthFromNode(node: Node): number {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent?.length ?? 0;
  }

  let sum = 0;
  for (const child of Array.from(node.childNodes)) {
    sum += textLengthFromNode(child);
  }
  return sum;
}

export function resolveRenderedClickToTextOffset(
  root: HTMLElement,
  target: EventTarget | null,
  event: MouseEvent,
): TextOffsetMappingResult {
  if (!(target instanceof Node) || !root.contains(target)) {
    return { offset: null };
  }

  let clickNode: Node | null = null;
  let clickOffset = 0;
  if ("caretPositionFromPoint" in document && document.caretPositionFromPoint) {
    const caret = document.caretPositionFromPoint(event.clientX, event.clientY);
    if (caret) {
      clickNode = caret.offsetNode;
      clickOffset = caret.offset;
    }
  } else if ("caretRangeFromPoint" in document && document.caretRangeFromPoint) {
    const caretRange = document.caretRangeFromPoint(event.clientX, event.clientY);
    if (caretRange) {
      clickNode = caretRange.startContainer;
      clickOffset = caretRange.startOffset;
    }
  } else if (target.nodeType === Node.TEXT_NODE) {
    clickNode = target;
    clickOffset = 0;
  }

  if (!clickNode || !root.contains(clickNode)) {
    return { offset: null };
  }

  let offset = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const current = walker.currentNode;
    if (current === clickNode) {
      offset += clickOffset;
      return { offset };
    }
    offset += current.textContent?.length ?? 0;
  }

  // Fallback: if click landed on non-text node, approximate by summing previous siblings.
  let node: Node | null = clickNode;
  while (node && node !== root) {
    let sibling = node.previousSibling;
    while (sibling) {
      offset += textLengthFromNode(sibling);
      sibling = sibling.previousSibling;
    }
    node = node.parentNode;
  }
  return { offset };
}
