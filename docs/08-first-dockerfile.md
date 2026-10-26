# 08 — Your First Dockerfile

> Verified on: Docker Engine **29.8.2**, Compose **v5.6.0**, BuildKit **v0.33.1**, Ubuntu 26.04.1 LTS, x86_64.

---

## 1. Simple explanation (like I'm 7)

You know how to make a lunchbox and give it to a friend. But making the same lunchbox
every single day, for every friend, is tiring.

So you write down the **recipe**. Step one, get bread. Step two, put in cheese. Step three,
fold it. Now anyone can make that exact lunchbox by following your recipe.

A **Dockerfile** is that recipe. It is a text file with numbered steps, and Docker follows
them in order to build your image.

One important thing: the steps are not instructions to you. They are instructions to Docker.
And **each step is permanent.** You cannot go back and change step 2 after step 5 — like
stacking books. If you change a step in the middle, everything above it has to be redone.

That is why the *order* of steps matters so much, and chapter 09 is all about why.

---

## 2. Real name

A **Dockerfile** is a text file containing build instructions. Docker reads it top to bottom
and produces an image.

The full instruction set, from the official Dockerfile reference:

| Instruction | Purpose |
| :--- | :--- |
| `FROM` | Start a new stage from a base image. **Required, and must be first** (except global `ARG`s and parser directives). |
| `RUN` | Execute a command and commit the result as a new layer. **Runs at build time.** |
| `COPY` | Copy files from the build context into the image. Creates a layer. |
| `ADD` | Like `COPY`, plus URL extraction and auto-extraction. Prefer `COPY`. |
| `ENV` | Set environment variables. Available at build time **and** at runtime. |
| `ARG` | Build-time only variables. **Not** available at runtime. Chapter 06. |
| `WORKDIR` | Set the working directory for later instructions. Creates it if needed. |
| `CMD` | The default command. Runs at **container start**, not build time. |
| `ENTRYPOINT` | The executable to run. Runs at **container start**. |
| `EXPOSE` | Documentation of intended ports. **Publishes nothing.** Chapter 07. |
| `USER` | Run subsequent instructions (and the container) as this user. |
| `VOLUME` | Declare a mount point. Chapter 07. |
| `LABEL` | Metadata key=value pairs. |
| `HEALTHCHECK` | How Docker decides whether the container is healthy. Chapter 14. |
| `STOPSIGNAL` | Which signal `docker stop` sends. Chapter 10. |
| `SHELL` | Override the shell used by `RUN`, `CMD`, `ENTRYPOINT`. |
| `ONBUILD` | Instructions to run when this image is used as a base image. Rarely needed. |

### Two rules people always get wrong

**`RUN` runs now. `CMD` runs later.**

`RUN` executes during the build, on this machine, and its changes are saved into the image.
`CMD` does nothing at build time — it just records what should be run when a container starts.

```dockerfile
RUN echo hello > /greeting     # runs NOW, /greeting is in the image
CMD echo hello                 # runs LATER, when the container starts
```

**Every `RUN`, `COPY` and `ADD` creates a layer.** Layers are immutable, stacked, and shared
between images. Chapter 09 is entirely about this.

### The build context

`docker build .` sends the **current directory** to the daemon. That directory and everything
in it is the **build context** — the set of files `COPY` is allowed to reach.

This is why `docker build .` from your home directory is a terrible idea, and why
`.dockerignore` exists. Chapter 11 covers it properly, but the rule to hold onto now is:
**run `docker build` from the directory holding your Dockerfile.**

---

## 3. Command example

### The build command, piece by piece

```console
$ cd /home/sunny/app/nimo/docker-doc/docker-learn
$ docker build -t docker-learn:1.0.0 .
```

| Part | Meaning |
| :--- | :--- |
| `docker build` | Build an image from a Dockerfile |
| `-t docker-learn:1.0.0` | **Tag.** Name and version. Without `-t` you get an `<untagged>` dangling image — chapter 03. |
| `.` | **The build context.** This directory and its contents are sent to the daemon. `COPY` can only reach files inside here. |

