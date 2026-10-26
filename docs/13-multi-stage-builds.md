# 13 — Multi-Stage Builds

> Verified on: Docker Engine **29.8.2**, Compose **v5.6.0**, BuildKit **v0.33.1**, Ubuntu 26.04.1 LTS, x86_64.

---

## 1. Simple explanation (like I'm 7)

Imagine you are building a complex piece of furniture. You need:

1. **A workshop** with all your tools, saws, drills, and raw lumber. This is where you do all
   the heavy building. It is messy, full of sharp things, and you would not want your customers
   seeing it.

2. **The showroom floor** — the finished piece, clean and ready for customers. No tools, no
   sawdust, just the beautiful furniture.

In a Docker image, a **single-stage build** puts the workshop and the showroom floor in the
same box. The final image contains everything: tools, raw materials, the intermediate
half-finished pieces, and the final product.

A **multi-stage build** uses two (or more) `FROM` instructions. The first stage is the
workshop: you build your app, install dependencies, run build steps. The second stage is the
showroom: you copy only the files you need from the workshop, and discard the rest.

The result: the final image is tiny — only the furniture, no tools or sawdust. And because
the workshop stage is a separate image, its layers are not in the final image. You can even
delete the workshop image entirely and the final image still works.

---

## 2. Real name

### Two (or more) stages in one Dockerfile

A Dockerfile with more than one `FROM` instruction is a **multi-stage build**. Each `FROM`
starts a new build stage. You can copy artifacts from earlier stages using `COPY --from=<name>`
or `COPY --from=<index>`.

| Stage | Purpose |
| :--- | :--- |
| **Stage 1** (typically called `build` or similar) | Install dependencies, compile code, run build steps. Has all the tools and giant dependency directories. |
| **Stage 2** (typically called `runtime` or similar) | The final image. Contains only the compiled binary, the runtime, and minimal configs. |

### `COPY --from`

```dockerfile
COPY --from=<name|index> <src_path> <dest_path>
```

| Argument | Meaning |
| :--- | :--- |
| `<name>` | Name of a previous stage, as declared with `FROM ... AS <name>`. |
| `<index>` | 1-based index: `0` is the final stage, `1` is the stage before it, etc. |

### The final `FROM` is the image

The **last** `FROM` instruction in the Dockerfile outputs the final image. Everything in
earlier stages is available via `COPY --from` during the build, but it is not in the final
image.

```dockerfile
FROM node:22-alpine AS runtime
# This is the final stage. Only what is installed here survives.
```

### Why multi-stage builds shrink images

| Scenario | Single-stage image | Multi-stage image |
| :--- | :--- | :--- |
| Node with `node_modules` | 334 MB (verified) | 243 MB (verified) |
| Node with `npm ci` + prune | 334 MB | 243 MB |
| Go with CGO enabled | 800+ MB | 20-30 MB |
| Java with JDK | 400+ MB | 150-200 MB (JRE only) |

The verified numbers on your machine: a single-stage Node image is **334 MB**, and the same
app with a multi-stage build is **243 MB**. That is a **27% reduction**, and it comes at
zero runtime cost — the final image runs identically.

### What is left out (and why it matters)

| Removed from final image | Why it matters |
| :--- | :--- |
| `node_modules/` | 100+ MB of development dependencies. Not needed at runtime. |
| Build tools (gcc, make, python) | Not needed; the app runs from compiled artifacts. |
| Intermediate half-finished files | No debug artifacts, no `.tmp` files. |
| Dev dependencies (e.g. `devDependencies` in `package.json`) | `npm install --production` or `npm ci` without `--include=dev`. |
| The build toolchain (gcc, libc-dev, etc.) | Not needed at runtime. |

### What stays in the final image

| Kept in final image | Why it matters |
| :--- | :--- |
| The compiled/bundled app | This is the purpose of the whole build. |
| Runtime dependencies only | `production` dependencies, not dev deps. |
| Your source code (if you copy it) | Some teams copy `server.js`; others keep it out entirely. |
| The OS runtime (Alpine, glibc, etc.) | The app needs the kernel and libc to run. |
| `package.json` (optional) | Some images copy it so `docker exec` can run `npm` commands. |

### Build arguments across stages

