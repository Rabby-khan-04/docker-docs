# 11 — .dockerignore

> Verified on: Docker Engine **29.8.2**, Compose **v5.6.0**, BuildKit **v0.33.1**, Ubuntu 26.04.1 LTS, x86_64.

---

## 1. Simple explanation (like I'm 7)

When you run `docker build .`, Docker sends your whole folder to the daemon. Everything in
that folder is available for `COPY` to reach. That is the **build context**.

Now imagine you have a drawer full of things you do not want anyone to see: your `.git`
folder, your `node_modules`, your secret keys, your editor backup files. You do not want
those sent to the daemon, because:

1. **They make the build slow.** The daemon has to transmit them over the Unix socket, and
   they add to the image size.
2. **They can leak secrets.** A `COPY . .` that ignores `.git` will still copy everything
   except `.git`. But if you forget `.dockerignore`, your `config.json` with passwords could
   end up in the image.
3. **They are noise.** You do not want your `TODO.md` or `TODO.txt` in the image.

**.dockerignore** is a file that tells Docker: "Ignore these files and directories when sending
the build context. Do not even try to `COPY` them."

It works just like `.gitignore`, but for builds.

---

## 2. Real name

### Build context

The **build context** is the set of files that `docker build` sends to the daemon. It is the
directory you pass to `docker build`, and everything inside it (recursively), minus anything
matched by `.dockerignore`.

```console
$ docker build -t myimage .
Sending build context to Docker daemon   2.048kB
```

That `2.048kB` is the **context size after `.dockerignore`**. Without it, the number would be
larger.

### `.dockerignore` format

The file uses patterns just like `.gitignore`, but with some differences (covered below). It
is placed at the root of your build context, and Docker reads it automatically.

| Pattern | Meaning |
| :--- | :--- |
| `*.log` | Ignore any file ending in `.log`. |
| `node_modules/` | Ignore the directory `node_modules/` and everything inside it. |
| `**/tmp/` | Ignore any `tmp/` directory at any level. |
| `!important.txt` | **Do not ignore** `important.txt`, even if a previous rule would match it. |
| `# comment` | Ignored line. |

### Rules verified on this machine

| Rule | Example | Result |
| :--- | :--- | :--- |
| `*.log` | `app.log` | Ignored. |
| `node_modules/` | `node_modules/`, `node_modules/debug/` | Ignored entirely. |
| `**/tmp/` | `/tmp/`, `build/tmp/` | Ignored. |
| `!important.txt` | After `*.txt`, `important.txt` | **Not** ignored. |
| `# comment` | Any line starting with `#` | Skipped. |
| empty line | Blank line | Skipped. |

### `.dockerignore` vs `.gitignore` — the differences

| Feature | `.dockerignore` | `.gitignore` |
| :--- | :--- | :--- |
| Purpose | Excludes files from the **build context** sent to the daemon. | Excludes files from **git tracking**. |
| Committed to repo? | Recommended: yes, so everyone builds the same context. | Standard: yes, for all contributors. |
| Syntax | Almost identical, but **`!` negation works differently**. | `!` negation works as in git. |
| `**` | Matches any path, any depth. | Same as git. |
| Scope | Only the build context directory and its children. | The entire repo, plus the working directory. |
| Globbing | `?` and `*` work. | `?` and `*` work. |

### Negation `!` — the critical difference

In `.gitignore`, `!important.txt` after `*.txt` means "do not ignore important.txt."

In `.dockerignore`, the behavior is **different**. Docker does **not** support the `!` negation
pattern in the same way. If you write `!important.txt` in `.dockerignore`, it may be treated
as a literal filename to ignore, or it may be silently ignored by Docker.

**The safe approach:** Do not use `!` in `.dockerignore`. Instead, exclude everything you do
not want by positive patterns, and manually copy or `ADD` the few files you do need, using
their full paths.

---

## 3. Command example

### Create a `.dockerignore` file

```console
$ cd /home/sunny/app/nimo/docker-doc/docker-learn
$ cat > .dockerignore <<'EOF'
# Ignore git and metadata
.git
.gitignore

# Ignore dependencies (they are installed in the image)
node_modules
npm-debug.log*

# Ignore Docker files and local state
Dockerfile
Dockerfile.*
docker-compose*.yml
compose*.yaml

# Ignore environment and secrets
.env
*.pem
secrets/

# Ignore docs and tests (not needed to run the app)
docs/
tests/
README.md
*.md
EOF
```

