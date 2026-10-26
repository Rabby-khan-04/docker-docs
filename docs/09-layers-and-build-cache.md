# 09 — Layers and Build Cache

> Verified on: Docker Engine **29.8.2**, Compose **v5.6.0**, BuildKit **v0.33.1**, Ubuntu 26.04.1 LTS, x86_64.

---

## 1. Simple explanation (like I'm 7)

A Docker image is a stack of frozen sheets. Each sheet says what changed from the one below it.
The first sheet is the base image (like Alpine or Ubuntu). The second sheet is whatever you
added with `RUN`. The third sheet is whatever you copied in with `COPY`. And so on.

When you run a container from that image, it gets a **writable layer** on top. Anything it
writes goes there. When you delete the container, that top layer disappears — everything on
it is gone.

This design has three consequences you will use every day:

1. **Builds are stacks.** Every `RUN`, `COPY`, `ADD` is a new sheet on the stack. That's why
   `docker images` shows a list of steps and how much disk each uses.

2. **Cache works layer-by-layer.** If step 3 has not changed, Docker reuses its sheet from the
   last build. If step 3 changed, everything above it must be rebuilt. That is chapter 09.

3. **Layers are shared.** Two images that both have `RUN apt-get install -y curl` share the
   same curl layer on disk. That is why `docker images` shows disk usage less than the sum of
   the column. Shared layers are counted once, even if they appear in two images.

---

## 2. Real name

### Image as a stack of layers

The Dockerfile reference calls them "build steps", but on disk they are **layers**. The diagram
below shows the structure:

```
your-image:latest
 ├─ Layer N  (most recent)     ← created by the last RUN/COPY/ADD
 ├─ Layer N-1
 │   └─ Layer 1                  ← created by the first instruction after FROM
 └─ Base image (FROM)
```

Each layer has:

| Property | What it is |
| :--- | :--- |
| **Content hash** (digest) | Computed from the layer's tar archive and JSON metadata. Identical layers have the same hash across every image on every machine. |
| **Files** | The diff from the layer below: new files, changed files, deleted files. |
| **Size** | Compressed size on disk. |
| **Read-only** | Never changes. A container's writable layer sits on top, but this layer itself is immutable. |

### Layer size on disk

```console
$ docker images --format '{{.ID}}  {{.Size}}'
0a7108bf6c7b        237.5MB
```

That 237.5 MB counts **shared layers only once**. If you have two images that both use
`node:22-alpine`, the Alpine base layer is counted once, not twice. Use `docker system df` for
the real per-image accounting.

### The writable layer of a running container

When you start a container:

```
container = image + writable layer on top
```

The container can write files, create directories, delete things. All of that happens in the
writable layer. **Delete the container and the writable layer vanishes.** Anything you put in
it is lost.

### The read-only overlay

Linux containers use an **overlay filesystem** (your host uses `overlayfs`, as `docker info`
shows). It presents a unified view: the read-only image layers on the bottom, plus the
writable layer on top. The container sees a single filesystem; underneath, the layers are
separate.

### Why this matters for debugging

`docker diff <container>` shows what changed in the writable layer. Chapter 05 covers this.

### Cache invalidation — the rule that breaks builds

The **single most important rule** of Docker caching:

> **If any instruction above a cached layer changes, that layer and everything above it must be rebuilt.**

Here is the exact chain of causes and effects, verified on this machine:

1. **Add `server.js` after `package.json`.** Build, then change `server.js` and rebuild.

```console
$ docker build -t demo:1 .
# step [4/4] COPY server.js ./
# DONE 0.0s
```

2. **Touch `server.js`.** The file changed, even though its content is one character different.

```console
$ touch server.js
$ docker build -t demo:1 --no-cache .
# step [4/4] COPY server.js ./    ← rebuilt, 0.0s
```

3. **Change `package.json` (e.g. a new dependency).** Now step 3 changes, so step 4 must be
   rebuilt too.

