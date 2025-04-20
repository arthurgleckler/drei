let repetitions = 1;

function addEmacsKeyBindings(editor) {
  editor.addEventListener("keydown", (e) => {
    if (! (e.ctrlKey || e.altKey)) {
      return;
    }

    const sel = window.getSelection();

    if (!sel || !sel.rangeCount) return;

    const range = sel.getRangeAt(0);

    if (!range || !range.collapsed) return;

    const text = editor.innerText;

    switch (true) {
    case e.altKey && e.key === "<":
      moveToExtreme(editor, true);
      e.preventDefault();
      break;

    case e.altKey && e.key === ">": {
      moveToExtreme(editor, false);
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

    case e.ctrlKey && e.key === "y": {
      // <> Not yet working.
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

function cursorPosition(editor) {
  const selection = window.getSelection();

  if (selection.rangeCount === 0) return null;

  const range = selection.getRangeAt(0);

  if (! editor.contains(range.endContainer)) return null;

  return { node: range.endContainer, position: range.endOffset };
}

function extremeDescendant(choose, walk) {
  return function(root) {
    let extreme = root;

    while (extreme.firstChild) { extreme = choose(extreme); }
    if (extreme.nodeType === Node.TEXT_NODE) {
      return extreme;
    }

    const walker = document.createTreeWalker(document, NodeFilter.SHOW_TEXT);

    walker.currentNode = extreme;
    return walk(walker);
  };
}

const leftmostDescendant = extremeDescendant(
  x => x.firstChild,
  w => w.nextNode());

const rightmostDescendant = extremeDescendant(
  x => x.lastChild,
  w => w.previousNode());

function isBlockElement(node) {
  return node.nodeType === Node.ELEMENT_NODE
    && window.getComputedStyle(node).display === "block";
}

function kill(editor, fn) {
  alert("Unimplemented.");
  return;
  const { node, position } = cursorPosition(editor);
  let i = position;
  let n = node;

  for (let j = 0; j < repetitions; j++) {
    const { node: next, position: k } = fn(editor, i, n);
    i = k;
    n = next;
  }
  repetitions = 1;
  moveCursor(n, i);
}

function move(editor, fn) {
  const { node, position } = cursorPosition(editor);
  let i = position;
  let n = node;

  for (let j = 0; j < repetitions; j++) {
    const { node: next, position: k } = fn(editor, i, n);
    i = k;
    n = next;
  }
  repetitions = 1;
  moveCursor(n, i);
}

function moveCursor(node, offset) {
  const selection = window.getSelection();

  selection.removeAllRanges();

  const range = document.createRange();

  range.setStart(node, offset);
  range.collapse(true);
  selection.addRange(range);
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

function backwardParagraph(editor) {
  const { node, position} = cursorPosition(editor);
  const block = containingBlock(editor, node);
  const previous = block.previousElementSibling;

  if (previous) {
    const text = rightmostDescendant(previous);

    moveCursor(text, text.nodeValue.length);
  } else {
    const text = leftmostDescendant(block);

    moveCursor(text, 0);
  }
}
// Move backward from `startNode', which must be under `editor', from position
// `i', by greedily matching each regular expression in `regexps', in order,
// until all have been used or one fails to match.
function backwardRegexps(editor, i, startNode, ...regexps) {
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  let j = i;

  walker.currentNode = startNode;
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

// <> This is oversimplified.  It only looks for capital letters.
// `backwardRegexps' is insufficient.
const backwardSentence
      = (e, i, s) => backwardRegexps(e, i, s, /[^A-Z]*$/, /[A-Z]$/);

const backwardWord
      = (e, i, s) => backwardRegexps(e, i, s, /[^\w']*$/, /[\w']*$/);

// <> This is buggy since I changed it to use `forwardRegexps', especially with
// prefixes.  Fix `forwardRegexps'.
const forwardChar = (e, i, s) => forwardRegexps(editor, i, start, /^./s);

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

    moveCursor(text, text.nodeValue.length);
  }
}

// Move forward from `startNode', which must be under `editor', from position
// `i', by greedily matching each regular expression in `regexps', in order,
// until all have been used or one fails to match.
function forwardRegexps(editor, i, startNode, ...regexps) {
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  let j = i;

  walker.currentNode = startNode;
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

const forwardSentence
      = (e, i, s) => forwardRegexps(e, i, s, /^[^!.?]*/, /^[!.?]/, /^["']/);

// <> Include apostrophe among word constituents.
const forwardWord = (e, i, s) => forwardRegexps(e, i, s, /^[^\w']*/, /^[\w']*/);

function moveToExtreme(editor, beginningP) {
  const range = document.createRange();

  range.selectNodeContents(editor);
  range.collapse(beginningP);

  const selection = window.getSelection();

  selection.removeAllRanges();
  selection.addRange(range);
}

function normalizeLinkAttribute(d, type, name) {
  d.querySelectorAll(`${type}[${name}^="/"]`).forEach(e => {
    e[name] = "https://speechcode.com" + e.getAttribute(name);
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
            { path: "/home/arthur/tmp/backup-sampling.html" });
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