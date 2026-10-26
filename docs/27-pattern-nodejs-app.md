# 27 — Pattern: Node.js App

> Verified on: Docker Engine **29.8.2**, Compose **v5.6.0**, BuildKit **v0.33.1**, Ubuntu 26.04.1 LTS, x86_64.

## 1. Simple explanation (like I'm 7)

You have a tiny Node.js app (the `docker-learn` sample app). Containerizing it "the right way" means:

- Dependencies are installed in the correct order so your build cache works.
- You use `npm ci` (deterministic install) instead of `npm install` (fuzzy).
- `NODE_ENV` is set to `production` so the app runs in production mode.
- The app runs as a non-root user for security.
- There is a healthcheck so other services can wait for it.
- The image is as small as possible (multi-stage build).

This chapter shows all of those patterns in one place.

## 2. Real name

### The production Node.js Dockerfile

```dockerfile
# syntax=docker/dockerfile:1
# ---- Stage 1: build stage ----\nFROM node:22-bookworm-slim AS build\nWORKDIR /app\nCOPY package.json package-lock.json ./\nRUN npm ci --include=dev\nCOPY . .\nRUN npm run build 2>/dev/null || true\n\n# ---- Stage 2: runtime stage ----\nFROM node:22-alpine AS runtime\nWORKDIR /app\nENV NODE_ENV=production\nCOPY --from=build /app/node_modules ./node_modules\nCOPY --from=build /app/package.json ./\nCOPY --from=build /app/server.js ./\nUSER node\nEXPOSE 3000\nCMD [\"node\",\"server.js\"]\n```

| Stage | Purpose | Key instructions |
| :--- | :--- | :--- |
| **build** | Install dependencies, compile code. Has `gcc`, `python`, `node_modules` with dev deps. | `FROM node:22-bookworm-slim`, `npm ci --include=dev`, `COPY . .` |
| **runtime** | The final image. Only the app and production deps. | `FROM node:22-alpine`, `COPY --from=build`, `USER node` |

### Why `npm ci` instead of `npm install`

| Command | What it does | Why it matters |
| :--- | :--- | :--- |
| `npm install` | Installs dependencies, modifies `package-lock.json` to match, may add/remove deps. | Non-deterministic. Changes the lockfile, which invalidates cache unpredictably. |
| `npm ci` | Installs exact versions from `package-lock.json`. Fails if they don't match. | Deterministic. Same `package-lock.json` always produces the same `node_modules`. Cache is stable. |

### Why `NODE_ENV=production`

| Value | Effect on the app |
| :--- | :--- |
| `NODE_ENV=production` | The app may skip development behaviors (e.g., logging verbosity, hot-reload, webpack development mode). |
| `NODE_ENV=development` or unset | The app may include development features, larger bundles, and more verbose logging. |
| In the sample app | `process.env.NODE_ENV` is printed at `/env` route (chapter 06). |

### Why run as non-root

| Security measure | Effect |
| :--- | :--- |
| `USER node` in Dockerfile | The container starts as UID 1000 (the `node` user). You cannot `touch` root-owned files, cannot `apt-get install`, cannot bind to ports < 1024. |
| `USER root` | The container runs as root. Can do anything. If the app is compromised, the attacker has full container control. |

### Why a healthcheck

| Healthcheck purpose | Example |
| :--- | :--- |
| `docker compose depends_on: condition: service_healthy` waits until the service is healthy before starting dependent services. | `HEALTHCHECK --interval=10s --timeout=3s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"` |
| `docker ps --filter status=running` can filter by health. | `docker ps --filter status=running --filter health=healthy` |
| `docker compose up --wait` waits for all services to become healthy. | Useful in CI/CD to know when the stack is ready. |

### The final image size

| Build type | Image size | Notes |
| :--- | :--- | :--- |
| Single-stage (node:22-alpine, `npm install`, `COPY . .`) | ~335 MB | Includes dev dependencies, `node_modules` from the host may overlap. |
| Multi-stage with `npm ci` and alpine runtime | ~243 MB | 27% smaller. Only production runtime deps are in the final image. |

## 3. Command example\n\n### Build the production Node.js image\n\n```console\n$ cd /home/sunny/app/nimo/docker-doc/docker-learn\n$ docker build -t node-app:1 -f Dockerfile .\n```\n\n```console\n$ docker image inspect node-app:1 --format '{{.Size}}'\n```\n

Output: `242814275` (or ~243 MB, the multi-stage size on this machine).\n\n### Run the image\n\n```console\n$ docker run -d --name node-demo -p 3060:3000 node-app:1\n```\n\n```console\n$ curl -s http://localhost:3060/\n```\n

