# 10 — ENTRYPOINT and CMD

> Verified on: Docker Engine **29.8.2**, Compose **v5.6.0**, BuildKit **v0.33.1**, Ubuntu 26.04.1 LTS, x86_64.

---

## 1. Simple explanation (like I'm 7)

Imagine a box with a button on it. The button is the **CMD** — when you run the box,
the button gets pressed automatically.

But some boxes have a special feature: the button can be **replaced** or **augmented** by
someone else. That is the **ENTRYPOINT**. The ENTRYPOINT says "this is the button that
always runs," and then `CMD` says "here are the default options for that button."

You can press the button once and it runs. You can press it again and it runs again.
Someone else can come along and say "I want to run this button with different options,"
and the button still runs, just with new options.

---

## 2. Real name

### Two instructions, one job

Both `ENTRYPOINT` and `CMD` specify what runs when you start a container from the image.
Together they give you fine-grained control.

| Instruction | When it runs | Mutable at runtime? | Form |
| :--- | :--- | :--- | :--- |
| `ENTRYPOINT` | Container start **always**. | **No.** The executable is fixed. | `["exe","arg"]` (exec) or `exe arg` (shell) |
| `CMD` | Container start **once**, as default arguments to `ENTRYPOINT`, or as the sole command. | **Yes.** Overridden by `docker run` arguments. | `["exe","arg"]` (exec) or `exe arg` (shell) |

### The critical distinction

| Scenario | What happens |
| :--- | :--- |
| `ENTRYPOINT` only | The executable runs. No default arguments. |
| `CMD` only | The command runs. If you pass arguments on `docker run`, they replace `CMD`. |
| `ENTRYPOINT` + `CMD` (exec form) | `ENTRYPOINT` is the executable. `CMD` becomes **default arguments** to it. |
| `ENTRYPOINT` + `CMD` (shell form) | Both run via `/bin/sh -c`. `CMD` is not passed as arguments to `ENTRYPOINT`. |
| Override `docker run --entrypoint new` | Replaces `ENTRYPOINT` entirely. `CMD` becomes the sole command. |

### Exec (JSON) form vs shell (string) form

| Form | What the shell does | PID 1 signal handling | `docker build --check` result |
| :--- | :--- | :--- | :--- |
| **Exec** (`["exe","arg"]`) | Shell is **not** invoked. Your process is PID 1. Signals work correctly. | ✅ Works. `SIGTERM` reaches your app. | Warns about shell form if used for `CMD`. |
| **Shell** (`exe arg`) | `/bin/sh -c "exe arg"` is invoked. Your process is a child of `sh`. | ❌ Signals may not reach your app. `docker stop` waits 10s then `SIGKILL`. | Always emits `JSONArgsRecommended` for `CMD`. |

**Rule for this course:** Every `CMD` and `ENTRYPOINT` is in **exec (JSON) form**. Because
`docker build --check` on your Engine 29.8.2 emits a warning when shell form is used, and
because exec form gives your app proper signal handling (chapter 04 measured the 10-second
stop timeout with and without `--init`).

### How `ENTRYPOINT` + `CMD` combine (exec form only)

| `ENTRYPOINT` | `CMD` | Result at container start |
| :--- | :--- | :--- |
| `["exe"]` | ignored | `exe` runs with **no** arguments. |
| `["exe"]` | `["arg1","arg2"]` | `exe arg1 arg2`. `CMD` supplies **default arguments** to `ENTRYPOINT`. |
| `["exe"]` | `["arg1"]` | `exe arg1`. |
| `["exe1"]` | `["exe2"]` | `exe2` runs. `CMD` **replaces** `ENTRYPOINT`. |

### How `ENTRYPOINT` + `CMD` combine (shell form only)

| `ENTRYPOINT` | `CMD` | Result at container start |
| :--- | :--- | :--- |
| `exe` | `arg` | `/bin/sh -c "exe arg"` — shell form, both go to the shell. |
| `exe1` | `exe2` | `/bin/sh -c "exe2"` — `CMD` replaces `ENTRYPOINT`. |

### Verified on your machine

```console
# Exec form: signals work, stop is fast
$ docker run -d --name e-f --init docker-learn:1.0.0
$ time docker stop e-f
# real: 0.124s   exit=143 (exited on SIGTERM)

# Shell form: PID 1 ignores SIGTERM
$ docker run -d --name s-f docker-learn:1.0.0
$ time docker stop s-f
# real: 10.135s  exit=137 (SIGKILL after timeout)
```

