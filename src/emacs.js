const KILL_RING_MAX = 120;

let killRing = [];
let regionActive = false;
let repetitions = 1;

function addEmacsKeyBindings(editor) {
  editor.addEventListener("keydown", (e) => {
    if (! (e.ctrlKey || e.altKey)) {
      return;
    }

    const text = editor.innerText;

    switch (true) {
    case e.ctrlKey && e.key === " ":
      regionActive = true;
      e.preventDefault();
      break;

    case e.altKey && e.key === "<":
      move(editor, beginningOfBuffer);
      e.preventDefault();
      break;

    case e.altKey && e.key === ">": {
      move(editor, endOfBuffer);
      break;
    }

    case e.altKey && e.key === "a": {
      move(editor, backwardSentence);
      e.preventDefault();
      break;
    }

    case e.ctrlKey && e.key === "b":
      move(editor, backwardChar);
      e.preventDefault();
      break;

    case e.altKey && e.key === "b": {
      move(editor, backwardWord);
      e.preventDefault();
      break;
    }

    case e.altKey && e.key === "Backspace": {
      kill(editor, backwardWord);
      e.preventDefault();
      break;
    }

    case e.altKey && e.key === "d": {
      kill(editor, forwardWord);
      e.preventDefault();
      break;
    }

    case e.altKey && e.key === "e": {
      move(editor, forwardSentence);
      e.preventDefault();
      break;
    }

    case e.ctrlKey && e.key === "f":
      move(editor, forwardChar);
      e.preventDefault();
      break;

    case e.altKey && e.key === "f": {
      move(editor, forwardWord);
      e.preventDefault();
      break;
    }

    case e.ctrlKey && e.key === "g":
      deactivateRegion();
      e.preventDefault();
      break;

    case e.altKey && e.key === "k": {
      kill(editor, forwardSentence);
      e.preventDefault();
      break;
    }

    case e.ctrlKey && e.key === "u": {
      repetitions *= 4;
      e.preventDefault();
      break;
    }

    case e.ctrlKey && e.key === "w": {
      killRegion(editor);
      e.preventDefault();
      break;
    }

    case e.altKey && e.key === "w": {
      killRingSave(editor);
      e.preventDefault();
      break;
    }

    case e.ctrlKey && e.key === "y": {
      yank(editor);
      e.preventDefault();
      break;
    }

    case e.altKey && e.key === "{": {
      move(editor, backwardParagraph);
      e.preventDefault();
      break;
    }

    case e.altKey && e.key === "}": {
      move(editor, forwardParagraph);
      e.preventDefault();
      break;
    }
    }
  });
}

function containingBlock(editor, start) {
  if (start === editor || isBlockElement(start)) {
    return start;
  }
  return containingBlock(editor, start.parentNode);
}

function createTextWalker(root, start) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);

  walker.currentNode = start;
  return walker;
}

