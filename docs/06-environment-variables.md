# 06 — Environment Variables

> Verified on: Docker Engine **29.8.2**, Compose **v5.6.0**, BuildKit **v0.33.1**, Ubuntu 26.04.1 LTS, x86_64.

---

## 1. Simple explanation (like I'm 7)

Here is a box with a sticker on it.

The box is a program. The sticker says `APP_ENV = development`. The program reads the
sticker and behaves differently depending on what it says. When it says `production`, the
program gets serious.

You can have fifty copies of the **exact same box**, and stick a different label on each
one. One says `development`. One says `staging`. One says `production`. The boxes are
identical. The labels are different.

That is the whole idea, and it is why it matters: **the program does not change, only the
label does.** So you can build once, and then decide where it runs by changing the label.

Now the warning. The sticker is not hidden. Anyone who can look at your box can read the
sticker. So **never write a password on a sticker.** We will come back to this, twice,
because it is the most important security point in the chapter.

---

## 2. Real name

An **environment variable** is a key=value pair in a process's environment, inherited by
every child process. In a container it comes from three places:

1. **`ENV` in the Dockerfile** — baked into the image. Every container from that image gets
   it as a default.
2. **`docker run -e`** or `--env-file` — supplied when the container is created. **Overrides
   the image's value.**
3. **The image's base layers** — `node:22-alpine` sets `NODE_VERSION`, `YARN_VERSION`,
   `PATH`, and `HOME`.

Precedence, lowest to highest:

```
base image ENV  <  your Dockerfile ENV  <  -e / --env-file
```

Verify it on your machine. The image was built with `APP_ENV=production` baked in:

```console
$ docker inspect ch04-demo --format '{{range .Config.Env}}{{println .}}{{end}}'
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
NODE_VERSION=22.23.3
YARN_VERSION=1.22.22
APP_NAME=docker-learn
APP_ENV=production
PORT=3000
```

Now override it at runtime:

```console
$ docker inspect ch06-demo --format '{{range .Config.Env}}{{println .}}{{end}}'
APP_ENV=staging
GREETING=hello
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
NODE_VERSION=22.23.3
YARN_VERSION=1.22.22
APP_NAME=docker-learn
PORT=3000
```

`APP_ENV` is now `staging`. The image did not change — not a single byte of it. Only the
label moved. That is the whole chapter.

### `ENV` versus `ARG` — the distinction everyone gets wrong

| | `ENV` | `ARG` |
| :--- | :--- | :--- |
| Available at **build** time | yes | yes |
| Available at **runtime** | **yes** | **no** |
| Shows in `docker exec ... printenv` | yes | no |
| Shows in `docker history` | yes | yes |
| Default value in image | yes, baked in | no, unless declared |
| Purpose | runtime configuration | build-time configuration |

Measured proof that `ARG` is build-only. A Dockerfile with both:

```dockerfile
FROM node:22-alpine
ARG BUILD_MODE=development
ENV APP_MODE=$BUILD_MODE
RUN echo "BUILD_MODE=$BUILD_MODE" > /tmp/build_mode
CMD ["sh", "-c", "echo runtime; echo build_mode_file=$(cat /tmp/build_mode); echo APP_MODE=$APP_MODE"]
```

Built with `--build-arg BUILD_MODE=production`:

```console
$ docker run --rm ch06-test:1
runtime
build_mode_file=BUILD_MODE=production
APP_MODE=production

$ docker run --rm --entrypoint env ch06-test:1 | grep -E 'BUILD_MODE|APP_MODE'
APP_MODE=production
```

`BUILD_MODE` is **not in the runtime environment**. It is gone. But the value was written
into a file during the build, so it is still baked into the image layer. **`ARG` protects
the variable from being visible at runtime; it does not protect the value you used it for.**
Chapter 12 covers `RUN --mount=type=secret`, which is the tool that actually protects a
build-time secret.

---

## 3. Command example

### Set one with `-e`

