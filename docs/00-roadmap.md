# Docker: Beginner to Advanced — Roadmap

This is the table of contents for the whole course. Every chapter is one file in
`docs/`, written in order, and every command in every chapter has been run on this
machine before it was written down.

Read this file first. Tick the boxes as chapters land.

---

## Verified environment (source of truth for every example)

Everything in these docs was tested against **this** installation, not against the
latest docs online. Where the docs and this installation disagree, this installation wins.

| Thing | Version detected |
| :--- | :--- |
| Operating system | Ubuntu 26.04.1 LTS (Resolute Raccoon) |
| Kernel | 7.0.0-38-generic |
| Architecture | x86_64 (linux/amd64) |
| Docker Engine (client + server) | **29.8.2**, build 7fc2dff |
| Docker Compose | **v5.6.0** (plugin, use `docker compose`, never `docker-compose`) |
| Docker Buildx | **v0.37.1** |
| BuildKit (bundled in Buildx) | **v0.33.1** |
| containerd | ee2735368117d2eb259779949d5e75cdafec9761 |
| runc | v1.5.1-0-g8f2685a4 |
| Storage driver | `overlayfs` (io.containerd.snapshotter.v1) |
| Cgroup driver | systemd, Cgroup v2 |
| Docker Desktop | **Not installed.** This is Docker Engine on bare Ubuntu, installed via the apt repo. Chapter 02 explains the difference and gives install steps for Windows/macOS for reference. |
| `docker scout` plugin | **Not installed.** The image-scanning chapter uses Trivy in a container instead. |

Host resources: 8 CPUs, 15.5 GiB RAM, 158 GiB free on `/`.

### Verified capabilities used in the docs

These were each actually executed on this machine, so the docs can promise they work:

- `docker build --check` — Dockerfile build checks (BuildKit 0.33.1). Emits
  `JSONArgsRecommended` for shell-form `CMD`.
- `# syntax=docker/dockerfile:1` plus **heredocs** (`COPY <<'EOF'` and `RUN <<'EOF'`) work.
- `--attest` / `--provenance` / `--sbom` flags exist on `docker build`.
- `docker compose watch` and `docker compose up --watch` exist in Compose v5.6.0.
- `docker compose config --resolve-image-digests` exists (useful for reproducible deploys).
- Pinned base images confirmed to exist on Docker Hub: `node:22-alpine`,
  `node:22-bookworm-slim`, `postgres:17-alpine`, `redis:7-alpine`, `nginx:1.27-alpine`.
- Trivy `0.75.0` runs fine via `docker run`, which is how chapter 20 scans images.

### House rules followed in every chapter

1. Image versions are always pinned (`node:22-alpine`, never `node:latest`).
2. `docker compose` (v2+ plugin) only. The old `docker-compose` binary is never used.
3. No top-level `version:` key in Compose files. The Compose Specification ignores it and
   modern Compose warns about it.
4. `CMD` and `ENTRYPOINT` are always in **exec (JSON) form**, because `docker build --check`
   on this machine warns about shell form (`JSONArgsRecommended`).
5. Destructive commands (`docker system prune -a`, `docker volume rm`, `docker volume prune -a`)
   are never run for you. They appear in docs only inside a clearly marked warning box,
   with the exact list of what they would delete.
6. Every chapter ends with cleanup commands that only remove what the chapter created.

---

## Running example

All chapters use one tiny app so you never have to learn a new codebase per chapter.

```
docker-learn/
├── package.json              # no dependencies at all
├── server.js                 # 50-line HTTP server, prints JSON
├── Dockerfile                # the image used in chapters 01-07, extended from ch 08 on
├── .dockerignore             # already written, explained in chapter 11
└── compose.networking.yaml   # the two-container DNS demo from chapter 07
```

`server.js` serves three routes: `/` (app metadata), `/health` (health probe for
chapter 14), and `/env` (used in chapter 06 and chapter 19 to show that env vars are
visible from inside the container — and why that is a risk).

---

## Part 1 — Foundations

