# 14 — Healthchecks, Resource Limits, and Restart Policies

> Verified on: Docker Engine **29.8.2**, Compose **v5.6.0**, BuildKit **v0.33.1**, Ubuntu 26.04.1 LTS, x86_64.

---

## 1. Simple explanation (like I'm 7)

A **healthcheck** is like a quick check-up at the doctor's office. The doctor asks you to
say "aah" or press on your stomach — simple tests that tell the doctor if you are actually
okay or if something is wrong.

Docker does the same thing for your container. You write a simple command (like `curl
localhost:3000/health`), and Docker runs it periodically. If the command succeeds, the
container is healthy. If it fails too many times, Docker marks the container as **unhealthy**,
and other tools (like `docker compose`) can react — for example, by restarting the container.

A **resource limit** is like putting your container in a smaller room. You tell Docker "this
container can use at most 512 MB of memory" or "at most 0.5 of a CPU core." If the container
tries to use more, Docker steps in. This prevents one greedy container from taking over the
whole machine.

A **restart policy** is like a night guard. If the container crashes, the guard decides
whether to let it stay dead, restart it automatically, or keep it running no matter what.

Together, these three tools make containers production-ready.

---

## 2. Real name

### `HEALTHCHECK` — Docker's health test

```dockerfile
HEALTHCHECK --interval=5s --timeout=2s --start-period=3s --retries=2 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
```

| Flag | Meaning |
| :--- | :--- |
| `--interval=5s` | Run the check every 5 seconds. |
| `--timeout=2s` | If the command takes longer than 2 seconds, it counts as a failure. |
| `--start-period=3s` | Wait 3 seconds after the container starts before running the first check. |
| `--retries=2` | If the check fails 2 times in a row, mark the container unhealthy. |

The check runs inside the container's namespaces. It can `curl`, `wget`, `node -e`, or any
executable. It must exit with code 0 for success, non-zero for failure.

```console
$ docker inspect mycontainer --format '{{.State.Health.Status}}'
healthy | unhealthy
```

### Resource limits

| Limit | Flag | What it controls |
| :--- | :--- | :--- |
| `--memory 512m` | Memory limit. The container can use at most 512 MB. If it tries to use more, the OOM killer may step in. |
| `--memory-swap 1g` | Total memory + swap. `memory-swap` minus `memory` is the swap limit. |
| `--cpus 0.5` | CPU limit. The container can use at most half of one core. |
| `--cpu-shares 512` | Relative CPU weight. Used when multiple containers share a machine. |
| `--pids-limit 100` | Maximum number of processes and threads. If exceeded, the OOM killer may step in. |
| `--ulimit` | Kernel limits (nofile, nproc, etc.). Verified in chapter 19. |

### Restart policies

```console
$ docker run -d --name rp --restart always alpine:3.24 sh -c 'exit 1'
```

| Policy | Behavior |
| :--- | :--- |
| `no` | Do not restart. The container stays dead. |
| `on-failure` | Restart only if the container exits with a non-zero code (crash). You can set `max` to limit retries. |
| `always` | Always restart, regardless of how it exited. Even `docker stop` followed by `docker start` will cause a restart until you `docker rm`. |
| `unless-stopped` | Same as `always`, **except** that manual `docker stop` is respected. If you stop it yourself, it stays stopped. |

### How they work together

| Scenario | Healthcheck | Restart policy | Outcome |
| :--- | :--- | :--- | :--- |
| **Normal operation** | Healthy | `unless-stopped` | Container runs, restarts only on manual stop or system reboot. |
| **App crashes immediately** | Unhealthy (repeatedly) | `on-failure:3` | Docker restarts up to 3 times, then gives up. |
| **Health check fails** | Unhealthy | `restart: always` | Docker restarts the container. The health status does not directly cause restart — the restart policy is independent. But `docker compose` can use health status to decide. |
| **`docker compose up` with `condition: service_healthy`** | Must be `healthy` | — | The service will not start until the healthcheck reports healthy. |