```console
$ docker run -d --name ch06-demo -p 3012:3000 -e APP_ENV=staging -e GREETING=hello docker-learn:1.0.0
4d466f425cb9f242687bba78b49ebe6f1931c257976aab294997e6e1e53239c7

$ docker logs ch06-demo
[docker-learn] listening on http://0.0.0.0:3000 (env=staging)
```

| Part | Meaning |
| :--- | :--- |
| `-e APP_ENV=staging` | Set `APP_ENV` to `staging` inside the container |
| `-e GREETING=hello` | A second variable. `-e` can be repeated as often as you like. |

The log line proves the app read it. And the app did not change — same image, same bytes.

**`GREETING` is not used by the app.** It is set anyway, and it still shows up in the
environment. Docker does not validate that a variable means anything.

Two forms of `-e`:

```console
$ docker run -e APP_ENV=staging ...          # value is right there
$ docker run -e APP_ENV ...                 # copy from your own shell's environment
$ export APP_ENV=staging
$ docker run -e APP_ENV ...                 # picks it up
```

**The second form is the trap.** `docker run -e VAR` with no `=` silently copies your host's
value. If you forget to `export` it first, the variable is **unset in the container**, and
your app uses its built-in default. Nothing errors. You get a container running with the
wrong configuration and no message explaining why. Prefer `-e VAR=value` so the value is
visible in your shell history.

### See the environment from inside

```console
$ docker exec ch06-demo printenv
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
HOSTNAME=4d466f425cb9
NODE_VERSION=22.23.3
YARN_VERSION=1.22.22
APP_NAME=docker-learn
APP_ENV=staging
PORT=3000
HOME=/home/node
```

That is the whole environment. Note `HOSTNAME=4d466f425cb9` — the container's hostname is
the first 12 characters of its ID, which is a handy way to confirm which container answered
a request.

Our sample app exposes it over HTTP too, which is how you see it from a browser:

```console
$ curl -s http://localhost:3012/
{
  "name": "docker-learn",
  "env": "staging",
  "container": "4d466f425cb9",
  "pid": 1,
  "uptimeSeconds": 2
}
```

`"env": "staging"`. The label moved; the box did not.

**Now look at the `/env` route and understand why it is a liability:**

```console
$ curl -s http://localhost:3012/env
{
  "NODE_VERSION": "22.23.3",
  "HOSTNAME": "ef89d2dac976",
  "YARN_VERSION": "1.22.22",
  "SHLVL": "1",
  "PORT": "3000",
  "HOME": "/home/node",
  "APP_NAME": "docker-learn",
  "PATH": "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
  "APP_ENV": "production",
  "PWD": "/app"
}
```

**This endpoint is a teaching device, not a good idea.** It dumps every environment variable
to anyone who asks. If a real app did this with a database password in the environment, that
password is now on your website. Never expose an endpoint like this in production. It is here
so you can *see* the environment, and so chapter 19 can explain why that visibility is a
risk.

### `--env-file` for many variables

Typing twenty `-e` flags is awful. Use a file:

```console
$ cat /tmp/opencode/app.env
# A comment line -- ignored by Docker
APP_ENV=production
PORT=4000
APP_NAME="quoted-value"
EMPTY_VALUE=
```

```console
$ docker run -d --name ch06-envfile -p 3013:3000 --env-file /tmp/opencode/app.env docker-learn:1.0.0

$ docker logs ch06-envfile
[docker-learn] listening on http://0.0.0.0:3000 (env=production)

$ docker inspect ch06-envfile --format '{{range .Config.Env}}{{println .}}{{end}}'
APP_NAME="quoted-value"
EMPTY_VALUE=
APP_ENV=production
PORT=4000
```

File format rules, all verified above:

| Line | Result |
| :--- | :--- |
| `# comment` | Ignored. |
| `KEY=value` | Set to `value`. |
| `KEY=` | Set to the **empty string**. Distinct from being unset. |
| `KEY="quoted"` | Set to `"quoted"` — **the quotes are literal.** |