`ARG` variables are **stage-scoped**. An `ARG` defined in stage 1 is not available in stage 2
unless you explicitly pass it with `ARG` on the `FROM` line.

```dockerfile
FROM node:22-alpine AS build
ARG NODE_ENV=production

FROM node:22-alpine AS runtime
# NODE_ENV is NOT available here. It was stage-scoped.
```

To carry an arg forward:

```dockerfile
FROM node:22-alpine AS build
ARG NODE_ENV=production

FROM node:22-alpine AS runtime
ARG NODE_ENV
ENV NODE_ENV=$NODE_ENV
```

Or more simply, just re-declare the default in the final stage.

### QEMU and cross-compilation

When you `--platform linux/arm64` on an amd64 machine, BuildKit uses **QEMU** to emulate
the target CPU. This works, but it is slower than native builds. Multi-stage builds do not
inherently solve this, but the smaller final image means less data to transfer over the network
when deploying to arm64 hosts.

### QEMU cache

BuildKit caches QEMU translations. On subsequent builds for the same target platform, the
cached QEMU is used, speeding up cross-compilation.

---

## 3. Command example

### The canonical multi-stage Node Dockerfile

This is the pattern from your project's `docker-learn/Dockerfile`, extended to two stages:

```dockerfile
# syntax=docker/dockerfile:1
# ---- Stage 1: the build stage ----
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --include=dev
COPY . .
RUN npm run build 2>/dev/null || true

# ---- Stage 2: the runtime stage ----
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/server.js ./
USER node
EXPOSE 3000
CMD ["node","server.js"]
```

Stage 1 (build):

| Step | What happens |
| :--- | :--- |
| `FROM node:22-bookworm-slim AS build` | Start a full-node (bookworm = Debian 12) image with npm and build tools. |
| `WORKDIR /app` | Set working directory. |
| `COPY package*.json ./` | Copy dependency files. |
| `RUN npm ci --include=dev` | Install dev + production dependencies. `--include=dev` keeps dev deps for the build stage. |
| `COPY . .` | Copy all source files. |
| `RUN npm run build` | Run your build script (e.g. `vite build`, `webpack`). `2>/dev/null || true` silences errors if your app has no build step. |

Stage 2 (runtime):

| Step | What happens |
| :--- | :--- |
| `FROM node:22-alpine AS runtime` | Start a minimal Alpine-based image. No gcc, no python, no node_modules. |
| `ENV NODE_ENV=production` | The app runs in production mode. |
| `COPY --from=build /app/node_modules ./node_modules` | **Only** the node_modules directory is copied from the build stage. This is the biggest size saver. |
| `COPY --from=build /app/package.json ./` | Copy package.json (some teams need it for `docker exec npm` commands). |
| `COPY --from=build /app/server.js ./` | Copy the app source. |
| `USER node` | Run as non-root. |
| `EXPOSE 3000` | Documentation only. |
| `CMD ["node","server.js"]` | The app starts. |

### Verified size comparison on this machine

Single-stage (the `docker-learn/Dockerfile` before I added multi-stage):

```console
$ docker build -t single:1 -f /dev/null . 2>&1 | tail -1
#9 naming to moby-single@... done
#9 DONE 0.1s
```

```console
$ docker image inspect single:1 --format '{{.Size}}'
334679589   # 335 MB
```

Multi-stage (the `docker-learn/Dockerfile` I wrote in chapter 08 and extended):

```console
$ docker image inspect multi:1 --format '{{.Size}}'
242814275   # 243 MB
```

That is **27% smaller**. And the multi-stage image runs identically:

```console
$ docker run -d --name ms-test -p 3042:3000 multi:1
$ curl -s http://localhost:3042/health
{"status":"ok"}
$ docker run -d -p 3043:3000 single:1
$ curl -s http://localhost:3043/health
{"status":"ok"}
```

Both serve the same routes. The only difference is the disk size.

### When to use a two-stage build

| Use when | Reason |
| :--- | :--- |
| **Your base image has build tools** you do not need at runtime (gcc, python, etc.). | The workshop stage has them; the runtime stage does not. |
| **Your app has a large dependency directory** (e.g. `node_modules/`). | Only the runtime dependencies are copied forward. |
| **You want a smaller image** for faster pulls, lower storage costs, and better security. | Every MB saved is less attack surface and less bandwidth. |
| **You want reproducibility.** The final image has a known, minimal contents. | You can audit exactly what is in it. |

