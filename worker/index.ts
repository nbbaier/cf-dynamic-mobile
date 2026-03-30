interface Env {
  LOADER: {
    load(code: WorkerCode): WorkerStub;
    get(
      id: string,
      factory: () => Promise<WorkerCode> | WorkerCode
    ): WorkerStub;
  };
}

interface WorkerCode {
  compatibilityDate: string;
  compatibilityFlags?: string[];
  env?: Record<string, unknown>;
  globalOutbound?: unknown | null;
  mainModule: string;
  modules: Record<string, string>;
  tails?: unknown[];
}

interface WorkerStub {
  getEntrypoint(name?: string): { fetch(req: Request): Promise<Response> };
}

const TRAILING_SEMICOLON = /;$/;

export default {
  fetch(request: Request, env: Env): Response | Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/run" && request.method === "POST") {
      return handleRun(request, env);
    }

    // Let assets binding handle static files
    return new Response("Not Found", { status: 404 });
  },
};

/**
 * Split code into body + last expression (REPL-style).
 * If the last non-empty line looks like a bare expression (not a declaration,
 * assignment, control flow, etc.), extract it so we can assign its value to __result.
 */
function extractLastExpression(code: string): {
  body: string;
  lastExpr: string | null;
} {
  const lines = code.split("\n");

  // Walk backwards to find the last non-empty, non-comment line
  let lastIdx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (line === undefined) {
      continue;
    }
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("//") && !trimmed.startsWith("/*")) {
      lastIdx = i;
      break;
    }
  }

  if (lastIdx === -1) {
    return { body: code, lastExpr: null };
  }

  const lastLineRaw = lines[lastIdx];
  if (lastLineRaw === undefined) {
    return { body: code, lastExpr: null };
  }
  const lastLine = lastLineRaw.trim().replace(TRAILING_SEMICOLON, "");

  // Skip lines that are clearly statements, not expressions
  const statementPrefixes = [
    "const ",
    "let ",
    "var ",
    "function ",
    "class ",
    "if ",
    "if(",
    "for ",
    "for(",
    "while ",
    "while(",
    "switch ",
    "switch(",
    "try ",
    "throw ",
    "import ",
    "export ",
    "return ",
    "await ", // top-level await is a statement here
    "}",
    "{",
  ];

  const isStatement = statementPrefixes.some((p) => lastLine.startsWith(p));
  if (isStatement) {
    return { body: code, lastExpr: null };
  }

  // It looks like an expression — extract it
  const body = lines.slice(0, lastIdx).join("\n");
  return { body, lastExpr: lastLine };
}

async function handleRun(request: Request, env: Env): Promise<Response> {
  let code: string;
  try {
    const body = (await request.json()) as { code?: string };
    code = body.code ?? "";
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!code.trim()) {
    return Response.json({ error: "No code provided" }, { status: 400 });
  }

  // Wrap user code as top-level module code (REPL-style).
  // The last expression statement is captured as the result automatically.
  const { body, lastExpr } = extractLastExpression(code);

  const wrappedCode = `
const __logs = [];
const __origLog = console.log;
const __origError = console.error;
const __origWarn = console.warn;

console.log = (...args) => __logs.push({ level: "log", message: args.map(a => typeof a === "object" ? JSON.stringify(a) : String(a)).join(" ") });
console.error = (...args) => __logs.push({ level: "error", message: args.map(a => typeof a === "object" ? JSON.stringify(a) : String(a)).join(" ") });
console.warn = (...args) => __logs.push({ level: "warn", message: args.map(a => typeof a === "object" ? JSON.stringify(a) : String(a)).join(" ") });

let __result;
let __error = null;
try {
  ${body}
  ${lastExpr ? `__result = ${lastExpr};` : ""}
} catch (e) {
  __error = e instanceof Error ? e.message : String(e);
} finally {
  console.log = __origLog;
  console.error = __origError;
  console.warn = __origWarn;
}

export default {
  async fetch() {
    return Response.json({
      logs: __logs,
      result: __result !== undefined ? String(__result) : null,
      error: __error,
    });
  }
};
`;

  try {
    const worker = env.LOADER.load({
      mainModule: "index.js",
      modules: { "index.js": wrappedCode },
      compatibilityDate: "2026-01-28",
      globalOutbound: null, // sandbox: no network access
    });

    const response = await worker
      .getEntrypoint()
      .fetch(new Request("https://dummy/", { method: "POST" }));
    const data = await response.json();
    return Response.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json(
      { logs: [], result: null, error: `Worker error: ${message}` },
      { status: 500 }
    );
  }
}
