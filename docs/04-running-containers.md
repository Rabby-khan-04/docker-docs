# 04 — Running Containers

> Verified on: Docker Engine **29.8.2**, Compose **v5.6.0**, BuildKit **v0.33.1**, Ubuntu 26.04.1 LTS, x86_64.

---

## 1. Simple explanation (like I'm 7)

An image is a frozen lunchbox. This chapter is about the person who opens it.

You can have as many people eating from identical lunchboxes as you like. Each one gets
their own portion. If one person spills soup, the other people still have lunch and the
lunchbox is still sealed and clean.

Docker calls the person a **container**. Here are the things you can do to a person:

- **Start** them (wake them up).
- **Stop** them (ask them to finish and go to sleep — politely).
- **Kill** them (shove them, immediately, no manners).
- **Rename** them.
- **Pause** them (freeze mid-sentence, they keep their coffee).
- **Remove** them (they leave and are gone forever).

The important idea: **stopping is not removing.** A stopped person is still there, still
holding their lunch. You have to explicitly remove them.

And here is the beginner trap that catches everyone: **if you do not give a container a
name, Docker invents a silly one.** You will type `docker stop ecstatic_faraday` and have
no idea how you knew that. Always use `--name`.

---

## 2. Real name

### The container lifecycle

A container is always in exactly one state. `docker ps` shows you which:

```
                  docker run
                     │
                     ▼
              ┌─────────────┐
              │  CREATED    │  container exists, never started
              └──────┬──────┘
                     │ docker start
                     ▼
              ┌─────────────┐   docker pause
              │  RUNNING    │ ◄──────────┐
              └──┬───────┬──┘            │ docker unpause
   process exits │       │ docker stop   │
   or docker kill       │ SIGTERM then   │
                 │       │ SIGKILL       │
                 ▼       ▼               │
              ┌─────────────┐ ────────────┘
              │  EXITED     │
              └──────┬──────┘
                     │ docker rm
                     ▼
              ┌─────────────┐
              │  REMOVED    │  metadata deleted, writable layer gone
              └─────────────┘
```

| State | Meaning | Visible in |
| :--- | :--- | :--- |
| `CREATED` | Container exists but has never been started | `docker ps -a` |
| `RUNNING` | Process is alive | `docker ps` |
| `PAUSED` | Frozen. Process still exists, uses no CPU. All its memory is still held. | `docker ps -a` shows `Up ... (Paused)` |
| `RESTARTING` | Docker is restarting it after a crash | `docker ps -a` |
| `EXITED` (dead) | Process ended. Container metadata and writable layer still exist. | `docker ps -a` |
| `REMOVED` | Gone. Cannot be brought back. | nothing |

### `stop` versus `kill` — and why the difference matters

`docker stop` is polite. It sends **`SIGTERM`** to the container's main process, then waits
**10 seconds** by default, then sends **`SIGKILL`** if the process has not exited.

`docker kill` sends `SIGKILL` immediately. No chance to clean up.

The polite version matters. A well-behaved app catches `SIGTERM`, stops accepting new
requests, finishes in-flight work, closes database connections, and exits. Skip that and
you get half-written transactions.

Here is the honest behaviour of a typical Node app in a container, measured on this
machine:

```console
$ docker run -d --name ch04-sig3 docker-learn:1.0.0
$ time docker stop ch04-sig3
ch04-sig3

real	0m10.135s
exit=137
```

Ten seconds and exit code 137. What happened: `SIGTERM` was sent, the app ignored it, so
after 10 seconds Docker sent `SIGKILL` anyway. Exit code 137 is 128 + 9 — killed by signal
9.

With `--init`, the same thing is instant and clean:

```console
$ docker run -d --name ch04-sig --init docker-learn:1.0.0
$ time docker stop ch04-sig
ch04-sig

real	0m0.124s
exit=143
```

