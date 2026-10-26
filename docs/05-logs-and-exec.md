# 05 — Logs and Exec

> Verified on: Docker Engine **29.8.2**, Compose **v5.6.0**, BuildKit **v0.33.1**, Ubuntu 26.04.1 LTS, x86_64.

---

## 1. Simple explanation (like I'm 7)

A person is running in a locked room. They can talk, but you cannot see in.

Docker gives you two ways to see inside.

**Logs** are like reading over their shoulder while they work. Your program prints
something, and `docker logs` shows it. If your program crashes, the last thing it printed
is usually the reason why. This is your number one debugging tool.

**Exec** is like asking to go into the room for a minute. You run a command *inside* the
running person — look at their files, check a setting, try something. They do not even
notice, and they carry on working.

The two are partners:

- Container will not start? → **logs**
- Container started but behaves oddly? → **exec**
- Container crashed? → **logs** first, always

---

## 2. Real name

**Log driver.** Docker does not decide where logs go. A *log driver* does. On your machine
it is `json-file`:

```console
$ docker info --format 'Logging Driver: {{.LoggingDriver}}'
json-file
```

Each container's output is written to a JSON file on the host:

```console
$ docker inspect ch04-demo --format '{{.LogPath}}'
/var/lib/docker/containers/d98559918f9c369e.../d98559918f9c369e...-json.log
```

That path is under `/var/lib/docker/`, which is root-only:

```console
$ ls /var/lib/docker/containers/d98559918f9c369e.../...-json.log
ls: cannot access ...: Permission denied
```

**Use `docker logs`, never read the file.** `docker logs` gets timestamps and stream
separation right, and it works with any log driver. Reading the raw file also gets the
deleting-container problem wrong: removing a container deletes its log file, so if you
deleted the container you needed, the logs are gone.

**The critical default.** Here is a container's log configuration on your machine:

```console
$ docker inspect ch04-demo --format '{{json .HostConfig.LogConfig}}'
{"Type":"json-file","Config":{}}
```

`Config` is **empty**. That means no `max-size` and no `max-file`. **Log files grow without
limit until the disk is full.** A chatty application left running for a month will fill a
disk. This is not a Docker bug; it is a default that is wrong for production. The fix is
three flags:

```console
$ docker run -d --name myapp --log-opt max-size=10m --log-opt max-file=3 ...
$ docker inspect myapp --format '{{json .HostConfig.LogConfig}}'
{"Type":"json-file","Config":{"max-file":"3","max-size":"10m"}}
```

That caps each container at roughly 30 MB. **Chapter 17** covers this properly, and it is
one of the highest-value three-flag habits in this course.

**`docker exec`** runs a new process inside a container's existing namespaces. It shares
the container's filesystem, network, environment and PID namespace. It does not restart
anything and it does not affect the main process except by consuming CPU and memory.

---

## 3. Command example

### Read the logs

```console
$ docker logs ch04-demo
[docker-learn] listening on http://0.0.0.0:3000 (env=production)
```

One line. That is the whole output of the app. **This is the most important line in this
chapter**, because it demonstrates the whole point: your program's `console.log` output
lands in `docker logs` automatically. You do not configure anything. You do not install
anything. You write to stdout and Docker captures it.

Flag by flag on `docker logs`:

| Flag | Meaning |
| :--- | :--- |
| `-f`, `--follow` | **Stream new output live**, like `tail -f`. Blocks your terminal until you Ctrl-C. |
| `--tail <n>` | Show only the last *n* lines. `--tail 0` shows none (wait, then stream). `--tail all` shows everything. |
| `--since <time>` | Only output newer than a timestamp. `5m`, `2h`, or an RFC3339 date. |
| `--until <time>` | Only output older than a timestamp. |
| `-t`, `--timestamps` | Prefix each line with an RFC3339 timestamp. **Turn this on whenever you are debugging timing.** |

