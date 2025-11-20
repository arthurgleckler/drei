const KILL_RING_MAX = 120;

let killRing = [];
let regionActive = false;

// <> Check states of modifiers everywhere.

// <> Make prefix argument apply to self-inserting characters, too.

function makeKeyHandler(editor) {
  let repetitions = 1;

  function* generator() {
    let event = yield;

    nextSequence: while (true) {
      if (event.altKey) {
        if (event.key === "Alt") {
          event = yield false;
          continue nextSequence;
        }

        let digit = Number(event.key);

        if (!Number.isNaN(digit)) {
          repetitions = digit;
          while (true) {
            event = yield true;
            if (event.ctrlKey && event.key === "u") {
              event = yield true;
              continue nextSequence;
            }
            digit = Number(event.key);
            if (Number.isNaN(digit)) {
              continue nextSequence;
            }
            repetitions = repetitions * 10 + digit;
          }
        }
        switch (event.key) {
        case "<":
          move(editor, repetitions, beginningOfBuffer);
          repetitions = 1;
          event = yield true;
	  continue nextSequence;
	case ">":
          move(editor, repetitions, endOfBuffer);
          repetitions = 1;
          event = yield true;
	  continue nextSequence;
	case "Backspace":
          kill(editor, repetitions, backwardWord);
          repetitions = 1;
          event = yield true;
	  continue nextSequence;
        case "a":
          move(editor, repetitions, backwardSentence);
          repetitions = 1;
          event = yield true;
	  continue nextSequence;
	case "b":
          move(editor, repetitions, backwardWord);
          repetitions = 1;
          event = yield true;
	  continue nextSequence;
	case "Backspace":
          kill(editor, repetitions, backwardWord);
          repetitions = 1;
          event = yield true;
	  continue nextSequence;
	case "d":
          kill(editor, repetitions, forwardWord);
          repetitions = 1;
          event = yield true;
	  continue nextSequence;
	case "e":
          move(editor, repetitions, forwardSentence);
          repetitions = 1;
          event = yield true;
	  continue nextSequence;
	case "f":
          move(editor, repetitions, forwardWord);
          repetitions = 1;
          event = yield true;
	  continue nextSequence;
	case "k":
          kill(editor, repetitions, forwardSentence);
          repetitions = 1;
          event = yield true;
	  continue nextSequence;
        case "t":
          transpose(editor, backwardWord, forwardWord, repetitions);
          repetitions = 1;
          event = yield true;
	  continue nextSequence;
	case "w":
          killRingSave(editor);
          repetitions = 1;
          event = yield true;
	  continue nextSequence;
	case "{":
          move(editor, repetitions, backwardParagraph);
          repetitions = 1;
          event = yield true;
	  continue nextSequence;
	case "}":
          move(editor, repetitions, forwardParagraph);
          repetitions = 1;
          event = yield true;
	  continue nextSequence;
        default:
          event = yield false;
	  continue nextSequence;
        }
      } else if (event.ctrlKey) {
        if (event.key === "Control") {
          event = yield false;
          continue nextSequence;
        }
        switch (event.key) {
        case "u":
          repetitions = 4;
          event = yield true;

          while (true) {
            if (event.ctrlKey && event.key === "u") {
              repetitions *= 4;
              event = yield true;
            } else {
              break;
            }
          }

          let digit = Number(event.key);

          if (Number.isNaN(digit)) {
            continue nextSequence;
          }
          repetitions = digit;
          while (true) {
            event = yield true;
            if (event.ctrlKey && event.key === "u") {
              event = yield true;
              continue nextSequence;
            }
            digit = Number(event.key);
            if (Number.isNaN(digit)) {
              continue nextSequence;
            }
            repetitions = repetitions * 10 + digit;
          }
        case " ":
          regionActive = true;
          repetitions = 1;
          event = yield true;
	  continue nextSequence;
        case "a":
          move(editor, repetitions, beginningOfLine);
          repetitions = 1;
          event = yield true;
	  continue nextSequence;
        case "b":
          move(editor, repetitions, backwardChar);
          repetitions = 1;
          event = yield true;
	  continue nextSequence;
        case "e":
          move(editor, repetitions, endOfLine);
          repetitions = 1;
          event = yield true;
	  continue nextSequence;
        case "f":
          move(editor, repetitions, forwardChar);
          repetitions = 1;
          event = yield true;
	  continue nextSequence;
        case "g":
          deactivateRegion();
          repetitions = 1;
          event = yield true;
	  continue nextSequence;
        case "n":
          move(editor, repetitions, forwardLine);
          repetitions = 1;
          event = yield true;
	  continue nextSequence;
        case "p":
          move(editor, repetitions, backwardLine);
          repetitions = 1;
          event = yield true;
	  continue nextSequence;
        case "t":
          transpose(editor, backwardChar, forwardChar, repetitions);
          repetitions = 1;
          event = yield true;
	  continue nextSequence;
        case "w":
          killRegion(editor);
          repetitions = 1;
          event = yield true;
	  continue nextSequence;
        case "x":
          event = yield true;
          if (event.altKey) {
          } else if (event.ctrlKey) {
            switch (event.key) {
            case "s":
              writePage();
              repetitions = 1;
              event = yield true;
	      continue nextSequence;
            }
          } else {
            switch (event.key) {
            case "Backspace":
              kill(editor, repetitions, backwardSentence);
              repetitions = 1;
              event = yield true;
	      continue nextSequence;
            }
          }
          repetitions = 1;
          event = yield false;
	  continue nextSequence;
        case "y":
          yank(editor);
          repetitions = 1;
          event = yield true;
	  continue nextSequence;
        default:
          event = yield false;
	  continue nextSequence;
        }
      } else {
        event = yield false;
	continue nextSequence;
      }
    }
  }

  const g = generator();

  g.next();

  return function (event) {
    if (g.next(event).value) event.preventDefault();
  };
}

