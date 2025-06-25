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
        let digit = Number(event.key);

        if (! Number.isNaN(digit)) {
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
          move(repetitions, editor, beginningOfBuffer);
          repetitions = 1;
          event = yield true;
	  continue nextSequence;
	case ">":
          move(repetitions, editor, endOfBuffer);
          repetitions = 1;
          event = yield true;
	  continue nextSequence;
	case "a":
          move(repetitions, editor, backwardSentence);
          repetitions = 1;
          event = yield true;
	  continue nextSequence;
	case "b":
          move(repetitions, editor, backwardWord);
          repetitions = 1;
          event = yield true;
	  continue nextSequence;
	case "Backspace":
          kill(repetitions, editor, backwardWord);
          repetitions = 1;
          event = yield true;
	  continue nextSequence;
	case "d":
          kill(repetitions, editor, forwardWord);
          repetitions = 1;
          event = yield true;
	  continue nextSequence;
	case "e":
          move(repetitions, editor, forwardSentence);
          repetitions = 1;
          event = yield true;
	  continue nextSequence;
	case "f":
          move(repetitions, editor, forwardWord);
          repetitions = 1;
          event = yield true;
	  continue nextSequence;
	case "k":
          kill(repetitions, editor, forwardSentence);
          repetitions = 1;
          event = yield true;
	  continue nextSequence;
	case "w":
          killRingSave(editor);
          repetitions = 1;
          event = yield true;
	  continue nextSequence;
	case "{":
          move(repetitions, editor, backwardParagraph);
          repetitions = 1;
          event = yield true;
	  continue nextSequence;
	case "}":
          move(repetitions, editor, forwardParagraph);
          repetitions = 1;
          event = yield true;
	  continue nextSequence;
        default:
          event = yield false;
	  continue nextSequence;
        }
      } else if (event.ctrlKey) {
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
        case "b":
          move(repetitions, editor, backwardChar);
          repetitions = 1;
          event = yield true;
	  continue nextSequence;
        case "f":
          move(repetitions, editor, forwardChar);
          repetitions = 1;
          event = yield true;
	  continue nextSequence;
        case "g":
          deactivateRegion();
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
          if (event.ctrlKey && event.key === "s") {
            writePage();
            repetitions = 1;
            event = yield true;
	    continue nextSequence;
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
  };

  const g = generator();

  g.next();

  return function(event) {
    if (g.next(event).value) event.preventDefault();
   };
}

function findContainer(editor, start) {
  return (start === editor || isContainer(start))
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

function normalizeToTextNode(editor, node, i) {
  if (node.nodeType === Node.TEXT_NODE) {
    return { node: node, position: i };
  }

  const walker = createTextWalker(editor, node);

  if (node === editor) {
    if (i === 0) return { node: walker.nextNode(), position: 0 };
    while (walker.nextNode()) {}
  }
  if (walker.nextNode() === null) walker.previousNode();

  const textNode = walker.currentNode;

  return { node: textNode, position: i };
}

function normalizeRange(editor, range) {
  const { node: n1, position: i1 }
        = normalizeToTextNode(editor, range.startContainer, range.startOffset);
  const { node: n2, position: i2 }
        = normalizeToTextNode(editor, range.endContainer, range.endOffset);
  const r = new Range();

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
  return normalizeToTextNode(editor, end, range.endOffset);
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

    if (backwards) {
      selection.getRangeAt(0).setStart(node, offset);
    } else {
      selection.getRangeAt(0).setEnd(node, offset);
    }
  } else {
    moveCollapsedCursor(node, offset);
  }
}

