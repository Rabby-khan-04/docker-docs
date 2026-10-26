# 16 — Compose Advanced

> Verified on: Docker Engine **29.8.2**, Compose **v5.6.0**, BuildKit **v0.33.1**, Ubuntu 26.04.1 LTS, x86_64.

---

## 1. Simple explanation (like I'm 7)

You have seen the basic Compose file. But real-world applications need more: environment-specific
config, health-based startup order, secret management, and the ability to run different sets of
services depending on whether you are in dev or production.

**Compose advanced** covers all of these. You will learn how to make Compose work for both
development and production with separate files, how to pass secrets and environment variables
securely, and how to make services wait for each other using health checks.

---

## 2. Real name

### `.env` files and environment variable interpolation

Compose supports an `.env` file that contains `KEY=VALUE` pairs. These variables are available
in the Compose file. The syntax is:

```env
# .env
APP_ENV=development
DB_HOST=db
DB_PORT=5432
```

In the Compose file:

```yaml
services:
  api:
    environment:
      - APP_ENV
      - DB_HOST
      - DB_PORT
```

The variable names are used without the `$` prefix or `${}` wrapper — Compose interprets them
directly.

### Variable interpolation and `$` escaping

You can use variables inside other variable values:

```env
# .env
POSTGRES_USER=dbuser
POSTGRES_PASSWORD=secret
```

```yaml
services:
  db:
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
```

The `${VAR}` syntax is replaced at Compose load time. **Important:** Docker's `--env-file` does
**not** strip quotes, unlike some Compose `.env` handling. Write bare values in `.env` files.

### Variable precedence (lowest to highest)

1. **Default values** in the Dockerfile `ENV` instruction.
2. **`environment:`** key in the service definition.
3. **`environment_file:`** in the service definition.
4. **`.env` file** in the compose project directory.
5. **`-e`** flag on the `docker compose up` command line.
6. **`-e`** flag on the `docker run` command line (not compose).

Later sources **override** earlier ones. So `-e APP_ENV=production` after `.env: APP_ENV=dev`
results in `APP_ENV=production`.

### `env_file` vs `environment`

| Source | Syntax | Interpolation | Precedence |
| :--- | :--- | :--- | :--- |
| `environment:` | `KEY: VALUE` inline | Yes (`${VAR}`) | Lowest (overridden by `-e`) |
| `environment_file:` | Path to `.env` file | Yes (`${VAR}`) | Medium |
| `-e KEY=VALUE` | Command line | No (literal) | Highest |
| `.env` file | Same as `-e` but in a file | Yes (`${VAR}`) | Medium |
| `docker run -e` | Command line | No (literal) | Highest (outside compose) |

### Profiles — enabling/disabling service groups

```yaml
services:
  api:
    build: .
    profiles: ["api"]   # this service is in the "api" profile
  db:
    build: .
    profiles: ["db", "monitoring"]  # in both profiles
  debug:
    image: alpine:3.24
    profiles: ["debug"]  # only enabled with --profile debug
  stats:
    image: nicolaka/netshoot:latest
    profiles: []  # not in any profile (always running)

networks:
  appnet: {}

volumes: {}
```

Enable profiles:

```console
$ docker compose --profile api up
# Runs only the api service.

$ docker compose --profile api --profile monitoring up
# Runs api + db + monitoring services.

$ docker compose up
# Runs all services (default profile includes everything).
```

### Deploy — resource limits and replica control

`deploy` is primarily used with Swarm, but some fields are acknowledged by Compose on plain
Docker Engine:

```yaml
services:
  api:
    deploy:
      resources:
        limits:
          memory: 256M
          cpus: '0.5'
```

On plain Docker Engine, these are documented but have no enforcement effect (unlike Swarm).
They are included for compatibility and future use.

### Extending and overriding — `compose.override.yaml`

You can have a base `compose.yaml` and an override file `compose.override.yaml` in the same
directory. Compose automatically loads the override file when running `up`:

```yaml
# compose.yaml (base)
services:
  api:
    build: .
    ports: ["127.0.0.1:3000:3000"]
    environment:
      APP_ENV: production

# compose.override.yaml (development overrides)
services:
  api:
    environment:
      APP_ENV: development
    command: ["node", "--watch", "server.js"]
    volumes:
      - .:/app
```

When you run `docker compose up`, the override is merged on top of the base. The override's
`APP_ENV: development` replaces the base's `APP_ENV: production`, and the `command` and
`volumes` are added.