Exit code 143 is 128 + 15 — exited on `SIGTERM`. 124 milliseconds instead of 10 seconds.

**Why `--init` changes this.** In a container, PID 1 is your process. Linux gives special
treatment to PID 1, including that **default signal handlers are not installed**. Node.js
installs a `SIGTERM` handler for you — but when Node is PID 1, the kernel's PID-1 rule
overrides the default, and the behaviour is not what the app author expects. `--init` runs
a tiny init process (`docker-init`, version 0.19.0 on your machine) as PID 1, which forwards
signals correctly to your app as a normal child process. Same signal, correct handling.

Chapter 10 goes deep on this. For now: **`--init` is a good default for anything
long-running.**

### The command family

| Command | Does | Deletes anything? |
| :--- | :--- | :--- |
| `docker run` | Create + start + attach | No (`--rm` deletes on exit) |
| `docker create` | Create only, do not start | No |
| `docker start` | Start a created/stopped container | No |
| `docker stop` | `SIGTERM`, wait 10s, then `SIGKILL` | No |
| `docker kill` | `SIGKILL` immediately | No |
| `docker restart` | stop, then start | No |
| `docker pause` / `unpause` | Freeze / unfreeze all processes | No |
| `docker rename` | Change the name | No |
| `docker rm` | Delete container metadata and writable layer | **Yes — data in the container is gone** |
| `docker container prune` | Delete all stopped containers | **Yes** |

Note the third column. Only the bottom two destroy anything.

---

## 3. Command example

### Start a container properly

```console
$ docker run -d --name ch04-demo -p 3011:3000 docker-learn:1.0.0
139c0161a3642e5409bc119521e5b5ab88a61c249042d1737413d0bdfcf3a139
```

Flag by flag:

| Flag | Long form | Why |
| :--- | :--- | :--- |
| `-d` | `--detach` | Return to the shell immediately. Without it, the container's output owns your terminal and Ctrl-C stops it. |
| `--name ch04-demo` | | A memorable name. Skipping this gives you `epic_merkle` and no idea which container you meant. |
| `-p 3011:3000` | `--publish` | Host port 3011 → container port 3000. Chapter 07. |
| `docker-learn:1.0.0` | | Image to run. Untagged means `:latest`. |

The output is a **64-character container ID**. It is the container's permanent identity —
its name is a label you can change, this cannot. Use it when you did not pass `--name`:

```console
$ docker ps --format '{{.ID}} {{.Names}}'
```

### List containers

```console
$ docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'
NAMES           IMAGE                STATUS          PORTS
ch04-demo       docker-learn:1.0.0   Up 2 seconds    0.0.0.0:3011->3000/tcp, [::]:3011->3000/tcp
```

Without `--format` you also get `CONTAINER ID`, `COMMAND` and `CREATED`, and the output is
wide enough to wrap:

```console
$ docker ps
CONTAINER ID   IMAGE              COMMAND             CREATED          STATUS          PORTS                                         NAMES
139c0161a364   docker-learn:1.0.0   "node server.js"   2 seconds ago    Up 2 seconds    0.0.0.0:3011->3000/tcp, [::]:3011->3000/tcp   ch04-demo
```

**`docker ps` only shows RUNNING containers.** This is the number one beginner surprise —
you start a container, it crashes, and it has vanished from `docker ps` while leaving no
trace. You need `-a` for all:

```console
$ docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
NAMES       STATUS                       PORTS
ch04-demo   Up 2 seconds                0.0.0.0:3011->3000/tcp, [::]:3011->3000/tcp
```

Column by column:

| Column | Meaning |
| :--- | :--- |
| `CONTAINER ID` | Permanent identity, shortened to 12 chars |
| `IMAGE` | Which image it came from |
| `COMMAND` | The actual command being run. If this looks wrong, your `ENTRYPOINT`/`CMD` is wrong — chapter 10. |
| `CREATED` | When the container was created |
| `STATUS` | State, plus "Up X" and **any health status** |
| `PORTS` | Published ports. **`0.0.0.0:3011->3000/tcp` means host 3011 to container 3000.** If this column is empty, nothing is reachable from your machine. |
| `NAMES` | The name you chose |