`--tail` and `--timestamps` are the two you will use constantly:

```console
$ docker logs --tail 1 ch04-demo
[docker-learn] listening on http://0.0.0.0:3000 (env=production)

$ docker logs -t ch04-demo
2026-10-08T08:54:45.216049460Z [docker-learn] listening on http://0.0.0.0:3000 (env=production)
```

The `-t` timestamp comes from the log driver, not from your app. That means it keeps
working even if your app has no logging library and prints bare text. If your app logs its
own timestamps too, you get both — mildly redundant, but useful.

Live streaming, in a second terminal:

```console
$ docker logs -f --timestamps ch04-demo
```

**Gotcha with `--since` and timestamps:** `--since 2m` filters by the log driver's
recorded time, which is UTC. The `-t` display is also UTC. If you are comparing against a
local-time log line from another tool, you will be off by your timezone offset.

### Read logs from a stopped container

This works, and it matters:

```console
$ docker stop ch04-demo
$ docker logs ch04-demo
[docker-learn] listening on http://0.0.0.0:3000 (env=production)
```

Logs survive `docker stop`. They are only deleted by `docker rm`. **This is why you read
logs before you remove anything.**

### Get a shell inside a running container

```console
$ docker exec -it ch04-demo sh
```

| Flag | Meaning |
| :--- | :--- |
| `-i` | **Interactive.** Keep stdin open so you can type. |
| `-t` | **TTY.** Allocate a pseudo-terminal so the shell gets proper line editing and prompts. |
| `-d`, `--detach` | Run the exec in the background. Your command still runs, you just do not watch it. |
| `-u`, `--user` | Run as a specific user, e.g. `--user root`. Often the only way to fix a permission problem. |
| `-w`, `--workdir` | Override the working directory for this command. |
| `-e` | Set an environment variable for *this command only*. |
| `--privileged` | Give full host access. **Chapter 19.** Treat as a last resort. |

Inside, on your machine:

```console
$ whoami
node
$ cat /app/server.js | head -1
// The smallest useful Node.js HTTP server. No dependencies on purpose:
```

`whoami` returns `node`, not `root`. That is `USER node` from the Dockerfile. You are inside
a container and you are still not root. Chapter 19 is about why that is good.

**A detail worth understanding:** you did not get a shell on the *host*. You got a shell in
a namespace. `ls /` shows the container's filesystem, `ip addr` shows the container's
interfaces, `ps` shows only the container's processes. The `sh` you ran is a process *inside
the running container*, alongside `node server.js`.

### `exec` without a TTY

If you are in a script, or piping output, `-t` will fail:

```console
$ docker exec ch04-demo node -e "console.log('hello from inside')"
hello from inside
```

Works fine — no TTY needed for a plain command. Reserve `-it` for when you actually want an
interactive shell.

If you are in an environment without a real terminal (a CI log, some remote shells), `-it`
fails with:

```
cannot attach stdin to a TTY-enabled container because stdin is not a terminal
```

Drop the `t` and use `-i` alone when you are piping:

```console
$ echo "cat /etc/hostname" | docker exec -i ch04-demo sh
139c0161a364
```

That prints the container's hostname. The hostname is the first 12 characters of the
container ID, which is another handy trick for knowing which container you are inside.

### Detached exec

Useful for "kick off a long job inside the running container and keep working":

```console
$ docker exec -d ch04-demo sh -c 'sleep 30'
$ docker top ch04-demo
UID                 PID                 PPID                C   STIME               TTY                 TIME                CMD
sunny               165163              165137              0   15:06               ?                   00:00:00            /sbin/docker-init -- docker-entrypoint.sh node server.js
sunny               165220              165163              0   15:06               ?                   00:00:00            node server.js
sunny               166403              165137              33  15:08               ?                   00:00:00            sleep 30
```

`docker top` shows all three: the init process (PID 1, from `--init`), your app, and the
detached `sleep`. Useful for confirming an exec really started.