Real output from your machine:

```console
$ docker build -t docker-learn:1.0.0 .
#1 [internal] load build definition from Dockerfile
#1 transferring dockerfile: 2B done
#1 DONE 0.0s

#2 [internal] load metadata for docker.io/library/node:22-alpine
#2 DONE 1.3s

#3 [internal] load .dockerignore
#3 transferring context: 246B done
#3 DONE 0.0s

#4 [internal] load build context
#4 transferring context: 265B done
#4 DONE 0.0s

#5 [1/4] FROM docker.io/library/node:22-alpine@sha256:0a7108bf6c7b...
#5 DONE 0.0s

#6 [2/4] WORKDIR /app
#6 DONE 0.0s

#7 [3/4] COPY server.js ./
#7 DONE 0.0s

#8 [4/4] COPY server.js ./   (etc.)
#8 exporting to image
#9 exporting layers 0.1s done
...
#9 naming to docker.io/library/docker-learn:1.0.0 done
Successfully built ...
```

Read the left column. **`#8 [4/4]` is the step counter: this is the 4th of 4 real steps.**
Steps 1-4 marked `[internal]` are BuildKit's own bookkeeping — loading the Dockerfile, the
metadata, your `.dockerignore`, and the build context. They are not your instructions.

Notice `FROM docker.io/library/node:22-alpine@sha256:0a7108bf...`. BuildKit resolved your
`node:22-alpine` to the **exact digest** and shows it. That is the pin from chapter 03 doing
its job: the digest you see here is what you will get, today and on every rebuild.

### `--progress=plain` — the flag to add to every build

By default BuildKit draws a live-updating UI that clears itself. In a terminal that is nice.
When you want to read what happened — in CI, in a log file, or when something failed —
`--progress=plain` gives you every line and keeps them:

```console
$ docker build --progress=plain -t docker-learn:1.0.0 .
```

You will use this constantly from now on.

### Lint your Dockerfile before building

Docker Engine 29.8.2 ships **build checks**. This is not a toy feature — it catches real
bugs. Run it as a separate step:

```console
$ docker build --check .
Check complete, 1 warning has been found!

WARNING: JSONArgsRecommended - https://docs.docker.com/go/dockerfile/rule/json-args-recommended/
JSON arguments recommended for CMD to prevent unintended behavior related to OS signals
Dockerfile:2
--------------------
   1 |     FROM node:22-alpine
   2 | >>> CMD echo hi
   3 |
```

That is a genuine warning about shell-form `CMD`. Chapter 10 explains precisely what goes
wrong. Your `docker-learn/Dockerfile` already uses JSON form, so it produces no warnings.

Turn warnings into build failures with the `# check=error=true` parser directive:

```dockerfile
# syntax=docker/dockerfile:1
# check=error=true
FROM node:22-alpine
CMD echo hi
```

```console
$ docker build --check .
ERROR: lint violation found for rules: JSONArgsRecommended
$ echo $?
1
```

Verified: exit code **1**. Without the directive, warnings do not fail the build. **Put
`# check=error=true` in a real project** so a bad Dockerfile fails CI instead of shipping.

### Build and run, the whole loop

```console
$ docker build -t docker-learn:1.0.0 .
$ docker run -d --name dl -p 3000:3000 --init docker-learn:1.0.0
$ curl -s http://localhost:3000/
{
  "name": "docker-learn",
  "env": "production",
  "container": "0239d5010e7a",
  "pid": 1,
  "uptimeSeconds": 8
}
$ docker rm -f dl
```

That four-command loop is the entire development cycle. Most changes mean rebuild + restart.

### Other flags you will need