**That last row is a genuine trap.** Docker's `--env-file` does **not** strip quotes:

```console
$ docker run --rm --env-file /tmp/opencode/app.env --entrypoint sh ch06-test:1 -c 'echo "APP_NAME is: [$APP_NAME]"'
APP_NAME is: ["quoted-value"]
```

If your app compares `APP_NAME` against `docker-learn`, it fails, because the value has
literal quote characters in it. Write values bare. (Compose's `.env` interpolation *does*
handle quotes — chapter 33 shows the difference. Do not carry assumptions between them.)

### Precedence, tested

```console
$ docker run --rm --env-file /tmp/opencode/app.env -e APP_ENV=from-cli -e PORT=5000 --entrypoint env ch06-test:1 | grep -E 'APP_ENV|PORT'
APP_ENV=from-cli
PORT=5000
```

Both `-e` flags won over the file. `-e` beats `--env-file`, regardless of the order you
write them on the command line.

### Passing build-time variables

```console
$ docker build --build-arg BUILD_MODE=production -t ch06-test:1 /tmp/opencode/ch06
```

| Part | Meaning |
| :--- | :--- |
| `--build-arg NAME=value` | Set an `ARG` during the build |
| *(default)* | Without `NAME=value`, Docker copies from your shell environment if set |

```console
$ docker build -t ch06-test:2 /tmp/opencode/ch06     # no --build-arg
$ docker run --rm ch06-test:2
runtime
build_mode_file=BUILD_MODE=development
APP_MODE=development
```

The `ARG BUILD_MODE=development` default applied. That is how you get a default without
having to remember the flag.

**Never put a secret in `--build-arg`.** It lands in the image history permanently:

```console
$ docker history --no-trunc ch06-leak:1 --format '{{.CreatedBy}}' | grep -i secret
RUN /bin/sh -c echo "connecting with SuperSecret123" # buildkit
ENV DATABASE_PASSWORD=SuperSecret123
```

Two leaks from one bad Dockerfile: the `ENV` is in the history, **and** the `RUN` command
that mentions it is in the history. Anyone who pulls the image can read both with one
command. I deleted that image immediately. Chapter 12 shows the correct pattern
(`RUN --mount=type=secret`), which keeps the value out of the image entirely.

### No `-e`, and the variable still has a value

This trips people constantly:

```console
$ docker run --rm --entrypoint sh docker-learn:1.0.0 -c 'echo PORT is [$PORT]'
PORT is [3000]
```

No `-e` was passed. `PORT` is still `3000`, because `ENV PORT=3000` is in the image. **`-e`
overrides; it does not define.** If you want to know what a container is *actually*
configured with, ask the container, not the Dockerfile:

```console
$ docker exec myapp printenv
```

---

## 4. File example

Here is a Dockerfile that uses `ENV` correctly — for non-secret configuration only — plus a
`.env` file and the commands that consume them. This is the shape you should use for your
own app.

**`.env` — the values, kept out of the image and out of git:**

```bash
# /home/sunny/app/nimo/docker-doc/docker-learn/.env
#
# WARNING: this file must NEVER be committed to git.
# Add it to .gitignore AND to .dockerignore (see the next line below).
#
# The NEXT line is the important one.
#
# NOTE ON QUOTES: Docker's --env-file does NOT strip quotes.
# Write bare values. Write quoted values only in a Compose .env file.

# Which environment this container thinks it is in.
APP_ENV=development

# Port the app listens on INSIDE the container.
# Do not put the host port here -- that is set with -p at run time.
PORT=3000

# A non-secret label so you can tell containers apart at a glance.
APP_NAME=docker-learn
```

**The Dockerfile:**