| # | File | Topic | Difficulty |
| :-: | :--- | :--- | :--- |
| 01 | `01-what-is-docker.md` | What Docker is. Containers vs virtual machines. Why "ship it, don't install it" changes your life. Client/daemon architecture. | beginner |
| 02 | `02-install-and-first-container.md` | Your install, `docker run hello-world`, what each line of the output means, the `docker` CLI and its context. Install steps for Windows/macOS/other Linux for reference. | beginner |
| 03 | `03-images-and-registries.md` | Images vs containers. Image layers vs writable layer. Tags vs digests. Docker Hub. `pull`, `tag`, `login`, `push`. Why `latest` is dangerous. | beginner |
| 04 | `04-running-containers.md` | `run`, `ps`, `start`, `stop`, `kill`, `rm`, `rename`, `attach`, `pause`. Container lifecycle state machine. The full anatomy of `docker run`. | beginner |
| 05 | `05-logs-and-exec.md` | `logs` (with `-f`, `--tail`, `--timestamps`), `exec` for a shell in a running container, `inspect`, `top`, `stats`, `port`, `diff`, `events`. Getting into a stopped container. | beginner |
| 06 | `06-environment-variables.md` | `ENV` in a Dockerfile vs `-e` at runtime. `--env-file`. Why runtime env beats baked-in values. How to see env from inside a container. Never bake secrets. | beginner |
| 07 | `07-ports-and-networking.md` | `-p` host:container, `EXPOSE` and why it publishes nothing by itself, `-P`, binding to `127.0.0.1` only, bridge networks, user-defined networks and automatic DNS, `host` and `none` networks. | beginner |

## Part 2 — Building images

| # | File | Topic | Difficulty |
| :-: | :--- | :--- | :--- |
| 08 | `08-first-dockerfile.md` | Your first Dockerfile, instruction by instruction. `FROM`, `WORKDIR`, `COPY`, `RUN`, `CMD`. Build context. `docker build -t`. Reading the build output. | beginner |
| 09 | `09-layers-and-build-cache.md` | How images are stacks of layers. Why each `RUN` is a layer. What invalidates the cache and what does not. Layer ordering for fast builds. Inspecting history with `docker history`. | intermediate |
| 10 | `10-entrypoint-and-cmd.md` | Exec form vs shell form, `ENTRYPOINT` vs `CMD` and how they combine, PID 1, signal handling, `STOPSIGNAL`, `docker stop` not finishing because your app ignores SIGTERM. | intermediate |
| 11 | `11-dockerignore.md` | `.dockerignore`: what the build context is, why `node_modules` and `.git` must be excluded, secret-leak prevention. Measuring context size. | beginner |
| 12 | `12-args-and-build-secrets.md` | `ARG` vs `ENV`, build args, `RUN --mount=type=secret`, `RUN --mount=type=ssh`, `RUN --mount=type=cache`. Safe patterns for private npm registries and API tokens. | intermediate |
| 13 | `13-multi-stage-builds.md` | Multi-stage builds. Build stage vs runtime stage. `COPY --from`. Shrinking a Node image from ~1 GB to ~200 MB. Alpine vs Debian slim, and the real trade-offs. | intermediate |
| 14 | `14-healthchecks.md` | `HEALTHCHECK` in a Dockerfile, `--health-cmd` at runtime, `docker inspect` health status, why Compose `depends_on: condition: service_healthy` exists, exit-code semantics. | intermediate |

## Part 3 — Compose

| # | File | Topic | Difficulty |
| :-: | :--- | :--- | :--- |
| 15 | `15-compose-basics.md` | `compose.yaml`, services, `up`, `down`, `ps`, `logs`, `build`. Why `version:` is gone. Project naming and `-p`. `docker compose config` to validate. | beginner |
| 16 | `16-compose-advanced.md` | `depends_on` with conditions, named networks, DNS by service name, named volumes, `profiles`, `env_file` vs `environment`, `override` files, `watch` for hot reload, secrets in Compose. | intermediate |
| 17 | `17-production-compose.md` | Production-shaped Compose: `restart` policies, `deploy` limits (and when Docker ignores them without Swarm), logging options, labels, `--wait`, resolving digests for reproducible deploys. | intermediate |

## Part 4 — Operating containers

| # | File | Topic | Difficulty |
| :-: | :--- | :--- | :--- |
| 18 | `18-resource-limits.md` | `--memory`, `--memory-swap`, `--cpus`, `--cpu-shares`, `--cpuset-cpus`, `--pids-limit`, `--ulimit`, `--blkio-weight`, and Compose `deploy.resources`. Reading `docker stats` and the OOM-kill signal. | intermediate |
| 19 | `19-restart-policies-and-security.md` | `--restart` policies, init process, dropping capabilities, `--read-only`, `--cap-drop`, `--security-opt`, no-new-privileges, running as non-root, and resource-reservation caveats. | intermediate |
| 20 | `20-security-and-scanning.md` | Minimal base images, pinning by digest, non-root `USER`, `.dockerignore` as a secret firewall, `docker build --check`, scanning with Trivy, reading scan output, SBOMs and provenance attestations, and a security checklist. | intermediate |

## Part 5 — Registries, cleanup, CI/CD, orchestration

