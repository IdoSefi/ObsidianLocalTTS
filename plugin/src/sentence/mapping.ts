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

function findFirstTextDescendant(node: Node): Node | null {
  if (node.nodeType === Node.TEXT_NODE) {
    return node;
  }

  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  const next = walker.nextNode();
  return next ?? null;
}

function resolveOffsetFromRange(root: HTMLElement, clickNode: Node, clickOffset: number): number | null {
  try {
    const range = document.createRange();
    range.setStart(root, 0);

    if (clickNode.nodeType === Node.TEXT_NODE) {
      const textLength = clickNode.textContent?.length ?? 0;
      const safeOffset = Math.min(Math.max(clickOffset, 0), textLength);
      range.setEnd(clickNode, safeOffset);
    } else {
      const childCount = clickNode.childNodes.length;
      const safeOffset = Math.min(Math.max(clickOffset, 0), childCount);
      range.setEnd(clickNode, safeOffset);
    }

    return range.toString().length;
  } catch {
    return null;
  }
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
  }

  if (!clickNode && "caretRangeFromPoint" in document && document.caretRangeFromPoint) {
    const caretRange = document.caretRangeFromPoint(event.clientX, event.clientY);
    if (caretRange) {
      clickNode = caretRange.startContainer;
      clickOffset = caretRange.startOffset;
    }
  }

  if (!clickNode) {
    // Reading view often does not place a caret on click.
    // Fall back to the clicked node so we can approximate an offset.
    clickNode = target;
    clickOffset = 0;
  }

  if (clickNode.nodeType !== Node.TEXT_NODE) {
    const textDescendant = findFirstTextDescendant(clickNode);
    if (textDescendant) {
      clickNode = textDescendant;
      clickOffset = 0;
    }
  }

  if (!clickNode || !root.contains(clickNode)) {
    return { offset: null };
  }

  const rangeOffset = resolveOffsetFromRange(root, clickNode, clickOffset);
  if (rangeOffset !== null) {
    return { offset: rangeOffset };
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