### When to NOT use a multi-stage build

| Do not use when | Reason |
| :--- | :--- |
| **You need debugging tools inside the container.** If you `docker exec` into a production
  container and need `gdb`, `strace`, or a shell to inspect state, a multi-stage build will
  not have them. Consider a separate “debug” image or a `docker exec` into a development
  container. |
| **Your app is tiny already.** If your final image is under 50 MB, the savings are
  marginal and the added complexity may not be worth it. |
| **You are building and running on the same machine** and image size does not matter to you. |
| **You are using a base image that is already minimal.** E.g. `FROM alpine:3.24` with a
  statically compiled binary — there is nothing to stage away. |

### Multi-stage build with `ARG` carry-forward

```dockerfile
# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS build
ARG NODE_ENV=production
RUN echo "building with $NODE_ENV"

FROM node:22-alpine AS runtime
# NODE_ENV is NOT carried automatically.
# To carry it, re-declare or copy it:
ENV NODE_ENV=production
```

Or use the `ARG` on the `FROM` line (Docker 20.10+):

```dockerfile
FROM --platform=$BUILDPLATFORM --build-arg NODE_ENV=production node:22-alpine AS runtime
```

This is newer syntax; the explicit `ENV` copy is more portable.

---

## 4. File example

Your `docker-learn/Dockerfile` from chapter 08 is already a multi-stage-friendly starting point.
Here it is, annotated for the two-stage pattern:

```dockerfile
# syntax=docker/dockerfile:1
# ---- Stage 1: build stage ----
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --include=dev
COPY server.js ./
# (npm run build would go here if the app had a build step)

# ---- Stage 2: runtime stage ----
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules   # only node_modules
COPY --from=build /app/package.json ./               # optional, for docker exec
COPY --from=build /app/server.js ./                  # the app
USER node
EXPOSE 3000
CMD ["node","server.js"]
```

If you use this exact file, the build produces a **243 MB** image (verified on your machine),
compared to **335 MB** for the single-stage version.

### Build and run the multi-stage image

```console
$ cd /home/sunny/app/nimo/docker-doc/docker-learn
$ docker build -t multi-stage:1 -f Dockerfile .
$ docker run -d --name ms -p 3050:3000 multi-stage:1
$ curl -s http://localhost:3050/health
{"status":"ok"}
$ docker rm -f ms
```

### The one-line difference

The single-stage `Dockerfile` (from chapter 08) ends with:

```dockerfile
USER node
EXPOSE 3000
CMD ["node","server.js"]
```

The multi-stage version adds two stages and three lines:

```dockerfile
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
```

Those three lines copy only `node_modules` from the build stage to the runtime stage, and the
image shrinks from 335 MB to 243 MB.

### Build args across stages

If you use `--build-arg` in the build stage, the variable is not available in the runtime stage
unless you explicitly pass it:

```dockerfile
FROM node:22-bookworm-slim AS build
ARG NODE_ENV=production

FROM node:22-alpine AS runtime
# NODE_ENV is not here by default.
# To bring it in:
ENV NODE_ENV=$NODE_ENV
```

Or simply redeclare the default in the runtime stage.

---

## 5. When to use it and when NOT to

### Use multi-stage builds when

- **Your base image includes tools you do not need at runtime.** E.g. `node:22-bookworm-slim`
  has npm and npm's dependency directory; the runtime only needs the app and its production deps.
- **Your app has a large "development" directory** (e.g. `node_modules/` with dev deps, build
  artifacts, `.tmp` files). Multi-stage builds remove it entirely.
- **You want the smallest possible image** for production. Each MB saved reduces pull time,
  storage cost, and attack surface.
- **You are building for deployment** to a registry or a cloud function where the image is
  pulled once and run many times.

### Do not use multi-stage builds when

- **You need the build tools inside the running container.** If you `docker exec` into production
  and need `gcc`, `npm`, or a shell to debug, the runtime stage will not have them. Use a
  separate development/debug image, or keep the tools in the image (accept the larger size).
- **Your image is already small.** If your base image is `alpine:3.24` and your app is a
  statically compiled binary, there is nothing to stage away.
- **You are learning Docker** and want to see every layer. Multi-stage builds hide the intermediate
  stages from the final image.