function findContainer(editor, start) {
  return start === editor || isContainer(start)
    ? start
    : findContainer(editor, start.parentNode);
}

function createTextWalker(root, start) {
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
    e => e.nodeValue === "" ? NodeFilter.FILTER_SKIP : NodeFilter.FILTER_ACCEPT);

  walker.currentNode = start;
  return walker;
}

function normalizeToTextNode(editor, node, i, backwards) {
  if (node.nodeType === Node.TEXT_NODE) {
    return { node: node, position: i };
  }

  let child;

  if (backwards) {
    child = i > 0 ? node.childNodes[i - 1] : node;
  } else {
    child = i < node.childNodes.length ? node.childNodes[i] : node;
  }

  const walker = createTextWalker(editor, child);

  if (backwards) {
    const textNode = walker.currentNode.nodeType === Node.TEXT_NODE
          ? walker.currentNode
          : walker.previousNode();

    return { node: textNode, position: textNode.nodeValue.length };
  } else {
    const textNode = walker.currentNode.nodeType === Node.TEXT_NODE
          ? walker.currentNode
          : walker.nextNode();

    return { node: textNode, position: 0 };
  }
}

function normalizeRange(editor, range) {
  const { node: n1, position: i1 }
        = normalizeToTextNode(editor, range.startContainer, range.startOffset,
                              false);
  const { node: n2, position: i2 }
        = normalizeToTextNode(editor, range.endContainer, range.endOffset,
                              true);
  const r = document.createRange();

  r.setStart(n1, i1);
  r.setEnd(n2, i2);
  return r;
}

function point(editor) {
  const selection = window.getSelection();

  if (selection.rangeCount === 0) return null;

  const range = selection.getRangeAt(0);
  const end = range.endContainer;

  if (!editor.contains(end)) return null;
  return normalizeToTextNode(editor, end, range.endOffset, false);
}