### You cannot exec into a stopped container

```console
$ docker exec ch05-stop echo hi
Error response from daemon: container 347a821e... is not running
```

`exec` needs a live process to join. For a stopped container you have two options:

**Option 1 — start it with a different command.** Override the entrypoint:

```console
$ docker run --rm -it --entrypoint sh docker-learn:1.0.0 -c 'head -3 /app/server.js'
// The smallest useful Node.js HTTP server. No dependencies on purpose:
// every Docker chapter uses this exact file so you only ever have to
```

`--entrypoint sh` replaces the image's entrypoint, and `-c` gives it something to do. This
is the single most useful trick in this chapter for poking at an image you cannot run
normally — no ports, no env vars, no application logic in the way.

**Option 2 — copy files out.**

```console
$ docker cp ch04-demo:/app/server.js /tmp/opencode/copied.js
$ head -2 /tmp/opencode/copied.js
// The smallest useful Node.js HTTP server. No dependencies on purpose:
```

`docker cp` works on **running and stopped** containers, in both directions:

```console
$ docker cp /tmp/opencode/copied.js ch04-demo:/tmp/copied-back.js
```

This is how you get a config file, a crash dump, or a certificate in or out without a shell.

### `inspect` — the full truth

`docker inspect` prints the complete JSON record Docker keeps. It is enormous. Do not read
it raw; pull out the fields you want with `--format` and Go templates.

```console
$ docker inspect ch04-demo --format '{{.State.Status}} / {{.State.Running}} / pid={{.State.Pid}}'
running / true / pid=165163

$ docker inspect ch04-demo --format 'Name: {{.Name}}'
Name: /ch04-demo

$ docker inspect ch04-demo --format 'Image: {{.Config.Image}}'
Image: docker-learn:1.0.0

$ docker inspect ch04-demo --format 'RestartCount: {{.RestartCount}}'
RestartCount: 0

$ docker inspect ch04-demo --format 'Started: {{.State.StartedAt}}'
Started: 2026-10-08T09:06:29.372383264Z
```

The `--format` syntax:

| Syntax | Meaning |
| :--- | :--- |
| `{{.Field}}` | One field |
| `{{.Parent.Child}}` | Nested field |
| `{{json .Field}}` | Render a whole structure as JSON |
| `{{range .Field}}{{println .}}{{end}}` | **Loop over a list, one line each.** |
| `{{index .Field 0}}` | First element of a list |

That last pair is what makes inspect genuinely useful. Environment variables, without the
noise:

```console
$ docker inspect ch04-demo --format '{{range .Config.Env}}{{println .}}{{end}}'
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
NODE_VERSION=22.23.3
YARN_VERSION=1.22.22
APP_NAME=docker-learn
APP_ENV=production
PORT=3000
```

Ports, as JSON:

```console
$ docker inspect ch04-demo --format '{{json .NetworkSettings.Ports}}'
{"3000/tcp":[{"HostIp":"0.0.0.0","HostPort":"3011"},{"HostIp":"::","HostPort":"3011"}]}
```

`HostIp: 0.0.0.0` means the port is open to your whole network, not just localhost. Chapter 07
shows the safer `127.0.0.1` binding.

For most questions, this one line answers it:

```console
$ docker inspect ch04-demo --format 'status={{.State.Status}} exit={{.State.ExitCode}} oom={{.State.OOMKilled}} restarts={{.RestartCount}} error={{.State.Error}}'
status=running exit=0 oom=false restarts=0 error=
```

Read it left to right when something is wrong: what state, what exit code, was it OOM-killed,
how many times has it restarted, and is there an error message. Chapter 23 is built on this
one command.

### `stats` — live resource usage

```console
$ docker stats --no-stream ch04-demo
CONTAINER ID   NAME        CPU %     MEM USAGE / LIMIT    MEM %     NET I/O         BLOCK I/O   PIDS
139c0161a364   ch04-demo   10.32%    9.582MiB / 15.5GiB   0.06%     2.37kB / 126B   0B / 0B     7
```