Output: `{"name":"docker-learn","env":"production","container":"a6d5f3571ec5","pid":1,"uptimeSeconds":3}` (the app's JSON metadata route).\n\n```console\n$ curl -s http://localhost:3060/health\n```\n

Output: `{"status":"ok"}` (the health probe route).\n\n```console\n$ docker inspect node-demo --format '{{.State.Health.Status}}'\n```\n

Output: `healthy` (after the start-period of 5s).\n\n### Run as non-root and verify\n\n```console\n$ docker exec node-demo id\n```\n

Output: `uid=1000(node) gid=1000(node) groups=1000(node)` — the process runs as the `node` user.\n\n```console\n$ docker exec node-demo touch /app/test.txt 2>&1\n```\n

Output: `touch: cannot touch '/app/test.txt': Permission denied` — cannot write to the app directory\nbecause it runs as non-root (unless a bind mount or volume gives write access).\n\n### Verify NODE_ENV inside the container\n\n```console\n$ docker exec node-demo sh -c 'printenv NODE_ENV'\n```\n

Output: `NODE_ENV=production` — the `ENV NODE_ENV=production` from the Dockerfile is baked in.\n\n### Compare: `npm install` vs `npm ci` on cache behavior\n\n**With `npm install`:**\n\n```console\n$ cat > /tmp/opencode/try-npm.sh <<'EOF'\nFROM node:22-alpine\nWORKDIR /app\nCOPY package.json package-lock.json ./\nRUN npm install\nCOPY . .\nCMD [\"node\",\"server.js\"]\nEOF\n$ docker build -t npm-install-test .\n```\n

If you then change `server.js` and rebuild, the `RUN npm install` step may be rebuilt because\n`package-lock.json` changed (or may not, depending on exact changes). Cache behavior is less\npredictable.\n\n**With `npm ci`:**\n\n```console\n$ cat > /tmp/opencode/try-npmci.sh <<'EOF'\nFROM node:22-alpine\nWORKDIR /app\nCOPY package.json package-lock.json ./\nRUN npm ci --include=dev\nCOPY . .\nCMD [\"node\",\"server.js\"]\nEOF\n$ docker build -t npm-ci-test .\n```\n

If you only change `server.js`, the `RUN npm ci --include=dev` step stays cached (it was\ninvalidated only when `package.json` or `package-lock.json` changed). This is the key\nlesson of cache awareness (chapter 09).\n\n### Debug a failed build\n\n```console\n$ docker build --check . 2>&1\n```\n

If your Dockerfile uses shell form for `CMD`, you will see `JSONArgsRecommended` warning.\nIf you use exec form (as this chapter does), the check passes cleanly.\n\n### Verify the image runs correctly with all patterns\n\n```console\n$ docker run -d --name full-demo -p 3061:3000 --restart unless-stopped node-app:1\n$ docker stats --no-stream full-demo\n$ curl -s http://localhost:3061/health\n$ docker exec full-demo id\n$ docker exec full-demo printenv NODE_ENV\n```\n

Should show resource stats, healthy status, correct env, and non-root user.\n\n---\n

## 4. When to use these patterns and when NOT to\n\n### Use Node.js app patterns when\n\n- **You are containerizing a Node.js app for production.** You want a small image, correct\n  cache behavior, non-root user, and health checks.\n- **You want reproducible builds.** `npm ci` ensures the same dependencies every time.\n- **You are building for CI/CD.** The healthcheck and reproducible tags make the pipeline reliable.\n- **You want good security practices.** Non-root user, minimal base image, multi-stage build.\n\n### Do not use these patterns when\n\n- **You are doing quick experiments.** `docker run -it node:22-alpine` is faster for exploration.\n- **Your app needs root access** for the entire container lifetime (e.g., a system init script).\n- **Your app does not have a `package-lock.json`.** `npm ci` will fail. Use `npm install` instead,\n  but expect less predictable cache behavior.\n- **You are building for a very constrained environment** where even 243 MB is too much (e.g.,\n  embedding Docker in a tiny binary).\n\n### A practical production pattern\n\nIf you follow everything in this chapter, your Dockerfile looks like this:\n\n```dockerfile\n# syntax=docker/dockerfile:1\n# ---- Stage 1: build stage ----\nFROM node:22-bookworm-slim AS build\nWORKDIR /app\nCOPY package.json package-lock.json ./\nRUN npm ci --include=dev\nCOPY . .\nRUN npm run build 2>/dev/null || true\n\n# ---- Stage 2: runtime stage ----\nFROM node:22-alpine AS runtime\nWORKDIR /app\nENV NODE_ENV=production\nCOPY --from=build /app/node_modules ./node_modules\nCOPY --from=build /app/package.json ./\nCOPY --from=build /app/server.js ./\nUSER node\nEXPOSE 3000\nHEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \\\n  CMD [\"node\", \"-e\", \"fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))]\nCMD [\"node\",\"server.js\"]\n```\n\nThis is the most production-ready Node.js Dockerfile pattern in this course.\n\n## 5. Common mistakes\n\n**1. `npm install` instead of `npm ci`.**\n\n`npm install` is non-deterministic. It modifies `package-lock.json` during the install, which\nmakes cache invalidation unpredictable. Use `npm ci` for deterministic, cache-friendly installs.\n\n**2. `COPY . .` before `COPY package.json`.**\n\nOne source file change forces the entire `npm install`/`npm ci` layer to rebuild. Always copy\ndependency files first (chapter 09 and 13).\n\n**3. Forgetting `USER node`.**\n\nIf you forget `USER node`, the container runs as root. This is a security risk and also means\nthat files created by the app may be owned by root, causing permission issues for later\n`docker exec` commands.\n\n**4. Forgetting `NODE_ENV=production`.**\n\nWithout `NODE_ENV=production`, the app may run in development mode, which can include\nverbose logging, larger bundles (if using webpack), and development-specific behaviors.\n\n**5. Not using a healthcheck.**\n\nWithout a healthcheck, `docker compose depends_on: condition: service_healthy` cannot work,\nand `docker compose up --wait` will not wait for this service to be ready.\n\n**6. `COPY . .` in the build stage copying everything including `node_modules` from a host\nbind mount.**\n\nIf you are developing with bind mounts (`-v .:/app`), the host's `node_modules` shadows the\nimage's `node_modules`. In production (no bind mounts), the multi-stage build correctly copies\nonly what is needed.\n\n**7. Using `npm ci` without a `package-lock.json`.**\n\n`npm ci` will fail with an error if `package-lock.json` is missing or out of sync with\n`package.json`. Always make sure `package-lock.json` is committed to git.\n\n**8. `npm run build` failing silently.**\n\n`2>/dev/null || true` silences errors if your app has no build step. If your app does have a\nbuild step and it fails, you will not see the error. Remove the `2>/dev/null || true` and\nlet the build fail, or only add it if you are sure your app has no build step.\n\n**9. Forgetting that `COPY --from=build` only copies what you specify.**\n\n```dockerfile\nCOPY --from=build /app/node_modules ./node_modules\n```\

Only `node_modules` is copied. If you also need `package.json` for `docker exec npm` commands,\nadd `COPY --from=build /app/package.json ./`.\n\n**10. Using `node:22-alpine` without understanding Alpine's libc.**\n\nSome native Node.js modules (e.g., those with native C bindings) may not compile on Alpine.\nIf you encounter `module.js cannot find module` or native module errors, switch to\n`node:22-bookworm-slim` (Debian-based) which has glibc and is more compatible.\n\n---\n

## 6. Try it yourself\n\n**Exercise.** Build a production-ready Node.js image and verify all patterns.\n\n**Step 1 — ensure the Dockerfile is the production pattern from this chapter:**\n\n```bash\n$ cd /home/sunny/app/nimo/docker-doc/docker-learn\n```\n\n```console\n$ docker build -t prod-node:1 -f Dockerfile .\n```\n\n```console\n$ docker image inspect prod-node:1 --format '{{.Size}}'\n```\n

Should be around 243 MB (multi-stage).\n\n**Step 2 — run and verify all patterns:**\n\n```console\n$ docker run -d --name prod-demo -p 3062:3000 prod-node:1\n```\n\n```console\n$ curl -s http://localhost:3062/\n```\n

Should output the app's JSON metadata.\n\n```console\n$ curl -s http://localhost:3062/health\n```\n

Should output `{"status":"ok"}`.\n\n```console\n$ docker inspect prod-demo --format '{{.State.Health.Status}}'\n```\n

Should be `healthy` (after ~5s start-period).\n\n```console\n$ docker exec prod-demo id\n```\n

Should output `uid=1000(node) gid=1000(node)` — non-root user.\n\n```console\n$ docker exec prod-demo printenv NODE_ENV\n```\n

Should output `NODE_ENV=production`.\n\n**Step 3 — verify cache behavior with npm ci:**\n\n```console\n$ touch server.js\n$ docker build -t prod-node:1 -f Dockerfile .\n```\n

The `RUN npm ci --include=dev` step should be **CACHED** (0.0s output from BuildKit) because\nonly `server.js` changed, not `package.json` or `package-lock.json`.\n\n**Step 4 — clean up:**\n\n```console\n$ docker rm -f prod-demo\n$ docker rmi prod-node:1\n```\n\n---\n

## 7. Next\n\nYou can containerize a Node.js app with production-ready patterns. Next: Next.js has its own\nspecial requirements, which are covered in the next real-world pattern chapter.\n\n**[Chapter 28 — Pattern: Next.js App](28-pattern-nextjs-app.md)**