function directionalPoint(backwards, editor) {
  const selection = window.getSelection();

  if (selection.rangeCount === 0) return null;

  const range = selection.getRangeAt(0);
  const limit = backwards ? range.startContainer : range.endContainer;

  if (!editor.contains(limit)) return null;
  return normalizeToTextNode(editor,
                             limit,
                             backwards ? range.startOffset : range.endOffset,
                             backwards);
}

function deactivateRegion() {
  const selection = window.getSelection();
  const range = selection.getRangeAt(0);

  range.collapse(false);
  regionActive = false;
}

function moveCollapsedCursor(node, offset) {
  const selection = window.getSelection();
  const range = document.createRange();

  range.setStart(node, offset);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function moveCursor(editor, backwards, node, offset) {
  if (regionActive) {
    const selection = window.getSelection();
    const range = selection.getRangeAt(0);

    if (backwards) {
      range.setStart(node, offset);
    } else {
      range.setEnd(node, offset);
    }
  } else {
    moveCollapsedCursor(node, offset);
  }
}

function extremeText(choose, walk) {
  return function (root) {
    let extreme = root;

    while (extreme.firstChild) { extreme = choose(extreme); }
    if (extreme.nodeType === Node.TEXT_NODE) {
      return extreme;
    }
    return walk(createTextWalker(document, extreme));
  };
}

const leftmostText = extremeText(
  x => x.firstChild,
  w => w.nextNode());

const rightmostText = extremeText(
  x => x.lastChild,
  w => w.previousNode());

function extremeNode(limit, walk) {
  return function(range) {
    const start = limit(range);

    return (start.nodeType === Node.TEXT_NODE)
      ? start
      : walk(
        document.createTreeWalker(
          start,
          NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT));
  };
}

const extremeLeft = extremeNode(range => range.startContainer,
                                walker => walker.firstChild());
const extremeRight = extremeNode(range => range.endContainer,
                                 walker => walker.lastChild());

function isContainer(node) {
  if (node.nodeType !== Node.ELEMENT_NODE) return false;

  const display = window.getComputedStyle(node).display;

  return display !== "inline" && display !== "inline-container";
}

function precedes(n1, i1, n2, i2) {
  return (
    (n1 === n2 && i1 < i2)
    || (n1.compareDocumentPosition(n2) & Node.DOCUMENT_POSITION_FOLLOWING)
        !== 0);
}

function createOpenRange(n1, i1, n2, i2) {
  const range = document.createRange();

  if (precedes(n1, i1, n2, i2)) {
    range.setStart(n1, i1);
    range.setEnd(n2, i2);
  } else {
    range.setStart(n2, i2);
    range.setEnd(n1, i1);
  }
  return range;
}

function kill(editor, repetitions, scout) {
  const { node: n1, position: i1 } = point(editor);
  const { node: n2, position: i2 } = scout.go(editor, repetitions);
  const range = createOpenRange(n1, i1, n2, i2);

  pushKill(editor, r => r.extractContents(), range);
}

function move(editor, repetitions, scout) {
  const backwards = scout.backwards;
  const { node: n1, position: i1 } = directionalPoint(backwards, editor);
  const { node: n2, position: i2 } = scout.go(editor, repetitions);

  if (n1 === n2 && i1 === i2) return;
  moveCursor(editor, backwards, n2, i2);
}

// <> Implement 14.2.3 Appending Kills.
function pushKill(editor, getContents, range) {
  killRing.push(getContents(normalizeRange(editor, range)));
  if (killRing.length > KILL_RING_MAX) {
    killRing = killRing.slice(1);
  }
}

function killCore(editor, getContents) {
  const selection = window.getSelection();

  if (selection.rangeCount === 0) return;
  pushKill(editor, getContents, selection.getRangeAt(0));
}

function killRegion(editor) {
  killCore(editor, r => r.extractContents());
}

function killRingSave(editor) {
  killCore(editor, r => r.cloneContents());
}

function yank(editor) {
  regionActive = false;
  if (killRing.length > 0) {
    const { node, position } = point(editor);
    const right = node.splitText(position);

    right.parentNode.insertBefore(killRing.at(-1).cloneNode(true), right);
    moveCollapsedCursor(right, 0);
  }
}

function transpose(editor, backwardScout, forwardScout, repetitions) {
  deactivateRegion();

  const start = point(editor);
  const backwardEnd = backwardScout.go(editor, 1);
  const range = createOpenRange(start.node, start.position,
                                backwardEnd.node, backwardEnd.position);
  const contents = range.extractContents();

  const marker = document.createTextNode("");

  range.insertNode(marker);
  moveCollapsedCursor(marker, 0);

  forwardScout.go(editor, repetitions);

  const insertPoint = point(editor);
  const insertRange = document.createRange();

  insertRange.setStart(insertPoint.node, insertPoint.position);
  insertRange.insertNode(contents);
  marker.remove();

  const finalPosition = forwardScout.go(editor, 1);

  moveCollapsedCursor(finalPosition.node, finalPosition.position);
}

function* takeWhile(generator, predicate) {
  for (const x of generator) {
    if (!predicate(x)) return;
    yield x;
  }
}

function* filter(generator, predicate) {
  for (const x of generator) {
    if (predicate(x)) yield x;
  }
}

function* map(generator, f) {
  for (const x of generator) {
    yield f(x);
  }
}

function atMostNth(generator, count) {
  let result = { done: false };

  for (let i = count; i > 0 && !result.done; i--) {
    result = generator.next();
  }
  return result.value;
}

function* postOrder(root, orderChildren) {
  if (root.nodeType === Node.ELEMENT_NODE) {
    for (const c of orderChildren(root.children)) {
      yield* postOrder(c, orderChildren);
    }
  }
  yield root;
}

function* postOrderFrom(start, nextChild, orderChildren) {
  yield start;

  let node = start;

  while (true) {
    const previous = node;

    node = nextChild(node);
    if (node === null) {
      const p = previous.parentNode;

      if (p === null) return;
      yield* postOrderFrom(p, nextChild, orderChildren);
      return;
    }
    yield* postOrder(node, orderChildren);
  }
}

// Step backwards through the text, recording the position of any element, even
// nested ones, as you pass, but only elements for which `isContainer' returns
// true.  When moving backward, record the starting position of each element,
// and conversely.  These are the places where motion should pause.
function detents(nextChild, orderChildren) {
  return function* (editor, start) {
    yield* takeWhile(filter(postOrderFrom(start, nextChild, orderChildren),
                            n => isContainer(n)),
                     n => n !== editor);
  };
}

function makeDetentMaker(backwards) {
  return backwards
    ? detents(n => n.previousSibling, c => Array.from(c).toReversed())
    : detents(n => n.nextSibling, c => c);
}

function* motionRanges(editor, start, i, backwards) {
  const maker = makeDetentMaker(backwards);
  const detents = maker(editor, start);
  const d1 = detents.next();

  if (d1.done) return;

  const r1 = document.createRange();

  if (backwards) {
    r1.setStartBefore(d1.value);
    r1.setEnd(start, i);
  } else {
    r1.setStart(start, i);
    r1.setEndAfter(d1.value);
  }

  yield r1;

  let p = d1.value;

  for (const d of detents) {
    const rn = document.createRange();

    if (backwards) {
      rn.setStartBefore(d);
      rn.setEndBefore(p);
    } else {
      rn.setStartAfter(p);
      rn.setEndAfter(d);
    }
    yield rn;
    p = d;
  }
}

// Accumulate all TEXT nodes in a Range, with the first and last nodes having
// their text truncated to match the Range boundaries.
function expandRange(range) {
  const root = range.commonAncestorContainer.nodeType === Node.TEXT_NODE
    ? range.commonAncestorContainer.parentNode
    : range.commonAncestorContainer;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);

  walker.currentNode = range.startContainer;
  if (range.startContainer.nodeType !== Node.TEXT_NODE) {
    walker.nextNode();
  }

  let node = walker.currentNode;

  if (!range.intersectsNode(node)) {
    return [];
  }

  const accumulator = [];
  let text = node.nodeValue;

  if (node === range.endContainer) {
    text = text.substring(
      node === range.startContainer ? range.startOffset : 0,
      range.endOffset);
  } else if (node === range.startContainer) {
    text = text.substring(range.startOffset);
  }

  if (text) {
    accumulator.push(text);
  }

  if (node === range.endContainer) {
    return accumulator;
  }

  while (walker.nextNode()) {
    node = walker.currentNode;

    if (!range.intersectsNode(node)) {
      break;
    }

    text = node.nodeValue;

    if (node === range.endContainer) {
      text = text.substring(0, range.endOffset);
    }

    if (text) {
      accumulator.push(text);
    }

    if (node === range.endContainer) {
      break;
    }
  }

  return accumulator;
}