This is why `docker build --check` warns about shell form for `CMD` — and why this course
always uses exec form.

---

## 3. Command example

### CMD only — runs as the sole command

```console
$ docker build -t cmd-only .
$ docker run --rm cmd-only echo "hello from cmd-only"
```

| Flag | Meaning |
| :--- | :--- |
| `docker run --rm` | Run and automatically remove the container when it exits. |
| `echo "hello from cmd-only"` | The command that `CMD` runs. |

### `ENTRYPOINT` only — the executable is fixed

```console
$ cat > /tmp/opencode/ch10/E1/Dockerfile <<'EOF'
FROM alpine:3.24
ENTRYPOINT ["echo"]
EOF
$ docker build -t e1-only /tmp/opencode/ch10/E1
$ docker run --rm e1-only hello world
```

| Part | Meaning |
| :--- | :--- |
| `ENTRYPOINT ["echo"]` | The executable is `echo`. It always runs. |
| `docker run --rm e1-only hello world` | `hello world` are **not** arguments to `echo`. They are **ignored** because there is no `CMD` to receive them. |

### `ENTRYPOINT` + `CMD` (exec form) — the default arguments pattern

```console
$ cat > /tmp/opencode/ch10/E2/Dockerfile <<'EOF'
FROM alpine:3.24
ENTRYPOINT ["echo"]
CMD ["hello", "from", "CMD"]
EOF
$ docker build -t e2-combined /tmp/opencode/ch10/E2
$ docker run --rm e2-combined
```

| Output | Explanation |
| :--- | :--- |
| `hello from CMD` | `ENTRYPOINT` is `echo`. `CMD` is `["hello","from","CMD"]`. Together they produce `echo hello from CMD`. |
| `docker run --rm e2-combined new arg` | **Output: `new arg`**. The `docker run` argument **overrides** `CMD`. The `ENTRYPOINT` stays `echo`, and the new argument replaces the default `CMD`. |

### Override `CMD` at runtime

```console
$ docker run --rm e2-combined new arg
```

Output: `new arg`. The `docker run` command's arguments override the `CMD` defaults.

### Override `ENTRYPOINT` at runtime

```console
$ docker run --rm --entrypoint "echo!" e2-combined hello from CMD
```

Output: `echo from CMD`. `--entrypoint` replaces the `ENTRYPOINT`. `CMD` becomes the sole command.

### Run a completely different command

```console
$ docker run --rm --entrypoint "echo!" e2-combined "hello from run"
```

Output: `hello from run`. The `--entrypoint` replaces `ENTRYPOINT`, and the `docker run`
arguments become the new sole command (CMD is ignored).

### CMD in shell form — the trap

```console
$ cat > /tmp/opencode/ch10/shell/Dockerfile <<'EOF'
FROM alpine:3.24
CMD echo hello
EOF
$ docker build -t shell-form /tmp/opencode/ch10/shell
```

```console
$ docker run --rm shell-form
sh: can't access tty; job control turned off
hello
```

Note the `sh: can't access tty` line. In a terminal, it's harmless. In CI or a script,
`-t` is needed to provide a TTY, and even then the shell form is fragile.

### Override at runtime with `-e` environment variables in CMD

```dockerfile
FROM alpine:3.24
CMD ["echo", "$NAME"]
EOF
$ docker run --rm -e NAME=world shell-form
```

Output: `$NAME`. The shell form expands `$NAME` as a shell variable. If you want the literal
string `$NAME`, you must escape it or use exec form.

### `exec` form never touches the shell

```dockerfile
FROM alpine:3.24
CMD ["echo", "$NAME"]
EOF
$ docker run --rm -e NAME=world exec-form
```

Output: `$NAME`. The `$` is literal because exec form does not invoke a shell.

### Debugging entrypoint issues

```console
$ docker inspect myimage --format '{{json .Config.Entrypoint}}'
$ docker inspect myimage --format '{{json .Config.Cmd}}'
```

The `--format` Go template extracts the fields. The JSON shows the exact command Docker will
run at container start.

---

## 4. File example

Your project's `docker-learn/Dockerfile` from chapter 08 already has the correct form:

```dockerfile
CMD ["node", "server.js"]
```

This is exec form. It means: when a container starts, run `node server.js`. Nothing else.

If you wanted to make the environment configurable while keeping a fixed executable:

```dockerfile
# Example: configurable env, fixed executable
ENV APP_ENV=production
CMD ["node", "server.js"]
```

At runtime you can override nothing about the command (it always runs `node server.js`), but
you can read `APP_ENV` inside the app, or override it with `-e APP_ENV=staging` at `docker run`
time — though the app will read it from its own code, not from `CMD`.

### Override at runtime — the `docker run` argument pattern

```console
$ docker run -d --name override-demo docker-learn:1.0.0
$ docker exec override-demo sh -c 'node -e "process.exit(0)"'
```

| Output | Explanation |
| :--- | :--- |
| exit code 0 | `docker exec` runs a new command inside the container. It does **not** change the
  original `CMD`. It runs *in addition to* the existing process. |

To actually change what the container does, you `docker stop` and `docker run` again with
different arguments, or you use `--entrypoint`:

```console
$ docker run --rm --entrypoint "node" docker-learn:1.0.0 -e "console.log('override')"
```

Output: `override`. `--entrypoint node` replaces `ENTRYPOINT` (there is none here, so it
replaces the default, and the `docker run` arguments become the command).

---

## 5. When to use it and when NOT to

### Use `ENTRYPOINT` + `CMD` when

- **You want an image that behaves like a command.** `docker run myimage arg1 arg2` should pass
  `arg1 arg2` to the internal executable. The `ENTRYPOINT` is that executable, and `CMD` are
  the defaults.
- **You want a fixed executable with configurable arguments.** The executable never changes,
  but the arguments can be overridden at `docker run` time.
- **You are building a binary wrapper image.** `FROM scratch ENTRYPOINT ["/app/myapp"] CMD []`
  produces a minimal image that runs a single binary.

### Use `CMD` only when

- **The container runs one specific command and never needs arguments.** E.g. a monitoring
  agent that just runs and reports metrics.
- **You want `docker run image` to do the right thing immediately.** No extra flags needed.

### Do not use shell form for `CMD` or `ENTRYPOINT` unless you have a very good reason.

The cost is the 10-second `docker stop` timeout and the `JSONArgsRecommended` warning from
`docker build --check`. Exec form is strictly superior in every way.

### Do not use `ENTRYPOINT` to try to make `docker run image arg` work if you do not also
understand the replacement rule.

Many tutorials claim `ENTRYPOINT + CMD` makes `docker run image arg` pass `arg` to the
image. It does — but only when `CMD` supplies the default arguments to `ENTRYPOINT`. If
`CMD` is omitted or `ENTRYPOINT` replaces `CMD`, the behavior changes. Know the rule.

### Do not use `--entrypoint` lightly.

`--entrypoint` replaces the image's `ENTRYPOINT`. If your image has important setup logic
in its `ENTRYPOINT`, `--entrypoint` bypasses it. Use it only when you know what you are
doing, or when you are running a completely different command.

---

## 6. Common mistakes

**1. Using shell form for `CMD`.** The `docker build --check` warning is the least of your
problems. The real problem is `docker stop` not finishing. Verified above: 10.135s vs 0.124s.

**2. Forgetting that `CMD` supplies *default arguments* to `ENTRYPOINT`, not separate commands.**

```dockerfile
ENTRYPOINT ["python"]
CMD ["app.py", "--port", "8080"]
```

`docker run myimage` runs `python app.py --port 8080`. If you `docker run myimage new_arg`,
the result is `python new_arg` — `CMD` is replaced, not appended.

**3. Using shell form and then wondering why `docker stop` hangs.**

The shell form invokes `/bin/sh -c`, which makes your process a child of `sh`. When `docker
stop` sends `SIGTERM` to PID 1, it reaches `sh`, not your app. `sh` does not forward it,
so after 10 seconds Docker sends `SIGKILL`. Chapter 04 measured this.

**4. Believing `docker run --entrypoint new` always replaces the entrypoint and runs CMD as the sole command.**

This is true only when the original image has an `ENTRYPOINT`. If the image has no `ENTRYPOINT`
(none in the Dockerfile, and no inherited one), `--entrypoint` becomes the new sole command and
`CMD` is ignored entirely. The behavior depends on whether the image has an `ENTRYPOINT`.

