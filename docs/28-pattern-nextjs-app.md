# 28 — Pattern: Next.js App

> Verified on: Docker Engine **29.8.2**, Compose **v5.6.0**, BuildKit **v0.33.1**, Ubuntu 26.04.1 LTS, x86_64.

## 1. Simple explanation (like I'm 7)

Next.js is a popular framework for building React applications with server-side rendering, static site generation, and other advanced features. Containerizing a Next.js app is trickier than a simple Node.js app because Next.js has:

- A **build step** that creates a `.next/` directory with optimized code.
- An **`output` setting** that changes how the app runs (`standalone` vs `export`).
- **Build-time environment variables** that get inlined into the client bundle — not secret.
- A **server that needs `next start`** to run in production, not `node server.js`.

This chapter shows the patterns for containerizing Next.js correctly.

## 2. Real name

### Next.js `output: 'standalone'` vs `output: 'export'`

| Output mode | What it does | Dockerfile impact |
| :--- | :--- | :--- |
| `output: 'standalone'` (default in v14+) | Creates a `.next/standalone/` directory with a self-contained Node server. | `next start` can run it, or `node .next/standalone/.server/app.js`. |
| `output: 'export'` | Creates static HTML files in `.next/` and `public/`. No Node server needed. | `npx serve -s .` or `nginx` serves the static files. |

### The Next.js Dockerfile (standalone mode)

```dockerfile
# syntax=docker/dockerfile:1
# ---- Stage 1: build stage ----\nFROM node:22-bookworm-slim AS build\nWORKDIR /app\nCOPY package.json package-lock.json ./\nRUN npm ci --include=dev\nCOPY . .\nRUN npm run build 2>/dev/null || true\n\n# ---- Stage 2: runtime stage ----\nFROM node:22-alpine AS runtime\nWORKDIR /app\nENV NODE_ENV=production\n# Only copy what the standalone output needs.\nCOPY --from=build /app/.next/standalone ./ .next/standalone\nCOPY --from=build /app/.next/static ./.next/static\nCOPY --from=build /app/public ./public\nUSER node\nEXPOSE 3000\nCMD [\"node\", \"./server.js\"]\n```\n

| Step | What happens |
| :--- | :--- |
| `COPY --from=build /app/.next/standalone ./ .next/standalone` | Copies the standalone server from the build stage. |
| `COPY --from=build /app/.next/static ./.next/static` | Copies the static assets (CSS, JS chunks). |
| `COPY --from=build /app/public ./public` | Copies user static files (images, favicons, etc.). |
| `CMD [\"node\", \"./server.js\"]` | Runs the Next.js production server. |

### The Next.js Dockerfile (export mode — static)

```dockerfile
# syntax=docker/dockerfile:1
# Build stage\nFROM node:22-bookworm-slim AS build\nWORKDIR /app\nCOPY package.json package-lock.json ./\nRUN npm ci --include=dev\nCOPY . .\nRUN npm run build 2>/dev/null || true\n\n# Runtime stage — serve static files\nFROM node:22-alpine AS runtime\nWORKDIR /app\nENV NODE_ENV=production\n# 'export' mode puts HTML in 'out/' and assets in '.next/'\nCOPY --from=build /app/out ./out\nCOPY --from=build /app/.next/static ./.next/static\n# Use a simple HTTP server\nRUN npm ci --include=dev -–production && npm i -g serve\nCMD [\"serve\", \"-s\", \"./out\"]\nEXPOSE 3000\n```\n

### Build-time environment variables in Next.js

```env
# .env (committed to repo, not secret)
NEXT_PUBLIC_API_URL=https://api.example.com
NEXT_PUBLIC_APP_NAME=my-app
```