function* textBlocks(editor, start, i, backwards) {
  const maker = makeDetentMaker(backwards);
  const detents = maker(editor, start);
  const d1 = detents.next();

  if (d1.done) return;

  const r1 = document.createRange();

  if (backwards) {
    r1.setStartBefore(d1.value);
    r1.setEnd(start, i);
  } else {
    r1.setStart(start, i);
    r1.setEndAfter(d1.value);
  }

  let text = r1.toString();

  if (text !== "") yield text;

  let p = d1.value;

  for (const d of detents) {
    const rn = document.createRange();

    if (backwards) {
      rn.setStartBefore(d);
      rn.setEndBefore(p);
    } else {
      rn.setStartAfter(p);
      rn.setEndAfter(d);
    }
    text = rn.toString();
    if (text !== "") yield text;
    p = d;
  }
}

class Scout {
  constructor(backwards) {
    this.backwards = backwards;
  }

  // We could take a count and return the final stopping point, but using a
  // generator will allow us to do things like visualize all the potential
  // stopping points, e.g. to see where `forwardSentence' would take us for any
  // number of repetitions.
  *stoppingPoints(editor, start, i) {
    let offset = 0;

    for (const b of textBlocks(editor, start, i, this.backwards)) {
      let j = 0;
      let s = b;

      while (true) {
        s = this.affix(s, j);
        j = this.step(s);
        if (j === 0) {
          offset += s.length;
          yield offset;
          break;
        }
        offset += j;
        yield offset;
      }
    }
  }