---

## 3. Command example

### Load an `.env` file

```console
$ cat > /tmp/opencode/test.env <<'EOF'
APP_ENV=development
DB_HOST=db.example.com
EOF

$ cat > /tmp/opencode/env-compose.yaml <<'EOF'
services:
  api:
    image: docker-learn:1.0.0
    env_file: /tmp/opencode/test.env
    command: ["node", "-e", "console.log(JSON.stringify(process.env.APP_ENV))"]
EOF

$ docker compose -f /tmp/opencode/env-compose.yaml up --abort-on-container-exit --exit-code-from api
```

Output: `development`. The `.env` file variables are available in the container.

### Variable interpolation in the Compose file

```yaml
services:
  api:
    environment:
      - DB_HOST
      - "DB_PASSWORD=${DB_PASSWORD}"
```

Here `DB_HOST` is replaced by the value from the `.env` file, and `DB_PASSWORD` is explicitly
quoted and also interpolated.

### `--profile` enabled services

```console
$ docker compose --profile api up
Creating docker-learn-api-1 ... done
```

Only the `api` service starts. Other services are not created.

```console
$ docker compose --profile api --profile debug up
Creating docker-learn-api-1 ... done
Creating docker-learn-debug-1 ... done
```

Both `api` and `debug` services start.

### `docker compose config` with profiles

```console
$ docker compose --profile api config --services
api
```

Only the `api` service is listed.

### `docker compose` with `.env` and interpolation

```console
$ cat > .env
APP_NAME=myapp
PORT=8080

$ docker compose config --images
myapp:latest
```

The `.env` file provides `APP_NAME` and `PORT`, which are used by Compose to resolve the
image name if it contains variable references (less common, but supported).

---

## 4. File example

Here is a complete `compose.yaml` with profiles and an override pattern.

```yaml
# Base Compose file — contains services for both dev and prod.
# Profiles let you select which groups to start.

services:
  # The API server. Always running, but part of the "api" profile.
  api:
    build: .
    init: true
    profiles: ["api"]
    restart: unless-stopped
    ports:
      - "127.0.0.1:3000:3000"
    environment:
      APP_NAME: docker-learn
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 10s
      timeout: 3s
      start_period: 5s
      retries: 3

  # Development-only service: a debug shell.
  debug:
    image: alpine:3.24
    profiles: ["debug"]
    command: sh -c "echo I am the debug tool; sleep 3600"

  # Monitoring sidecar.
  monitor:
    image: nicolaka/netshoot:latest
    profiles: ["monitoring"]
    command: sleep 86400

  # The database.
  db:
    build: ./db
    profiles: ["db", "monitoring"]
    environment:
      POSTGRES_USER: learn
      POSTGRES_PASSWORD: secret
      POSTGRES_DB: learndb
    volumes:
      - pgdata:/var/lib/postgresql/data

  # A one-shot job that waits for the API to be healthy.
  smoke:
    image: alpine:3.24
    profiles: []
    depends_on:
      api:
        condition: service_healthy
    command: wget -qO- http://api:3000/health

networks:
  appnet:
    driver: bridge

volumes:
  pgdata:
```

### Running with profiles

```console
# Development: api + debug
$ docker compose --profile api --profile debug up

# Production: api + db + monitoring (no debug)
$ docker compose --profile api --profile db --profile monitoring up

# Everything (default profile includes all services)
$ docker compose up
```

### The `compose.override.yaml` for development

```yaml
services:
  api:
    environment:
      APP_ENV: development
    command: ["node", "--watch", "server.js"]
    volumes:
      - .:/app
      - node_modules_keep:/app/node_modules
volumes:
  node_modules_keep:
```

Run with the override:

```console
$ docker compose up
# api gets APP_ENV=development, --watch flag, and bind mounts.
```

---

## 5. When to use advanced Compose features

### Use `.env` files when

- **You have more than 3-4 environment variables.** Typing `-e` flags on the command line gets
  old fast.
- **You want different values for different environments.** Dev, staging, and prod can each have
  their own `.env` file checked out of git (or not checked in, for secrets).
- **You want variable interpolation.** `${VAR}` inside the Compose file is a clean way to
  reference other variables.

### Use profiles when

- **You want different service sets for dev vs prod.** Dev may have a debug shell and a
  monitoring sidecar; prod may not.