| Column | Meaning |
| :--- | :--- |
| `CPU %` | Share of one core. 100% = one core saturated. Can exceed 100% with multiple cores. |
| `MEM USAGE / LIMIT` | Memory in use, against the limit. **`15.5GiB` is the host total — no limit is set.** |
| `MEM %` | Percentage of the limit. |
| `NET I/O` | Bytes received / sent. |
| `BLOCK I/O` | Bytes read from / written to disk. |
| `PIDS` | Number of processes and threads. |

| Flag | Meaning |
| :--- | :--- |
| `--no-stream` | Print once and exit. **Always use this in scripts** — without it `docker stats` runs forever. |
| `-a` | Include stopped containers. |
| `--format` | Custom columns. |

Notice `MEM USAGE / LIMIT` showing `/ 15.5GiB`. That is not a Docker default limit; it is
your whole machine's RAM, because you set no limit. A runaway container would take the host
down before Docker intervened. Chapter 18 sets real limits.

`docker stats` without `--no-stream` streams live, which is what you want when watching a
server. Use `--no-stream` in every script and in docs.

### `top` — processes inside one container

```console
$ docker top ch04-demo
UID                 PID                 PPID                C   STIME               TTY                 TIME                CMD
sunny               165163              165137              0   15:06               ?                   00:00:00            /sbin/docker-init -- docker-entrypoint.sh node server.js
sunny               165220              165163              0   15:06               ?                   00:00:00            node server.js
```

Unlike `docker exec ... ps`, `docker top` works on a container with **no shell installed**,
because the host does the inspecting. That makes it the more robust choice for debugging
distroless or minimal images.

The full command line reads `/sbin/docker-init -- docker-entrypoint.sh node server.js`,
which shows all three layers at once: the init process from `--init`, the base image's
`docker-entrypoint.sh`, and our `CMD`. Chapter 10 explains why that middle layer matters.

### `diff` — what changed in the writable layer

```console
$ docker exec ch04-demo sh -c 'echo scratch > /tmp/scratch'
$ docker diff ch04-demo
C /tmp
A /tmp/scratch
C /sbin
A /sbin/docker-init
```

| Prefix | Meaning |
| :--- | :--- |
| `A` | **Added** |
| `C` | **Changed** |
| `D` | **Deleted** |

`A /tmp/scratch` is the file you just created — this is the container's writable layer, the
part that dies with the container. `A /sbin/docker-init` came from `--init`.

`docker diff` is how you find "where did that file go" and "what is writing to my disk".
It is also how you spot a container that is quietly accumulating data in a place it should
not be.

### `port` — what got published

```console
$ docker port ch04-demo
3000/tcp -> 0.0.0.0:3011
3000/tcp -> [::]:3011
```

`[::]` is IPv6. Two lines means the port is bound on both IPv4 and IPv6.

### `events` — the live activity feed

`docker events` streams every action the daemon performs. Capture it in one terminal, act in
another:

```console
$ docker events --filter container=ch04-demo
```

Real captured output from a `restart` and a `stop` on this machine:

```console
2026-10-08T14:56:57.418347178+06:00 container kill 139c0161a364 (image=docker-learn:1.0.0, name=ch04-demo, signal=15)
2026-10-08T14:57:07.434404158+06:00 container kill 139c0161a364 (image=docker-learn:1.0.0, name=ch04-demo, signal=9)
2026-10-08T14:57:07.535045851+06:00 container stop 139c0161a364 (image=docker-learn:1.0.0, name=ch04-demo)
2026-10-08T14:57:07.542455043+06:00 container die 139c0161a364 (execDuration=70, exitCode=137, image=docker-learn:1.0.0, name=ch04-demo)
2026-10-08T14:57:07.804712967+06:00 container start 139c0161a364 (image=docker-learn:1.0.0, name=ch04-demo)
2026-10-08T14:57:07.804738361+06:00 container restart 139c0161a364 (image=docker-learn:1.0.0, name=ch04-demo)
```