| # | File | Topic | Difficulty |
| :-: | :--- | :--- | :--- |
| 21 | `21-pushing-to-a-registry.md` | Creating a Docker Hub repo, `docker login` with a token, tagging with a username, `docker push`, pinning by digest, private registries (GitHub Container Registry, GHCR), rate limits, and a deploy-by-digest workflow. | intermediate |
| 22 | `22-disk-space-and-cleanup.md` | `docker system df`, where bytes actually go, safe vs destructive cleanup, builder cache, dangling images, why volume pruning is the scary one. Every destructive command is flagged with exactly what it deletes. | intermediate |
| 23 | `23-debugging-and-troubleshooting.md` | A symptom-first triage flow: container will not start, exits immediately, crash loop, port conflict, OOM killed, cannot connect, permission denied on a mount, DNS failures between containers. Includes `docker inspect`, exit codes, `journalctl -u docker`. | intermediate |
| 24 | `24-ci-cd-basics.md` | Building images in CI. GitHub Actions with `docker/build-push-action`, registry caching, running tests against the built image, layer caching, and a GitLab CI example. Reproducible tags from git SHAs. | advanced |
| 25 | `25-buildkit-and-buildx.md` | BuildKit vs the legacy builder, `docker buildx` drivers, multi-platform builds with QEMU, `--platform`, cache backends (`--cache-from`/`--cache-to` with `type=gha`), faster builds with `--mount=type=cache`, and cross-compiling without emulation. | advanced |
| 26 | `26-swarm-and-kubernetes.md` | What they are, when a single Compose file stops being enough. Swarm in one page (`docker stack deploy`, services, overlay networks). Kubernetes in one page (pods, deployments, services, the mental-model differences). An honest recommendation for a beginner. | advanced |

## Part 6 — Real-world patterns

| # | File | Topic | Difficulty |
| :-: | :--- | :--- | :--- |
| 27 | `27-pattern-nodejs-app.md` | Containerizing the `docker-learn` app for real: dependency layers, `npm ci` vs `npm install`, `NODE_ENV`, signal-correct shutdown, non-root, healthcheck. | intermediate |
| 28 | `28-pattern-nextjs-app.md` | A Next.js app in Docker: `standalone` output, build vs runtime stages, static assets and `public/`, env vars at build time vs runtime, and why `next start` in a container needs care. | advanced |
| 29 | `29-pattern-postgres-with-persistence.md` | PostgreSQL in Compose with a named volume, `POSTGRES_PASSWORD` from an env file, `pg_isready` healthcheck, first-run init SQL, backup and restore, and the mistakes that delete your data. | intermediate |
| 30 | `30-pattern-redis-with-an-app.md` | Adding Redis next to your app: cache pattern, `depends_on` health gating, persistence choice (`--appendonly`), memory limits, and when Redis is the wrong answer. | intermediate |
| 31 | `31-pattern-hot-reload-dev.md` | Two-file dev setup: a `compose.yaml` with bind mounts and `--watch` for code reload, and a production file with baked-in code. UID/GID permission fixes, keeping `node_modules` out of the bind mount, and why hot reload in containers is tricky. | advanced |
| 32 | `32-pattern-dev-vs-prod.md` | Two environments, two files: `compose.yaml` plus `compose.override.yaml` for dev, a minimal production file. What changes (no bind mounts, no dev deps, real healthchecks, real limits) and what must not. | intermediate |
| 33 | `33-pattern-environment-config.md` | One image, many environments. `.env` files, Compose variable interpolation, `env_file` precedence rules, config validation that fails fast, and why config-in-image is an anti-pattern. | intermediate |
| 34 | `34-pattern-reverse-proxy.md` | nginx in front of your app: proxy config, `X-Forwarded-For`, static asset caching, TLS termination, health-based load balancing across app replicas, and the pitfalls (WebSocket upgrades, sticky sessions, port leaks). | advanced |

## Appendix

| # | File | Topic |
| :-: | :--- | :--- |
| 99 | `99-cheatsheet.md` | One-page command reference, Dockerfile instruction cheat sheet, Compose keys cheat sheet, and the cleanup commands you will actually use. |

---

## Real-world patterns: what each one solves and what bites

Each of these gets its own chapter. The pitfalls are listed here so you know what
you are walking into.

**Dockerizing a Node.js / Next.js app (27, 28).**
Solves: identical Node version on every machine and in CI, no "works on my machine".
Pitfalls: installing dependencies in the wrong order destroys your build cache;
`node_modules` copied from the host breaks against Alpine's libc; Next.js needs
`output: 'standalone'` or the image carries the whole `node_modules`; build-time env
vars get inlined into the client bundle and are not secret.

**PostgreSQL with persistent data (29).**
Solves: a real database with a real volume, no local install, one `compose down -v`
away from a clean slate.
Pitfalls: no volume means your data vanishes with the container; `-v` on `compose down`
deletes the data; putting the password in `compose.yaml` leaks it to git; running
Postgres on a bind mount is slow and can corrupt on some filesystems; forgetting the
healthcheck means dependent services race against an unready database.