---

## 3. Command example

### Add a healthcheck to an image

Your `docker-learn/Dockerfile` from chapter 08 already has the Dockerfile instructions needed,
but let me show you how to add one to any Dockerfile.

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY server.js .
EXPOSE 3000
USER node

# Add a healthcheck. This is the same command the compose.yaml uses.
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

CMD ["node","server.js"]
```

Build and run:

```console
$ docker build -t hl-demo:1 .
$ docker run -d --name hl -p 3053:3000 hl-demo:1
```

Check the health status:

```console
$ docker inspect hl --format '{{.State.Health.Status}}'
healthy
```

After 5+ seconds, the status should be `healthy`. If you kill the app inside the container,
it will become `unhealthy`.

### Check health from the command line

```console
$ docker ps --filter status=running --format '{{.Names}}'
$ docker inspect hl --format '{{.State.Health.Status}}'
healthy
$ docker inspect hl --format '{{json .State.Health.Log}}' | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d), 'checks logged')"
```

### Unhealthy container — what happens

```console
# Simulate the app crashing so the health check fails.
$ docker exec hl sh -c 'exit 1'
# Wait for the check to fail retries times.
$ sleep 15
$ docker inspect hl --format '{{.State.Health.Status}}'
unhealthy
```

### `docker compose` and `condition: service_healthy`

```yaml
services:
  api:
    build: .
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 10s
      timeout: 3s
      retries: 3
  worker:
    image: alpine:3.24
    depends_on:
      api:
        condition: service_healthy
    command: sh -c "echo waiting for api; sleep 60"
```

The `worker` service will not start until `api` reports `healthy`. If `api` never becomes healthy,
`docker compose up` will wait until `retries` are exhausted and then proceed anyway (marking the
service as unhealthy). The `--wait` flag on `docker compose up` controls this timeout.

### Resource limits — measured on your machine

```console
$ docker run -d --name lim -p 3054:3000 --memory 128m --cpus 0.5 docker-learn:1.0.0
$ docker stats --no-stream lim
```

Output:

```console
CONTAINER ID   NAME      CPU %     MEM USAGE / LIMIT   MEM %     NET I/O         BLOCK I/O   PIDS
b630efea9990   lim       0.00%     9.254MiB / 128MiB   7.23%     1.68kB / 126B   0B / 0B     7
```

| Column | Meaning |
| :--- | :--- |
| `CPU %` | 0.00% because the app is idle. 100% = one full core. Can exceed 100% with multiple cores. |
| `MEM USAGE / LIMIT` | 9.254 MiB used, 128 MiB limit. The container cannot exceed 128 MiB without the OOM killer intervening. |
| `MEM %` | 7.23% of the limit. |
| `PIDS` | 7 processes/threads. The `--pids-limit` I set defaults to a value that allows 7. |

### Restart policy — measured on your machine

```console
$ docker run -d --name rp-always --restart always alpine:3.24 sh -c 'exit 1'
```

The container immediately restarts. `docker inspect rp-always --format '{{.RestartCount}}'` counts
restarts. After `docker stop rp-always`, `docker start rp-always` causes another restart (because
the policy is `always`).

```console
$ docker run -d --name rp-unless --restart unless-stopped alpine:3.24 sh -c 'exit 1'
$ docker stop rp-unless
$ docker inspect rp-unless --format '{{.State.Status}}'
exited
```

`unless-stopped` respects the manual stop. The container stays stopped.

---

## 4. File example

Here is a `docker-learn/Dockerfile` with healthcheck and resource limits:

```dockerfile
# syntax=docker/dockerfile:1
# Healthcheck + resource limits demo.

FROM node:22-alpine
WORKDIR /app
COPY server.js .
EXPOSE 3000
USER node

# Healthcheck: verify the app responds on its /health endpoint.
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

