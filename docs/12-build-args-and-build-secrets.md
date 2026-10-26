# 12 — Build args and build secrets

> Verified on: Docker Engine **29.8.2**, Compose **v5.6.0**, BuildKit **v0.33.1**, Ubuntu 26.04.1 LTS, x86_64.

---

## 1. Simple explanation (like I'm 7)

A **build argument** is like a variable you set when you start a recipe. It is only used while
you are cooking — once the dish is served, the variable is gone.

A **build secret** is the same, but it is something you do not want anyone to see. Even the
person eating the dish.

In Docker:

- `ARG` is a build argument. It is set with `--build-arg` during `docker build`. It can be
  read during the build, but it is **not** available inside the running container.
- `RUN --mount=type=secret` is a build secret. It is mounted into the build container for one
  `RUN` step only. The secret value is never baked into the image.

Think of it like this: a build argument is a note you write on the recipe card. A build secret
is a note you read once and then immediately shred so nobody else can see it.

---

## 2. Real name

### `ARG` — build-time variables

An `ARG` declares a variable that can be set at build time:

```dockerfile
FROM node:22-alpine
ARG BUILD_MODE=development
```

| Property | Value |
| :--- | :--- |
| **Set during build** | `--build-arg BUILD_MODE=production` |
| **Available at build time** | Yes — in `RUN`, `COPY`, `ENV` directives. |
| **Available at runtime** | **No.** Not in `docker exec ... printenv`, not in the container's environment. |
| **Default value** | Specified in the `ARG` instruction itself. |
| **Visible in `docker history`** | Yes — the `ARG` line appears in the build log, but the value is not stored in the final image. |

### How `ARG` interacts with `ENV`

```dockerfile
FROM node:22-alpine
ARG BUILD_MODE=development
ENV APP_MODE=$BUILD_MODE
```

| Outcome | Explanation |
| :--- | :--- |
| `BUILD_MODE` at build time | Set by `--build-arg`. Available in the `ENV` directive. |
| `APP_MODE` at runtime | Set to the value of `BUILD_MODE` at build time. **Baked into the image.** |
| `APP_MODE` visible at runtime | Yes — it is an `ENV`, so it persists. |
| `BUILD_MODE` visible at runtime | **No.** `ARG` is stripped after the build. |

### `--build-arg` on `docker build`

```console
$ docker build --build-arg BUILD_MODE=production -t demo:1 .
```

| Part | Meaning |
| :--- | :--- |
| `docker build` | Start a build. |
| `--build-arg NAME=value` | Set the `ARG` named `NAME` to `value` during the build. |
| *(without `NAME=value`)* | If `NAME` is already set in the Dockerfile (via `ARG NAME=default`), that default applies. If not set, Docker copies the value from your shell environment, if it is set. |

### The trap: `--build-arg` is not a runtime secret

Many beginners think `--build-arg` keeps a value secret. It does not.

```console
$ docker build --build-arg DB_PASSWORD=hunter2 -t secret-demo:1 .
$ docker run --rm secret-demo:1 printenv DB_PASSWORD
```

Output: **nothing** (DB_PASSWORD is not in the runtime environment). That much is correct.

But:

```console
$ docker history --no-trunc secret-demo:1 --format '{{.CreatedBy}}' | grep hunter2
RUN /bin/sh -c echo "connecting with $DB_PASSWORD" # buildkit
```

`DB_PASSWORD` appears in the build history, permanently. Anyone who pulls the image can read
the history and see it. **Never use `--build-arg` for secrets.** Use `RUN --mount=type=secret`
instead (covered below).

### `RUN --mount=type=secret` — the correct way to handle build secrets

```dockerfile
# syntax=docker/dockerfile:1
FROM alpine:3.24
RUN --mount=type=secret,id=DB_PASS,src=/run/secrets/db_pass \
    echo "DB password is $(cat /run/secrets/DB_PASS)" > /tmp/msg.txt
RUN cat /tmp/msg.txt
CMD ["cat", "/tmp/msg.txt"]
```