| Flag | Meaning |
| :--- | :--- |
| `-f`, `--file` | Use a different Dockerfile, e.g. `-f Dockerfile.dev`. |
| `-t` | Tag. **Always use it.** |
| `--no-cache` | Ignore all cached layers. Slow, but the answer to "why is my change not taking effect". |
| `--build-arg NAME=value` | Set an `ARG` during the build. Chapter 06. |
| `--target <stage>` | Stop at a named build stage. Multi-stage, chapter 13. |
| `--label k=v` | Add image metadata. |
| `--progress plain` | Non-animated, complete output. |
| `--check` | Lint only, do not build. |
| `--platform` | Build for another CPU architecture. Chapter 25. |
| `--sbom=true --provenance=true` | Attach an SBOM and build provenance. Chapter 20. |

---

## 4. File example

This is the actual `docker-learn/Dockerfile` in your project. Every line is annotated.

```dockerfile
# The image used in chapters 01-07.
# This is the "final" Dockerfile for the course: a single-stage build that
# runs as non-root. Chapter 13 makes it multi-stage, and chapter 14 adds a
# HEALTHCHECK.

# ---------------------------------------------------------------------------
# FROM -- the base image. MUST be the first real instruction.
# ---------------------------------------------------------------------------
# Base image. Pinned to a specific version, never `latest`.
# `alpine` is a minimal Linux. `22` is the Node major version.
FROM node:22-alpine

# ---------------------------------------------------------------------------
# WORKDIR -- the directory later instructions run in.
# ---------------------------------------------------------------------------
# Set the working directory for all later instructions. Docker creates it if
# it does not exist.
WORKDIR /app

# ---------------------------------------------------------------------------
# COPY -- copy from the build context.
# ---------------------------------------------------------------------------
# Copy package.json BEFORE the source files.
# This ordering is not a style choice: it makes this layer reusable when only
# server.js changes. Chapter 09 explains the caching behaviour in full.
COPY package.json ./

# Copy the application source.
COPY server.js ./

# ---------------------------------------------------------------------------
# ENV -- non-secret configuration, baked in as defaults.
# ---------------------------------------------------------------------------
# Non-secret configuration defaults. These are baked into the image and can be
# overridden at run time with -e or --env-file.
# Note the backslash line-continuation and the mandatory quotes around 3000 --
# without them, "PORT=3000" would be parsed as a build directive, not a value.
ENV APP_NAME=docker-learn \
    APP_ENV=production \
    PORT=3000

# ---------------------------------------------------------------------------
# EXPOSE -- documentation only.
# ---------------------------------------------------------------------------
# Documentation only. EXPOSE does NOT publish the port. You still need
# docker run -p or compose ports. Chapter 07 proves this.
EXPOSE 3000

# ---------------------------------------------------------------------------
# USER -- run as non-root.
# ---------------------------------------------------------------------------
# Run as a non-root user.
# The node:22-alpine image already contains a `node` user (uid 1000), so this
# needs no extra setup. Everything from here on runs as uid 1000, not root.
# Chapter 19 covers why this matters.
USER node

# ---------------------------------------------------------------------------
# CMD -- what to run when a container starts. EXEC (JSON) FORM.
# ---------------------------------------------------------------------------
# The default command, in EXEC (JSON) form.
# Exec form is the correct choice here. `docker build --check` on Docker Engine
# 29.8.2 emits a JSONArgsRecommended warning for shell form, because shell form
# makes the shell PID 1 and breaks signal handling. Chapter 10 is entirely
# about this.
CMD ["node", "server.js"]
```

### Why each line is there

| Line | If you deleted it |
| :--- | :--- |
| `FROM node:22-alpine` | Nothing. A Dockerfile must start with `FROM`. |
| `WORKDIR /app` | `COPY package.json ./` would scatter files in `/`, and `node server.js` would fail because the file is not there. |
| `COPY package.json ./` | `npm install` in a later layer has nothing to read. Chapter 27. |
| `COPY server.js ./` | No application. The container starts and immediately exits. |
| `ENV ...` | `process.env.APP_ENV` is `undefined` and your app uses its fallback default. Chapter 06. |
| `EXPOSE 3000` | Nothing breaks. It is a comment. It documents intent for humans and tooling. |
| `USER node` | **Everything runs as root.** A compromise of the container becomes a compromise of the host. Chapter 19. |
| `CMD [...]` | The image has no default command. Every `docker run` needs an explicit command appended. |

