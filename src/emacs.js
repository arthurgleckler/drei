let killRing = "";

function addEmacsKeyBindings(editor) {
  editor.addEventListener("keydown", (e) => {
    if (! (e.ctrlKey || e.altKey)) {
      return;
    }

    const sel = window.getSelection();

    if (!sel || !sel.rangeCount) return;

    const range = sel.getRangeAt(0);

    if (!range || !range.collapsed) return;

    const position = getCaretCharacterOffsetWithin(editor);
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
      backwardSentence(editor);
      e.preventDefault();
      break;
    }

    case e.ctrlKey && e.key === "b":
      backwardChar(editor);
      e.preventDefault();
      break;

    case e.altKey && e.key === "b": {
      backwardWord(editor);
      e.preventDefault();
      break;
    }

    case e.altKey && e.key === "d": {
      // <> Not yet working.

      const after = text.slice(position);
      const match = after.match(/^\s*\S+/);

      if (match) {
        const len = match[0].length;

        killRing = match[0];
        deleteText(editor, position, len);
      }
      e.preventDefault();
      break;
    }

    case e.altKey && e.key === "e": {
      forwardSentence(editor);
      e.preventDefault();
      break;
    }

    case e.ctrlKey && e.key === "f":
      forwardChar(editor);
      e.preventDefault();
      break;

    case e.altKey && e.key === "f": {
      forwardWord(editor);
      e.preventDefault();
      break;
    }

    case e.altKey && e.key === "k": {
      // <> Not yet working.

      const after = text.slice(position);
      const ix = after.indexOf("\n");
      const len = ix >= 0 ? ix : after.length;

      killRing = after.slice(0, len);
      deleteText(editor, position, len);
      e.preventDefault();
      break;
    }

    case e.ctrlKey && e.key === "y": {
      // <> Not yet working.

      if (killRing.length > 0) {
        insertText(editor, position, killRing);
        moveCursor(editor, position + killRing.length);
      }
      e.preventDefault();
      break;
    }
    }
  });
}

function move(node, offset) {
  const selection = window.getSelection();

  selection.removeAllRanges();

  const range = document.createRange();

  range.setStart(node, offset);
  range.collapse(true);
  selection.addRange(range);
}

// <> Include apostrophe among word constituents.

// <> Factor out what's common between backwardChar and forwardChar.
function backwardChar(editor) {
  const selection = window.getSelection();

  if (selection.rangeCount === 0) return;

  const range = selection.getRangeAt(0);
  let node = range.endContainer;

  if (! editor.contains(node)) return;

  const i = range.endOffset;

  if (i > 0) {
    move(node, i - 1);
  } else {
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);

    walker.currentNode = node;
    do {
      node = walker.previousNode();
    } while (node && node.length === 0);
    if (node) move(node, node.length);
  }
}

// Move backward over regexp if a match is present.  Don't cross element
// boundaries.
function backwardRegexp(i, textNode, regexp) {
  if (i > 0) {
    const r = regexp.exec(textNode.nodeValue.slice(0, i));

    if (r) return i - r[0].length;
  }
  return i;
}

function backwardSentence(editor) {
  // <> Not yet working.
}

// <> Factor out what's common between backwardWord and forwardWord.

// Move backward by one word.  Words stop before element boundaries.
function backwardWord(editor) {
  const selection = window.getSelection();

  if (selection.rangeCount === 0) return;

  const range = selection.getRangeAt(0);

  if (!editor.contains(range.startContainer)) return;
  range.startContainer.parentNode.normalize();

  let node = range.startContainer;
  const i = range.startOffset;

  if (i > 0) {
    const j = backwardRegexp(i, node, /\w+\W*$/);

    // <> `forwardWord' may need an analogous condition.  See "on Github" in the
    // "backup-sampling.html" example I've been using.  Two M-f's are required
    // to move past the end of it.
    if (j < i) {
      move(node, j);
      return;
    }
  }

  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);

  walker.currentNode = node;
  do {
    node = walker.previousNode();
  } while (node && node.length === 0);
  if (node) {
    move(node, backwardRegexp(node.length, node, /\w+\W*$/));
  }
}