  go(editor, count) {
    const { node: start, position: i }
          = directionalPoint(this.backwards, editor);
    const offset = atMostNth(this.stoppingPoints(editor, start, i), count);

    return this.endingPoint(editor, start, i, offset);
  }
}

class BackwardScout extends Scout {
  affix(string, i) { return string.slice(0, string.length - i); }

  constructor() {
    super(true);
  }

  // <> Factor out what's common between BackwardScout.endingPoint and
  // ForwardScout.endingPoint.
  endingPoint(editor, start, i, offset) {
    if (i >= offset) return { node: start, position: i - offset };

    let j = offset - i;
    let n;
    let p = start;
    const walker = createTextWalker(editor, start);

    while ((n = walker.previousNode())) {
      const k = n.nodeValue.length;

      if (j <= k) return { node: n, position: k - j };
      j -= k;
      p = n;
    }
    return { node: p, position: j };
  }
}

class ForwardScout extends Scout {
  affix(string, i) { return string.slice(i); }

  constructor() {
    super(false);
  }

  endingPoint(editor, start, i, offset) {
    if (i + offset <= start.nodeValue.length) {
      return { node: start, position: i + offset };
    }

    let j = offset - start.nodeValue.length + i;
    let n;
    let p = start;
    const walker = createTextWalker(editor, start);

    while ((n = walker.nextNode())) {
      const k = n.nodeValue.length;

      if (j <= k) return { node: n, position: j };
      j -= k;
      p = n;
    }
    return { node: p, position: p.nodeValue.length };
  }
}

