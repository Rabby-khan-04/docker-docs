# 31 — Pattern: Hot Reload in Development

> Verified on: Docker Engine **29.8.2**, Compose **v5.6.0**, BuildKit **v0.33.1**, Ubuntu 26.04.1 LTS, x86_64.

## 1. Simple explanation (like I'm 7)

When you are developing an app, you want to see your changes immediately without rebuilding the Docker image every time. **Hot reload** (or live reload) means: you edit a file on your host, and the container automatically picks up the change.

This is tricky in Docker because the container's filesystem is separate from the host's. If you just `docker run -v .:/app`, the host's `node_modules` may shadow the image's copy, and file-watchers may not work on network filesystems.

This chapter shows the two-file pattern: `compose.yaml` for production (no bind mounts) and `compose.override.yaml` for development (bind mounts + `--watch`).

## 2. Real name

### The development Compose file (`compose.override.yaml`)

```yaml
services:
  api:
    ports:
      - "127.0.0.1:3080:3000"
    environment:
      APP_ENV: development
    command: ["node", "--watch", "server.js"]
    volumes:
      - .:/app
      - node_modules_keep:/app/node_modules

volumes:
  node_modules_keep:
```

| Instruction | Purpose |
| :--- | :--- |
| `ports: "127.0.0.1:3080:3000"` | Different port so dev and prod can run simultaneously. |
| `APP_ENV: development` | The app runs in development mode (verbose logging, etc.). |
| `command: ["node", "--watch", "server.js"]` | Node.js 22 has a built-in `--watch` flag. When `server.js` changes, Node restarts automatically. |
| `volumes: - .:/app` | Mounts the host source code into the container. Changes on the host are immediately visible. |
| `volumes: - node_modules_keep:/app/node_modules` | A named volume that preserves the image's `node_modules` over the bind mount. Without this, the host's `node_modules` shadows the image's copy. |

### Why `node_modules_keep` is needed

```yaml
# Without node_modules_keep:\n  - .:/app\n# The host's node_modules (maybe 200 MB) shadows the image's node_modules.\n# The app may miss modules, or `npm` commands inside the container may act on the host's copy.\n\n# With node_modules_keep:\n  - .:/app\n  - node_modules_keep:/app/node_modules\n# The named volume preserves the image's node_modules.\n# The host source code overlay works, but node_modules from the image is still accessible.\n```

### The production Compose file (`compose.yaml`)

```yaml
services:
  api:
    build: .
    restart: unless-stopped\n    ports:\n      - "127.0.0.1:3000:3000"\n    environment:\n      APP_ENV: production\n# No volumes: the image is immutable.\n# No --watch: the image is built once and run.\n```\n

This file has no `volumes:` that bind-mount the host folder. The image is built once and run\nimmutably. This is the biggest difference from development Compose files.

### How to use both files together

```console
$ docker compose up\n```

When both `compose.yaml` and `compose.override.yaml` exist in the same directory, Compose\nautomatically loads the override file on top of the base. The result is a development stack\nwith live code reload.

To run only the base (production) file:

```console
$ docker compose -f compose.yaml up\n```

To run with the override (development):

```console
$ docker compose up\n```

### UID/GID permission fixes

When you mount the host source code into the container (`-v .:/app`), files created on the host\nmay be owned by your user (UID 1000 on many Linux machines), but the container may run as a\ndifferent user (e.g., `node` with UID 1000, or UID 0 root). This can cause permission issues.

```yaml
# In compose.override.yaml\n  volumes:\n    - .:/app\n    - node_modules_keep:/app/node_modules\n# Add UID/GID alignment:\n  - $(pwd):/app\n# Or use the host user:\n  - $(id -u):$(id -g):/app\n```

Actually, the simplest approach on Linux is:

```yaml
volumes:\n  - .:/app\n```

If the host user is UID 1000 and the container user is also UID 1000 (which is the case when\n`USER node` is 1000), it just works. If there is a mismatch, use:

```yaml
volumes:\n  - $(pwd):/app:ro  # read-only mount, no writes back to host\n```

Or, in the container, `chown -R 1000:1000 /app` after the mount.