This output is worth reading closely, because it is chapter 04's whole argument in one place:

- `14:56:57` `kill ... signal=15` — `SIGTERM` sent.
- `14:57:07` `kill ... signal=9` — **ten seconds later**, `SIGKILL`. The app ignored
  `SIGTERM`.
- `die ... exitCode=137` — 128 + 9.
- `start` then `restart` — the whole sequence lasted 10.3 seconds.

With `--init`, the gap between signal 15 and signal 9 disappears, because the app handles
the signal. `events` makes that difference visible.

`--since 10m` to look back, `--until` to stop, `--filter` to narrow. Very useful for
answering "what happened at 3am" after the fact.

---

## 4. File example

The file that pairs with this chapter is a debugging script. Put this next to your project
as `debug-container.sh`:

```bash
#!/usr/bin/env bash
# Debugging a container that is misbehaving. Read-only: this script
# inspects, it never stops or removes anything.
#
# Usage: ./debug-container.sh myapp
set -uo pipefail

NAME="${1:?Usage: $0 <container-name>}"

echo "=============================================="
echo " 1. State: running? exit code? OOM-killed?    "
echo "=============================================="
# The single most informative line in all of Docker.
# Read left to right: what state, why did it exit, did the kernel
# kill it for memory, how many crashes, what error.
docker inspect "$NAME" --format \
  'status={{.State.Status}} exit={{.State.ExitCode}} oom={{.State.OOMKilled}} restarts={{.RestartCount}} error={{.State.Error}}'

echo
echo "=============================================="
echo " 2. Logs (last 50 lines, with timestamps)     "
echo "=============================================="
# --tail so a chatty app does not flood your terminal.
# -t because you are debugging and timing is often the clue.
docker logs --tail 50 -t "$NAME"

echo
echo "=============================================="
echo " 3. Processes inside the container            "
echo "=============================================="
# docker top, not `exec ps` -- works even with no shell in the image.
docker top "$NAME"

echo
echo "=============================================="
echo " 4. Resource usage right now                  "
echo "=============================================="
# --no-stream is mandatory in scripts, or this hangs forever.
docker stats --no-stream "$NAME"

echo
echo "=============================================="
echo " 5. Published ports                           "
echo "=============================================="
docker port "$NAME"

echo
echo "=============================================="
echo " 6. Environment (grep to filter)              "
echo "=============================================="
# `grep -i secret` here is a good habit: it shows you what config
# this container is actually running with, and reminds you that
# anything you put in env is readable by anyone with docker access.
docker inspect "$NAME" --format '{{range .Config.Env}}{{println .}}{{end}}'

echo
echo "=============================================="
echo " 7. Recent daemon events for this container    "
echo "=============================================="
docker events --since 5m --until 0s --filter "container=$NAME" \
  | tail -20
```

Make it executable:

```bash
$ chmod +x debug-container.sh
$ ./debug-container.sh ch04-demo
```

Section 6 is the one that catches people out: environment variables are readable by anyone
who can run `docker inspect`, which is anyone in the `docker` group or with the socket. That
is why secrets do not belong in plain environment variables — chapters 19 and 23.

---

## 5. When to use it and when NOT to

### Logs

| Use | When |
| :--- | :--- |
| `docker logs` | Always, first. Before anything else touches the container. |
| `--tail 50 -t` | Default habit. Keeps output readable and adds timing. |
| `-f` | Watching a problem live, or watching a deploy. |
| `--since 5m` | "It was fine five minutes ago." |
| A real logging driver | Anything beyond a single machine — `syslog`, `journald`, `gelf`, or a Docker log aggregator. Available on your machine: `docker info` lists `awslogs fluentd gcplogs gelf journald json-file local splunk syslog`. |