```dockerfile
# Config baked into the image.
#
# Rules for this file:
#   1. ENV is for NON-SECRETS only. Config values that change per environment,
#      like a database URL, belong in --env-file at run time, not here.
#   2. Anything secret goes in --env-file, and even then, understand that
#      `docker inspect` shows it to anyone with Docker access. See chapter 19.
#   3. PORT is set here as a DEFAULT. An -e at run time overrides it.
#   4. Note the two-space indent: the value must be wrapped in quotes,
#      because PORT=3000 with no space is a DIRECTIVE, not an ENV.

FROM node:22-alpine

WORKDIR /app

# Copy only what is needed first, so this layer is cached independently
# of source changes. (Chapter 09 is entirely about why this ordering matters.)
COPY package.json ./
COPY server.js ./

# Non-secret defaults. These are what the container uses if nobody overrides them.
ENV APP_NAME=docker-learn \
    APP_ENV=production \
    PORT=3000

# Documentation only -- publishes nothing. Chapter 07.
EXPOSE 3000

# Run as a non-root user. Chapter 19.
USER node

# Exec (JSON) form. docker build --check on this machine warns about
# shell form with JSONArgsRecommended, so JSON form throughout this course.
CMD ["node", "server.js"]
```

**Run it three ways and watch the label change while the image stays identical.**

One thing to note first, because it will bite you: this app is a **server**, so
`docker run app-config-demo:1` without `-d` hangs your terminal forever. For a
long-running app the pattern is always `-d`, then `docker logs`, then remove:

```bash
# 1. Defaults from the image: APP_ENV=production
$ docker build -t app-config-demo:1 -f /home/sunny/app/nimo/docker-doc/docker-learn/Dockerfile /home/sunny/app/nimo/docker-doc/docker-learn
$ docker run -d --rm --name cfg-1 app-config-demo:1
$ docker logs cfg-1                      # => ... (env=production)

# 2. Override from the command line: APP_ENV=staging
$ docker run -d --rm --name cfg-2 -e APP_ENV=staging app-config-demo:1
$ docker logs cfg-2                      # => ... (env=staging)

# 3. Override from a file: APP_ENV=development, PORT=3000 (from .env)
$ docker run -d --rm --name cfg-3 --env-file /home/sunny/app/nimo/docker-doc/docker-learn/.env app-config-demo:1
$ docker logs cfg-3                      # => ... (env=development)
```

Three different configurations from one image, verified by reading the log line of each.
`docker run -d --rm` is the workhorse pattern for this whole course.

**And prove the image never changed:**

```bash
$ docker images app-config-demo:1
$ docker image inspect app-config-demo:1 --format 'Id: {{.Id}}'
```

One image ID across all three runs. Three configurations. That is why runtime
configuration beats baking values in.

Cleanup:

```bash
$ docker rmi app-config-demo:1
```

---

## 5. When to use it and when NOT to

### The decision, in one table

| Value | Where it belongs | Why |
| :--- | :--- | :--- |
| `PORT` | `ENV` default + `-e` override | Changes per deployment |
| `APP_ENV`, `LOG_LEVEL` | `ENV` default + `-e` override | Changes per environment |
| `DATABASE_URL` | `--env-file`, **not** baked in | Contains credentials |
| `API_TOKEN`, `SECRET_KEY` | Docker secrets or an external secret manager | **Visible in `docker inspect` and `docker logs`** |
| `NODE_VERSION` (base image tag) | `FROM node:22-alpine` | It is the image, not a variable |
| A build flag like `BUILD_MODE` | `ARG` | Build-time only, does not need to survive |
| A build-time secret | `RUN --mount=type=secret` | Chapter 12. Never `--build-arg`. |

### Use environment variables for

- **Per-environment config** so one image serves dev, staging and prod.
- **Values you know at run time but not at build time** — the hostname of the database, a
  feature flag, a port chosen at deploy.
- **Secrets, with eyes open.** A Docker secret mounted as an env var is better than a
  literal in an image, but still readable via `docker inspect`. Chapter 19 covers what
  "better" means and when it is not enough.

### Do not use environment variables for