That last row is worth pausing on: the `CMD` line is the difference between
`docker run myimage` working and `docker run myimage node server.js` being necessary. It is
documentation *and* behaviour.

---

## 5. When to use it and when NOT to

### Use a Dockerfile when

- **Anyone else needs to run your app.** The Dockerfile is the reproducible recipe.
- **You need CI to build the same thing you run locally.** Same file, same result.
- **You are shipping an image to a registry.** There is no other way to build one.
- **You want a documented, reviewable build.** A Dockerfile is a text file in git. You can
  read the diff and see exactly what changed.

### Do not use a Dockerfile when

- **You are running a one-off container.** `docker run node:22-alpine node -e '...'` needs no
  image build at all.
- **The image already exists.** Pulling `postgres:17-alpine` is faster and more reliable than
  writing a Dockerfile that copies `postgres` onto `alpine`.
- **You only need a config change.** `docker run -e FOO=bar existing-image` — no rebuild
  needed. This is the payoff of chapter 06.
- **The tool is available as an official image.** Check Docker Hub before writing a
  Dockerfile. Official images are maintained upstream; yours is maintained by you, forever.

### Build context discipline

**Always `docker build` from the directory containing the Dockerfile.** This is not
pedantry:

```console
$ cd /home/sunny            # WRONG. Context becomes your entire home directory.
$ docker build -t myapp ~/projects/myapp
```

The first sends everything under `/home`; the second sends only the project. `.dockerignore`
helps but is a band-aid. Chapter 11.

### `ADD` versus `COPY`

Prefer `COPY`. Always, unless you specifically need one of `ADD`'s extras:

| | `COPY` | `ADD` |
| :--- | :--- | :--- |
| Local files | yes | yes |
| Remote URL | **no** | yes (fetches it) |
| Auto-extracts `.tar.gz` | no | yes |
| Predictable | yes | fewer surprises |
| Use it for | 95% of cases | archives you want unpacked |

A build that fetches a URL with `ADD` is a build that can break when that URL changes, with
no diff in your repository. Avoid it.

---

## 6. Common mistakes

**1. Using shell form for `CMD` or `ENTRYPOINT`.**

```dockerfile
CMD node server.js              # shell form -- WRONG
CMD ["node", "server.js"]       # exec form -- RIGHT
```

Shell form makes `/bin/sh` PID 1. Signals do not reach your app; `docker stop` waits out the
full 10-second timeout. Chapter 10 is entirely about this, and `docker build --check` on
your machine warns about it.

**2. Forgetting `-t`.**

```console
$ docker build .
$ docker images --filter dangling=true
<untagged>   4fd64af75835    238MB
```

Chapter 03. You now have a 238 MB mystery image.

**3. Building from the wrong directory.** `docker build -t x /home/sunny` sends your whole
home directory to the daemon. `COPY` then fails confusingly, or succeeds and copies your
SSH keys into an image. Chapter 11.

**4. Assuming `CMD` runs at build time.** It does not. `RUN` does. Confusing these is why
people write `RUN node server.js` (which hangs the build forever) instead of `CMD`.

**5. `ENV PORT=3000` without quotes in a multi-value form.** This is not a syntax error, it is
worse:

```dockerfile
ENV PORT=3000 APP_ENV=production
```

Without quotes, `PORT=3000` can be parsed as a **build directive** rather than a value. The
official docs give the same warning. Always quote or line-continuate:

```dockerfile
ENV APP_NAME=docker-learn \
    APP_ENV=production \
    PORT=3000
```

**6. No `USER` line, so everything runs as root.** Verified on your machine: without it,
`docker exec <name> whoami` returns `root`. With it, `node`. Chapter 19.

