// <> Add tests.

let killRing = "";
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
      repeat(editor, backwardSentence);
      e.preventDefault();
      break;
    }

    case e.ctrlKey && e.key === "b":
      repeat(editor, backwardChar);
      e.preventDefault();
      break;

    case e.altKey && e.key === "b": {
      repeat(editor, backwardWord);
      e.preventDefault();
      break;
    }

    case e.altKey && e.key === "d": {
      // <> Not yet working.
      e.preventDefault();
      break;
    }

    case e.altKey && e.key === "e": {
      repeat(editor, forwardSentence);
      e.preventDefault();
      break;
    }

    case e.ctrlKey && e.key === "f":
      repeat(editor, forwardChar);
      e.preventDefault();
      break;

    case e.altKey && e.key === "f": {
      repeat(editor, forwardWord);
      e.preventDefault();
      break;
    }

    case e.altKey && e.key === "k": {
      // <> Not yet working.
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
    }
  });
}

function moveCursor(node, offset) {
  const selection = window.getSelection();

  selection.removeAllRanges();

  const range = document.createRange();

  range.setStart(node, offset);
  range.collapse(true);
  selection.addRange(range);
}

function move(fn) {
  return function(editor) {
    const selection = window.getSelection();

    if (selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);

    if (! editor.contains(range.endContainer)) return;

    fn(editor, range.endOffset, range.endContainer);
  };
}

// <> This is buggy since I changed it to use `backwardRegexps', especially with
// prefixes.  Fix `backwardRegexps'.
const backwardChar = move(
  function (editor, i, start) {
    const { node, position } = backwardRegexps(editor, i, start, /.$/s);

    moveCursor(node, position);
  });

// <> Factor out what's common between backwardWord and forwardWord.

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
const backwardSentence = move(
  function (editor, i, start) {
    const { node, position }
          = backwardRegexps(editor, i, start, /[^A-Z]*$/, /[A-Z]$/);

    moveCursor(node, position);
  });

// <> Include apostrophe among word constituents.
function backwardWord(editor) {
  const selection = window.getSelection();

  if (selection.rangeCount === 0) return;

  const range = selection.getRangeAt(0);

  if (! editor.contains(range.endContainer)) return;

  const { node, position }
        = backwardRegexps(
          editor, range.endOffset, range.endContainer, /\W*$/, /\w*$/);

  moveCursor(node, position);
}

// <> This is buggy since I changed it to use `forwardRegexps', especially with
// prefixes.  Fix `forwardRegexps'.
const forwardChar = move(
  function (editor, i, start) {
    const { node, position } = forwardRegexps(editor, i, start, /^./s);

    moveCursor(node, position);
  });

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

const forwardSentence = move(
  function (editor, i, start) {
    const { node, position }
          = forwardRegexps(editor, i, start, /^[^!.?]*/, /^[!.?]/, /^["']/);

    moveCursor(node, position);
  });

// <> Include apostrophe among word constituents.
const forwardWord = move(
  function (editor, i, start) {
    const { node, position } = forwardRegexps(editor, i, start, /^\W*/, /^\w*/);

    moveCursor(node, position);
  });

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

function repeat(editor, fn) {
  for (let i = 0; i < repetitions; i++) {
    fn(editor);
  }
  repetitions = 1;
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
        blockTag: 'P'
      });

      squire.focus();
      squire.setHTML(editable);
      squire.setKeyHandler("ctrl-b", null); // Disable Squire's C-b handler.
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