| Part | Meaning |
| :--- | :--- |
| `--mount=type=secret,id=DB_PASS` | Mount the secret with the given `id`. |
| `src=/run/secrets/DB_PASS` | On the host, the secret file lives at this path. It is passed via `docker build --secret`. |
| `echo "DB password is $(cat /run/secrets/DB_PASS)"` | Inside the `RUN` step, the secret is available as a file. |
| `cat /tmp/msg.txt` (final CMD) | The secret is in the output, but it is **not** in the image layers or the runtime environment. |

Build and run:

```console
$ printf 'MY_SECRET=hunter2' > /tmp/opencode/sec.txt
$ docker build --mount=type=secret,id=MY_SECRET,src=/tmp/opencode/sec.txt -t secret-build:1 .
$ docker run --rm secret-build:1
```

Output: `DB password is hunter2`. The secret was used during the build, but it is not in the
image.

### Why `--mount=type=secret` is safer than `--build-arg`

| Aspect | `--build-arg` | `--mount=type=secret` |
| :--- | :--- | :--- |
| Visible in `docker history` | Yes — the value appears in the command text. | No — the value is never stored. |
| Visible in image layers | No — but the command that used it may leave traces. | No — the mount is tmpfs and is discarded after the `RUN` step. |
| Visible at runtime | No — `ARG` is stripped after build. | No — the mount exists only during the `RUN` step. |
| Can be passed from host env | Yes — `docker build` copies from shell. | Yes — via `src` path on host. |

---

## 3. Command example

### Build arg default when not passed

```dockerfile
FROM node:22-alpine
ARG BUILD_MODE=development
ENV APP_MODE=$BUILD_MODE
```

```console
$ docker build -t demo:1 .          # no --build-arg
$ docker run --rm --entrypoint env demo:1 | grep APP_MODE
APP_MODE=development
```

```console
$ docker build --build-arg BUILD_MODE=production -t demo:2 .
$ docker run --rm --entrypoint env demo:2 | grep APP_MODE
APP_MODE=production
```

### `--build-arg` copies from shell environment

```console
$ export BUILD_MODE=env-value
$ docker build -t demo:3 .
$ docker run --rm --entrypoint env demo:3 | grep BUILD_MODE
BUILD_MODE=env-value
```

The `--build-arg` takes the value from your shell's environment if no `NAME=value` is given
on the command line.

### Build arg with `ENV` — the interaction

```dockerfile
FROM node:22-alpine
ARG BUILD_MODE=development
RUN echo "building with $BUILD_MODE"
ENV APP_ENV=$BUILD_MODE
```

```console
$ docker build --build-arg BUILD_MODE=production -t demo:3 .
$ docker run --rm --entrypoint env demo:3 | grep -E 'BUILD_MODE|APP_ENV'
APP_ENV=production
```

`BUILD_MODE` is used to set `APP_ENV`, which is then baked into the image as an `ENV`.

### Secret as file (default)

```dockerfile
# syntax=docker/dockerfile:1
FROM alpine:3.24
RUN --mount=type=secret,id=DB_PASS \
    echo "$(cat /run/secrets/DB_PASS)" > /tmp/secret.txt
RUN cat /tmp/secret.txt
```

Build:

```console
$ printf 'hunter2' > /tmp/opencode/sec.txt
$ docker build --mount=type=secret,id=DB_PASS,src=/tmp/opencode/sec.txt -t secret-build:1 .
$ docker run --rm secret-build:1
```

Output: `hunter2`. The secret was used during the build, but it is not in the image layers
or the runtime environment.

### Secret as environment variable

```dockerfile
# syntax=docker/dockerfile:1
FROM alpine:3.24
RUN --mount=type=secret,id=S,env=S \
    echo "as env var: $S"
```

Build:

```console
$ docker build --mount=type=secret,id=S,src=/tmp/opencode/sec.txt -t secret-env:1 .
$ docker run --rm secret-env:1
```

Output: `as env var: hunter2`. The secret is mounted as an environment variable inside the
`RUN` step only.

---

## 4. File example

Here is a Dockerfile that uses both `ARG` and `RUN --mount=type=secret` correctly:

```dockerfile
# syntax=docker/dockerfile:1
# Build-time configuration (non-secret).
ARG NODE_ENV=production
# Do not use `--build-arg` for real secrets. Use `RUN --mount=type=secret` instead.

FROM node:22-alpine
WORKDIR /app

# Use the build arg to set a default. It can be overridden at runtime with -e.
ENV NODE_ENV=$NODE_ENV

# Install dependencies first (good cache ordering from chapter 09).
COPY package.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --include=dev

# Copy source.
COPY . .

# Build-time secret: read a database password from the host and use it to generate
# a configuration file. The password never lands in the image.
RUN --mount=type=secret,id=DB_PASS,src=/tmp/opencode/db-pass.txt \
    echo "DB_HOST=db.example.com" > db.conf \
    echo "DB_USER=app_user" >> db.conf \
    echo "DB_PASSWORD=$(cat /run/secrets/DB_PASS)" >> db.conf

# The config file is copied into the runtime image, but the password is not.
COPY --from=build /app/db.conf /app/db.conf
USER node
CMD ["node","server.js"]
```

This pattern is advanced but real. The secret is used during the build to generate a config
file, and only the config file (without the password) is copied into the final image.

---

## 5. When to use it and when NOT to

### Use `ARG` when

- **You need a value during the build** that does not need to persist in the image. Example:
  `BUILD_MODE`, `GIT_SHA`, a private registry URL you need to `RUN apk add` from.
- **You want a default that can be overridden.** `ARG NAME=default` provides a default; callers
  can supply their own `--build-arg NAME=override`.
- **You are documenting what the build expects.** An `ARG` line at the top of the Dockerfile
  tells readers "this build needs these variables."

### Do not use `ARG` when

- **The value must be available at runtime.** Use `ENV` instead (chapter 06). `ARG` is stripped
  after the build.
- **The value is a secret.** Use `RUN --mount=type=secret` (covered below). `ARG` is visible
  in `docker history`.
- **The value is a version tag.** Use `FROM image:tag` or `FROM image@digest`. Do not pass it
  as an `ARG` just to avoid pinning the image.

### Use `RUN --mount=type=secret` when

- **You need a secret only during the build.** Example: a private package registry URL, a
  database password needed to generate a config file, a TLS key for signing.
- **You want the secret to disappear after the build.** The mount is tmpfs and is discarded
  after the `RUN` step completes.
- **You do not want the secret in `docker history`.** This is the single biggest advantage
  over `--build-arg`.

### Do not use `--build-arg` for secrets

Verified above: the value appears in `docker history --no-trunc`. Anyone who pulls the image
can read it. Use `RUN --mount=type=secret` instead.

### `--build-arg` can copy from your shell environment — be careful

```console
$ export MY_SECRET=hunter2
$ docker build -t demo:1 .          # no --build-arg MY_SECRET=...
```

If `demo:1` has `ARG MY_ENV`, the value `hunter2` from your shell is used. This is a
subtle way secrets leak in. Always pass `--build-arg NAME=value` explicitly, never rely on
the shell environment unless you are certain no secrets are involved.

---

## 6. Common mistakes

**1. Using `--build-arg` for a secret.**

```dockerfile
FROM node:22-alpine
ARG DB_PASSWORD=hunter2     # NEVER
ENV DATABASE_PASSWORD=$DB_PASSWORD
```

Verified: `docker history --no-trunc` reveals `hunter2` forever. Use `RUN --mount=type=secret`
instead.

**2. Assuming `ARG` is available at runtime.**

```console
$ docker run --rm --entrypoint env demo:1 | grep DB_PASSWORD
# nothing — DB_PASSWORD is not there
```

`ARG` is build-time only. If your app reads `process.env.DB_PASSWORD`, it is `undefined`.

**3. Forgetting that `--build-arg` copies from your shell.**

```console
$ export SECRET=hunter2
$ docker build -t demo:1 .          # no --build-arg SECRET=...
```

If the Dockerfile has `ARG SECRET`, the value from your shell is used. This is a subtle
leak path. Always pass `--build-arg SECRET=value` explicitly.

**4. Believing `docker history` does not show `ARG` values.**