Useful formatting flags, because the default table is too wide to read:

```console
$ docker ps -a --format '{{.Names}}\t{{.Status}}'
$ docker ps --filter status=running --format '{{.Names}}'
$ docker ps --filter name=ch04 --format '{{.Names}}'
$ docker ps --filter ancestor=node:22-alpine --format '{{.Names}}'
```

### Stop, start, restart

```console
$ docker stop ch04-demo
ch04-demo

$ docker ps -a --filter name=ch04-demo --format '{{.Names}} {{.Status}}'
ch04-demo Exited (137) Less than a second ago
```

`Exited (137)` — 137 means `SIGKILL` was needed, exactly the 10-second-timeout story above.
If you see `Exited (0)` the app shut down cleanly on its own.

```console
$ docker start ch04-demo
ch04-demo

$ docker ps -a --filter name=ch04-demo --format '{{.Names}} {{.Status}}'
ch04-demo Up 2 seconds

$ curl -s http://localhost:3011/health
{
  "status": "ok"
}
```

A `docker start` on a stopped container runs the **original** command again. It does not
rerun `docker run` — any flags you passed then are baked into the container and cannot be
changed. Want different flags? `docker rm` it and `docker run` again.

```console
$ docker restart ch04-demo
$ docker kill ch04-demo
```

### Pause and unpause

```console
$ docker pause ch04-demo
ch04-demo

$ docker ps -a --filter name=ch04-demo --format '{{.Names}} {{.Status}}'
ch04-demo Up 54 seconds (Paused)

$ docker unpause ch04-demo
ch04-demo
```

`pause` uses cgroups freezer — the kernel stops scheduling the container's processes. They
do not run, consume no CPU, **and still hold all their memory**. Unpausing resumes exactly
where it left off.

Useful for debugging a live system without disrupting it, and as a snapshot mechanism for
the writable layer. Rare in normal use.

### Rename

```console
$ docker rename ch04-demo ch04-before-refactor
```

Free and instant. The container ID never changes. Useful when you are about to run a second
container with the same role and need to distinguish them in `docker ps`.

### Kill

```console
$ docker run -d --name ch04-k docker-learn:1.0.0
$ docker kill ch04-k
ch04-k

$ docker inspect ch04-k --format 'exit={{.State.ExitCode}}'
exit=137
```

`kill` is `SIGKILL`. Exit 137 immediately. Use `stop` unless you have a reason not to.

### Remove

Removing a **running** container is refused, and this refusal is a safety feature:

```console
$ docker rm ch04-b
Error response from daemon: cannot remove container "ch04-b": container is running: stop the container before removing or force remove

$ docker rm -f ch04-b
ch04-b
```

| Flag | Meaning |
| :--- | :--- |
| `docker rm <name>` | Remove a stopped container. Refuses to touch a running one. |
| `-f`, `--force` | Stop (kill, actually) and remove in one step. **Any data in the writable layer is destroyed.** |
| `-v`, `--volumes` | Also remove anonymous volumes attached to it. **Named volumes are not removed** — see below, this surprises people constantly. |

**Critical detail about `-v`:** it removes *anonymous* volumes only. Volumes you declared by
name in a Compose file, or created with `docker volume create`, **survive**. That is why
`docker compose down` keeps your database data but `docker compose down -v` deletes it.
Chapter 07 and chapter 29 cover this properly, because losing a database to `down -v` is a
classic and avoidable disaster.

### `--rm`, so you never have to think about it

```console
$ docker run --rm alpine:3.24 echo auto-removed
auto-removed

$ docker ps -a --filter ancestor=alpine:3.24 --format '{{.Names}}'
```

No output. The container was deleted the instant it exited.