function extremeText(choose, walk) {
  return function(root) {
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

function whitespaceCollapseType(container) {
  switch (window.getComputedStyle(container).whiteSpace) {
  case "break-spaces":
  case "pre":
  case "pre-wrap":
    return 2;
  case "normal":
  case "nowrap":
    switch (container.tagName) {
    case "P": return 1;
    case "PRE": return 2;
    default: return 0;
    }
  case "pre-line": return 1;
  default: return 0;
  }
}

function whitespaceCollapseAmount(container, length) {
  switch (whitespaceCollapseType(container)) {
    case 0: return length;
    case 1: return length - 1;
    case 2: return 0;
  }
}

function backwardCollapseWhitespace(editor, i, textNode) {
  const rest = textNode.nodeValue.slice(0, i);
  const suffixMatch = rest.match(/\s+$/);

  if (!suffixMatch) return { node: textNode, position: i };

  const container = findContainer(editor, textNode);
  const j = i - whitespaceCollapseAmount(container, suffixMatch[0].length);

  if (j > 0) { return { node: textNode, position: j }; }

  const walker = createTextWalker(editor, textNode);
  const next = walker.nextNode();

  return next
    ? { node: next, position: next.nodeValue.length }
    : { node: textNode, position: j };
}

function forwardCollapseWhitespace(editor, i, textNode) {
  const rest = textNode.nodeValue.slice(i);
  const prefixMatch = rest.match(/^\s+/);

  if (!prefixMatch) return { node: textNode, position: i };

  const container = findContainer(editor, textNode);
  const j = i + whitespaceCollapseAmount(container, prefixMatch[0].length);

  if (j < textNode.length) { return { node: textNode, position: j }; }

  const walker = createTextWalker(editor, textNode);
  const next = walker.nextNode();

  return next ? { node: next, position: 0 } : { node: textNode, position: j };
}

function beginningOfContainer(container) {
  return (container.nodeType === Node.TEXT_NODE)
    ? { node: container, position: 0 }
    : forwardCollapseWhitespace(container, 0, leftmostText(container));
}

function endOfContainer(container) {
  if (container.nodeType === Node.TEXT_NODE) {
    return { node: container, position: container.nodeValue.length };
  }

  const end = rightmostText(container);

  return backwardCollapseWhitespace(container, end.nodeValue.length, end);
}

function beginningOfBuffer(editor, node, i) {
  return beginningOfContainer(editor);
}

function endOfBuffer(editor, node, i) { return endOfContainer(editor); }

function isContainer(node) {
  if (node.nodeType !== Node.ELEMENT_NODE) return false;

  const display = window.getComputedStyle(node).display;

  return display !== "inline" && display !== "inline-container";
}

function precedes(n1, i1, n2, i2) {
  return ((n1 === n2) && (i1 < i2))
    || ((n1.compareDocumentPosition(n2) & Node.DOCUMENT_POSITION_FOLLOWING)
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

function repeat(count, editor, go, node, position) {
  let i = position;
  let n = node;

  for (let j = 0; j < count; j++) {
    const { node: next, position: k } = go(editor, n, i);
    i = k;
    n = next;
  }
  count = 1;
  return { node: n, position: i };
}

function kill(count, editor, go) {
  const { node: n1, position: i1 } = point(editor);
  const { node: n2, position: i2 } = repeat(count, editor, go, n1, i1);
  const range = createOpenRange(n1, i1, n2, i2);

  pushKill(editor, r => r.extractContents(), range);
}

function move(count, editor, go) {
  const { node: n1, position: i1 } = point(editor);
  const { node: n2, position: i2 } = repeat(count, editor, go, n1, i1);

  if (n1 === n2 && i1 === i2) return;
  moveCursor(editor, precedes(n1, i1, n2, i2), n2, i2);
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
      break;
    }
    yield* postOrder(node, orderChildren);
  }
}

// Step backwards through the text, recording the position of any element, even
// nested ones, as you pass.  When moving backward, record the starting position
// of each element, and conversely.  These are the places where motion should
// pause.
function detents(nextChild, orderChildren) {
  return function*(editor, start) {
    yield* takeWhile(filter(postOrderFrom(start, nextChild, orderChildren),
                            n => isContainer(n)),
                     n => n !== editor);
  };
}

const backwardDetents =
      detents(n => n.previousSibling, c => Array.from(c).toReversed());

const forwardDetents = detents(n => n.nextSibling, c => c);

function* textBlocks(start, i, backwards, detents) {
  const d1 = detents.next();

  if (d1.done) return;

  const r1 = document.createRange();

  if (backwards) {
    r1.setStartBefore(d1.value);
  } else {
    r1.setStartAfter(d1.value);
  }
  r1.setEnd(start, i);
  yield r1.toString();

  let p = d1.value;

  for (const d of detents) {
    const rn = document.createRange();

    if (backwards) {
      rn.setStartBefore(d);
      rn.setEndBefore(p);
    } else {
      rn.setStartAfter(d);
      rn.setEndAfter(p);
    }
    yield rn.toString();
    p = d;
  }
}

function positionsEqual(n1, i1, n2, i2) {
  const r1 = document.createRange();
  const r2 = document.createRange();

  r1.setStart(n1, i1);
  r1.collapse(true);
  r2.setStart(n2, i2);
  r2.collapse(true);

  return r1.compareBoundaryPoints(Range.START_TO_START, r2) === 0;
}

function regexpDetent(extreme, generateDetents, moveByRegexp) {
  return function(regexp) {
    const go = moveByRegexp(regexp);

    return function(editor, start, i) {
      for (const d of generateDetents(editor, start)) {
        const { node: n1, position: j1 } = go(d, start, i);

        if (! positionsEqual(n1, j1, start, i)) {
          return { node: n1, position: j1 };
        }

        const { node: n2, position: j2 } = extreme(d);

        if (! positionsEqual(n2, j2, start, i)) {
          return { node: n2, position: j2 };
        }
      }
      return { node: start, position: i };
    };
  };
}

function backwardRange(editor, start, i) {
  const range = document.createRange();

  range.setStartBefore(editor);
  range.setEnd(start, i);
  return range;
}

function forwardRange(editor, start, i) {
  const range = document.createRange();

  range.setStart(start, i);
  range.setEndAfter(editor);
  return range;
}

function backwardText(editor, start, i) {
  return backwardRange(editor, start, i).toString();
}

function forwardText(editor, start, i) {
  return forwardRange(editor, start, i).toString();
}

function backwardOneRegexp(text, regexp) {
  const matches = Array.from(text.matchAll(regexp));

  const m1 = matches.at(-1);

  if (m1 && m1.index !== text.length) return text.length - m1.index;

  const m2  = matches.at(-2);

  if (m2) return text.length - m2.index;
  return 0;
}

function forwardOneRegexp(text, regexp) {
  const match = regexp.exec(text);

  return match ? match.index + match[0].length : 0;
}

function backwardOffset(editor, start, i, offset) {
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

function forwardOffset(editor, start, i, offset) {
  if (i + offset < start.nodeValue.length) {
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
  return { node: p, position: p.nodeValue.length};
}

// <> For efficiency, change these to extract the text string over which to
// match outside of the `repeat' loop.
function backwardRegexp(regexp) {
  return function(editor, start, i) {
    return backwardOffset(
      editor, start, i,
      backwardOneRegexp(backwardText(editor, start, i), regexp));
  };
}

function forwardRegexp(regexp) {
  return function(editor, start, i) {
    return forwardOffset(
      editor, start, i,
      forwardOneRegexp(forwardText(editor, start, i), regexp));
  };
}

const backwardRegexpDetent
      = regexpDetent(beginningOfContainer, backwardDetents, backwardRegexp);

const forwardRegexpDetent
      = regexpDetent(endOfContainer, forwardDetents, forwardRegexp);

const backwardChar = backwardRegexp(/.$/gs);

const forwardChar = forwardRegexp(/^./s);

// <> What should be the definition of a paragraph boundary w.r.t. non-<p>
// elements, e.g. <ul> and <li>?

// <> Fix: Should stop at beginning of paragraph, not at end of previous
// paragraph.
function backwardParagraph(editor, start, i) {
  const { node, position } = point(editor);
  const container = findContainer(editor, node);
  const previous = container.previousElementSibling;

  if (previous) {
    const text = rightmostText(previous);

    return { node: text, position: text.nodeValue.length };
  } else {
    return { node: leftmostText(container), position: 0 };
  }
}

function forwardParagraph(editor, start, i) {
  const container = findContainer(editor, start);
  const next = container.nextElementSibling;

  if (next) {
    return { node: leftmostText(next), position: 0 };
  } else {
    const text = rightmostText(container);

    return { node: text, position: text.nodeValue.length };
  }
}

// <> Fix this in the case of "Make a hero image."  It must be skipping that
// because the previous paragraph doesn't end with a period.  But it should be
// stopping at the <p> boundary.  It's not enough to search inside the <p>, then
// to the beginning of the <p>, and then to the beginning of the containing
// element.  We should stop at every <p> boundary.
const backwardSentence
      = backwardRegexpDetent(
        /(?<=(?:(?:\.\.\.\.?|[.?!])["')\]]*\s+(?!\s)))/gsu);

const forwardSentence
      = forwardRegexpDetent(/(?:(?:\.\.\.\.?|[.?!])["')\]]*)(?=\s+)/su);

const backwardWord = backwardRegexpDetent(/(^|[\w']+)[^\w']*$/gsu);

const forwardWord = forwardRegexpDetent(/^[^\w']*[\w']*/su);

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

  const j = (i + 1 < size) ? i + 1 : i - 1;
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

// <> Normalize the page, e.g. by removing spaces outside containers, and
// coalescing spaces inside containers where appropriate, e.g. inside <p> but
// not inside <pre>.

// <> Catch errors.
async function readPage() {
  const { invoke } = window.__TAURI__.core;

  return await invoke("read_page", { });
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

  return invoke("exit", { message: message});
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