- **You are iterating on a feature.** Start just the services you need with `--profile
  feature-x`, and add more later.

### Use `compose.override.yaml` when

- **You have a base Compose file committed to git** that defines the production shape.
- **Developers need local overrides** (different env vars, bind mounts for code reload, different
  command). The override file is not committed (or is git-ignored), so it does not affect the
  production baseline.

### Do not use profiles as a substitute for environment-specific configuration.

Profiles show/hide services. For changing config (env vars, resource limits), use `.env` files,
`-e` flags, or `compose.override.yaml`.

### Do not forget that `.env` interpolation uses `${VAR}` syntax.

Docker's own `--env-file` behavior differs from Compose `.env` interpolation. In Compose, you
write `${VAR}` to reference another variable. In `--env-file`, quotes are not stripped, so write
bare values.

---

## 6. Common mistakes

**1. Assuming `.env` file variables are automatically exported to the shell.**

They are only available to Compose. The host shell does not see them unless you source the file
or use `docker compose env`.

**2. Using `$VAR` instead of `${VAR}` in Compose `.env` files.**

Docker Compose uses `${VAR}` syntax for variable interpolation. `$VAR` may not be interpreted
correctly, or may be interpreted as a shell variable if your shell processes the file.

**3. Using `environment:` and `environment_file:` in the same service without understanding precedence.**

```yaml
services:
  api:
    environment:
      APP_ENV: production
    env_file:
      - .env
```

If `.env` contains `APP_ENV=development`, the service gets `APP_ENV=development` (the `env_file`
overrides the inline `environment`). Know the precedence order.

**4. Forgetting that `docker compose up` auto-loads `compose.override.yaml`.**

If you have an override file in the directory, it is loaded automatically. If you do not want
it, remove or rename it, or use `-f` to point to a different base file.

**5. Using `depends_on: condition: service_healthy` without a healthcheck.**

The `condition` can only be `service_healthy` if the service actually has a healthcheck configured.
Without it, the condition defaults to `service_running`, which may allow the dependent service
to start before the other one is ready.

**6. `docker compose up` hanging because of `--wait` and a failing healthcheck.**

If the healthcheck can never succeed, `docker compose up --wait` will wait until the default
timeout (usually 120 seconds) and then proceed anyway. Use `--wait-timeout` to set a shorter
timeout, or debug the healthcheck first.

**7. `docker compose down -v` removing named volumes you meant to keep.**

`docker compose down` preserves named volumes. Add `-v` only if you want to remove them too.

**8. Mixing `environment:` and `env_file:` without understanding precedence later in the file.**

The Compose file format processes keys in order, and later sources override earlier ones. The
full precedence chain (lowest to highest) is documented in the spec, but the practical rule is:
the last `environment:` or `env_file:` entry wins.

**9. Forgetting that `ports:` host ports must be unique.**

Two services cannot publish the same host port. Use different host ports, or use a user-defined
network and reach containers by name without publishing ports.

**10. `docker compose run` without `--rm` leaving behind stopped containers.**

`docker compose run` creates and starts a one-off container. Without `--rm`, the container stays
after it exits. Use `--rm` to auto-remove.

---

## 7. Try it yourself

**Exercise.** Use profiles and an override file to run a dev vs prod configuration.

**Step 1 — create the base Compose file:**

```bash
$ cd /home/sunny/app/nimo/docker-doc/docker-learn
```

```yaml
services:
  api:
    build: .
    init: true
    profiles: ["api"]
    restart: unless-stopped
    ports:
      - "127.0.0.1:3000:3000"
    environment:
      APP_NAME: docker-learn
```

**Step 2 — create the override file:**

```yaml
services:
  api:
    environment:
      APP_ENV: development
    command: ["node", "--watch", "server.js"]
    volumes:
      - .:/app
```

**Step 3 — start with the api profile only:**

```console
$ docker compose --profile api up
```

The api service should start with the default `APP_ENV=production` from the base file.

**Step 4 — start with the api profile and the override:**

```console
$ docker compose --profile api up
```

The api service should now have `APP_ENV=development` and `node --watch server.js` from the
override.

**Step 5 — clean up:**

```console
$ docker compose down
```

---

## 8. Next

You can compose complex multi-service applications with profiles, environment files, and
override files. Next: production-shaped Compose files with resource limits, restart policies,
and separate dev and production configurations.

**[Chapter 17 — Production-Shaped Compose](17-production-compose.md)**