class BeginningOfBufferScout extends Scout {
  constructor() {
    super(true);
  }

  go(editor, count) {
    return { node: leftmostText(editor), position: 0 };
  }
}

class EndOfBufferScout extends Scout {
  constructor() {
    super(false);
  }

  go(editor, count) {
    const end = rightmostText(editor);

    return { node: end, position: end.nodeValue.length };
  }
}

const beginningOfBuffer = new BeginningOfBufferScout();
const endOfBuffer = new EndOfBufferScout();

class ParagraphBackwardScout extends BackwardScout {
  step(text) { return text.length; }
}

class ParagraphForwardScout extends ForwardScout {
  step(text) { return text.length; }
}

const backwardParagraph = new ParagraphBackwardScout();

const forwardParagraph = new ParagraphForwardScout();

class RegexpBackwardScout extends BackwardScout {
  constructor(regexp) {
    super();
    this.regexp = regexp;
  }

  step(text) {
    const matches = Array.from(text.matchAll(this.regexp));

    const m1 = matches.at(-1);

    if (m1 && m1.index !== text.length) return text.length - m1.index;

    const m2 = matches.at(-2);

    if (m2) return text.length - m2.index;
    return 0;
  }
}

class RegexpForwardScout extends ForwardScout {
  constructor(regexp) {
    super();
    this.regexp = regexp;
  }

  step(text) {
    const match = this.regexp.exec(text);

    return match ? match.index + match[0].length : 0;
  }
}