function normalizeToTextNode(editor, node, i) {
  if (node.nodeType === Node.TEXT_NODE) {
    return { node: node, position: i };
  } else {
    const walker = createTextWalker(editor, node);

    if (node === editor) {
      if (i === 0) return { node: walker.nextNode(), position: 0 };
      while (walker.nextNode()) {}
    }
    if (walker.nextNode() === null) walker.previousNode();

    const textNode = walker.currentNode;

    return { node: textNode, position: textNode.nodeValue.length };
  }
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

function extremeDescendant(choose, walk) {
  return function(root) {
    let extreme = root;

    while (extreme.firstChild) { extreme = choose(extreme); }
    if (extreme.nodeType === Node.TEXT_NODE) {
      return extreme;
    }
    return walk(createTextWalker(document, extreme));
  };
}

const leftmostDescendant = extremeDescendant(
  x => x.firstChild,
  w => w.nextNode());

const rightmostDescendant = extremeDescendant(
  x => x.lastChild,
  w => w.previousNode());

function beginningOfBuffer(editor, i, node) {
  return { node: leftmostDescendant(editor), position: 0 };
}

function endOfBuffer(editor, i, node) {
  const end = rightmostDescendant(editor);

  return { node: end, position: end.nodeValue.length };
}

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

function repeat(editor, go, node, position) {
  let i = position;
  let n = node;

  for (let j = 0; j < repetitions; j++) {
    const { node: next, position: k } = go(editor, i, n);
    i = k;
    n = next;
  }
  repetitions = 1;
  return { node: n, position: i };
}

function kill(editor, go) {
  const { node: n1, position: i1 } = point(editor);
  const { node: n2, position: i2 } = repeat(editor, go, n1, i1);
  const range = createOpenRange(n1, i1, n2, i2);

  killPush(editor, r => r.extractContents(), range);
}

function move(editor, go) {
  const { node: n1, position: i1 } = point(editor);
  const { node: n2, position: i2 } = repeat(editor, go, n1, i1);

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

// <> This is buggy since I changed it to use `backwardRegexps', especially with
// prefixes.  Fix `backwardRegexps'.
const backwardChar = (e, i, s) => backwardRegexps(e, i, s, /.$/s);

// If `regexp' matches backward, moveCursor over it greedily.  Return the final
// position.  Ensure that walker.currentNode is current.  If there is no match,
// return -1.
function backwardOneRegexp(walker, i, regexp) {
  let s = walker.currentNode.nodeValue.slice(0, i);
  let match = regexp.exec(s);

  if (match) {
    let j = i;                    // end of text in current Node
    let pj = i;                   // end of text in previous Node
    let k = 0;                    // total match length across Nodes
    let pk;                       // previous total match length

    while (true) {
      pk = k;
      k = match[0].length;
      j -= k - pk;
      if (j > 0 || ! walker.previousNode()) {
        return j;
      }
      pj = j;
      j = walker.currentNode.nodeValue.length;
      s = walker.currentNode.nodeValue + s; // O(N^2)
      match = regexp.exec(s);
      if (match[0].length === k) {
        walker.nextNode();
        return pj;
      }
    }
  } else {
    return -1;
  }
}

function backwardParagraph(editor, i, start) {
  const { node, position} = point(editor);
  const block = containingBlock(editor, node);
  const previous = block.previousElementSibling;

  if (previous) {
    const text = rightmostDescendant(previous);

    return { node: text, position: text.nodeValue.length };
  } else {
    return { node: leftmostDescendant(block), position: 0 };
  }
}
// Move backward from `startNode', which must be under `editor', from position
// `i', by greedily matching each regular expression in `regexps', in order,
// until all have been used or one fails to match.
function backwardRegexps(editor, i, startNode, ...regexps) {
  const walker = createTextWalker(editor, startNode);
  let j = i;

  if (startNode.nodeType != Node.TEXT_NODE) {
    walker.previousNode();
    if (walker.currentNode.nodeType != Node.TEXTNODE) {
      walker.nextNode();
    }
  }
  for (const r of regexps) {
    const position = backwardOneRegexp(walker, j, r);

    if (position === -1) {
      return { node: walker.currentNode, position: j };
    }
    j = position;
  }
  return { node: walker.currentNode, position: j };
}

// <> Don't cross block boundaries, esp. <p>.

// <> This is oversimplified.  It only looks for capital letters.
// `backwardRegexps' is insufficient.
const backwardSentence
      = (e, i, s) => backwardRegexps(e, i, s, /[^A-Z]*$/, /[A-Z]$/);

const backwardWord
      = (e, i, s) => backwardRegexps(e, i, s, /[^\w']*$/, /[\w']*$/);

// <> This is buggy since I changed it to use `forwardRegexps', especially with
// prefixes.  Fix `forwardRegexps'.
const forwardChar = (e, i, s) => forwardRegexps(e, i, s, /^./s);

// If `regexp' matches forward, moveCursor over it greedily.  Return the final
// position.  Ensure that walker.currentNode is current.  If there is no match,
// return -1.
function forwardOneRegexp(walker, i, regexp) {
  let s = walker.currentNode.nodeValue.slice(i);
  let match = regexp.exec(s);

  if (match) {
    let j = i;                    // start of text in current Node
    let k = 0;                    // total match length across Nodes
    let pk;                       // previous total match length

    while (true) {
      pk = k;
      k = match[0].length;
      j += k - pk;
      if (j < walker.currentNode.nodeValue.length || ! walker.nextNode()) {
        return j;
      }
      j = 0;
      s += walker.currentNode.nodeValue; // O(N^2)
      match = regexp.exec(s);
      if (match[0].length === k) {
        return j;
      }
    }
  } else {
    return -1;
  }
}

function forwardParagraph(editor, i, start) {
  const block = containingBlock(editor, start);
  const next = block.nextElementSibling;

  if (next) {
    return { node: leftmostDescendant(next), position: 0 };
  } else {
    const text = rightmostDescendant(block);

    return { node: text, position: text.nodeValue.length };
  }
}

// Move forward from `startNode', which must be under `editor', from position
// `i', by greedily matching each regular expression in `regexps', in order,
// until all have been used or one fails to match.
function forwardRegexps(editor, i, startNode, ...regexps) {
  const walker = createTextWalker(editor, startNode);
  let j = i;

  if (startNode.nodeType != Node.TEXT_NODE) {
    walker.nextNode();
    if (walker.currentNode.nodeType != Node.TEXTNODE) {
      walker.previousNode();
    }
  }
  for (const r of regexps) {
    const position = forwardOneRegexp(walker, j, r);

    if (position === -1) {
      return { node: walker.currentNode, position: j };
    }
    j = position;
  }
  return { node: walker.currentNode, position: j };
}

// <> Don't cross block boundaries, esp. <p>.
const forwardSentence
      = (e, i, s) => forwardRegexps(e, i, s, /^[^!.?]*/, /^[!.?]/, /^["']/);

const forwardWord = (e, i, s) => forwardRegexps(e, i, s, /^[^\w']*/, /^[\w']*/);

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

function addSquireImports(d) {
  d.head.appendChild(
    document.createRange().createContextualFragment(
      `<script src="https://cdnjs.cloudflare.com/ajax/libs/squire-rte/1.6.0/squire.js" integrity="sha512-gfJ0h5z/w2Ude2ycrspWNJHvl4MBJCmkN3BF+KHmio2/Usf870s2SPIXUi4mDiYrau3PhCU21dSHd6iQ2s1pWg==" crossorigin="anonymous" referrerpolicy="no-referrer"></script>
       <script defer src="/emacs.js" type="module">`));
}

document.addEventListener("DOMContentLoaded", () => {
  (async function () {
    const { invoke } = window.__TAURI__.core;
    const page =
          await invoke(
            "read_file",
            { path: "/home/arthur/scheme/src/web/site/public/blog/ewe/ewe.html" });
    const parser = new DOMParser();

    document.documentElement.innerHTML = page;
    normalizeLinks(document);
    addSquireImports(document);

    const editor = document.querySelector(".contents");

    if (editor) {
      const editable = editor.innerHTML;

      editor.replaceChildren();

      const squire = new Squire(editor, {
        blockTag: "P"
      });

      squire.focus();
      squire.setHTML(editable);
      squire.setKeyHandler("ctrl-b", null); // Disable Squire's C-b handler.
      squire.setKeyHandler("ctrl-u", null); // Disable Squire's C-u handler.
      squire.setKeyHandler("ctrl-y", null); // Disable Squire's C-y handler.
      addEmacsKeyBindings(editor);
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