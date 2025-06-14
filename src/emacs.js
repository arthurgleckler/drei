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

function containingBlock(editor, start) {
  return (start === editor || isBlockElement(start))
    ? start
    : containingBlock(editor, start.parentNode);
}

function createBlockWalker(root) {
  return document.createTreeWalker(
    root,
    NodeFilter.SHOW_ALL ^ NodeFilter.SHOW_TEXT,
    e => isBlockElement(e) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP);
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

  if (! editor.contains(end)) return null;
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

function moveCursor(editor, forward, node, offset) {
  if (regionActive) {
    const selection = window.getSelection();

    if (forward) {
      selection.getRangeAt(0).setEnd(node, offset);
    } else {
      selection.getRangeAt(0).setStart(node, offset);
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

function whitespaceCollapseType(block) {
  switch (window.getComputedStyle(block).whiteSpace) {
  case "break-spaces":
  case "pre":
  case "pre-wrap":
    return 2;
  case "normal":
  case "nowrap":
    switch (block.tagName) {
    case "P": return 1;
    case "PRE": return 2;
    default: return 0;
    }
  case "pre-line": return 1;
  default: return 0;
  }
}

function whitespaceCollapseAmount(block, length) {
  switch (whitespaceCollapseType(block)) {
    case 0: return length;
    case 1: return length - 1;
    case 2: return 0;
  }
}

function backwardCollapseWhitespace(editor, i, textNode) {
  const rest = textNode.nodeValue.slice(0, i);
  const suffixMatch = rest.match(/\s+$/);

  if (! suffixMatch) return { node: textNode, position: i };

  const block = containingBlock(editor, textNode);
  const j = i - whitespaceCollapseAmount(block, suffixMatch[0].length);

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

  if (! prefixMatch) return { node: textNode, position: i };

  const block = containingBlock(editor, textNode);
  const j = i + whitespaceCollapseAmount(block, prefixMatch[0].length);

  if (j < textNode.length) { return { node: textNode, position: j }; }

  const walker = createTextWalker(editor, textNode);
  const next = walker.nextNode();

  return next ? { node: next, position: 0 } : { node: textNode, position: j };
}

function beginningOfBlock(block) {
  return forwardCollapseWhitespace(block, 0, leftmostText(block));
}

function endOfBlock(block) {
  const end = rightmostText(block);

  return backwardCollapseWhitespace(block, end.nodeValue.length, end);
}

function beginningOfBuffer(editor, node, i) { return beginningOfBlock(editor); }

function endOfBuffer(editor, node, i) { return endOfBlock(editor); }

function isBlockElement(node) {
  return node.nodeType === Node.ELEMENT_NODE
    && window.getComputedStyle(node).display === "block";
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

  killPush(editor, r => r.extractContents(), range);
}

function move(count, editor, go) {
  const { node: n1, position: i1 } = point(editor);
  const { node: n2, position: i2 } = repeat(count, editor, go, n1, i1);

  if (n1 === n2 && i1 === i2) return;
  moveCursor(editor, precedes(n1, i1, n2, i2), n2, i2);
}

// <> Implement 14.2.3 Appending Kills.
function killPush(editor, getContents, range) {
  killRing.push(getContents(normalizeRange(editor, range)));
  if (killRing.length > KILL_RING_MAX) {
    killRing = killRing.slice(1);
  }
}

function killCore(editor, getContents) {
  const selection = window.getSelection();

  if (selection.rangeCount === 0) return;
  killPush(editor, getContents, selection.getRangeAt(0));
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

function goOr(...gos) {
  return function(e, s, i) {
    for (const go of gos) {
      const { node: n, position: j } = go(e, s, i);

      if ((n !== s) || (j !== i)) return { node: n, position: j };
    }
    return { node: s, position: i };
  };
}

function scope(go, container) {
  return function(e, s, i) { return go(container(e, s), s, i); };
}

function regexpDetent(moveByRegexp) {
  return function(regexp) {
    return goOr(
      scope(moveByRegexp(regexp), containingBlock),
      moveByRegexp(regexp));
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

  return matches.length > 0 ? matches.at(-1)[0].length : 0;
}

function forwardOneRegexp(text, regexp) {
  const match = regexp.exec(text);

  return match ? match[0].length : 0;
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
  return { node: p, position: j };
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

const backwardRegexpDetent = regexpDetent(backwardRegexp);

const forwardRegexpDetent = regexpDetent(forwardRegexp);

const backwardChar = backwardRegexp(/.$/gs);

const forwardChar = forwardRegexp(/^./s);

function backwardParagraph(editor, start, i) {
  const { node, position } = point(editor);
  const block = containingBlock(editor, node);
  const previous = block.previousElementSibling;

  if (previous) {
    const text = rightmostText(previous);

    return { node: text, position: text.nodeValue.length };
  } else {
    return { node: leftmostText(block), position: 0 };
  }
}

function forwardParagraph(editor, start, i) {
  const block = containingBlock(editor, start);
  const next = block.nextElementSibling;

  if (next) {
    return { node: leftmostText(next), position: 0 };
  } else {
    const text = rightmostText(block);

    return { node: text, position: text.nodeValue.length };
  }
}

const backwardSentence
      = backwardRegexpDetent(/(?<=(?:^|(?:\.\.\.\.?|[.?!])["']*)\s+)/gsu);

const forwardSentence = forwardRegexpDetent(/(?:\.\.\.\.?|[.?!]["']*)\s+/su);

const backwardWord = backwardRegexpDetent(/(^|[\w']+)[^\w']*$/gsu);

const forwardWord = forwardRegexpDetent(/^[^\w']*[\w']*/su);

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

// <> Normalize the page, e.g. by removing spaces outside blocks, and coalescing
// spaces inside blocks where appropriate, e.g. inside <p> but not inside <pre>.

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