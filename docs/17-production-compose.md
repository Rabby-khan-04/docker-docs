# 17 — Production-Shaped Compose

> Verified on: Docker Engine **29.8.2**, Compose **v5.6.0**, BuildKit **v0.33.1**, Ubuntu 26.04.1 LTS, x86_64.

---

## 1. Simple explanation (like I'm 7)

You have been writing Compose files for development. In production, you need different settings:

- No bind mounts (so code changes don't auto-reload, and you get the real image you built).
- Real resource limits (so one container doesn't hog all the memory).
- Real restart policies (so the service comes back after a crash, but not after you manually stop it).
- Health checks (so `docker compose up --wait` knows when the app is ready).
- No development tools, no debug ports, no extra logging verbosity.

A **production-shaped Compose file** is one that has all of this baked in, so you can run
`docker compose up -d` and get a production-ready stack.

---

## 2. Real name

### The production Compose file

```yaml
services:
  api:
    build:
      context: .
      dockerfile: Dockerfile
    image: docker-learn:1.0.0
    container_name: dl-api
    init: true
    restart: unless-stopped
    ports:
      - "127.0.0.1:3000:3000"
    environment:
      APP_NAME: docker-learn
      APP_ENV: production
      PORT: "3000"
    networks:
      - appnet
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 10s
      timeout: 3s
      start_period: 5s
      retries: 3
    deploy:
      resources:
        limits:
          memory: 256M
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

  # A one-shot job: waits for the api to be healthy, then exits.
  smoke:
    image: alpine:3.24
    networks:
      - appnet
    depends_on:
      api:
        condition: service_healthy
    command: wget -qO- http://api:3000/health
    restart: "no"

networks:
  appnet:
    driver: bridge
```

Two things to notice:

1. **No `volumes:`** that bind-mount the host folder into the container. The image is built once
   and run immutably. This is the biggest difference from development Compose files.

2. **`restart: unless-stopped`** — the container will restart automatically after a crash, but not
   after a manual `docker compose stop`.

3. **Resource limits** under `deploy.resources.limits.memory` — the container cannot exceed 256 MB
   of memory. (On this Engine version, these are documented but have no enforcement effect; they
   are included for compatibility and future use, and you would use `--memory` on `docker run` for
   immediate enforcement.)

4. **Healthcheck** — Docker knows when the app is ready, and `docker compose up --wait` can wait for
   it.

### The development override (`compose.override.yaml`)

```yaml
services:
  api:
    ports:
      - "127.0.0.1:3080:3000"
    environment:
      APP_ENV: development
    command: ["node", "--watch", "server.js"]
    volumes:
      - .:/app
      - node_modules_keep:/app/node_modules
volumes:
  node_modules_keep:
```

This file is auto-loaded by `docker compose up` when it exists. It adds:

- Different port (3080 instead of 3000, so you can run both dev and prod simultaneously).
- `APP_ENV=development`.
- `node --watch server.js` for hot reload.
- Bind mounts: `.` (host source) into the container, and a named volume `node_modules_keep` that
  preserves the image's `node_modules` over the bind mount.

Run with both:

```console
$ docker compose up
```

Both the base file and the override are merged. The result is a development stack with live code
reload, and a production stack (without the override flags) that is immutable and limited.

---

## 3. Command example

### Production stack from scratch

```console
$ cd /home/sunny/app/nimo/docker-doc/docker-learn
$ docker compose up -d
```

```console
Creating docker-learn-api-1 ... done
```

```console
$ docker compose ps
NAME      IMAGE    COMMAND            SERVICE    CREATED         STATUS
dl-api    docker-learn:1.0.0   "docker-entrypoint.s…"   api       30 seconds ago   Up 30 seconds (healthy)
```

```console
$ curl -s http://localhost:3000/
{"name":"docker-learn","env":"production","container":"a6d5f3571ec5","pid":1,"uptimeSeconds":30}
```

```console
$ docker compose logs --tail 3 api
```

```console
$ docker compose down
```

Stops and removes the container(s) and the network. Named volumes (if any) are preserved; add `-v`
to remove them too.

### Verify the health status

```console
$ docker inspect dl-api --format '{{.State.Health.Status}}'
healthy
```

### Verify resource limits (shown by docker stats)

```console
$ docker stats --no-stream dl-api
```

```console
CONTAINER ID   NAME      CPU %     MEM USAGE / LIMIT   MEM %     NET I/O         BLOCK I/O   PIDS
...            dl-api    ...       ...                 256M      ...
```

### Verify the override (development) is not applied

```console
$ docker compose -f compose.yaml config 2>&1 | grep -E "APP_ENV|command|volumes"
```

Should show `APP_ENV: production`, no `command: --watch`, and no `volumes:`.

---

## 4. File example

Here is the complete `compose.yaml` from the roadmap, with the production shape applied.

```yaml
# compose.yaml — Production-shaped base Compose file.
# (Chapter 17). Extended by compose.override.yaml in dev mode.

services:
  api:
    build:
      context: .
      dockerfile: Dockerfile
    image: docker-learn:1.0.0
    container_name: dl-api
    init: true
    restart: unless-stopped
    ports:
      - "127.0.0.1:3000:3000"
    environment:
      APP_NAME: docker-learn
      APP_ENV: production
      PORT: "3000"
    networks:
      - appnet
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 10s
      timeout: 3s
      start_period: 5s
      retries: 3
    deploy:
      resources:
        limits:
          memory: 256M
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

  smoke:
    image: alpine:3.24
    networks:
      - appnet
    depends_on:
      api:
        condition: service_healthy
    command: wget -qO- http://api:3000/health
    restart: "no"

networks:
  appnet:
    driver: bridge
```

```yaml
# compose.override.yaml — Development overrides.
# (Auto-loaded by `docker compose up` when present.)

services:
  api:
    ports:
      - "127.0.0.1:3080:3000"
    environment:
      APP_ENV: development
    command: ["node", "--watch", "server.js"]
    volumes:
      - .:/app
      - node_modules_keep:/app/node_modules
volumes:
  node_modules_keep:
```

---

## 5. When to use a production-shaped Compose file

### Use it when

- **You are running in production** and want resource limits, restart policies, and health
  checks.
- **You have a development/production split.** The base file is production-shaped; the override
  file adds dev-only goodies (bind mounts, `--watch`, different env vars).
- **You want `docker compose up --wait`** to work so your CI/CD can depend on services being
  ready before proceeding.
- **You want `depends_on: condition: service_healthy`** to ensure dependent services start only
  after their prerequisites are healthy.

### Do not use production-shaped Compose when

- **You are developing locally** and need bind mounts for code reload. Use the override file
  instead, or run without the base file.
- **You are running a single container.** `docker run` is simpler.
- **You have no need for restart policies or health checks.** If your container is a short-lived
  job, you do not need `restart` or `HEALTHCHECK`.

---

## 6. Common mistakes

**1. `docker compose up` hangs forever waiting for healthcheck.**

The healthcheck may be misconfigured (timeout too short, check command wrong, app not actually
listening). Debug with `docker inspect container --format '{{.State.Health.Status}}'` and
`docker logs container`.

**2. `docker compose down -v` removing data volumes you meant to keep.**

`docker compose down` preserves named volumes. Add `-v` only if you want to remove them.

**3. Forgetting that `deploy.resources.limits` has no enforcement effect on plain Docker Engine.**

On this Engine version, memory and CPU limits under `deploy` are documented but not enforced.
Use `--memory` and `--cpus` on `docker run` for immediate enforcement, or accept that they are
documentation/future-compatibility.

**4. Publishing the same host port in two services.**

Two `ports:` entries with the same host port conflict. Use different host ports, or run services
on a user-defined network without publishing ports.

**5. Confusing `compose.override.yaml` with `compose.yaml`.**

The override is auto-loaded. If you do not want it, remove or rename the file, or use
`-f compose.yaml` to point to a different base file.

**6. Not realizing that `docker compose up` auto-loads `compose.override.yaml`.**

If you do not want the override, remove the file, rename it, or use `-f` to specify a different
base file.

**7. Expecting `environment` in the base file to be overridden by the override file's `environment`
always.**

The merge logic follows a specific order: base keys are kept unless the override redefines them.
If you want to ensure a key is always a particular value, put it in the base file without an
override that changes it.

**8. `docker compose down` removing volumes you meant to keep.**

`docker compose down` does not remove named volumes. Add `-v` only if you want to remove them.

**9. Confusing `ports:` with network reachability.**

`ports:` publishes ports to the host. If two containers need to talk to each other, use a
user-defined network and reach them by name, without publishing any ports.

**10. `docker compose up` succeeding but the app not being reachable.**

Check that the port mapping is correct (`docker compose ps`), the app is listening on the
internal port, and there are no firewall rules blocking the host port.

---

## 7. Try it yourself

**Exercise.** Run the production Compose file and verify health + limits.

**Step 1 — ensure the Dockerfile and compose files are in place:**

```bash
$ cd /home/sunny/app/nimo/docker-doc/docker-learn
```

```console
$ docker compose up -d
```

**Step 2 — verify the app is running and healthy:**

```console
$ docker compose ps
$ curl -s http://localhost:3000/health
```

```console
$ docker inspect dl-api --format '{{.State.Health.Status}}'
```

Should output `healthy`.

**Step 3 — verify resource limits with docker stats:**

```console
$ docker stats --no-stream dl-api
```

Should show `MEM USAGE / LIMIT` with 256M as the limit.

**Step 3 — verify the override is not applied (base file only):**

```console
$ docker compose -f compose.yaml config 2>&1 | grep -E "APP_ENV|command|volumes"
```

Should show `APP_ENV: production`, no `command`, and no `volumes`.

**Step 4 — now add the override and verify dev settings:**

```console
$ docker compose up
```

```console
$ docker compose -f compose.yaml config 2>&1 | grep -E "APP_ENV|command|volumes"
```

Should show `APP_ENV: development`, `command: ["node", "--watch", "server.js"]`, and
`volumes:`.

**Step 5 — clean up:**

```console
$ docker compose down
```

---

## 8. Next

You have a production-shaped Compose file with resource limits, restart policies, health
checks, and a development override. Next: registries — how to build an image, tag it, push it
to a registry, and pull it down on another machine.

**[Chapter 21 — Pushing to a Registry](21-pushing-to-a-registry.md)**