import { EditorView, keymap } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { basicSetup } from "codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { oneDark } from "@codemirror/theme-one-dark";

const DEFAULT_CODE = `console.log("Hello from Dynamic Workers!");

const nums = [1, 2, 3, 4, 5];
const sum = nums.reduce((a, b) => a + b, 0);
console.log("Sum:", sum);

sum`;

const editorParent = document.getElementById("editor-pane") as HTMLDivElement;
const outputEl = document.getElementById("output") as HTMLDivElement;
const runBtn = document.getElementById("run-btn") as HTMLButtonElement;
const clearBtn = document.getElementById("clear-btn") as HTMLButtonElement;

// Theme overrides to blend with our dark UI
const theme = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "14px",
  },
  ".cm-scroller": {
    fontFamily: "var(--font-mono)",
    lineHeight: "1.6",
    padding: "8px 0",
  },
  ".cm-content": {
    padding: "0 16px",
  },
  ".cm-gutters": {
    background: "var(--bg)",
    border: "none",
    color: "var(--text-dim)",
  },
  ".cm-activeLineGutter": {
    background: "var(--surface)",
  },
  ".cm-activeLine": {
    background: "rgba(255,255,255,0.04)",
  },
  "&.cm-focused .cm-cursor": {
    borderLeftColor: "var(--accent)",
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
    background: "rgba(0, 210, 255, 0.15) !important",
  },
});

const editor = new EditorView({
  state: EditorState.create({
    doc: DEFAULT_CODE,
    extensions: [
      basicSetup,
      javascript(),
      oneDark,
      theme,
      keymap.of([
        {
          key: "Mod-Enter",
          run: () => {
            runCode();
            return true;
          },
        },
      ]),
      EditorView.lineWrapping,
    ],
  }),
  parent: editorParent,
});

function appendLine(text: string, className: string = "log") {
  const line = document.createElement("div");
  line.className = `log-line ${className}`;
  line.textContent = text;
  outputEl.appendChild(line);
  outputEl.scrollTop = outputEl.scrollHeight;
}

function clearOutput() {
  outputEl.innerHTML = "";
}

async function runCode() {
  const code = editor.state.doc.toString().trim();
  if (!code) return;

  runBtn.disabled = true;
  runBtn.textContent = "Running…";
  clearOutput();
  appendLine("Executing…", "system");

  try {
    const res = await fetch("/api/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });

    const data = (await res.json()) as {
      logs: { level: string; message: string }[];
      result: string | null;
      error: string | null;
    };

    clearOutput();

    for (const log of data.logs) {
      appendLine(log.message, log.level);
    }

    if (data.error) {
      appendLine(`Error: ${data.error}`, "error");
    }

    if (data.result !== null) {
      appendLine(`→ ${data.result}`, "result");
    }

    if (!data.logs.length && !data.error && data.result === null) {
      appendLine("(no output)", "system");
    }
  } catch (e) {
    clearOutput();
    appendLine(`Network error: ${e instanceof Error ? e.message : e}`, "error");
  } finally {
    runBtn.disabled = false;
    runBtn.textContent = "Run ▶";
  }
}

runBtn.addEventListener("click", runCode);
clearBtn.addEventListener("click", clearOutput);
