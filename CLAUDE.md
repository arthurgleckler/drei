# DREI - Web Editor with Emacs Key Bindings

## Project Overview

DREI (German for "three", but means "DREI Rich Editor Implementation,"
and intended to come after EINE and ZWEI, earlier implementations of
Emacs) is a web-based text editor built with Tauri that implements
Emacs-style keyboard shortcuts and text navigation.  The editor loads
web content from a URL, allows editing with Emacs key bindings, and
can save changes back to the server.

## Architecture

### Technology Stack
- **Frontend**: Vanilla JavaScript with DOM manipulation
- **Backend**: Tauri 2.x with Rust
- **HTTP Client**: reqwest (Rust)
- **Build System**: npm + Cargo

### Components

1. **Tauri Application** (`src-tauri/`)
   - Rust-based desktop application shell
   - Handles HTTP requests to load and save content
   - CLI argument parsing for URL specification
   - Entry point: `src-tauri/src/main.rs`

2. **Editor Core** (`src/emacs.js`)
   - Complete Emacs keybinding implementation
   - Text navigation with semantic understanding (words, sentences, paragraphs)
   - Kill ring (clipboard) with 120-item history
   - Block cursor rendering
   - Region (selection) management

3. **Test Suite** (`tests/`)
   - HTML-based test runner
   - Tests for `collapseRange` and related functions

## Core Concepts

### Text Navigation

The editor uses a sophisticated text navigation system based on "scouts":

- **Scout Pattern**: Abstract class that defines directional movement
  - `BackwardScout` and `ForwardScout` for bidirectional navigation
  - `RegexpBackwardScout` and `RegexpForwardScout` for pattern-based movement

- **Navigation Functions**:
  - Character movement: `forwardChar`, `backwardChar`
  - Word movement: `forwardWord`, `backwardWord`
  - Sentence movement: `forwardSentence`, `backwardSentence`
  - Paragraph movement: `forwardParagraph`, `backwardParagraph`
  - Buffer extremes: `beginningOfBuffer`, `endOfBuffer`

### Whitespace Handling

The editor respects CSS whitespace properties:
- Detects `white-space`, `white-space-collapse` CSS properties
- Handles collapsible vs. preserved whitespace (e.g., `<p>` vs. `<pre>`)
- Functions: `collapseRange`, `whitespaceCollapseType`,
  `whitespaceCollapseAmount`

### Kill Ring (Clipboard)

Emacs-style kill ring with multiple clipboard entries:
- Maximum 120 entries (`KILL_RING_MAX`)
- `kill()`: Cut text to kill ring
- `killRingSave()`: Copy text to kill ring
- `yank()`: Paste from kill ring
- Kill ring supports appending kills (partially implemented)

### Region (Selection)

- Activated with `Ctrl+Space`
- Deactivated with `Ctrl+g`
- Used for copy/cut operations

## Key Bindings

### Movement
- `Ctrl+f`: Forward char
- `Ctrl+b`: Backward char
- `Meta+f`: Forward word
- `Meta+b`: Backward word
- `Meta+e`: Forward sentence
- `Meta+a`: Backward sentence
- `Meta+}`: Forward paragraph
- `Meta+{`: Backward paragraph
- `Meta+>`: End of buffer
- `Meta+<`: Beginning of buffer

### Editing
- `Meta+d`: Kill forward word
- `Meta+Backspace`: Kill backward word
- `Meta+k`: Kill forward sentence
- `Ctrl+w`: Kill region (cut)
- `Meta+w`: Save region to kill ring (copy)
- `Ctrl+y`: Yank (paste)

### Other
- `Ctrl+Space`: Set mark (activate region)
- `Ctrl+g`: Cancel/deactivate region
- `Ctrl+x Ctrl+s`: Save page
- `Ctrl+q`: Quit application

### Prefix Arguments
- `Ctrl+u`: Universal argument (default 4, can be chained)
- `Meta+[digit]`: Numeric argument (can accumulate digits)

## Tauri Commands

### `read_page()`
Fetches HTML content from the URL specified via `--url` CLI argument.

**Returns**: HTML string

**Error**: Returns error message if request fails

### `write_contents(contents: String)`
POSTs the edited HTML content back to the URL.

**Parameters**:
- `contents`: HTML string of the edited content

**Returns**: `Ok(())` on success

**Error**: Returns error message with status and details

### `exit(message: String)`
Prints a message and exits the application with code 1.

## Development

### Setup
```bash
npm install
```

### Running
```bash
npm run dev
# or
npm run tauri dev -- -- --url <your-url>
```