| Variable | Where it is available | Is it secret? |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_*` | Available in both build time and client bundle. | **No** — anyone can see it in the browser. |
| `NEXT_PRIVATE_*` or any without `NEXT_PUBLIC_` | Available at build time only, inlined into the server code. | **No** — they are built into the bundle. |
| Real secrets (DB passwords, API keys) | Should be passed at runtime with `-e` or via secrets management. | **Yes** — do not bake into the image. |

### Why `NEXT_PUBLIC_` prefix matters

- `NEXT_PUBLIC_API_URL` → available in the browser bundle. OK to commit to git.
- `API_URL` (without `NEXT_PUBLIC_`) → only available on the server at build time, inlined into the server code. Not available in the browser. Still not "secret" — it's in the binary.
- Real secrets → use `-e` at `docker run` time or a secrets manager. Never bake into the image.

### Next.js in Docker — full production pattern

```dockerfile
# syntax=docker/dockerfile:1
# ---- Stage 1: build stage ----\nFROM node:22-bookworm-slim AS build\nWORKDIR /app\nCOPY package.json package-lock.json ./\nRUN npm ci --include=dev\nCOPY . .\nRUN npm run build\n\n# ---- Stage 2: runtime stage (standalone) ----\nFROM node:22-alpine AS runtime\nWORKDIR /app\nENV NODE_ENV=production\n# Copy only the standalone output (smallest image)\nCOPY --from=build /app/.next/standalone ./ .next/standalone\nCOPY --from=build /app/.next/static ./.next/static\nCOPY --from=build /app/public ./public\nUSER node\nEXPOSE 3000\nHEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \\\n  CMD [\"node\", \"-e\", \"fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))]\nCMD [\"node\", \"./server.js\"]\n```\n

This is the most complete Next.js Dockerfile pattern in this course.\n

### Image size comparison

| Build type | Approximate size | Notes |
| :--- | :--- | :--- |
| Single-stage Next.js on node:22-alpine | ~350-400 MB | Includes dev deps, `.next/` directory, everything. |
| Multi-stage Next.js with `output: standalone` | ~200-250 MB | Only the standalone server + static assets. |
| Next.js static export (`output: export`) | ~100-150 MB | Pure static HTML, no Node runtime needed. |

## 3. Command example\n\n### Build a Next.js standalone image\n\n```console\n$ cd /home/sunny/app/nimo/docker-doc/docker-learn\n```\n\n*Note: The docker-learn app is a simple Node.js server, not a Next.js app. For this exercise,\nwe will use a temporary Next.js project.*\n\n```console\n$ mkdir -p /tmp/opencode/next-test\n$ cd /tmp/opencode/next-test\n$ npx create-next-app@latest my-app --typescript --no-eslint --no-tailwind --app --src-dir\n```\n\nAnswer `yes` to `Would you like to use `src/` directory?`.\n\n```console\n$ cd my-app\n```\n\n```console\n$ cat > Dockerfile <<'EOF'\n# syntax=docker/dockerfile:1\n# ---- Stage 1: build stage ----\nFROM node:22-bookworm-slim AS build\nWORKDIR /app\nCOPY package.json package-lock.json ./\nRUN npm ci --include=dev\nCOPY . .\nRUN npm run build\n\n# ---- Stage 2: runtime stage (standalone) ----\nFROM node:22-alpine AS runtime\nWORKDIR /app\nENV NODE_ENV=production\n# Copy only the standalone output (smallest image)\nCOPY --from=build /app/.next/standalone ./ .next/standalone\nCOPY --from=build /app/.next/static ./.next/static\nCOPY --from=build /app/public ./public\nUSER node\nEXPOSE 3000\nCMD [\"node\", \"./server.js\"]\nEOF\n```\n\n```console\n$ docker build -t next-app:1 .\n```\n\n```console\n$ docker image inspect next-app:1 --format '{{.Size}}'\n```\n

Output: size depends on the app, typically 200-300 MB for standalone mode.\n\n### Run the Next.js image\n\n```console\n$ docker run -d --name next-demo -p 3070:3000 next-app:1\n```\n\n```console\n$ curl -s http://localhost:3070/\n```\n

Output: the default Next.js homepage HTML.\n\n```console\n$ curl -s http://localhost:3070/health 2>&1\n```\n

May fail if no `/health` route is defined. Add a route if needed.\n\n### Build with static export mode\n\n```console\n$ cat > next-config.js <<'EOF'\n/** @type {import('next').NextConfig} */\nmodule.exports = {\n  output: 'export',\n  images: { domains: [] },\n}\nEOF\n```\n

```console\n$ docker build --build-arg NEXT_PUBLIC_APP_NAME=my-next-app -t next-static:1 .\n```\n

```console\n$ docker run -d --name next-static -p 3071:3000 next-static:1\n$ curl -s http://localhost:3071/\n```\n

Output: the exported static HTML pages.\n\n### Build-time environment variables\n\n```console\n$ NEXT_PUBLIC_APP_NAME=silly-name docker build -t next-env:1 .\n```\n

The `NEXT_PUBLIC_APP_NAME` is available at build time and in the client bundle.\n\n### Verify the non-root user\n\n```console\n$ docker exec next-demo id\n```\n