**7. `COPY . .` before `npm install`.** This copies the host's `node_modules` — possibly built
against a different libc — into the image, and it invalidates the dependency layer on every
source edit. Chapter 13.

**8. Adding `EXPOSE` and thinking you are done.** It publishes nothing. Verified in chapter 07.

**9. Leaving `RUN apt-get update` in a layer without `apt-get clean`.** The downloaded `.deb`
files stay in the layer forever. Chapter 13 shows the multi-stage fix.

**10. Writing secrets into the Dockerfile.** `ENV PASSWORD=hunter2` is permanently visible in
`docker history`. Verified in chapter 06. Chapter 12 has the correct pattern.

**11. Depending on a mutable base image.** `FROM node:22-alpine` is fine. `FROM node` or
`FROM node:latest` will break a future build with no change to your code.

**12. Copying the whole app before installing dependencies.** One-line change, enormous
build-time effect. Chapter 09.

**13. `docker build` succeeding but `docker run` exiting 127.** The command is not found:
wrong `WORKDIR`, missing files, or `node_modules` not installed. Chapter 23 has the triage.

---

## 7. Try it yourself

**Exercise.** Write a Dockerfile from scratch, watch the step counter, then break it on
purpose and read the error.

**Step 1 — write one in a scratch directory:**

```bash
$ mkdir -p /tmp/exercise-build
$ cd /tmp/exercise-build
```

Create `Dockerfile`:

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY server.js ./
EXPOSE 3000
USER node
CMD ["node", "server.js"]
```

And copy in the app:

```bash
$ cp /home/sunny/app/nimo/docker-doc/docker-learn/server.js .
```

**Step 2 — build with plain output and count the steps:**

```console
$ docker build --progress=plain -t exercise:1 .
```

Expect `#N [1/3]`, `[2/3]`, `[3/3]` — three real steps (WORKDIR, COPY, and the
metadata-only ones). Count them. The `[internal]` steps are BuildKit's, not yours.

**Step 3 — prove the metadata-only lines are free:**

```console
$ docker history exercise:1 --format '{{.Size}}\t{{.CreatedBy}}'
```

`WORKDIR`, `EXPOSE`, `USER` and `CMD` all show **`0B`**. They record configuration in the
image's JSON; they add no files. Only `COPY` adds bytes. That is chapter 09 in one command.

**Hint.** Step 4 is the useful part.

**Step 4 — lint it, then deliberately break it:**

```console
$ docker build --check .
Check complete, 0 warnings have been found!
```

Now change `CMD ["node", "server.js"]` to `CMD node server.js` and re-run:

```console
$ docker build --check .
WARNING: JSONArgsRecommended ...
```

You have now seen the tooling catch the exact mistake from mistake #1. Keep `--check` in
your build loop; it is free.

**Step 5 — run it and confirm PID 1 is your app:**

```console
$ docker run -d --name exercise-app -p 3090:3000 exercise:1
$ curl -s http://localhost:3090/ | head -3
$ docker exec exercise-app cat /proc/1/comm
```

`node`, not `sh`. Exec form doing its job.

**Step 6 — break it on purpose and read the failure:**

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY does-not-exist.js ./
CMD ["node", "server.js"]
```

```console
$ docker build -t broken:1 .
ERROR: failed to compute cache key: failed to calculate checksum of ref ...: "/app/does-not-exist.js": not found
```

`COPY` can only reach files **inside the build context**. That is the rule, made concrete.

**Cleanup for this chapter:**

```console
$ docker rm -f exercise-app
$ docker rmi exercise:1 broken:1
$ rm -rf /tmp/exercise-build
```

`broken:1` may not exist — the build failed — in which case `docker rmi` prints an error.
That is harmless.

---

## 8. Next

You can write a Dockerfile. Now: why reordering six lines can take your build from two
minutes to two seconds. How layers work, what invalidates the cache, and what does not.

**[Chapter 09 — Layers and Build Cache](09-layers-and-build-cache.md)**