### Exec

| Use | When |
| :--- | :--- |
| `exec -it ... sh` | Interactive debugging a running container. |
| `exec` with no TTY | Scripts, one-off checks, automation. |
| `exec -u root` | Fixing a permissions problem — reading a root-owned log, changing a config. |
| `exec -d` | Kicking off a long job inside a running container. |
| `exec -w /some/dir` | Running a command somewhere other than the working directory. |

### Do not use exec for

- **Anything you need to survive.** `exec` changes are as ephemeral as the container. They
  vanish on restart. If it matters, it belongs in the image, a volume, or a config file —
  not typed into an exec.
- **Installing packages** to debug. `apk add curl` inside a live container fixes nothing
  permanently and hides the fact that your image is missing a tool. Put it in the Dockerfile.
- **As a substitute for logs.** If the app logs the problem, read the logs. If it does not,
  fix the app's logging — that is a real bug, and an exec shell is not a substitute.
- **On a stopped container.** It cannot work. Use `--entrypoint` on a fresh `docker run`, or
  `docker cp`.

### Do not use `inspect` for

- **Reading the raw JSON.** It is thousands of lines. Use `--format` every time, and commit
  the one-liners you use to a script so you stop re-typing them.
- **As a monitoring system.** Polling `docker inspect` is not monitoring. Chapter 20
  covers healthchecks; Prometheus and similar tools are what you want when this is a
  production concern.

### One caution about logs and secrets

Anything your app prints goes into the log file and is readable by anyone with Docker
access. Do not log tokens, passwords, full request bodies containing personal data, or
anything you would not paste into a public issue. This is not paranoia — it is the most
common way application secrets escape their intended boundaries.

---

## 6. Common mistakes

**1. `docker exec` into a container you have not confirmed is running.**

```console
$ docker exec myapp sh
Error response from daemon: container 347a821e... is not running
```

Check `docker ps` first, or just read the logs — a stopped container almost always means you
want `docker logs`, not a shell.

**2. Using `-it` when you do not need a TTY.** In scripts, in CI, or over a non-terminal
connection:

```
cannot attach stdin to a TTY-enabled container because stdin is not a terminal
```

Drop the `t`. Use `-i` if you are piping, neither if you are just running a command.

**3. Installing debug tools with exec and forgetting it is temporary.**

```console
$ docker exec -u root myapp apk add --no-cache curl    # gone on restart
```

Put the tool in the Dockerfile, or use a sidecar/debug image. Chapter 19.

**4. `docker stats` without `--no-stream` in a script.** It never exits. Your pipeline hangs
and you blame Docker. Add `--no-stream`.

**5. Reading `/var/lib/docker/.../xxx-json.log` directly.** Permission denied for a normal
user, no timestamp handling, breaks with a different log driver, and the file is deleted
when you delete the container — so you cannot debug the crash you just cleaned up.
Use `docker logs`.

**6. Forgetting that logs are unbounded by default.**

```console
$ docker inspect myapp --format '{{json .HostConfig.LogConfig}}'
{"Type":"json-file","Config":{}}
```

Empty `Config` means unlimited growth. On a long-running server this fills your disk. Add
`--log-opt max-size=10m --log-opt max-file=3`. Chapter 17.

**7. Assuming `docker logs` shows logs from before the container was recreated.** When
Compose recreates a container (`up` after a config change), the old container is deleted and
its logs go with it. If you need logs to survive, ship them somewhere else. Chapter 34.

**8. Expecting `docker exec ps aux` to work.** Minimal images often have no `ps` at all:

```console
Error response from daemon: exec: "ps": executable file not found in $PATH
```

Use `docker top` — it inspects from outside and needs nothing installed in the image.

**9. Assuming `docker exec` respects the container's entrypoint.** It does not. `exec`
bypasses `ENTRYPOINT` entirely and runs exactly the command you give. Good for debugging,
surprising if you expected the app's startup logic.