The dev script is configured to use
`https://speechcode.local/blog/drei` by default.

### Building
```bash
npm run tauri build
```

### Testing
Open `tests/runner.html` in a browser to run the test suite.

## File Structure

```
drei/
├── src/
│   ├── emacs.js           # Core editor implementation
│   ├── index.html         # Entry point HTML
│   └── assets/            # Static assets
├── src-tauri/
│   ├── src/
│   │   ├── main.rs        # Tauri app entry point
│   │   └── lib.rs         # Library code
│   ├── Cargo.toml         # Rust dependencies
│   └── tauri.conf.json    # Tauri configuration
├── tests/
│   └── runner.html        # Test suite
├── package.json           # Node dependencies and scripts
└── .gitignore
```

## Implementation Details

### Tree Walking
The editor uses `TreeWalker` API for efficient DOM traversal:
- `createTextWalker()`: Creates a walker that only visits text nodes
- Filters empty text nodes
- Used for navigation and position normalization

### Range Normalization
All cursor positions are normalized to text nodes:
- `normalizeToTextNode()`: Converts any node position to a text node position
- `normalizeRange()`: Ensures both range endpoints are in text nodes

### Position Representation
Positions are represented as `{node, position}` objects:
- `node`: A DOM Text node
- `position`: Character offset within the text node

### Collapsed Offset Calculation
`collapsedOffsetToTotalOffset()`: Maps positions in collapsed text
(with whitespace removed) back to original text with whitespace
intact.

## Known TODOs

From code comments:
- [ ] Check states of modifiers everywhere
- [ ] Make prefix argument apply to self-inserting characters
- [ ] Implement 14.2.3 Appending Kills (from Emacs manual)
- [ ] Verify if `backwards` parameter is necessary in some functions
- [ ] Handle starting in the middle of an element in `collapseRange`
- [ ] Check for whitespace before first element in `collapseRange`
- [ ] Factor out common code between `BackwardScout.endingPoint` and
      `ForwardScout.endingPoint`
- [ ] Add error handling for `readPage()` and `writePage()`

## Planned Refactoring: defineKey Function

### Overview
Refactor `makeKeyHandler` to use a declarative `defineKey` function for
defining key bindings, replacing the current large switch statement
approach.

### Usage
```javascript
defineKey("C-x C-s", function (editor, repetitions) {
  writePage();
  return 1;
});
```

### Implementation Plan

#### 1. Key Sequence Parser
Create `parseKeySequence(keyString)` to parse strings like `"C-x C-s"`
into structured key descriptors:

```javascript
function parseKeySequence(keyString) {
  // Split by space to get individual keys: ["C-x", "C-s"]
  // For each key:
  //   - Parse modifiers: C- (ctrl), M- (alt/meta)
  //   - Parse the actual key
  // Return: [
  //   { ctrl: true, alt: false, key: "x" },
  //   { ctrl: true, alt: false, key: "s" }
  // ]
}
```

#### 2. Key Binding Storage
Create a tree/trie data structure to store key bindings for efficient
multi-key sequence lookup:

```javascript
const keyBindings = {
  // Example structure:
  // {
  //   ctrl: {
  //     x: {
  //       ctrl: {
  //         s: { action: function(editor, reps) { ... } }
  //       }
  //     },
  //     f: { action: function(editor, reps) { ... } }
  //   },
  //   alt: {
  //     f: { action: function(editor, reps) { ... } }
  //   }
  // }
};
```

#### 3. defineKey Function
```javascript
function defineKey(keySequence, action) {
  const keys = parseKeySequence(keySequence);
  let current = keyBindings;
  
  // Navigate/create the tree structure
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const modifierKey = getModifierKey(key); // "ctrl", "alt", or "none"
    
    if (i === keys.length - 1) {
      // Last key in sequence - store the action
      current[modifierKey][key.key] = { action };
    } else {
      // Intermediate key - ensure path exists
      if (!current[modifierKey]) current[modifierKey] = {};
      if (!current[modifierKey][key.key]) current[modifierKey][key.key] = {};
      current = current[modifierKey][key.key];
    }
  }
}
```

#### 4. Refactored makeKeyHandler
Replace switch statements with tree lookups:

```javascript
function makeKeyHandler(editor) {
  let repetitions = 1;
  
  function* generator() {
    let event = yield;
    let currentBindings = keyBindings;
    
    nextSequence: while (true) {
      // Handle prefix arguments (C-u, M-digit) first
      if (event.altKey && !isNaN(Number(event.key))) {
        // Handle M-digit for prefix argument
        // ... existing logic ...
      } else if (event.ctrlKey && event.key === "u") {
        // Handle C-u for prefix argument
        // ... existing logic ...
      } else {
        // Look up the key binding
        const modifierKey = getModifierKey(event); // "ctrl", "alt", or "none"
        const binding = currentBindings?.[modifierKey]?.[event.key];
        
        if (binding) {
          if (binding.action) {
            // Execute the action and update repetitions
            repetitions = binding.action(editor, repetitions);
            currentBindings = keyBindings; // Reset to root
            event = yield true; // Always preventDefault when key matches
            continue nextSequence;
          } else {
            // Intermediate key in a sequence - wait for next key
            currentBindings = binding;
            event = yield true;
            continue;
          }
        } else {
          // No binding found - reset
          currentBindings = keyBindings;
          event = yield false;
          continue nextSequence;
        }
      }
    }
  }
  
  // ... rest of existing code ...
}
```

#### 5. Migration Examples
Convert existing bindings to `defineKey` calls:

```javascript
// Simple single-key bindings
defineKey("M-<", (editor, reps) => {
  move(editor, reps, beginningOfBuffer);
  return 1;
});

defineKey("M->", (editor, reps) => {
  move(editor, reps, endOfBuffer);
  return 1;
});

defineKey("M-f", (editor, reps) => {
  move(editor, reps, forwardWord);
  return 1;
});

defineKey("C-f", (editor, reps) => {
  move(editor, reps, forwardChar);
  return 1;
});

// Multi-key sequences
defineKey("C-x C-s", (editor, reps) => {
  writePage();
  return 1;
});

defineKey("C-x Backspace", (editor, reps) => {
  kill(editor, reps, backwardSentence);
  return 1;
});

// Special cases
defineKey("C-SPC", (editor, reps) => {
  regionActive = true;
  return 1;
});

defineKey("C-g", (editor, reps) => {
  deactivateRegion();
  return 1;
});
```

#### 6. Key Normalization
Handle special keys consistently:
- `" "` for space (may also accept `"SPC"` or `"Space"`)
- `"Backspace"`
- `"<"`, `">"`, `"{"`, `"}"` etc.

#### 7. Return Value Handling
The action function's return value becomes the new value for
`repetitions`:
- The function is called with `(editor, repetitions)` as arguments
- It returns the new value for the `repetitions` variable
- Typically returns `1` to reset repetitions after executing a command
- Could return a different value if needed for special cases
- When any key matches a binding, `preventDefault()` is invoked

#### 8. Benefits
1. **Declarative**: Key bindings are data, not buried in switch
   statements
2. **Extensible**: Easy to add new bindings or override existing ones
3. **Readable**: Clear mapping between key sequences and actions
4. **Maintainable**: Single source of truth for all key bindings
5. **Debuggable**: Can inspect `keyBindings` object to see all bindings
6. **User-configurable**: Could eventually load custom key bindings
   from a file

#### 9. Potential Challenges
1. **Prefix arguments**: Need special handling for C-u and M-digit
   sequences
2. **Mode-specific bindings**: May want different bindings in different
   contexts
3. **Key sequence timeout**: Real Emacs has a timeout for incomplete
   sequences
4. **Binding conflicts**: Need to detect when a new binding conflicts
   with existing ones

#### 10. Implementation Order
1. Implement `parseKeySequence`
2. Create `keyBindings` data structure
3. Implement `defineKey`
4. Refactor `makeKeyHandler` to use lookups
5. Migrate existing bindings one section at a time
6. Test thoroughly
7. Remove old switch statement code

## Design Philosophy

1. **Semantic Navigation**: Movement commands understand document
   structure (words, sentences, paragraphs)
2. **CSS-Aware**: Respects CSS whitespace rules rather than raw DOM
   text
3. **Generator-Based**: Uses JavaScript generators for lazy evaluation
   of navigation paths
4. **Emacs Compatibility**: Implements Emacs keybindings and concepts
   (kill ring, regions, prefix arguments)
5. **Desktop Integration**: Uses Tauri for native app experience while
   editing web content

## Contributing

When working on this project:
- Maintain Emacs keybinding semantics.
- Respect CSS whitespace properties in text operations.
- Test navigation commands with various HTML structures.
- Ensure that text node normalization is maintained.
- Run tests in `tests/runner.html` after changes.
- Do not add comments that are obvious in context.
- Always use complete sentences, proper punctuation, and proper
  grammar, including in comments and error messages.
- Do not use run-on sentences anywhere, including in comments and
  error messages..
- Never leave whitespace at the end of a source code line.
- Never end source code files with a newline.
- In Javascript, use const when appropriate.