const backwardSentence = new RegexpBackwardScout(
  /(?<=(?:(?:\.\.\.\.?|[.?!])["')\]]*\s+(?!\s)))/gsu);

const forwardSentence = new RegexpForwardScout(
  /(?:(?:\.\.\.\.?|[.?!])["')\]]*)(?=\s+)/su);

const backwardWord = new RegexpBackwardScout(/(^|[\w']+)[^\w']*$/gsu);

const forwardWord = new RegexpForwardScout(/^[^\w']*[\w']*/su);

class SelectionScout extends Scout {
  constructor(backwards, quantum) {
    super(backwards);
    this.quantum = quantum;
  }

  go(editor, count) {
    const selection = window.getSelection();
    const savedRange = selection.rangeCount > 0
          ? selection.getRangeAt(0).cloneRange()
          : null;

    const startPoint = directionalPoint(this.backwards, editor);

    moveCollapsedCursor(startPoint.node, startPoint.position);

    for (let i = 0; i < count; i++) {
      selection.modify("move",
                       this.backwards ? "backward" : "forward",
                       this.quantum);
    }

    const result = point(editor);

    if (savedRange) {
      selection.removeAllRanges();
      selection.addRange(savedRange);
    }

    return result;
  }
}

const backwardChar = new SelectionScout(true, "character");
const forwardChar = new SelectionScout(false, "character");

const backwardLine = new SelectionScout(true, "line");
const forwardLine = new SelectionScout(false, "line");

const beginningOfLine = new SelectionScout(true, "lineboundary");
const endOfLine = new SelectionScout(false, "lineboundary");

// <> Make cursor disappear when editor doesn't have focus.
function removeBlockCursor(editor) {
  const span = editor.querySelector("span.drei-cursor");

  if (span === null) return;

  const parent = span.parentNode;
  const text = document.createTextNode(span.textContent);

  parent.replaceChild(text, span);
  parent.normalize();
}

function addBlockCursor(editor) {
  const { node: textNode, position: i } = point(editor);
  const size = textNode.length;

  if (size === 0) return;

  const j = i + 1 < size ? i + 1 : i - 1;
  const range = document.createRange();
  const span = document.createElement("span");

  range.setStart(textNode, i < j ? i : j);
  range.setEnd(textNode, i < j ? j : i);
  span.className = "drei-cursor";
  range.surroundContents(span);
}

function normalizeLinkAttribute(d, type, name) {
  d.querySelectorAll(`${type}[${name}^="/"]`).forEach(e => {
    e[name] = "https://speechcode.local" + e.getAttribute(name);
  });
}

const NORMALIZERS = {
  a: ["href"],
  area: ["href"],
  audio: ["src"],
  base: ["href"],
  blockquote: ["cite"],
  button: ["formaction"],
  embed: ["src"],
  form: ["action"],
  iframe: ["src"],
  img: ["src", "srcset", "usemap"],
  input: ["src", "formaction"],
  link: ["href"],
  object: ["data"],
  q: ["cite"],
  script: ["src"],
  source: ["src"],
  track: ["src"],
  video: ["src", "poster"]
};

function normalizeLinks(d) {
  for (const [type, names] of Object.entries(NORMALIZERS)) {
    for (const n of names) {
      normalizeLinkAttribute(d, type, n);
    }
  }
}

// <> Catch errors.
async function readPage() {
  const { invoke } = window.__TAURI__.core;

  return await invoke("read_page", {});
}

function normalizeWhitespace(element) {
  element.normalize();

  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null);

  while (walker.nextNode()) {
    const textNode = walker.currentNode;
    const container = findContainer(element, textNode.parentNode);
    const style = window.getComputedStyle(container);

    switch (style.getPropertyValue("white-space")) {
    case "pre":
    case "pre-line":
    case "pre-wrap":
      if (style.getPropertyValue("white-space-collapse") !== "collapse") {
        continue;
      }
      break;
    case "break-spaces":
    case "normal":
    case "nowrap":
      switch (style.getPropertyValue("white-space-collapse")) {
      case "break-spaces":
      case "preserve":
      case "preserve-breaks":
      case "preserve-spaces":
        continue;
      }
    }

    let normalized = textNode.nodeValue.replace(/\s+/g, " ");

    if (!textNode.previousSibling
        || (textNode.previousSibling.nodeType === Node.ELEMENT_NODE
            && isContainer(textNode.previousSibling))) {
      normalized = normalized.replace(/^\s+/, "");
    }

    if (!textNode.nextSibling
        || (textNode.nextSibling.nodeType === Node.ELEMENT_NODE
            && isContainer(textNode.nextSibling))) {
      normalized = normalized.replace(/\s+$/, "");
    }

    textNode.nodeValue = normalized;
  }
}

// <> Undo `normalizeLinks'.

// <> Catch errors.
async function writePage() {
  const { invoke } = window.__TAURI__.core;
  const contents = document.querySelector(".contents");

  return await invoke("write_contents", { contents: contents.innerHTML });
}

function exit(message) {
  const { invoke } = window.__TAURI__.core;

  return invoke("exit", { message: message });
}

document.addEventListener("DOMContentLoaded", () => {
  (async function () {
    const imports = Array.from(document.querySelectorAll("script"))
          .filter(s => s.src)
          .map(s => s.outerHTML)
          .join("");

    document.documentElement.innerHTML = await readPage();
    normalizeLinks(document);
    document.head.appendChild(
      document.createRange().createContextualFragment(imports));

    const editor = document.querySelector(".contents");

    normalizeWhitespace(editor);
    if (editor) {
      editor.contentEditable = "true";
      editor.focus();
      editor.addEventListener("keydown", makeKeyHandler(editor));
    } else {
      const body = document.querySelector("body");

      body.innerHTML = 'No ".contents" found.';
    }
  })();
});

document.addEventListener("keydown", (event) => {
  if (event.ctrlKey && event.key === "q") {
    window.__TAURI__.process.exit(0);
  }
});