### `--watch` and file-system events

Node.js 22 has a built-in `--watch` flag:

```console
$ node --watch server.js
```

When `server.js` changes, Node restarts the app automatically.

```yaml
command: ["node", "--watch", "server.js"]
```

This works inside a Compose service with a bind mount (`-v .:/app`). When you edit `server.js`\non the host, the container sees the change, and Node restarts.

#### `--watch` limitations

| Limitation | Description | Workaround |
| :--- | :--- | :--- |
| **Network filesystems** | `inotify` (Linux file-watcher) does not work well on NFS, SMB, or bind mounts\n  in some configurations. | Use a native Linux filesystem for the bind mount. |
| **`node_modules` churn** | If `node_modules` itself is being watched, every install/uninstall triggers a restart. | Use `node_modules_keep` named volume to overlay the image's `node_modules`, and only mount\n  source files (`-v ./src:/app/src` instead of `-v .:/app`). |
| **Docker Desktop on macOS/Windows** | Uses a VM with a different filesystem. `--watch` may not work or may be slow. | On macOS/Windows, use `docker-dev` or sync tools, or accept a slower feedback loop. |
| **Large files** | Watching large files or directories may cause unnecessary restarts. | Use `.node- watchrc` to exclude patterns, or only watch specific files. |

### Comparing dev vs prod setups

| Aspect | Development (`compose.yaml` + override) | Production (`compose.yaml` only) |
| :--- | :--- | :--- |
| **Bind mounts** | `-v .:/app` for live code reload | No bind mounts; image is immutable |
| **`--watch`** | `node --watch server.js` for auto-restart | Not needed; the image is rebuilt on deploy |
| **`APP_ENV`** | `development` | `production` |
| **`command`** | `node --watch server.js` | `node server.js` |
| **`volumes`** | `.` + `node_modules_keep` | None (or only named volumes for data) |
| **Image size** | Larger (dev tools, node_modules from host) | Smaller (multi-stage, only runtime deps) |
| **Restart policy** | `unless-stopped` (same) | `unless-stopped` (same) |

## 3. Command example\n\n### Development setup with hot reload\n\n```bash\n$ cd /home/sunny/app/nimo/docker-doc/docker-learn\n```\n\n```yaml\n# compose.override.yaml — development overrides\nservices:\n  api:\n    ports:\n      - \"127.0.0.1:3080:3000\"\n    environment:\n      APP_ENV: development\n    command: [\"node\", \"--watch\", \"server.js\"]\n    volumes:\n      - .:/app\n      - node_modules_keep:/app/node_modules\n\nvolumes:\n  node_modules_keep:\n```\n\n```console\n$ docker compose up\n```\n\nThe api service should start with `node --watch server.js`, `APP_ENV=development`, and the\nbind mount so code changes are immediately visible.\n\n### Production setup (no hot reload)\n\n```console\n$ docker compose -f compose.yaml up\n```\n\nThe api service should start with `node server.js`, `APP_ENV=production`, and no bind mounts.\n\n### Verify hot reload works\n\n1. Start with the development setup:\n   ```console\n   $ docker compose up\n   ```\n2. The api container starts with `node --watch server.js`.\n3. Edit `server.js` on the host:\n   ```console\n   $ nano server.js  # or any editor\n   ```\n4. Wait a few seconds — Node should automatically restart the app.\n5. Verify the app is still running:\n   ```console\n   $ curl -s http://localhost:3080/\n   ```\n\n### Verify UID/GID alignment\n\n```console\n$ docker compose exec api id\n```\n

Should output `uid=1000(node)` if `USER node` is in the Dockerfile and the host user is also\nUID 1000. If there is a mismatch, you may see permission errors when writing to `/app`.\n\n### Only mount source files, not node_modules\n\nInstead of `-v .:/app`, you can mount only the source directory:\n\n```yaml\nvolumes:\n  - ./src:/app/src\n  - node_modules_keep:/app/node_modules\n```\