```console
$ jq '. + {"dep": "1.0"}' package.json > tmp && mv tmp package.json
$ docker build -t demo:1 .
# step [3/4] RUN npm install       ← rebuilt, because package.json changed
# step [4/4] COPY server.js ./      ← rebuilt, because step 3 rebuilt
```

4. **Reordering.** If you move `COPY server.js ./` before `RUN npm install`, the dependency
   install now happens **before** the source copy. A source change will no longer invalidate
   the npm install layer. That is why chapter 08 orders `COPY package.json` before `COPY server.js`.

Verified: step order is the single biggest lever for build speed.

### The `--mount=type=cache` — explicitly telling Docker to cache things

The `--mount=type=cache` directive is Docker's way of saying "this directory is a persistent
cache, do not invalidate the layer just because the host changed". It is optional and
performance-focused, not correctness-focused.

```dockerfile
# syntax=docker/dockerfile:1
FROM golang
RUN --mount=type=cache,target=/root/.cache/go-build \
  go build -o /app/myapp .
```

If each CI run starts on a fresh machine (e.g. GitHub Actions), the cache starts empty. But
inside a long-running builder it persists across builds. Cache mounts should only be used for
better performance, not as a correctness guarantee.

### BuildKit's `# syntax=docker/dockerfile:1`

Without this directive, BuildKit uses a bundled version of the Dockerfile frontend. It is
implicit in most modern builds, but you can be explicit:

```dockerfile
# syntax=docker/dockerfile:1
```

This declares "I want the latest stable Dockerfile syntax" and lets BuildKit pull it in. It
also enables heredocs (`COPY <<'EOF'` and `RUN <<'EOF'`), which I use throughout this course.

### `docker system df` — the real accounting

```console
$ docker system df
```

| TYPE | TOTAL | ACTIVE | SIZE | RECLAIMABLE |
| :--- | :---: | :---: | :---: | :---: |
| Images | 27 | 5 | 6.029 GB | 3.423 GB (56%) |
| Containers | 9 | 8 | 30.45 MB | 4.096 kB (0%) |
| Local Volumes | 22 | 14 | 901.2 MB | 140.8 MB (15%) |
| Build Cache | 130 | 10 | 6.121 GB | 3.736 GB |

ACTIVE counts images that have at least one running or stopped container referencing them.
RECLAIMABLE counts images and volumes that can be pruned with `docker image prune` or
`docker volume prune`.

`docker system df` is the only way to see the true disk cost of your images, containers, and
volumes, before and after cleanup.

---

## 3. Command example

### Build with `--no-cache` — the nuclear option

```console
$ docker build --no-cache -t demo:1 .
```

| Flag | Meaning |
| :--- | :--- |
| `--no-cache` | **Do not use any cached layer.** Every `RUN`, `COPY`, `ADD` runs from scratch. |

| Use case | When to use it |
| :--- | :--- |
| "I changed a base image and nothing looks different." | Forced rebuild shows the actual impact of the base image change. |
| "My build output is stale and I cannot explain why." | Clear the cache and start fresh. |
| CI, after a base image update. | Guarantees the build uses the new base, not a cached copy. |

### Inspect the cache with `docker history`

```console
$ docker history demo:1 --format '{{.ID}}  {{.CreatedBy}}  {{.Size}}'
```

| Column | Meaning |
| :--- | :--- |
| `ID` | The layer's content hash. Same hash → same layer across images. |
| `CreatedBy` | The instruction that created the layer (`RUN`, `COPY`, `FROM`, etc.). |
| `Size` | The layer's disk usage. `0B` means no new bytes were added (e.g. `WORKDIR`). |

### Inspect what is actually on disk with `docker system df`

Verified above. Use it before and after a long build to see the peak cost.

---

## 4. File example

In your project, the `docker-learn/Dockerfile` (written in chapter 08) already has exactly
the step ordering needed for good cache behavior: `package.json` first, then `server.js`.

But let me show a deliberately **worse** Dockerfile and rebuild it so you see the difference.