function forwardChar(editor) {
  const selection = window.getSelection();

  if (selection.rangeCount === 0) return;

  const range = selection.getRangeAt(0);
  let node = range.endContainer;

  if (! editor.contains(node)) return;

  const i = range.endOffset;

  if (i < node.length) {
    move(node, i + 1);
  } else {
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);

    walker.currentNode = node;
    do {
      node = walker.nextNode();
    } while (node && node.length === 0);
    if (node) move(node, 0);
  }
}

// If `regexp' matches forward, move over it greedily.  Return the final
// position.  Ensure that walker.currentNode is current.  If there is no match,
// return -1.
function forwardOneRegexp(walker, i, regexp) {
  let s = walker.currentNode.nodeValue.slice(i);
  let match = regexp.exec(s);

  if (match) {
    let j = i;                    // start of text in current Node
    let k = 0;                    // total match length across Nodes
    let pk = 0;                   // previous total match length

    while (true) {
      k = match[0].length;
      j += k - pk;
      if (j === walker.currentNode.nodeValue.length) {
        if (walker.nextNode()) {
          j = 0;
        } else {
          return j;
        }
      }
      s += walker.currentNode.nodeValue.slice(j); // O(N^2)
      match = regexp.exec(s);

      if (! match || match[0].length === pk) {
        return j;
      }
      pk = k;
    }
  } else {
    return -1;
  }
}

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
      return { node: startNode, position: i };
    }
    j = position;
  }
  return { node: walker.currentNode, position: j };
}

function forwardSentence(editor) {
  // <> Not yet working.
}

// Move forward by one word.  Words stop before element boundaries.
function forwardWord(editor) {
  const selection = window.getSelection();

  if (selection.rangeCount === 0) return;

  const range = selection.getRangeAt(0);

  if (! editor.contains(range.endContainer)) return;

  let { node, position }
      = forwardRegexps(editor, range.endOffset, range.endContainer, /^\W*/,
                       /\w+/);

  move(node, position);
}

function moveCursor(editor, position) {
  const sel = window.getSelection();
  const range = setCaretPosition(editor, position);

  if (range) {
    sel.removeAllRanges();
    sel.addRange(range);
  }
}

function moveToExtreme(editor, beginningP) {
  const range = document.createRange();

  range.selectNodeContents(editor);
  range.collapse(beginningP);

  const sel = window.getSelection();

  sel.removeAllRanges();
  sel.addRange(range);
}

function deleteText(editor, start, count) {
  const { node, offset } = locatePosition(editor, start);
  const range = document.createRange();

  range.setStart(node, offset);

  const endPos = locatePosition(editor, start + count);

  range.setEnd(endPos.node, endPos.offset);
  range.deleteContents();
}

function insertText(editor, position, text) {
  const { node, offset } = locatePosition(editor, position);
  const range = document.createRange();
  const textNode = document.createTextNode(text);

  range.setStart(node, offset);
  range.collapse();
  range.insertNode(textNode);
}

function getCaretCharacterOffsetWithin(el) {
  const sel = window.getSelection();
  let position = 0;
  const range = sel.getRangeAt(0);
  const preRange = range.cloneRange();

  preRange.selectNodeContents(el);
  preRange.setEnd(range.startContainer, range.startOffset);
  position = preRange.toString().length;
  return position;
}

function locatePosition(root, index) {
  let node = root.firstChild;
  let pos = index;

  while (node) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (pos <= node.length) {
        return { node, offset: pos };
      } else {
        pos -= node.length;
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const result = locatePosition(node, pos);

      if (result) return result;
    }
    node = node.nextSibling;
  }
  return { node: root, offset: 0 };
}

function setCaretPosition(container, index) {
  const { node, offset } = locatePosition(container, index);
  const range = document.createRange();

  range.setStart(node, offset);
  range.collapse(true);
  return range;
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