This avoids watching `node_modules` churn, which would trigger unnecessary restarts.\n\n### Compare dev vs prod with `docker compose config`\n\n```console\n$ docker compose config 2>&1 | grep -E \"APP_ENV|command|volumes\"\n```\n

With the override file present, you should see `APP_ENV: development`, `command: [\"node\", \"--watch\",\n\"server.js\"]`, and `volumes:`. Without the override (or with `-f compose.yaml`), you should see\n`APP_ENV: production`, no `command`, and no `volumes`.

## 4. When to use these patterns and when NOT to\n\n### Use hot reload patterns when\n\n- **You are developing a Dockerized app** and want to see changes immediately without\n  rebuilding the image.\n- **You are using Node.js 22**, which has built-in `--watch` support.\n- **You want a separate dev setup** that does not affect the production baseline.\n- **You have a `compose.override.yaml`** that adds dev-only settings on top of the production base.\n\n### Do not use these patterns when\n\n- **You are running in production.** The override file must NOT be applied in production. Always\n  run `docker compose -f compose.yaml up` (without the override) for a production-immutable stack.\n- **Your app does not support `--watch`.** If you are on Node.js 14 or earlier, or using a different\n  runtime, `--watch` is not available. Use `nodemon` or a custom restart script instead.\n- **You are on Docker Desktop macOS/Windows.** The VM filesystem may not support `inotify`-based\n  `--watch`. The feedback loop may be slow or unreliable.\n- **You have a very large codebase** with frequent `node_modules` changes. Watching `node_modules`\n  causes unnecessary restarts. Use `node_modules_keep` or only mount source directories.\n\n### A practical development pattern\n\nIf you follow everything in this chapter, your file structure looks like this:\n\n```text\ndocker-learn/\n├── compose.yaml          # production base (no bind mounts, immutable)\n├── compose.override.yaml # development overrides (bind mounts, --watch)\n├── Dockerfile            # multi-stage, production-ready\n├── package.json\n├── server.js\n├── .dockerignore\n└── ...\n```\n\n```yaml\n# compose.yaml — production base\nservices:\n  api:\n    build: .\n    restart: unless-stopped\n    ports:\n      - \"127.0.0.1:3000:3000\"\n    environment:\n      APP_ENV: production\n    healthcheck:\n      test: [\"CMD\", \"node\", \"-e\", \"fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))]\n      interval: 10s\n      timeout: 3s\n      start_period: 5s\n      retries: 3\n\n# compose.override.yaml — development overrides\nservices:\n  api:\n    ports:\n      - \"127.0.0.1:3080:3000\"\n    environment:\n      APP_ENV: development\n    command: [\"node\", \"--watch\", \"server.js\"]\n    volumes:\n      - .:/app\n      - node_modules_keep:/app/node_modules\n\nvolumes:\n  node_modules_keep:\n```\n\n```console\n# Development: include the override\n$ docker compose up\n# Production: use only the base file\n$ docker compose -f compose.yaml up\n```\n\n## 5. Common mistakes\n\n**1. Applying `compose.override.yaml` in production by accident.**\n\n```console\n$ docker compose up\n```\n

If `compose.override.yaml` exists in the directory, Compose auto-loads it. The override adds\nbind mounts, `APP_ENV=development`, and `node --watch`. In production, you want the base\nfile only. Run `docker compose -f compose.yaml up` instead.\n\n**2. Forgetting `node_modules_keep` and wondering why `npm` commands act on the host's copy.**\n\n```console\n$ docker compose exec api npm install some-package\n```\

