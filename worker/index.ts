interface Env {
  LOADER: {
    load(code: WorkerCode): WorkerStub;
    get(id: string, factory: () => Promise<WorkerCode> | WorkerCode): WorkerStub;
  };
}

interface WorkerCode {
  mainModule: string;
  modules: Record<string, string>;
  compatibilityDate: string;
  compatibilityFlags?: string[];
  env?: Record<string, unknown>;
  globalOutbound?: unknown | null;
  tails?: unknown[];
}

interface WorkerStub {
  getEntrypoint(name?: string): { fetch(req: Request): Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/run" && request.method === "POST") {
      return handleRun(request, env);
    }

    // Let assets binding handle static files
    return new Response("Not Found", { status: 404 });
  },
};

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

  // Wrap user code directly as module source — no new Function() (blocked in Workers)
  // User code runs at module top-level; we capture console output and export a result.
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
  __result = await (async () => {
    ${code}
  })();
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

    const response = await worker.getEntrypoint().fetch(
      new Request("https://dummy/", { method: "POST" })
    );
    const data = await response.json();
    return Response.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ logs: [], result: null, error: `Worker error: ${message}` }, { status: 500 });
  }
}