Use `--rm` for throwaway work: debugging, one-off scripts, testing. Do **not** use it for
anything whose data or logs you want to inspect afterwards.

### Exit codes tell you why a container died

```console
$ docker run --name ch04-exit alpine:3.24 sh -c 'exit 42'
$ echo $?
42

$ docker ps -a --filter name=ch04-exit --format '{{.Names}} {{.Status}}'
ch04-exit Exited (42) Less than a second ago

$ docker inspect ch04-exit --format 'ExitCode={{.State.ExitCode}} Error={{.State.Error}}'
ExitCode=42 Error=
```

**`Exited (42)` is your app's own exit code.** This is how you debug a crash-looping
container: read the number, and if your app returns meaningful codes, you know the cause.
Common ones:

| Code | Meaning |
| :--- | :--- |
| `0` | Success. Nothing went wrong. |
| `1` | Generic failure. Look at the logs. |
| `2` | Shell misuse, or your app chose it for a specific error. |
| `126` | Found the command but could not execute it — often a wrong architecture. |
| `127` | **Command not found.** The single most common beginner error: wrong path, wrong `WORKDIR`, or `node_modules` missing from the image. |
| `137` | `SIGKILL` — either `docker kill`, or the 10-second stop timeout expired, or the OOM killer got it. Chapter 23. |
| `139` | Segfault. Chapter 23. |
| `143` | `SIGTERM` — a clean, requested shutdown. |

### A port conflict, shown exactly

```console
$ docker run -d --name ch04-p1 -p 3023:3000 docker-learn:1.0.0
$ docker run --rm -p 3023:3000 docker-learn:1.0.0
docker: Error response from daemon: failed to set up container networking: driver failed programming external connectivity on endpoint epic_merkle (131af3...): Bind for 0.0.0.0:3023 failed: port is already allocated
```

The key phrase is `port is already allocated`. This is not a Docker bug; two things want
the same host port. Fix it by publishing a different host port, or find the owner:

```console
$ docker ps --filter publish=3023 --format '{{.Names}}'
```

Note this happens **before the container is created**, so no partial container is left
behind.

### Watch it run

```console
$ docker ps
```

Then open a second terminal and hit the app. Come back and you will see the `STATUS` uptime
ticking. It looks like nothing happened, which is the entire point of `-d`.

```console
$ curl -s http://localhost:3011/
{
  "name": "docker-learn",
  "env": "production",
  "container": "139c0161a364",
  "pid": 1,
  "uptimeSeconds": 12
}
```

`"pid": 1` — your app is PID 1 in its own namespace. Chapter 10 is entirely about why that
matters.

---

## 4. File example

No Dockerfile in this chapter. The file that pairs with container lifecycle is a
`docker-compose.yaml`, but Compose is chapter 15 — too early to introduce here.

The real artifact of this chapter is muscle memory. Put this in a file you keep handy
(`docker-cheatsheet.txt`), because you will use every line within the hour:

```bash
#!/usr/bin/env bash
# Container lifecycle, from this chapter.
# WARNING: the last two lines delete containers. Read them before you run this.

# Start a long-running container properly
docker run -d --name myapp -p 3000:3000 --init -e APP_ENV=production docker-learn:1.0.0

# See it
docker ps
docker ps -a                                  # include stopped ones
docker ps -a --format '{{.Names}}\t{{.Status}}'

# Watch its output
docker logs -f myapp

# Look inside it
docker exec -it myapp sh

# Change its life
docker pause myapp
docker unpause myapp
docker restart myapp
docker stop myapp
docker kill myapp

# Read its final state before deleting it
docker inspect myapp --format 'exit={{.State.ExitCode}} oom={{.State.OOMKilled}}'

# Remove it
docker rm myapp                  # stopped only
docker rm -f myapp               # running too -- DESTRUCTIVE to container data

# Clean up the three containers used in this chapter
docker rm -f ch04-demo ch04-exit ch04-p1
```