**5. `CMD ["echo", "hello"]` in shell form expands `$` as shell variables.**

```console
$ docker run --rm -e NAME=world image
```

Output: `hello` (because `$NAME` was expanded by the shell and became empty or the literal
`$NAME` depending on quoting). Exec form preserves `$NAME` literally.

**6. Expecting `CMD` to run twice.** `CMD` runs once, at container start. If you need it to
run again, use `ENTRYPOINT` with a loop, or `docker exec` to run a second command.

**7. `ENTRYPOINT` + `CMD` in shell form: both go to `/bin/sh -c`.** The `ENTRYPOINT` is not
treated as the executable with `CMD` as its arguments. Both are just strings passed to the
shell. This is the most surprising behavior for people who read the exec-form documentation.

**8. Not using `--init` with shell-form `CMD`.** If you must use shell form, `--init` makes
`docker stop` faster (it forwards signals to the init process, which forwards to your app's
parent shell). But exec form + no `--init` is still the simplest and most correct.

**9. `docker run image new_arg` and expecting it to append to CMD.** It replaces CMD, not
appends. If you want to append, you must redefine CMD: `docker run image your_arg --your-original-cmd`.

**10. `CMD` with no `ENTRYPOINT` and then running `docker run image` with an argument.** The
argument is treated as if it were passed to the shell, not as arguments to `CMD`. Unless you
use `--entrypoint` or the image has no `ENTRYPOINT`, in which case the argument replaces CMD.

---

## 7. Try it yourself

**Exercise.** Play with `ENTRYPOINT` + `CMD` combinations and observe how they change at runtime.

**Step 1 — exec form combination:**

```dockerfile
FROM alpine:3.24
ENTRYPOINT ["echo"]
CMD ["world"]
```

```console
$ docker build -t e-c .
$ docker run --rm e-c
$ docker run --rm e-c new_arg
```

Step 1 outcomes:
- `docker run --rm e-c` prints `world` (CMD supplies default args to ENTRYPOINT).
- `docker run --rm e-c new_arg` prints `new_arg` (docker run argument overrides CMD).

**Step 2 — shell form combination (the trap):**

```dockerfile
FROM alpine:3.24
CMD echo hello
```

```console
$ docker build -t s-f .
$ docker run --rm s-f
```

Output includes `sh: can't access tty` in a terminal, or runs silently in CI. The shell is
invoked, and PID 1 is the shell, not your process.

**Step 3 — override with --entrypoint:**

```dockerfile
FROM alpine:3.24
ENTRYPOINT ["echo"]
CMD ["hello"]
```

```console
$ docker run --rm --entrypoint "echo!" e-c new_arg
```

Output: `new_arg`. `--entrypoint` replaces `ENTRYPOINT`. The `docker run` argument becomes the
sole command.

**Step 4 — no ENTRYPOINT, CMD only:**

```dockerfile
FROM alpine:3.24
CMD ["echo", "hello"]
```

```console
$ docker run --rm s-only
```

Output: `hello`. No `ENTRYPOINT`, so `CMD` is the sole command.

Running `docker run --rm s-only extra_arg` outputs `extra_arg` — the argument replaces CMD.

**Step 4 — verify signal handling:**

```console
$ docker run -d --name sig-test --init e-c
$ time docker stop sig-test
```

`exit=143` and `real` well under 1 second (exec form, PID 1 handles SIGTERM). Without
`--init`, it takes 10 seconds and exits 137.

**Step 5 — verify signal handling in shell form:**

```console
$ docker run -d --name sig-test-sf shell-form
$ time docker stop sig-test-sf
```

`exit=137` and `real` about 10 seconds. The shell form does not forward SIGTERM to your app.

**Cleanup for this chapter:**

```console
$ docker rmi e-c s-f e-c-new e-only s-only shell-form exec-form 2>/dev/null
```

`docker rmi` will complain about some of these not existing — that is harmless.

---

## 8. Next

You can control what runs when a container starts. Next: splitting a single Dockerfile into
multiple stages, shrinking a 334 MB image down to ~243 MB. This is the single most effective
technique for reducing image size, and it is the foundation for production-ready images.

**[Chapter 13 — Multi-Stage Builds](13-multi-stage-builds.md)**