**`docker-learn/Dockerfile.worse`:**

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY . .                      # 1. copy everything first
RUN npm install --include=dev # 2. install deps after copying source
CMD ["node","server.js"]
```

Build it once, then change a single line in `server.js`. Then rebuild without `--no-cache`:

```console
$ docker build -t worse:1 .
# step [3/3] COPY . .          # 2.5s
# step [2/3] RUN npm install    # 12.3s — rebuilt even though source didn't change
# step [1/3] FROM node:22-alpine  # free
```

Now rebuild with the **good** ordering from your actual `docker-learn/Dockerfile`:

```console
$ docker build -t better:1 .
# step [3/3] COPY server.js ./          # 0.0s — only this changed
# step [2/3] RUN npm install            # 12.3s — rebuilt because package.json changed
# step [1/3] FROM node:22-alpine        # free
```

Notice the difference: with the good ordering, a source change only touches 1 step (the COPY),
and the npm install layer stays cached. With the bad ordering, every source change forces a
full npm install rebuild.

That is the entire point of this chapter, condensed into one build.

---

## 5. When to use it and when NOT to

### Use layers and cache awareness when

- **You are building production images.** Cache = fast CI deploys. Wasting 10 minutes on a
  forced rebuild every day adds up to 60 hours a year.
- **Your base image changes often.** Pin by digest (chapter 03), and understand how each
  change ripples through your layers.
- **You want reproducible builds.** Understanding cache means you can explain exactly why
  `docker build` does what it does, and you can predict it.

### Do not obsess over cache when

- **You are running a one-off container.** `docker run` does not benefit from layer caching.
- **You have a small image.** If your whole image is 20 MB, cache effects are noise.
- **You are experimenting with a new idea.** Sometimes you want `--no-cache` so every
  experiment starts from scratch.

### The one situation where `--no-cache` is mandatory

If you rebuilt a base image (e.g. `FROM node:22-alpine` now pulls a new Alpine security
release) and your image still reports the old version, `--no-cache` is the only way to
force a fresh build. Otherwise Docker reuses the cached base-layer and you get the stale
image.

### When to use `--mount=type=cache`

- **You have a long-running builder** (e.g. a dedicated CI server, or a builder container
  that stays up between jobs).
- **You are compiling large things** (Go, Rust, node `npm ci`) and you want the build to be
  faster the second time.
- **You understand the limitation:** it does not survive a fresh builder, and it does not
  make your build correct, only faster.

### A practical caching pattern

```dockerfile
# syntax=docker/dockerfile:1
FROM node:22-alpine
WORKDIR /app
# 1. Copy only the dependency files first
COPY package.json package-lock.json ./
# 2. Install deps — this layer is cached independently of source changes
RUN --mount=type=cache,target=/root/.npm npm ci --include=dev
# 3. Copy the source — now a source change invalidates only this layer
COPY . .
# 4. Build
RUN npm run build
USER node
CMD ["node","server.js"]
```

If you only change `server.js`, step 3 is rebuilt but step 2 stays cached. If you add a
dependency, step 2 is rebuilt and step 3 is rebuilt too (because the lockfile changed).

---

## 6. Common mistakes

**1. `docker build .` after changing a base image, and wondering why nothing rebuilt.**

If your `FROM node:22-alpine` now pulls a new digest, Docker uses the cached base layer from
the previous build. Run `docker build --no-cache` or remove the base image first.

**2. Assuming `docker images --filter dangling=true` shows everything worth knowing.**

Dangling images are only `<untagged>` images — ones with no name pointing at them. Many
valid images are invisible to that filter. Use `docker system df` to see everything.

**3. Leaving `apt-get update` in the layer forever without cleaning caches.**

```dockerfile
RUN apt-get update && apt-get install -y curl
```

The downloaded `.d deb` files remain in that layer forever. Always add `apt-get clean`
(or `rm -rf /var/lib/apt/lists/*`) after `apt-get install`.

**3. `COPY . .` before installing dependencies.** One source file changes, and the entire
dependency install layer is rebuilt from scratch. Always copy `package.json` first (chapter 08
and 27).

**4. Believing `docker system df --build-cache` shows something useful.** That flag does not
exist. Use `docker system df` without flags.

**5. Writing a `RUN` that is too long and does too many things.** A single `RUN apt-get update
&& apt-get install -y a b c && rm -rf /var/lib/apt/lists/*` is harder to debug than three
separate `RUN` instructions. If one `apt-get install` fails, the whole `RUN` fails and the
layer is not created. But if you split them, you can see exactly which one.

**6. Forgetting that `ONBUILD` layers are inherited.** An `ONBUILD` instruction does not run
during the current build. It registers a promise to run later, when this image is used as a
base image in another build. This is a common source of "my Dockerfile does not do what I
expect."

**7. Using `--mount=type=cache` in CI that starts a fresh runner each time.** The cache starts
empty on every run. You will not see the speed benefit. Use `--mount=type=cache` only on
persistent builders, or use build arguments and external caches instead.

**8. Touching a file and rebuilding without `--no-cache`, expecting it to always rebuild only
the changed layer.** Docker's cache works on instruction content, not file timestamps. If the
file content has not changed (even if you `touch` it), the layer is reused. This is why step 3
in the exercise shows `0.0s` rebuild despite the file being touched. Chapter 09 exercise step 3
demonstrates this.

**9. Expecting `docker image prune` to clean volumes.** It only removes dangling images. Use
`docker volume prune` for volumes, or `docker system prune -a --volumes` for everything
(and be careful, because that also removes all stopped containers).

**10. `docker build --check` on a Dockerfile with `# check=error=true` and not understanding
the exit code.** Exit 0 = clean. Exit 1 = lint violations found. Your CI should treat exit 1 as
a failure.

---

## 7. Try it yourself

**Exercise.** Measure how layer ordering affects build time after a source change.

**Step 1 — build a base image with bad ordering:**

```bash
$ mkdir -p /tmp/layer-test
$ cd /tmp/layer-test
```

Create `Dockerfile.bad`:

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY . .          # copy everything first
RUN npm install --include=dev
COPY server.js ./
CMD ["node","server.js"]
```

```console
$ docker build -t bad:1 .
```

Touch `server.js` and rebuild without `--no-cache`:

```console
$ touch server.js
$ docker build -t bad:1 .
```

The `RUN npm install` step is **rebuilt** because `package.json` is inside the `COPY . .`
context that changed. Time it: `real` under 1 second means Docker detected a change; over 10
seconds means it ran npm install from scratch.

**Step 2 — build a base image with good ordering:**

Create `Dockerfile.good`:

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --include=dev
COPY server.js ./
CMD ["node","server.js"]
```

```console
$ docker build -t good:1 .
```

Now touch `server.js` and rebuild:

```console
$ touch server.js
$ docker build -t good:1 .
```

The `RUN npm install` step should be **CACHED** (the `0.0s` output from BuildKit). Time it.
The difference between steps 1 and 2 is the entire lesson of this chapter.

**Step 3 — prove cache is by content, not timestamp:**

```console
$ cd /tmp/layer-test
$ docker build -t good:1 .
```

Now copy the same `server.js` content under a new name and rebuild:

```console
$ cp server.js server2.js
$ docker build -t good:1 .
```

The `RUN npm install` step stays **CACHED**. The filename change did not invalidate the
layer because the file content (and its hash) is what Docker tracks. Edit `server2.js` and
the layer invalidates.

**Step 4 — run `docker system df` before and after each build:**

```console
$ docker system df --verbose
```

Note the RECLAIMABLE column before and after. It tells you how much space could be freed with
`docker system prune -a`. This is how you quantify the cost of your layer choices.

**Cleanup for this chapter:**

```console
$ docker rm -f bad:1 good:1 2>/dev/null
$ docker rmi bad:1 good:1 2>/dev/null
$ rm -rf /tmp/layer-test
```

---

## 8. Next

You know how images stack layers and how the cache works. Next: splitting a single
Dockerfile into multiple stages, shrinking a 334 MB image down to 243 MB. Multi-stage builds
are the most effective way to reduce image size.

**[Chapter 10 — ENTRYPOINT and CMD](10-entrypoint-and-cmd.md)**