```bash
$ chmod +x docker-cheatsheet.txt
```

Two flags to notice in that file:

- `--init` — cheap insurance, makes `docker stop` fast and clean (measured above: 124 ms
  vs 10 s). Use it for anything long-running.
- `-e APP_ENV=production` — configuration belongs in the container, not baked into the
  image. Chapter 06.

---

## 5. When to use it and when NOT to

### When to reach for plain `docker run`

- **A one-off job.** Migration scripts, a data export, a backup. `--rm` and move on.
- **Debugging.** Run the image, poke at it with `docker exec`, read the logs, delete it.
- **A single service on one machine.** Sometimes Compose is ceremony and a `docker run`
  with a `--name` and a restart policy is genuinely all you need.
- **Learning.** While you are reading these chapters, `docker run` is clearer than Compose.
  You can see exactly which flag did what.

### When to use `docker create` then `docker start`

- **You need a container that is configured but not running.** Useful for building a
  template you start later, or when you want to `docker inspect` a container's configuration
  before running anything.
- **You want to test configuration without side effects.** Create it, inspect it, decide.

### When to use `pause`

- **Freezing a live system for inspection.** No restart, no lost state, no dropped
  connections frozen.
- **Consistent filesystem snapshots.** Because the process is frozen, its writable layer
  stops changing, so you can copy it safely.

Do not use `pause` as a substitute for `stop`. The process holds all its memory the entire
time, so a paused container still costs you RAM.

### When NOT to reach for `kill` or `rm -f`

- **Never `kill` something you did not start.** If you see a container you do not
  recognise — and on this machine there were already three before this course began
  (`redis-learn`, `infra-redis-1`, `evalery-redis-1`) — leave it alone. Work out what it is
  first.
- **Never `rm -f` before reading the logs.** When a container has crashed, its logs are the
  only evidence. `docker logs myapp` first, always, then remove.
- **Never `rm` a container holding state you have not backed up.** Its writable layer is
  destroyed and unrecoverable. If the data matters, it should have been in a volume —
  chapter 07.
- **Do not use `docker stop` as a pause substitute** in a script that then sleeps. You have
  torn down the process; use `pause`.

### A habit worth forming now

Every time you remove a container, remove the image too, if it was a throwaway:

```console
$ docker rm -f myapp && docker rmi myapp-test:1
```

Otherwise you accumulate stopped containers and `<untagged>` images and eventually hit a
full disk. Chapter 22 is entirely about cleaning up, but the best time to avoid the mess is
at the moment you create it.

---

## 6. Common mistakes

**1. Running a long-lived container without `-d`.** Your terminal is now the container's
output stream. Ctrl-C stops the container. Detach with `Ctrl-P Ctrl-Q`, or better, start
over with `-d`.

**2. Not using `--name`.** You get `ecstatic_faraday`, and to stop it you must dig through
`docker ps` for the ID. Once you have five containers, this is misery. Always `--name`.

**3. `docker ps` and concluding "it did not run."** `docker ps` hides stopped containers.
The container that crashed instantly is sitting in `docker ps -a` with `Exited (1)`. This is
the most common beginner moment of confusion, and it is entirely `docker ps`'s design.
Habit: when something "did not work", reach for `docker ps -a` and `docker logs`.

**4. Forgetting `--name`, then trying to `docker start` by the silly name.** Works, but you
will not remember it tomorrow. Related: `docker ps -a` shows truncated IDs; use
`docker ps -a --no-trunc` when you need the full 64 characters.

**5. `docker rm` on a running container and being confused by the error.** The message
literally tells you the fix: `stop the container before removing or force remove`. It is a
guardrail, not an obstacle.

**6. Assuming `docker start` re-runs `docker run`.** It does not. Flags from `docker run`
are baked in permanently. Changed your mind about ports or env vars? `docker rm` then
`docker run` again.