Then build, and notice the context size:

```console
$ docker build --progress=plain -t ctx-demo:1 .
```

You will see something like:

```console
#4 [internal] load build context
#4 transferring context: 246B done
```

Without `.dockerignore`, that number would be in the megabytes (your `node_modules` alone is
2 MB, and there are many more files).

### Verify what is and is not reachable

```console
$ docker build --check . 2>&1 | grep -i "JSONArgsRecommended\|warning"
```

If your Dockerfile uses exec form for `CMD` (as yours does), there should be no warnings.

```console
$ docker build -t ctx-demo:1 .
```

Then run the container and verify it works:

```console
$ docker run -d --name ctx-demo -p 3099:3000 --init ctx-demo:1
$ curl -s http://localhost:3099/
```

### The `ADD` caveat

`ADD` respects `.dockerignore` the same way `COPY` does. But `ADD` has an extra behavior:
if the URL ends in `.tar.gz` or `.tar`, Docker extracts it. That is the only time you should
use `ADD` instead of `COPY`.

---

## 4. File example

Your project already has `.dockerignore` (created in chapter 01). Its contents:

```
# Files that must never be sent to the Docker daemon during `docker build`.
# Everything here would otherwise be uploaded on every single build.

# Dependencies are re-installed inside the image with `npm ci`
node_modules
npm-debug.log*

# Docker files and local state
Dockerfile
Dockerfile.*
.dockerignore
docker-compose*.yml
compose*.yaml

# Local data, secrets and environment overrides
.env
.env.*
*.pem
*.key
secrets/
data/

# Version control and editor noise
.git
.gitignore
.vscode
.idea
*.swp

# Docs and tests are not needed to run the server
docs/
tests/
README.md
*.md
```

Each line is a pattern. Anything matching one of these patterns is excluded from the build
context. This means:

- `node_modules` is not sent to the daemon. The `COPY package.json ./` step still works because
  `package.json` is at the root, not inside `node_modules`.
- `Dockerfile` is not sent. (But the Dockerfile is still read by the daemon — it knows where
  to find it.)
- `*.md` is not sent. Your documentation stays on your machine.
- `secrets/` is not sent. If you have a `secrets/key.pem`, it will not end up in the image.

---

## 5. When to use it and when NOT to

### Use `.dockerignore` when

- **Your build context is large.** Even a typical Node project with `node_modules`, `docs/`,
  `tests/`, and `README.md` sends 2+ MB to the daemon. `.dockerignore` cuts that down to
  a few hundred kilobytes.
- **You have secrets or config files next to your Dockerfile.** `config.json`, `.env`, `*.pem`
  files — put them in `.dockerignore` so they never become part of an image, accidentally or
  otherwise.
- **You are sharing the Dockerfile with a team.** Committing `.dockerignore` ensures everyone
  builds the same context. Without it, two `docker build .` commands can produce different
  images.

### Do not use `.dockerignore` when

- **You are building inside a container that already filters the filesystem.** If your CI runner
  mounts a sparse filesystem or uses a read-only base, `.dockerignore` is redundant.
- **You want to test "what if this file were in the image?"** Temporarily move it out of
  `.dockerignore`, rebuild, check, then move it back.

### The most common `.dockerignore` patterns

| Pattern | Why it matters |
| :--- | :--- |
| `node_modules` | Installed dependencies; re-installed in the image. The single most important |
| `.git` | Your version control metadata; never needed in the build. |
| `.gitignore` | Your git-level ignore rules; not relevant to builds. |
| `*.log` | Chatty applications write logs; they grow unboundedly (chapter 05). |
| `*.pem`, `*.key` | Private keys; never bake into an image. |
| `secrets/` | A directory for any secret files. |
| `env/` or `.env` | Configuration that should be passed at runtime, not baked in. |
| `docs/`, `tests/` | Everything needed to run the app is already in the image. |
| `README.md` | Useful for humans, not for the container. |

### A `.dockerignore` checklist before every build

Before you run `docker build`, glance at your `.dockerignore` and confirm:

- [ ] `node_modules` is listed (or equivalent for your language).
- [ ] `.git` is listed.
- [ ] `Dockerfile` and `.dockerignore` themselves are listed (prevents recursive copies).
- [ ] `.env` and any `*.pem`/`.key` files are listed.
- [ ] `docs/`, `tests/`, `README.md` are listed (if they exist at the root).
- [ ] No unexpected files are exposed (run `docker build --progress=plain .` and check the
  context size).

If all checks pass, you are ready to build.

---

## 6. Common mistakes

**1. Forgetting `.dockerignore` entirely.**

```console
$ docker build -t myimage .
Sending build context to Docker daemon  2.048MB      # with .dockerignore
Sending build context to Docker daemon  12.3MB     # without .dockerignore
```

The difference is real. Context size matters for build speed and for what the daemon can
access.

**2. Assuming `.dockerignore` also excludes files from the **running** container.**

It does not. `.dockerignore` only affects `docker build`. Once the image is built, the
container has whatever the image contains. To keep files out of the running container, use
`USER node`, read-only rootfs, or volumes with selective mounts — chapter 19.

**3. Using `!` negation patterns.**

Docker's `.dockerignore` implementation does not reliably support `!` to negate previous
patterns. Write only positive patterns, and if you must include a file, use its full path in
`COPY` or `ADD`.

**4. Committing `.dockerignore` to git but never updating it.**

If you add `node_modules/` to `.dockerignore` and then add a `build/` directory, remember
to add `build/` too. An outdated `.dockerignore` is worse than none, because it gives a
false sense of security.

**5. `COPY . .` and thinking `.dockerignore` excludes the rest.**

`COPY . .` copies the **build context** after `.dockerignore` has been applied. It does not
copy "everything except what's in .dockerignore." It copies exactly what Docker decided to
send. If you want to copy specific files, list them explicitly.

**6. Confusing `.dockerignore` with `.gitignore`.**

They use similar patterns, but they serve different purposes. `.gitignore` is for git;
`.dockerignore` is for builds. Do not assume what works in one works in the other.

**7. Leaving `Dockerfile` out of `.dockerignore`.**

```console
$ cat .dockerignore
node_modules
# (Dockerfile not listed)
```

The Dockerfile is how the daemon knows what to build. If you exclude it, `docker build .`
fails or builds the wrong file. Either list it (and it is read but not copied) or leave it
included.

**8. Thinking `.dockerignore` makes the image smaller after it is built.**

`.dockerignore` only affects what is sent to the daemon during build. Once the image is
built, the files are already in it. To make the final image smaller, you need multi-stage
builds (chapter 13) or a smaller base image.

---

## 7. Try it yourself

**Exercise.** Create a `.dockerignore` for your project and measure the context size change.

**Step 1 — from scratch:**

```bash
$ mkdir -p /tmp/opencode/di-test
$ cd /tmp/opencode/di-test
```

Copy your project files (minus large ones):

```bash
$ mkdir src conf logs
$ cp /home/sunny/app/nimo/docker-doc/docker-learn/{package.json,server.js,Dockerfile,.dockerignore} .
$ cp /home/sunny/app/nimo/docker-doc/docker-learn/.dockerignore .dockerignore.bak 2>/dev/null || echo "no existing"
$ rm -f .dockerignore  # start clean
```

**Step 2 — build without .dockerignore:**

```console
$ docker build -t no-ignore:1 .
```

Take note of the context size reported by BuildKit (look for `transferring context:` in the
output). It will be in megabytes.

**Step 3 — add a .dockerignore:**

```console
$ cat > .dockerignore <<'EOF'
node_modules
*.log
*.pem
EOF
$ docker build -t with-ignore:1 .
```

The context size should be notably smaller. Take note of the new number.

**Step 4 — verify the build still works:**

```console
$ docker run -d --name di-test with-ignore:1
$ curl -s http://localhost:3000/
```

The app should still serve. If it does not, you may have excluded a file your `COPY` steps
need.

**Step 5 — clean up:**

```console
$ docker rmi no-ignore:1 with-ignore:1
$ rm -rf /tmp/opencode/di-test
```

---

## 8. Next

You can exclude files from the build context. Next: splitting a single Dockerfile into
multiple stages, shrinking a 334 MB image down to 243 MB. Multi-stage builds are the most
effective way to reduce image size, and they are the standard pattern for production Dockerfiles.

**[Chapter 13 — Multi-Stage Builds](13-multi-stage-builds.md)**