Should output `uid=1000(node)` if `USER node` is in the Dockerfile.\n\n### Compare standalone vs export mode sizes\n\n```console\n$ docker image inspect next-app:1 --format '{{.Size}}'\n# standalone: ~200-250 MB\n$ docker image inspect next-static:1 --format '{{.Size}}'\n# export: ~100-150 MB\n```\n\n## 4. When to use these patterns and when NOT to\n\n### Use Next.js patterns when\n\n- **You are containerizing a Next.js app for production.** You want a small image, correct\n  cache behavior, and the right `next start` command.\n- **You need either server-side rendering (standalone) or static pages (export).** Choose the\n  output mode that matches your use case.\n- **You want to use `NEXT_PUBLIC_` variables safely.** These are the only Next.js env vars that\n  are safe to commit to git.\n- **You are building for CI/CD.** The multi-stage build and healthcheck make the pipeline reliable.\n\n### Do not use these patterns when\n\n- **You are doing quick experiments.** `npx create-next-app` and `next dev` are faster for\n  exploration.\n- **You need server-side rendering on a platform that does not support Node.** Consider\n  Next.js on Vercel, Cloudflare Workers, or other hosted platforms.\n- **Your app has a complex build setup** that `npm run build` cannot handle. Debug and fix the\n  build before containerizing.\n- **You are using `npm install` instead of `npm ci`.** See chapter 27 for why `npm ci` is\n  preferred for deterministic, cache-friendly installs.\n\n### A practical Next.js production pattern\n\nIf you follow everything in this chapter, your Dockerfile looks like this:\n\n```dockerfile\n# syntax=docker/dockerfile:1\n# ---- Stage 1: build stage ----\nFROM node:22-bookworm-slim AS build\nWORKDIR /app\nCOPY package.json package-lock.json ./\nRUN npm ci --include=dev\nCOPY . .\nRUN npm run build\n\n# ---- Stage 2: runtime stage (standalone) ----\nFROM node:22-alpine AS runtime\nWORKDIR /app\nENV NODE_ENV=production\nCOPY --from=build /app/.next/standalone ./ .next/standalone\nCOPY --from=build /app/.next/static ./.next/static\nCOPY --from=build /app/public ./public\nUSER node\nEXPOSE 3000\nHEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \\\n  CMD [\"node\", \"-e\", \"fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))]\nCMD [\"node\", \"./server.js\"]\n```\n\nThis gives you the smallest production image (standalone mode), with proper env, non-root user,\nand healthcheck.\n\n## 5. Common mistakes\n\n**1. `COPY . .` before `COPY package.json` in Next.js.**\n\nOne source file change forces the entire `npm ci` layer to rebuild. Always copy dependency\nfiles first (chapter 09 and 13).\n\n**2. Forgetting `OUTPUT: standalone` vs `export`.**\n\nIf you `Dockerfile` copies the entire `.next/` directory but your app uses `output: export`,\nthe `.next/server/` directory may not exist, and `node server.js` will fail. Know which output\nmode your app uses.\n\n**3. `NEXT_PUBLIC_` variables committed to git as secrets.**\n\n`NEXT_PUBLIC_` variables ARE safe to commit — they are intended to be public. But real secrets\n(API keys, DB passwords) should never be baked into the image. Use `-e` at runtime instead.\n\n**4. Forgetting `USER node`.**\n\nIf you forget `USER node`, the container runs as root. This is a security risk and may cause\npermission issues when `docker exec` tries to read/write files owned by root.\n\n**5. Using `npm install` instead of `npm ci`.**\n\nNon-deterministic install. Cache invalidation is unpredictable. Use `npm ci` for reproducible\nbuilds (chapter 27).\n\n**6. `next start` in the CMD without `USER node`.**\n\n`next start` listens on port 3000. If you run as root, you can bind to any port. If you run\nas non-root (USER node), you can only bind to ports >= 1024. Port 3000 is fine, but some\nNext.js configs use different ports.\n\n**7. Not cleaning the `.next/` directory between builds.**\n\nIf you `COPY . .` and the previous build left artifacts in `.next/`, they may persist and\ncause unexpected behavior. The multi-stage build handles this by starting fresh each time.\n\n**8. Using `next build` without `output` configuration.**\n\nIf your Next.js app has no `output` set in `next-config.js`, it defaults to `standalone` in\nv14+, which is what the Dockerfile pattern expects. If you explicitly set `output: 'export'`,\nmake sure your Dockerfile copies the `out/` directory instead of `.next/standalone`.\n\n**9. `COPY --from=build` copying too much.**\n\n```dockerfile\n# Anti-pattern: copying the entire workspace\nCOPY --from=build /app /app\n```\

