# 15 — Compose Basics

> Verified on: Docker Engine **29.8.2**, Compose **v5.6.0**, BuildKit **v0.33.1**, Ubuntu 26.04.1 LTS, x86_64.

---

## 1. Simple explanation (like I'm 7)

You have several containers. One runs a database, one runs your web app, one runs Redis for
caching. Without Compose, you have to type a different `docker run` command for each one,
remember all the port numbers, and figure out how they talk to each other.

**Docker Compose** is a way to describe all your containers in a single file. Then, with one
command, you create and start all of them. And when you are done, one command stops and removes
them all.

It is like a script for your containers.

---

## 2. Real name

### `compose.yaml` — the Compose file

The Compose file is a **YAML** file named `compose.yaml` (or `docker-compose.yaml` for the old
version). It describes:

- **services** — individual containers and their configuration.
- **networks** — how containers reach each other.
- **volumes** — persistent data that survives container restarts.
- **profiles** — optional groupings of services.

The file format is the **Compose Specification** (v1.27.0 and newer), merged from the old
`version 2.x` and `version 3.x` formats. The top-level `version:` key is **obsolete** — modern
Compose ignores it and warns about it if present.

### `docker compose` — the CLI command

The Compose CLI is the program you type. Its binary is `docker compose` (with a space, not a
hyphen). The old `docker-compose` binary is **deprecated** and does not exist on this machine:

```console
$ docker-compose version
bash: docker-compose: command not found
```

Always `docker compose` with a space.

### Project name

Every Compose creation gets a **project name**. It is derived from the directory name where
`docker compose` is run. If your folder is `docker-learn`, the project name is `docker-learn`.

All containers, networks, and volumes get names like `docker-learn-api-1`. This is why two
Compose projects can run on one machine without colliding — they have different project names.

You can override with `-p` or `--project-name`:

```console
$ docker compose -p myproject up
```

### `docker compose` — the most used commands

| Command | What it does |
| :--- | :--- |
| `up` | Create and start services. |
| `down` | Stop and remove services, networks, and volumes. |
| `ps` | List running services. |
| `logs` | View output from services. |
| `config` | Validate and print the resolved Compose configuration. |
| `exec` | Run a command in a running service. |
| `pull` | Pull service images. |
| `build` | Build or rebuild service images. |

### `docker compose config` — validate and inspect

```console
$ docker compose config --quiet && echo "VALID"
```

Checks that the Compose file is syntactically valid and all referenced images and networks are
available. Exit code 0 means valid, non-zero means errors.

```console
$ docker compose config --services
api
worker
db
```

Prints the service names defined in the file.

```console
$ docker compose config --images
myimage:1.0.0 redis:7-alpine
```

Prints the image names used by the services.

---

## 3. Command example

### The simplest possible Compose file

```yaml
services:
  api:
    image: docker-learn:1.0.0
    command: ["node", "server.js"]
```

Run it:

```console
$ cd /home/sunny/app/nimo/docker-doc/docker-learn
$ docker compose up
```

Output:

```console
Creating docker-learn-api-1 ... done
```

The container starts and runs forever (it is a server). To stop it:

```console
$ docker compose down
```

Stopping and removing `docker-learn-api-1` ...

### Compose with ports and environment

```yaml
services:
  api:
    build: .
    ports:
      - "127.0.0.1:3000:3000"
    environment:
      APP_ENV: production
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 10s
      timeout: 3s
      start_period: 5s
      retries: 3
```

Build and run:

```console
$ docker compose up -d
```

`-d` runs in detached mode (background). The app is reachable at `http://localhost:3000`.

### `docker compose` with depends_on

```yaml
services:
  api:
    build: .
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
  worker:
    image: alpine:3.24
    depends_on:
      api:
        condition: service_healthy
    command: sh -c "echo waiting for api; sleep 60"
```

The `worker` service will not start until `api` reports `healthy`. Without `condition: service_healthy`,
`depends_on` only checks that the container is running, not that it is healthy.

### `docker compose` with volumes

```yaml
services:
  db:
    image: postgres:17-alpine
    volumes:
      - pgdata:/var/lib/postgresql/data
    environment:
      POSTGRES_PASSWORD: secret
      POSTGRES_USER: learn
      POSTGRES_DB: learndb
  api:
    build: .
    depends_on:
      db:
        condition: service_healthy
    environment:
      DATABASE_URL: postgresql://learn:secret@db:5432/learndb
volumes:
  pgdata:
```

The `pgdata` volume persists the PostgreSQL data. If you `docker compose down` **without** `-v`,
the volume is preserved. With `-v`, it is removed.

---

## 4. File example

Here is the `compose.yaml` from the roadmap, with the complete service definitions used
throughout this chapter.

```yaml
# compose.yaml — Base Compose file for chapters 15-17.
# Extended by compose.override.yaml in dev mode.
# NOTE: no top-level `version:` key. It is obsolete in the Compose Specification
# and modern Compose warns about it if present.

services:
  # The API server. Built from the local Dockerfile.
  api:
    build:
      context: .
      dockerfile: Dockerfile
    image: docker-learn:1.0.0
    container_name: dl-api
    init: true
    restart: unless-stopped
    ports:
      - "127.0.0.1:3080:3000"
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
      retries: 3
      start_period: 5s
    deploy:
      resources:
        limits:
          memory: 256M
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

  # A one-shot job: waits for the api to be healthy, then checks it once.
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
  # Compose creates this automatically and removes it on `compose down`.
  appnet:
    driver: bridge
```