- **True secrets, without accepting the caveat.** `docker inspect`, `docker logs`, and any
  process listing inside the container can read them. Chapter 19.
- **Build-time configuration that belongs in the image.** If it is fixed for a given
  build, put it in the Dockerfile. Rebuilding is correct, not wasteful.
- **A hundred variables.** At that point you want a config file in a volume, or a config
  service. Chapter 33.
- **Values with spaces or shell metacharacters without care.** In a `CMD` shell form, `$`,
  spaces and `;` are interpreted by the shell. Use exec form, or `$$` to escape. Chapter 10.

### `ENV` versus `ARG` — pick correctly

| Use `ENV` | Use `ARG` |
| :--- | :--- |
| The value is needed when the app runs | The value is only needed during the build |
| It is safe to bake into an image layer | It should not be visible to the running app |
| Node version flags, `NODE_ENV` | Build mode, git SHA, a private registry URL to log into |
| Defaults that `-e` will override | Values that only exist to drive a `RUN` step |

---

## 6. Common mistakes

**1. Baking a secret into `ENV`.** This is the big one:

```dockerfile
ENV DATABASE_PASSWORD=SuperSecret123     # NEVER
```

Verified above: `docker history --no-trunc` reveals it forever, and so does
`docker inspect`. Anyone who pulls the image gets it. Worse than a git leak, because
rewriting git history does not fix an image you already pushed.

**2. Putting a secret in a `RUN` command.** Also permanent, also in the history:

```dockerfile
RUN echo "connecting with $PASSWORD"    # NEVER -- the command text is stored
```

Same fix as above, using `RUN --mount=type=secret` from chapter 12.

**3. Using `--build-arg` for a secret.** Feels private because it is not in the final
environment. It is still in `docker history`:

```console
RUN |1 BUILD_MODE=production /bin/sh -c echo…
```

Build args are visible in the history regardless.

**4. Forgetting to `export`, so `-e VAR` silently passes nothing.** The container runs with
its default configuration and nothing tells you why. Always write `-e VAR=value`.

**5. Assuming `-e` defines a variable.** If the image sets `PORT=3000`, then `-e PORT`
without a value copies your shell's `PORT`, and if you have none, Docker does not set it and
the image's value applies. You get the default without knowing it. Check with
`docker exec myapp printenv`.

**6. Quotes in `--env-file` becoming part of the value.**

```console
$ docker run --rm --env-file app.env --entrypoint sh myapp -c 'echo "[$APP_NAME]"'
["quoted-value"]
```

Compose `.env` files behave differently here. Chapter 33. Do not assume one behaves like
the other.

**7. Committing `.env` to git.** Add it to `.gitignore`. And add it to `.dockerignore`
(chapter 11) — otherwise it is sent to the daemon on every build even if your Dockerfile
never copies it. A file in the build context is a file the daemon received.

**8. Exposing an endpoint that dumps the environment.** Our `/env` route is a teaching
device. In a real app this publishes every variable, including any secret, to the internet.
Delete the route after you have read this chapter.

**9. Confusing a build-time `ARG` with a runtime variable.** Verified above: `ARG` values
are simply absent from the runtime environment. If your app reads `process.env.BUILD_MODE`
at runtime and you set it with `ARG`, it is `undefined`.

**10. Expecting env vars to survive a restart of the container.** They do — they are part
of the container's config. They do **not** survive `docker rm`, because the container is
gone. If your configuration lives only in `-e` flags and you recreate the container without
them, you silently get the image defaults.

**11. Setting `NODE_ENV=production` and then running dev tools.** `npm install -g some-cli`
or a debugger behaves differently under `NODE_ENV=production`, and it fails confusingly.
Keep dev tooling out of production images entirely — chapter 13.

**12. A huge environment.** There is a limit on the total size of the environment block. If
you stuff megabytes of config into env vars, you can hit it, and the failure mode is a
process that will not start with an unhelpful error. Chapter 33 for the right pattern.