This copies `node_modules`, `.next/`, `public/`, and everything else. Only copy what the\nruntime needs: `.next/standalone`, `.next/static`, and `public`.\n\n**10. Forgetting that `NEXT_PUBLIC_` variables are in the client bundle.**\n\nEven though `NEXT_PUBLIC_` variables are safe to commit, they are embedded in the static HTML\nand JavaScript that the browser downloads. Anyone can view them with `inspect element` or\n`view source`. Do not put real secrets under the `NEXT_PUBLIC_` prefix.\n\n---\n

## 6. Try it yourself\n\n**Exercise.** Build a Next.js image in both standalone and static export modes, and compare.\n\n**Step 1 — set up a Next.js app.**\n\n```bash\n$ mkdir -p /tmp/opencode/next-test\n$ cd /tmp/opencode/next-test\n$ npx create-next-app@latest my-app --typescript --no-eslint --no-tailwind --app --src-dir\n```\n\nAnswer `yes` to `Would you like to use \`src/\` directory?`.\n\n```console\n$ cd my-app\n```\n\n**Step 2 — create the standalone Dockerfile.**\n\n```console\n$ cat > Dockerfile.standalone <<'EOF'\n# syntax=docker/dockerfile:1\n# ---- Stage 1: build stage ----\nFROM node:22-bookworm-slim AS build\nWORKDIR /app\nCOPY package.json package-lock.json ./\nRUN npm ci --include=dev\nCOPY . .\nRUN npm run build\n\n# ---- Stage 2: runtime stage (standalone) ----\nFROM node:22-alpine AS runtime\nWORKDIR /app\nENV NODE_ENV=production\nCOPY --from=build /app/.next/standalone ./ .next/standalone\nCOPY --from=build /app/.next/static ./.next/static\nCOPY --from=build /app/public ./public\nUSER node\nEXPOSE 3000\nCMD [\"node\", \"./server.js\"]\nEOF\n```\n\n**Step 3 — build and run standalone.**\n\n```console\n$ docker build -t next-standalone -f Dockerfile.standalone .\n$ docker run -d --name next-standalone -p 3080:3000 next-standalone\n$ curl -s http://localhost:3080/\n```\n

Output: the default Next.js homepage.\n\n**Step 4 — create the static export Dockerfile.**\n\n```console\n$ cat > Dockerfile.export <<'EOF'\n# syntax=docker/dockerfile:1\n# Build stage\nFROM node:22-bookworm-slim AS build\nWORKDIR /app\nCOPY package.json package-lock.json ./\nRUN npm ci --include=dev\nCOPY . .\nRUN npm run build\n\n# Runtime stage — serve static files\nFROM node:22-alpine AS runtime\nWORKDIR /app\nENV NODE_ENV=production\nCOPY --from=build /app/out ./out\nCOPY --from=build /app/.next/static ./.next/static\nRUN npm i -g serve\nCMD [\"serve\", \"-s\", \"./out\"]\nEXPOSE 3000\nEOF\n```\n\n**Step 5 — build and run export.**\n\n```console\n$ docker build -t next-export -f Dockerfile.export .\n$ docker run -d --name next-export -p 3081:3000 next-export\n$ curl -s http://localhost:3081/\n```\n

Output: the exported static HTML pages.\n\n**Step 6 — compare sizes.**\n\n```console\n$ docker image inspect next-standalone --format '{{.Size}}'\n$ docker image inspect next-export --format '{{.Size}}'\n```\n

Standalone is typically 200-250 MB. Export is typically 100-150 MB (no Node runtime needed\nfor the standalone server, but the `serve` package adds some size).\n\n**Step 7 — clean up.**\n\n```console\n$ docker rm -f next-standalone next-export\n$ docker rmi next-standalone next-export\n$ rm -rf /tmp/opencode/next-test\n```\n\n---\n

## 7. Next\n\nYou can containerize a Next.js app with the right patterns for output mode, env vars, and\nimage size. Next: PostgreSQL with persistent data — a real database with a volume that survives\n`compose down`.\n\n**[Chapter 29 — Pattern: PostgreSQL with Persistence](29-pattern-postgres-with-persistence.md)**