### Why no `version:` key?

```console
$ docker compose -f /tmp/opencode/ver.yaml config 2>&1 | head -8
time="2026-10-08T16:05:41+06:00" level=warning msg="/tmp/opencode/ver.yaml: the attribute `version` is obsolete, it will be ignored, please remove it to avoid potential confusion"
```

The `version:` key is ignored by the Compose Specification. Always write Compose files without it.

---

## 5. When to use Compose and when NOT to

### Use Compose when

- **You have two or more containers** that need to share a network, volumes, or restart policies.
- **You want a single `docker compose up`** to create everything, and `docker compose down` to
  tear it all down.
- **You want `depends_on: condition: service_healthy`** to coordinate service startup order.
- **You want Compose's volume management** (named volumes, bind mounts with `volumes:`).
- **You are running in development or staging.** Compose is the fastest way to get a full stack
  running locally.

### Do not use Compose when

- **You have a single container.** `docker run` is simpler.
- **You need fine-grained orchestration** ( scaling, self-health, service discovery). Compose
  runs on a single machine. For multi-host orchestration, use Swarm or Kubernetes (chapter 26).
- **You want to describe the system in code that can be versioned and reviewed.** Compose files
  are YAML and can be committed to git, which is the standard practice.
- **You are running in production on a cluster.** Use Docker Swarm or Kubernetes. Compose is
  for single-machine setups.

---

## 6. Common mistakes

**1. Using `docker-compose` (hyphen) instead of `docker compose` (space).**

```console
$ docker-compose up
bash: docker-compose: command not found
```

The old binary is deprecated. Always `docker compose` with a space.

**2. Forgetting the `version:` key is obsolete.**

```console
$ docker compose -f file.yaml config
time="2026-... level=warning msg="the attribute `version` is obsolete"
```

Remove the key. The Compose Specification does not use it.

**3. `depends_on` without `condition: service_healthy`.**

```yaml
depends_on:
  api:
```

This only checks that the container is **running**, not that it is **healthy**. If the app
crashes immediately, the dependent service will start anyway. Always use
`condition: service_healthy` when healthchecks are configured.

**4. Publishing the same port in two services.**

```yaml
ports:
  - "3000:3000"   # api service
  - "3000:3000"   # worker service  ← port conflict!
```

Two containers cannot bind the same host port. Use different host ports, or use a user-defined
network and reach containers by name without publishing any ports.

**5. Forgetting that `docker compose down` preserves named volumes unless `-v` is added.**

```console
$ docker compose down
# pgdata volume is kept. Data survives.
$ docker compose down -v
# pgdata volume is removed. Data is lost.
```

**6. Building with `docker compose build` and then `docker compose up` again.**

`docker compose up` automatically builds if the image is not present. Running `docker compose
build` first and then `up` is redundant and may produce unexpected results if the build changes
the context between the two commands.

**7. Using `docker compose run` without a service name.**

```console
$ docker compose run
```

You must specify a service name: `docker compose run --rm api echo hello`.

**8. Expecting environment variables in `docker-compose.yml` to be expanded by the shell.**

Compose does its own variable interpolation using `.env` files. Shell variable expansion does
not happen in the Compose file itself. Use `.env` files for external configuration (chapter 33).

**9. `docker compose cp` copying from the wrong container.**

`docker compose cp` copies from the default service (the first one in the file) unless you
specify `compose cp <service>:<path> <dest>`.

**10. `docker compose down` removing anonymous volumes you meant to keep.**

`docker compose down` does not touch named volumes. But `docker compose down -v` removes both
named and anonymous volumes. Be careful with the `-v` flag.

---

## 7. Try it yourself

**Exercise.** Run a two-service Compose file and verify `depends_on: condition: service_healthy`.

**Step 1 — create the Compose file:**

```bash
$ cd /home/sunny/app/nimo/docker-doc/docker-learn
```

```yaml
services:
  api:
    build: .
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 5s
      timeout: 3s
      start_period: 2s
      retries: 3
  worker:
    image: alpine:3.24
    depends_on:
      api:
        condition: service_healthy
    command: sh -c "echo api is healthy; sleep 60"
```

**Step 2 — start the services:**

```console
$ docker compose up -d
```

```console
Creating docker-learn-api-1 ... done
Creating docker-learn-worker-1 ... done
```

The worker should not start immediately; it waits for the api to be healthy.

**Step 3 — check the status:**

```console
$ docker compose ps
```

```console
NAME            IMAGE     COMMAND                  SERVICE    CREATED          STATUS
dl-worker-1     alpine:3.24   "sh -c echo api is healthy   worker     0 seconds ago   Waiting (healthy deadline ...)
dl-api-1        docker-learn:1.0.0   "docker-entrypoint.s…"   api        0 seconds ago   Up 2 seconds (healthy)
```

The worker is `Waiting` because it is waiting for the api to become healthy.

**Step 4 — wait for health, then verify the worker proceeds:**

```console
$ sleep 8
$ docker compose ps
```

The worker should now be `Up` and have executed its command.

**Step 5 — clean up:**

```console
$ docker compose down
```

---

## 8. Next

You can define multi-container applications in a single file. Next: production-shaped Compose
files with restart policies, resource limits, and separate development/production configurations.

**[Chapter 16 — Compose Advanced](16-compose-advanced.md)**