---

## 7. Try it yourself

**Exercise.** Prove that one image serves three environments, then see how dangerous
environment variables are.

**Step 1 — build once, run three ways:**

```console
$ cd /home/sunny/app/nimo/docker-doc/docker-learn
$ docker build -t exercise-env:1 -f /home/sunny/app/nimo/docker-doc/docker-learn/Dockerfile .
```

Now the three runs. Note `-d --rm`: the app is a server, so a foreground `docker run`
would hang your terminal forever, and `--rm` tidies up on exit.

```console
$ docker run -d --rm --name env-1 exercise-env:1
$ docker logs env-1
[docker-learn] listening on http://0.0.0.0:3000 (env=production)

$ docker run -d --rm --name env-2 -e APP_ENV=staging exercise-env:1
$ docker logs env-2
[docker-learn] listening on http://0.0.0.0:3000 (env=staging)

$ docker run -d --rm --name env-3 -e APP_ENV=production -e PORT=4000 exercise-env:1
$ docker logs env-3
[docker-learn] listening on http://0.0.0.0:4000 (env=production)
```

Notice run 3: `PORT=4000` changed the listening port **inside** the container. The log line
proves it. One image, three configurations.

**Step 2 — prove the image is byte-identical:**

```console
$ docker image inspect exercise-env:1 --format 'Id: {{.Id}}'
$ docker images exercise-env:1
```

**Hint.** Step 3 is the one that teaches the real lesson.

**Step 3 — see everything the container knows about itself:**

```console
$ docker run -d --name exercise-env-demo -p 3050:3000 -e APP_ENV=staging -e MY_SECRET=pretend-this-is-safe exercise-env:1
$ sleep 1
$ curl -s http://localhost:3050/env
```

Your `MY_SECRET` is right there in the output. Anyone who can reach that port sees it. Now
see who else can read it:

```console
$ docker exec exercise-env-demo printenv MY_SECRET
$ docker inspect exercise-env-demo --format '{{range .Config.Env}}{{println .}}{{end}}' | grep MY_SECRET
```

**Two completely different people can read that secret**: the user who can `docker exec`,
and anyone on the network who can reach port 3050. Now imagine `DATABASE_PASSWORD` instead of
`MY_SECRET`. This is exactly the problem chapter 19 is built on, and it is why "it is in an
environment variable" is not the same as "it is secret".

**Step 4 — watch a secret leak into an image, and then clean it up:**

```console
$ mkdir -p /tmp/opencode/ch06-leak
$ printf 'FROM node:22-alpine\nENV DB_PASSWORD=hunter2\nCMD ["sh"]\n' > /tmp/opencode/ch06-leak/Dockerfile
$ docker build -t exercise-leak:1 /tmp/opencode/ch06-leak
$ docker history --no-trunc exercise-leak:1 --format '{{.CreatedBy}}' | grep -i password
$ docker run --rm --entrypoint printenv exercise-leak:1 DB_PASSWORD
```

`hunter2` in two places. No amount of git history rewriting fixes this. Remove it:

```console
$ docker rmi exercise-leak:1
```

**Step 5 — check what your own app exposes.** The `/env` route in our sample app exists to
demonstrate this. In a real app, remove it. Also check whether a database URL with a
password is being read from the environment — that is normal — and then be aware that it is
readable by anyone with Docker access.

**Cleanup for this chapter:**

```console
$ docker rm -f exercise-env-demo
$ docker rmi exercise-env:1
$ rm -rf /tmp/opencode/ch06-leak
```

Note the difference between the two commands: `docker rm` removes containers,
`docker rmi` removes images, and `rm -rf` removes host directories. Three different tools,
three different things.

---

## 8. Next

You can configure a container from outside. Next: getting traffic into it — how ports are
published, how containers talk to each other, and why `EXPOSE` on its own does nothing.

**[Chapter 07 — Ports and Networking](07-ports-and-networking.md)**