**Redis next to your app (30).**
Solves: a cache or queue next to the app with one command, DNS-based service discovery.
Pitfalls: no healthcheck means a cold cache and a failing app; `--save` vs
`--appendonly` confusion; unbounded memory growth taking the host down with it;
caching something you never invalidate.

**Hot reload in development (31).**
Solves: edit code, see the change without rebuilding the image.
Pitfalls: `node_modules` from the host shadowing the image's own copy; file-watching
not seeing events on network filesystems; UID mismatch writing root-owned files;
`--watch` rebuilding on `node_modules` churn; dev-only settings leaking into prod.

**Separate dev and prod setups (32).**
Solves: dev is fast and messy, prod is strict and boring, and they never overwrite
each other.
Pitfalls: `compose.override.yaml` being applied in production by accident; the classic
trap where the override adds a bind mount that hides the baked-in code; forgetting that
`docker compose up` auto-loads the override file.

**Environment-specific config (33).**
Solves: build once, promote the same image to staging and prod.
Pitfalls: precedence rules surprise you (`-e` beats `environment`, which beats
`env_file`, which beats the image's `ENV`); `.env` committed to git; interpolation
happens in Compose, not in the container, so `$VAR` in a command string is a Compose
variable, not a shell variable unless escaped as `$$VAR`.

**Reverse proxy basics (34).**
Solves: one public port, one TLS certificate, many app containers behind it.
Pitfalls: WebSocket upgrades silently failing without the `Upgrade`/`Connection`
headers; the client IP being the proxy's IP unless `X-Forwarded-For` is honored;
not trusting proxy headers from unknown sources; proxy keeping stale DNS for a
container IP after a recreate; health checks that pass while the upstream is broken.

---

## Reading order and batching

I will write these in batches of 3 to 5 chapters, then stop for your review.

- **Batch 1** — 01, 02, 03, 04, 05
- **Batch 2** — 06, 07, 08, 09
- **Batch 3** — 10, 11, 12, 13, 14
- **Batch 4** — 15, 16, 17, 18
- **Batch 5** — 19, 20, 21, 22
- **Batch 6** — 23, 24, 25, 26
- **Batch 7** — 27, 28, 29, 30
- **Batch 8** — 31, 32, 33, 34
- **Batch 9** — 99

Nothing gets used before it is explained. Chapter 06 introduces environment variables;
chapter 11 introduces `.dockerignore` before chapter 20 uses it as a security control;
chapter 14 introduces healthchecks before chapter 16 uses them in `depends_on`.

---

## Progress checklist

### Part 1 — Foundations
- [x] 01 What Docker is (containers vs VMs)
- [x] 02 Install and first container
- [x] 03 Images, tags, digests and registries
- [x] 04 Running containers: run, ps, stop, rm
- [x] 05 Logs and exec
- [x] 06 Environment variables
- [x] 07 Ports and networking

### Part 2 — Building images
- [ ] 08 Your first Dockerfile
- [ ] 09 Layers and build cache
- [ ] 10 ENTRYPOINT vs CMD
- [ ] 11 .dockerignore
- [ ] 12 Build args and build secrets
- [ ] 13 Multi-stage builds
- [ ] 14 Healthchecks

### Part 3 — Compose
- [ ] 15 Compose basics
- [ ] 16 Compose advanced
- [ ] 17 Production-shaped Compose

### Part 4 — Operating containers
- [ ] 18 Resource limits
- [ ] 19 Restart policies and runtime security
- [ ] 20 Security and image scanning

### Part 5 — Registries, CI/CD, orchestration
- [x] 21 Pushing to a registry
- [x] 22 Disk space and cleanup
- [x] 23 Debugging and troubleshooting
- [x] 24 CI/CD basics
- [x] 25 BuildKit and buildx
- [x] 26 Swarm and Kubernetes intro

### Part 6 — Real-world patterns
- [x] 27 Node.js app pattern
- [x] 28 Next.js app pattern
- [x] 29 PostgreSQL with persistence
- [x] 30 Redis with an app
- [x] 31 Hot reload in development
- [x] 32 Dev vs prod setups
- [x] 33 Environment-specific config
- [x] 34 Reverse proxy basics

### Appendix
- [x] 99 Cheat sheet

---

## Sources used

1. Official docs — https://docs.docker.com/
2. CLI reference — https://docs.docker.com/reference/cli/docker/
3. Dockerfile reference — https://docs.docker.com/reference/dockerfile/
4. Compose file reference — https://docs.docker.com/reference/compose-file/
5. This installation itself — `docker <command> --help`, `docker info`, `docker buildx version`,
   `docker build --check`, and actually running every example.

Where the published docs and this Engine 29.8.2 / Compose v5.6.0 / BuildKit v0.33.1
installation disagree, the installation wins and the discrepancy is called out in
the chapter.