```console
$ docker history --no-trunc demo:1 --format '{{.CreatedBy}}' | grep SECRET
RUN |1 SECRET=hunter2 /bin/sh -c echo...
```

The `ARG` value is in the command text, visible to anyone.

**5. Using `ARG` to pass a version you cannot pin in `FROM`.**

```dockerfile
ARG NODE_VERSION
FROM node:$NODE_VERSION     # if $NODE_VERSION is not set, this fails or pulls 'node:latest'
```

Always pin your base image. Use `FROM node:22-alpine` directly, or use a build arg only
to override a already-pinned image: `FROM node:22-alpine` and `ARG NODE_VERSION` for
documentation.

**6. `ARG` and `ENV` with the same name, expecting `ARG` to win at runtime.**

```dockerfile
FROM node:22-alpine
ARG NODE_ENV=production
ENV NODE_ENV=$NODE_ENV
```

At runtime, `NODE_ENV` is whatever `ENV` was set to during the build. If you want to override
at runtime, use `-e NODE_ENV=development` at `docker run` time — the `ENV` in the image is
the default, and `-e` overrides it.

**7. Using `RUN --mount=type=secret` without `src`.**

```dockerfile
RUN --mount=type=secret,id=S
```

Docker requires `src` to point to the host file path. Without it, the build fails.

**8. Thinking `--mount=type=secret` persists across builds.**

The secret mount is stored in tmpfs on the builder. If you restart the builder or run a new
job, the cache is empty. Use a persistent builder or an external secrets manager for
long-term secret management.

**9. `COPY --from=build` copying a file that was generated with a secret.**

```dockerfile
RUN --mount=type=secret,id=S \
    echo "password: $(cat /run/secrets/S)" > cfg.txt
COPY --from=build /app/cfg.txt /app/cfg.txt
```

The file `cfg.txt` is copied, but it no longer contains the secret (the `RUN` step already
discarded it). If you re-read the file in a later step, you will see an empty or stale value.

---

## 7. Try it yourself

**Exercise.** Use `ARG` for a non-secret build parameter, and `RUN --mount=type=secret` for a
real secret. Verify that the secret is not in the image or at runtime.

**Step 1 — ARG for a non-secret:**

```dockerfile
FROM node:22-alpine
ARG BUILD_NUM=1
RUN echo "build number: $BUILD_NUM"
CMD ["node","-e","process.stdout.write(process.env.BUILD_NUM||'unset')"]
```

```console
$ docker build -t arg-demo:1 .
$ docker run --rm arg-demo:1
```

Output: `build number: 1` then `unset` (BUILD_NUM is not in the runtime environment).

**Step 2 — secret as a file:**

```dockerfile
FROM alpine:3.24
RUN --mount=type=secret,id=MYSEC,src=/tmp/opencode/sec.txt \
    cat /run/secrets/MYSEC > /tmp-out.txt
RUN cat /tmp-out.txt
CMD ["cat","/tmp-out.txt"]
```

Build and run:

```console
$ printf 'hunter2' > /tmp/opencode/sec2.txt
$ docker build --mount=type=secret,id=MYSEC,src=/tmp/opencode/sec2.txt -t secret-demo:1 .
$ docker run --rm secret-demo:1
```

Output: `hunter2`. The secret was used, but if you run `docker run --rm --entrypoint env secret-demo:1`
you will see that the secret is **not** in the environment.

**Step 3 — verify the secret is not in the image history:**

```console
$ docker history --no-trunc secret-demo:1 --format '{{.CreatedBy}}' | grep -i hunter2 || echo "not found in history (correct)"
```

Output: `not found in history (correct)`.

**Step 4 — clean up:**

```console
$ docker rmi arg-demo:1 secret-demo:1 2>/dev/null
$ rm -f /tmp/opencode/sec2.txt
```

---

## 8. Next

You can pass values into the build and keep secrets out of the image. Next: splitting a
single Dockerfile into multiple stages, shrinking a 334 MB image down to 243 MB. This is the
single most effective technique for reducing image size, and it is the standard pattern for
production Dockerfiles.

**[Chapter 13 — Multi-Stage Builds](13-multi-stage-builds.md)**