**10. Losing work because you deleted the container before reading the logs.** Order of
operations, always: `docker logs <name>` → then `docker rm`. There is no recovery for logs
of a removed container.

**11. `docker exec -it` as root in a container running as non-root and then being confused
why the fix disappeared.** It disappears because the container restarted. Put the fix in the
image.

**12. `docker diff` output scrolled past.** This is how you discover a container quietly
writing gigabytes into its writable layer — which is disk filling up for reasons chapter 22
would not reveal. Run `docker diff` when your disk usage surprises you.

---

## 7. Try it yourself

**Exercise.** Debug the sample app from inside a running container, then find out what it
changed and what it can see.

**Step 1 — start it and read its first log line:**

```console
$ docker run -d --name exercise-debug -p 3040:3000 --init docker-learn:1.0.0
$ docker logs -t exercise-debug
```

**Step 2 — confirm who you are inside:**

```console
$ docker exec exercise-debug whoami
$ docker exec exercise-debug id
```

`node`, `uid=1000(node)`. Not root. The `USER node` line from the Dockerfile is doing its
job.

**Hint.** Step 3 is the interesting one.

**Step 3 — prove the container cannot see your machine:**

```console
$ docker exec exercise-debug ps aux
PID   USER     TIME  COMMAND
    1 node      0:00 node server.js
    20 node      0:00 ps aux
$ docker exec exercise-debug ls /home/sunny
ls: /home/sunny: No such file or directory
```

The first shows only **two** processes: your app, and the `ps` you just ran. Your host is
running dozens right now, including three other containers. The second errors, because that
user does not exist inside the container. It has no idea what is on your host. That is the
PID and mount namespaces from chapter 01.

**Step 4 — make a change and watch `diff` catch it:**

```console
$ docker exec exercise-debug sh -c 'echo secret-note > /tmp/note.txt'
$ docker diff exercise-debug
```

`A /tmp/note.txt`. That file lives only in the container's writable layer and dies with
`docker rm`. This is exactly why chapter 07 exists.

**Step 5 — check your log configuration, and notice the gap:**

```console
$ docker inspect exercise-debug --format '{{json .HostConfig.LogConfig}}'
$ docker run --rm -d --name exercise-loglimit --log-opt max-size=10m --log-opt max-file=3 -p 3041:3000 docker-learn:1.0.0
$ docker inspect exercise-loglimit --format '{{json .HostConfig.LogConfig}}'
{"Type":"json-file","Config":{"max-file":"3","max-size":"10m"}}
```

The first is `{}` — unbounded. The second is capped. Take the second form seriously in
anything that runs longer than a demo.

**Step 6 — get into an image you cannot normally run:**

```console
$ docker run --rm --entrypoint sh docker-learn:1.0.0 -c 'ls -la /app; cat /etc/os-release | head -2'
```

No `-it` needed for a one-shot command. This is how you explore any image, including ones
whose app you cannot start.

**Step 7 — look at the whole picture in one shot:**

```console
$ docker inspect exercise-debug --format 'status={{.State.Status}} exit={{.State.ExitCode}} oom={{.State.OOMKilled}} restarts={{.RestartCount}}'
$ docker stats --no-stream exercise-debug
$ docker port exercise-debug
```

This is the whole of chapter 23 in three commands. Save them somewhere.

**Cleanup for this chapter:**

```console
$ docker rm -f exercise-debug exercise-loglimit ch04-demo
```

`docker rm` removes only these named containers. Your `redis-learn`, `infra-redis-1` and
`evalery-redis-1` containers are not in that list and will be untouched.

---

## 8. Next

You can see inside containers. Next: configuration — how environment variables actually get
into a container, why they beat hardcoded values, and why they are not a safe place for
secrets.

**[Chapter 06 — Environment Variables](06-environment-variables.md)**