**7. Believing `docker stop` is instant.** It is `SIGTERM`, then a **10-second wait**, then
`SIGKILL`. If your deploy script has `stop` in it and nothing else, add
`--init` so your app can actually catch the signal.

**8. Running `docker rm -f` on containers you did not create.** I did not touch your three
pre-existing containers in this chapter and I recommend the same discipline. `docker rm -f`
has no undo and no confirmation.

**9. Assuming `docker stop` sends an interrupt to *your* process.** It sends `SIGTERM` to
**PID 1**. If your real app is a child of a shell script, the shell is what receives it, and
whether it forwards the signal is up to that script. Chapter 10.

**10. Using `--rm` when you plan to inspect after a failure.** `docker run --rm` on a
crashing container deletes the evidence the moment it exits. Debug with `--rm` off, read
`docker logs`, then clean up.

**11. `docker run -p 3000:3000` twice and getting `port is already allocated`.** Two
containers cannot share a host port. Pick another host port, or put them on a shared network
and let them talk over DNS without publishing anything — chapter 07.

**12. Forgetting that `docker stop` does not remove.** `docker ps` will not show it, so it
feels gone. It is not. `docker ps -a` shows it, taking up disk. This is the single most
common cause of "why is my disk full" alongside dangling images.

---

## 7. Try it yourself

**Exercise.** Walk a container through its whole life and read the exit code that explains
how it died.

**Step 1 — start it and note the ID:**

```console
$ docker run -d --name exercise-app -p 3030:3000 --init docker-learn:1.0.0
```

**Step 2 — confirm it serves requests:**

```console
$ curl -s http://localhost:3030/health
```

**Hint.** Step 3 is where the lesson is.

**Step 3 — kill it hard and read the exit code:**

```console
$ docker kill exercise-app
$ docker inspect exercise-app --format 'exit={{.State.ExitCode}} oom={{.State.OOMKilled}}'
```

`exit=137 oom=false` — killed by signal 9, and *not* the OOM killer. `OOMKilled=false` is
the field that separates "I killed it" from "the kernel killed it for using too much
memory." Chapter 23 leans on that distinction.

**Step 4 — now do it politely and compare timings:**

```console
$ time docker stop exercise-app
$ docker inspect exercise-app --format 'exit={{.State.ExitCode}}'
```

Compare `exit=143` (clean `SIGTERM`, fast) against the `137` from step 3.

**Step 5 — and without `--init`, to see the trap:**

```console
$ docker run -d --name exercise-noinit -p 3031:3000 docker-learn:1.0.0
$ time docker stop exercise-noinit
$ docker rm exercise-noinit
```

That should take about 10 seconds and end in `137`, because the app is PID 1 and ignores
`SIGTERM`. Then start it again **with** `--init` and watch the difference. That is why
`--init` goes in your default flags.

**Step 6 — pause without stopping:**

```console
$ docker run -d --name exercise-pause -p 3032:3000 docker-learn:1.0.0
$ curl -s http://localhost:3032/health      # works
$ docker pause exercise-pause
$ curl -s --max-time 2 http://localhost:3032/health || echo "no response while paused"
$ docker unpause exercise-pause
$ curl -s http://localhost:3032/health      # works again
```

The app is still running and still holding its memory. It just stopped getting scheduled.

**Cleanup for this chapter** — only the three you created:

```console
$ docker rm -f exercise-app exercise-noinit exercise-pause ch04-demo
```

Safe because `docker rm` never touches images or volumes, and `-f` only affects the named
containers. Your `redis-learn`, `infra-redis-1` and `evalery-redis-1` containers are not in
that list and will be left alone.

---

## 8. Next

You can start, inspect and stop containers. Now you need to see what is happening inside
them — reading logs, getting a shell into a running process, and inspecting the full
configuration Docker recorded.

**[Chapter 05 — Logs and Exec](05-logs-and-exec.md)**