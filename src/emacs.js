Quill.imports["modules/keyboard"].DEFAULTS.bindings = {};

let killRing = "";

function emacsKeyBindings(quill) {
  return {
    "emacs-C-b": {
      key: "B",
      ctrlKey: true,
      handler(range) {
        quill().setSelection(Math.max(range.index - 1, 0));
        return false;
      }
    },
    "emacs-C-f": {
      key: "F",
      ctrlKey: true,
      handler(range) {
        const q = quill();

        q.setSelection(Math.min(range.index + 1, q.getLength() - 1));
        return false;
      }
    },
    "emacs-M-b": {
      key: "B",
      altKey: true,
      handler(range) {
        const q = quill();

        const before = q.getText(0, range.index);
        const reversed = [...before].reverse().join("");
        const match = reversed.match(/^\s*(\S+)/);
        const len = match ? match[0].length : 1;

        q.setSelection(Math.max(range.index - len, 0));
        return false;
      }
    },
    "emacs-M-f": {
      key: "F",
      altKey: true,
      handler(range) {
        const q = quill();
        const text = q.getText(range.index);
        const match = text.match(/^\s*(\S+)/);
        const jump = match ? range.index + match[0].length : range.index;

        q.setSelection(jump);
        return false;
      }
    },
    "emacs-M-<": {
      key: ",",
      altKey: true,
      handler() {
        quill().setSelection(0);
        return false;
      }
    },
    "emacs-M->": {
      key: ".",
      altKey: true,
      handler() {
        const q = quill();

        q.setSelection(q.getLength() - 1);
        return false;
      }
    },
    "emacs-M-a": {
      key: "A",
      altKey: true,
      handler(range) {
        const q = quill();
        const text = q.getText(0, range.index);
        const sentenceStart = Math.max(
          text.lastIndexOf(". ", range.index - 2),
          text.lastIndexOf("! ", range.index - 2),
          text.lastIndexOf("? ", range.index - 2),
        ) + 2;

        q.setSelection(sentenceStart > 1 ? sentenceStart : 0);
        return false;
      }
    },
    "emacs-M-e": {
      key: "E",
      altKey: true,
      handler(range) {
        const q = quill();
        const text = q.getText(range.index);
        const match = text.match(/^.*?[.!?](\s|$)/);
        const len = match ? match[0].length : 1;
        const jump = range.index + len;

        q.setSelection(Math.min(jump, q.getLength() - 1));
        return false;
      }
    },
    "emacs-M-d": {
      key: "D",
      altKey: true,
      handler(range) {
        const q = quill();
        const text = q.getText(range.index);
        const match = text.match(/^\s*\S+/);
        if (match) {
          const len = match[0].length;

          killRing = match[0];
          q.deleteText(range.index, len);
        }
        return false;
      }
    },
    "emacs-M-k": {
      key: "K",
      altKey: true,
      handler(range) {
        const q = quill();
        const text = q.getText(range.index);
        const lineEndRel = text.indexOf("\n");
        const len = lineEndRel >= 0 ? lineEndRel : text.length;

        killRing = text.slice(0, len);
        q.deleteText(range.index, len);
        return false;
      }
    },
    "emacs-C-y": {
      key: "Y",
      ctrlKey: true,
      handler(range) {
        const q = quill();

        if (killRing.length > 0) {
          q.insertText(range.index, killRing);
          q.setSelection(range.index + killRing.length);
        }
        return false;
      }
    }
  };
}

function makeQuill() {
  const Inline = Quill.import("blots/inline");

  class SpanBlot extends Inline {
    static create(value) {
      const node = super.create();

      if (value) node.setAttribute("class", value);
      return node;
    }

    static formats(node) {
      return node.getAttribute("class");
    }

    format(name, value) {
      if (value) {
        this.domNode.setAttribute("class", value);
      } else {
        this.domNode.removeAttribute("class");
      }
    }
  }

  Quill.register(SpanBlot, true);

  const quill = new Quill("#editor-container", {
    modules: {
      keyboard: {
        bindings: emacsKeyBindings(() => quill)
      },
      toolbar: false
    },
    theme: null
  });

  return quill;
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

function addQuillImports(d) {
  d.head.appendChild(
    document.createRange().createContextualFragment(
      `<script src="https://cdn.quilljs.com/1.3.6/quill.min.js"></script>
       <script defer src="/emacs.js" type="module">`));
}

document.addEventListener("DOMContentLoaded", () => {
  (async function () {
    const { invoke } = window.__TAURI__.core;
    const page =
          await invoke(
            "read_file",
            { path: "/tmp/backup-sampling.html" });
    const parser = new DOMParser();

    document.documentElement.innerHTML = page;
    normalizeLinks(document);
    addQuillImports(document);

    const editor = document.querySelector(".contents");

    if (editor) {
      const editable = editor.innerHTML;

      editor.id = "editor-container";
      editor.replaceChildren();

      const quill = makeQuill();

      quill.clipboard.dangerouslyPasteHTML(editable);
      quill.focus();
      quill.setSelection(quill.getLength() - 1);
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