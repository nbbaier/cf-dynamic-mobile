const codeEl = document.getElementById("code") as HTMLTextAreaElement;
const outputEl = document.getElementById("output") as HTMLDivElement;
const runBtn = document.getElementById("run-btn") as HTMLButtonElement;
const clearBtn = document.getElementById("clear-btn") as HTMLButtonElement;

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
  const code = codeEl.value.trim();
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

    const data = await res.json() as {
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

// Tab key inserts spaces in textarea
codeEl.addEventListener("keydown", (e) => {
  if (e.key === "Tab") {
    e.preventDefault();
    const start = codeEl.selectionStart;
    const end = codeEl.selectionEnd;
    codeEl.value = codeEl.value.substring(0, start) + "  " + codeEl.value.substring(end);
    codeEl.selectionStart = codeEl.selectionEnd = start + 2;
  }
});

runBtn.addEventListener("click", runCode);
clearBtn.addEventListener("click", clearOutput);

// Ctrl/Cmd+Enter to run
document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
    e.preventDefault();
    runCode();
  }
});