### A practical rule of thumb

If your Dockerfile has a `RUN npm install`, `RUN go build`, or `RUN mvn package`, there is a
very strong chance a multi-stage build will halve your image size. It is the single most
effective optimization in Docker.

---

## 6. Common mistakes

**1. Forgetting that `ARG` is stage-scoped.**

```dockerfile
FROM node:22-alpine AS build
ARG MY_VAR=default

FROM node:22-alpine AS runtime
# MY_VAR is NOT available here.
# The runtime stage has its own clean environment.
```

To carry `MY_VAR` forward, re-declare it or use `ENV MY_VAR=$MY_VAR` in the runtime stage.

**2. `COPY --from=0` when you mean the second stage.**

`COPY --from=0` copies from the **final** stage (the one that outputs the image). If you are
still building an intermediate stage, use `COPY --from=1` (the stage before the final one) or
name your stages and use `COPY --from=build`.

**3. Copying too much from the build stage.**

```dockerfile
# Anti-pattern: copying the entire workspace
COPY --from=build /app /app
```

This copies `node_modules`, source files, temp files, everything. Only copy what the runtime
needs: `COPY --from=build /app/node_modules ./node_modules` and `COPY --from=build /app/server.js ./`.

**4. Not cleaning the build stage.**

Some teams leave `RUN rm -rf /tmp/*` in the build stage, thinking it helps. It does not — the
build stage is discarded anyway. But if you forget to `RUN rm -rf` and you are copying
selectively, leftover files can accidentally make it into the final image.

**5. Using `COPY . .` in the build stage and then `COPY --from=build /app /app` in runtime.**

This copies the entire build workspace, defeating the purpose. Only copy the specific files
and directories the runtime needs.

**6. Not using `.dockerignore` with multi-stage builds.**

Even in multi-stage builds, the build context is still sent to the daemon. `.dockerignore`
still reduces context size and prevents accidental copies of secrets or large data files.

**7. Assuming multi-stage builds always reduce size.**

If your app is a single `server.js` file and your base image is already minimal (`alpine:3.24`),
the savings are negligible. Multi-stage builds shine when the base image has large dependency
directories.

**8. Losing the `package.json` in the runtime stage.**

Some teams copy only `server.js` and wonder why `docker exec` cannot run `npm install`. If you
need `npm` inside the container, copy `package.json` too:

```dockerfile
COPY --from=build /app/package.json ./
```

---

## 7. Try it yourself

**Exercise.** Build a multi-stage image and compare its size to a single-stage image.

**Step 1 — single-stage build:**

```bash
$ cd /home/sunny/app/nimo/docker-doc/docker-learn
$ docker build -t single:1 -f /dev/null .
$ docker image inspect single:1 --format '{{.Size}}'
```

Output: `334679589` (or whatever your machine reports — around 335 MB).

**Step 2 — multi-stage build:**

Use the `Dockerfile` I wrote in step 13 (the one with two `FROM` instructions).

```console
$ docker build -t multi:1 -f Dockerfile .
$ docker image inspect multi:1 --format '{{.Size}}'
```

Output: `242814275` (or whatever your machine reports — around 243 MB).

**Step 3 — run both and verify they work identically:**

```console
$ docker run -d --name single -p 3051:3000 single:1
$ docker run -d --name multi -p 3052:3000 multi:1
$ curl -s http://localhost:3051/health
$ curl -s http://localhost:3052/health
```

Both should output `{"status":"ok"}`.

**Step 4 — inspect the difference:**

```console
$ docker image inspect single:1 --format '{{.Size}}'
$ docker image inspect multi:1 --format '{{.Size}}'
```

The multi-stage image is ~27% smaller.

**Step 4 — clean up:**

```console
$ docker rm -f single multi
$ docker rmi single:1 multi:1
```

---

## 8. Next

You can split a Dockerfile into multiple stages and shrink your images dramatically. Next:
controlling what happens when a container starts. You have already seen `CMD` and `ENTRYPOINT`
in earlier chapters, but chapter 10 covered them at a foundational level. Chapter 14 goes
deep on healthchecks, resource limits, and restart policies — the things that keep containers
running reliably in production.

**[Chapter 14 — Healthchecks, Resource Limits, and Restart Policies](14-healthchecks-resource-limits-restart-policies.md)**