# cf-dynamic-mobile

A mobile-optimized JavaScript runner powered by [Cloudflare Dynamic Workers](https://developers.cloudflare.com/dynamic-workers/). Write and execute JS snippets from your phone or desktop — code runs in sandboxed, on-demand workers with no network access.

## How it works

1. A **Vite** frontend provides a split-pane editor + output view, optimized for mobile
2. Code is POSTed to `/api/run` on the **Cloudflare Worker** backend
3. The parent worker injects the code into a **Dynamic Worker** via `env.LOADER.load()`
4. The dynamic worker runs sandboxed (`globalOutbound: null`) — `console.log/warn/error` and return values are captured and sent back as JSON

## Development

```sh
# Install dependencies
bun install

# Run Vite dev server + Wrangler in parallel
bun run dev:vite   # http://localhost:5173 (proxies /api to wrangler)
bun run dev:worker # http://localhost:8787

# Or build + serve with wrangler
bun run dev
```

## Deploy

```sh
bun run deploy
```

## Project structure

```
├── worker/index.ts    # Parent worker — dispatches code to Dynamic Workers
├── src/
│   ├── index.html     # Mobile-optimized HTML shell
│   ├── style.css      # Dark theme, touch-friendly layout
│   └── main.ts        # Frontend: code submission + output rendering
├── wrangler.jsonc     # Worker config (worker_loaders binding + static assets)
└── vite.config.ts     # Builds frontend to dist/, proxies /api in dev
```