May install the package into the host's `node_modules` instead of the container's. Add\n`node_modules_keep:/app/node_modules` to preserve the image's copy.\n\n**3. Mounting `.` (whole host folder) and wondering why `--watch` triggers on unrelated\nfiles.**\n\nThe bind mount includes everything in the current directory: `Dockerfile`, `.dockerignore`,\n`compose.yaml`, `README.md`, etc. Use `.dockerignore`-style exclusions or only mount\n`./src` / `./lib` instead of `.`.\n\n**4. `node --watch` not working on Docker Desktop macOS/Windows.**\n\nThe hybrid VM filesystem may not support `inotify`. On macOS/Windows, consider using\n`nodemon` (`npm i -g nodemon`) or accept a slower feedback loop.\n\n**5. `--watch` triggering on `node_modules` changes.**\n\nIf the bind mount includes `node_modules` (from the host), every `npm install` inside the\ncontainer triggers a restart. Use `node_modules_keep` named volume to overlay the image's\n`node_modules` and only mount source files.\n\n**6. Forgetting to set `APP_ENV=development` in the override.**\n\nWithout this, the app may still run in production mode even in development, missing out on\ndev-friendly behaviors (e.g., more verbose logging, different webpack config).\n\n**7. `docker compose up` showing the override is auto-loaded and you cannot get rid of it.**\n\nIf you do not want the override, remove or rename the file, or use `-f compose.yaml` to point\nto a different base file.\n\n**8. Using `--watch` with a shell form `CMD`.**\n\n`node --watch server.js` works in exec form. If your `CMD` is in shell form (`CMD node server.js`),\nthe `--watch` flag may not work as expected. Always use exec form for `CMD` (as this course\ndoes).\n\n**8. Permissions issues when the host user UID differs from the container user UID.**\n\nIf the host is UID 1000 and the container runs as UID 1000 (via `USER node`), it works.\nIf there is a mismatch, use `chown -R 1000:1000 /app` inside the container, or adjust the\nmount options.\n\n**9. `--watch` and Docker Desktop on Linux hosts.**\n

Docker Desktop on Linux actually runs natively on Linux (through a container), so `--watch`\nusually works fine. The issue is mainly with macOS/Windows.\n\n**10. Thinking `--watch` rebuilds the image.**\n

`--watch` does **not** rebuild the image. It only restarts the running container's Node process.\nIf you changed a dependency or the Dockerfile, you still need `docker compose up --build` to\nrebuild the image.\n\n---\n

## 6. Try it yourself\n\n**Exercise.** Set up hot reload development and production configs.\n\n**Step 1 — ensure the base compose.yaml exists.**\n\n```bash\n$ cd /home/sunny/app/nimo/docker-doc/docker-learn\n```\n\n```yaml\n# compose.yaml — production base (already in the roadmap)\nservices:\n  api:\n    build: .\n    restart: unless-stopped\n    ports:\n      - \"127.0.0.1:3000:3000\"\n    environment:\n      APP_ENV: production\n    healthcheck:\n      test: [\"CMD\", \"node\", \"-e\", \"fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))]\n      interval: 10s\n      timeout: 3s\n      start_period: 5s\n      retries: 3\n```\n\n**Step 2 — create the override file.**\n\n```yaml\n# compose.override.yaml — development overrides\nservices:\n  api:\n    ports:\n      - \"127.0.0.1:3080:3000\"\n    environment:\n      APP_ENV: development\n    command: [\"node\", \"--watch\", \"server.js\"]\n    volumes:\n      - .:/app\n      - node_modules_keep:/app/node_modules\n\nvolumes:\n  node_modules_keep:\n```\n\n**Step 3 — start with hot reload (development).**\n\n```console\n$ docker compose up\n```\n\nThe api service should start with `node --watch server.js`, `APP_ENV=development`, and the\nbind mount.\n\n**Step 4 — verify hot reload.**\n\n1. The container starts.\n2. `curl -s http://localhost:3080/` serves the app.\n3. Edit `server.js` on the host (add a line or change a route).\n4. Wait 2-3 seconds — Node should auto-restart.\n5. `curl -s http://localhost:3080/` should show the updated output.\n\n**Step 5 — start production (without override).**\n\n```console\n$ docker compose -f compose.yaml up\n```\n\nThe api service should start with `node server.js`, `APP_ENV=production`, and no bind mounts.\n\n**Step 6 — clean up.**\n\n```console\n$ docker compose down\n```\n\n---\n

## 7. Next\n\nYou can develop inside Docker with hot reload without sacrificing production readiness. Next:\nenvironment-specific config — one image, many environments, `.env` files, and variable\ninterpolation.\n\n**[Chapter 33 — Pattern: Environment-Specific Config](33-pattern-environment-config.md)**