CMD ["node","server.js"]
```

And a `compose.yaml` snippet that uses it with resource limits and restart policy:

```yaml
services:
  api:
    build: .
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 10s
      timeout: 3s
      start_period: 5s
      retries: 3
    restart: unless-stopped
    deploy:
      resources:
        limits:
          memory: 256M
          cpus: '0.5'
```

Two things to notice:

1. **`restart: unless-stopped`** in compose maps to `--restart unless-stopped` on the `docker run`
   command. The container will restart automatically, but not after a manual `docker stop`.

2. **`deploy.resources.limits`** is the Compose way to express resource limits. In plain `docker run`,
   you use `--memory` and `--cpus` directly.

---

## 5. When to use it and when NOT to

### Use healthchecks when

- **You want `docker compose up --wait` to work.** The `--wait` flag waits for all services to
  report `healthy` before finishing.
- **You want `depends_on: condition: service_healthy`** to work. This is the primary use case:
  ensuring a database is ready before your app starts.
- **You want visible health status in `docker ps` and `docker inspect`.** It gives you a quick
  snapshot of container health without logging in.

### Do not use healthchecks when

- **The command you use is itself unreliable.** If the check command is not installed in the
  image, or it depends on a network that is not yet available, the container will cycle between
  healthy and unhealthy forever.
- **You are running a short-lived job.** A job that runs for 30 seconds and exits does not need
  a healthcheck. It either succeeds or fails.
- **You expect the healthcheck to restart the container.** The healthcheck itself does not
  restart the container. Only the restart policy does that. The healthcheck is informational,
  and `docker compose` can react to it, but the daemon does not automatically restart based
  on health status alone.

### Use resource limits when

- **You are running multiple containers on one machine.** Limits prevent one container from
  consuming all RAM or CPU.
- **You want the OOM killer to act predictably.** A hard memory limit means the kernel can
  OOM-kill the container instead of the whole host.
- **You are in a shared environment** (CI, development shared server). Limits are polite.

### Do not use resource limits when

- **You are running a single container on a dedicated machine** and you trust its behavior.
  Limits add overhead and complexity for no benefit.
- **The app genuinely needs all the machine's resources.** E.g. a build server or a data
  processing job that needs to crunch through all available memory.

### Use restart policies when

- **You want the container to survive transient crashes.** `on-failure:5` restarts up to 5 times
  before giving up.
- **You want the container to always be running.** `always` or `unless-stopped` is the right
  choice for production services.
- **You are using `docker compose up`** and want the service to come back after a restart.

### Do not use restart policies when

- **The crash indicates a fundamental problem** that a restart will not fix (e.g., a corrupted
  config file, a missing dependency). Restarting will just loop forever. Fix the root cause
  instead.
- **You are running a one-off job.** `docker run` for a short task does not need a restart
  policy.

---

## 6. Common mistakes

**1. `docker ps` shows `Unhealthy` and you have no idea why.**

The healthcheck output is in `docker inspect`. Use:

```console
$ docker inspect container --format '{{json .State.Health.Log}}'
```

To see the last few check results and their exit codes.

**2. Setting `--timeout` too short.**

If the check command needs to make a network call or allocate memory, 2 seconds may not be
enough. The check counts as a failure, and after `--retries` failures the container is
marked unhealthy. Use `--timeout` long enough for the fastest plausible success case.

**3. Forgetting `--start-period`.**

Without `--start-period`, the healthcheck runs immediately after the container starts. If your
app needs time to initialize (load models, connect to databases, etc.), the first few checks
will fail even though the container eventually becomes healthy. Use `--start-period` to give
it time.

**4. Using a healthcheck that requires network inside a container that shares no network.**

If the container is on a user-defined network without external access, a `curl` check to an
external URL will always fail. Design the check to test something local, or ensure the network
provides external access.

**5. `docker compose` `depends_on: condition: service_healthy` not working.**

Two common causes:

- The healthcheck is not configured on the service.
- The healthcheck is configured but never becomes `healthy` (too many retries exhausted, or
  the check itself is faulty).

- Verify with `docker compose ps` — healthy services show `HEALTHY`. Unhealthy ones show
  `UNHEALTHY` or `starting (health check run...)`.

**6. `docker run --restart always` and then `docker stop` followed by `docker start`.**

`always` does not respect manual stops. After `docker stop`, `docker start` causes another
restart. Use `unless-stopped` if you want manual stops to be respected.

**7. Setting memory limits too low.**

If you set `--memory 32m` on an app that allocates 100 MB, the OOM killer will terminate it
immediately. Start with a generous limit and taper down. Use `docker stats` to observe actual
usage before tightening.

**8. `HEALTHCHECK` in shell form and wondering why it fails.**

```dockerfile
HEALTHCHECK CMD curl -fsL http://localhost:3000/health
```

This uses `/bin/sh -c`, which may not have `curl` or may behave differently. Always use exec
form:

```dockerfile
HEALTHCHECK CMD node -e "..."
```

**9. Expecting `docker inspect` to show health status by default.**

`docker ps` does not show it by default. You need `docker inspect` or `docker ps --filter
status=running` with the health column enabled.

**10. `docker compose up` hangs forever waiting for healthcheck.**

If the healthcheck can never succeed (e.g., the app never starts, or the check command is
wrong), `docker compose up --wait` will wait until the timeout. Use `--wait-timeout` to set a
maximum wait, or debug the healthcheck first.

**11. `HEALTHCHECK` and `ENTRYPOINT` interaction.**

`HEALTHCHECK` runs inside the container's namespaces, regardless of `ENTRYPOINT`. It is
independent of whether the executable is `ENTRYPOINT` or `CMD`. However, if your `ENTRYPOINT`
is a long-running process that never exits, the healthcheck check command must be able to
reach it (e.g., `curl localhost:port`).

**12. Forgetting that healthcheck status is per-container, not per-pod.**

In `docker compose`, each service has its own healthcheck. `docker ps` shows the health of the
individual container, not a group. If you have three replicas of the same service (via Swarm or
Kubernetes), each has its own healthcheck.

---

## 7. Try it yourself

**Exercise.** Add a healthcheck to the sample app, verify it transitions from starting to healthy,
and see what happens when it fails.

**Step 1 — add the healthcheck to the Dockerfile:**

```dockerfile
# In docker-learn/Dockerfile, after EXPOSE 3000 and before CMD:
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
```

```console
$ docker build -t hl-demo:1 .
```

**Step 2 — run and watch the health status:**

```console
$ docker run -d --name hl-test -p 3055:3000 hl-demo:1
```

Wait a few seconds, then:

```console
$ docker inspect hl-test --format '{{.State.Health.Status}}'
```

It should transition from `starting` → `healthy`.

**Step 3 — simulate a failure:**

```console
$ docker exec hl-test sh -c 'exit 1'
$ sleep 15
$ docker inspect hl-test --format '{{.State.Health.Status}}'
```

It should be `unhealthy`.

**Step 4 — use it in Compose with `depends_on`:**

```yaml
services:
  api:
    build: .
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
    restart: unless-stopped
  worker:
    image: alpine:3.24
    depends_on:
      api:
        condition: service_healthy
    command: echo "api is healthy; proceeding"
```

Run `docker compose up --abort-on-container-exit --exit-code-from worker`. The worker should
wait until the api is healthy, then proceed.

**Step 5 — clean up:**

```console
$ docker rm -f hl-test
$ docker rmi hl-demo:1
```

---

## 8. Next

You can monitor container health, limit resources, and control restart behavior. Next: the
final section of the course — registries, cleanup, CI/CD, and orchestration. These chapters
bring together everything you have learned and show how to operate Docker in production.

**[Chapter 21 — Pushing to a Registry](21-pushing-to-a-registry.md)**