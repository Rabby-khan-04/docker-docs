# Appendix 99 — Cheatsheet

> Verified on: Docker Engine **29.8.2**, Compose **v5.6.0**, BuildKit **v0.33.1**, Ubuntu 26.04.1 LTS, x86_64.

This is a one-page reference for all the commands, instructions, and keys covered in this course.

## Docker CLI commands

| Command | Description | Example |
| :--- | :--- | :--- |
| `docker build -t NAME .` | Build an image. | `docker build -t myapp:1.0.0 .` |
| `docker build --no-cache -t NAME .` | Build without using any cached layers. | `docker build --no-cache -t demo:1 .` |
| `docker build --check .` | Run Dockerfile lint checks (BuildKit). Emits `JSONArgsRecommended` for shell form. | `docker build --check . 2>&1` |
| `docker run -d --name NAME IMAGE` | Run a container in detached mode. | `docker run -d --name my-container docker-learn:1.0.0` |
| `docker run -d --rm IMAGE` | Run and auto-remove when exits. | `docker run --rm alpine:3.24 echo hello` |
| `docker run -p HOST:CONTAINER IMAGE` | Publish a port. | `docker run -p 3000:3000 docker-learn:1.0.0` |
| `docker run --restart POLICY IMAGE` | Set restart policy. | `docker run --restart unless-stopped alpine:3.24` |
| `docker run --memory SIZE --cpus N IMAGE` | Set memory and CPU limits. | `docker run --memory 256m --cpus 0.5 alpine:3.24` |
| `docker container ls / ps` | List containers. | `docker ps -a` |
| `docker container ls --filter status=running` | List running containers. | `docker ps` |
| `docker inspect CONTAINER` | Full JSON state. | `docker inspect my-container` |
| `docker inspect container --format '{{.State.Status}}'` | Extract a field. | `docker inspect c --format '{{.State.Status}}'` |
| `docker inspect container --format '{{.HostConfig.Memory}}'` | Extract host config. | `docker inspect c --format '{{.HostConfig.Memory}}'` |
| `docker logs CONTAINER` | Show container logs. | `docker logs my-container` |
| `docker logs --tail 20 CONTAINER` | Last 20 lines. | `docker logs --tail 20 c` |
| `docker logs -f CONTAINER` | Follow log output. | `docker logs -f c` |
| `docker diff CONTAINER` | Show filesystem changes in writable layer. | `docker diff c` |
| `docker system df` | Show disk usage. | `docker system df` |
| `docker system df --verbose` | Per-object disk usage. | `docker system df --verbose` |
| `docker image prune` | Remove dangling images (no tag). | `docker image prune` |
| `docker image prune -a` | Remove all images not used by a container. | `docker image prune -a` |
| `docker container prune` | Remove all stopped containers. | `docker container prune` |
| `docker volume prune` | Remove anonymous volumes. | `docker volume prune` |
| `docker volume prune -f` | Remove all volumes without asking. | `docker volume prune -f` |
| `docker system prune` | Remove stopped containers, dangling images, unused networks. | `docker system prune` |
| `docker system prune -a --volumes` | **Nuclear option.** Remove everything not running. | `docker system prune -a --volumes` |
| `docker buildx version` | Check Buildx version. | `docker buildx version` |
| `docker buildx create --name NAME --use` | Create a new builder. | `docker buildx create --name mybuilder --use` |
| `docker buildx imagetools inspect IMAGE` | Inspect multi-platform image. | `docker buildx imagetools inspect myimage:1.0.0` |
| `docker buildx build OPTIONS IMAGE` | Build with Buildx (multi-platform, cache, etc.). | `docker buildx build --platform linux/amd64 -t myimage .` |
| `docker buildx prune` | Remove unused Buildx cache. | `docker buildx prune` |
| `docker login REGISTRY` | Log in to a registry. | `docker login --username admin docker.io` |
| `docker logout REGISTRY` | Log out of a registry. | `docker logout docker.io` |
| `docker tag SOURCE TARGET` | Tag an image for pushing. | `docker tag myimage myuser/myimage:1.0.0` |
| `docker push USERNAME/IMAGE:TAG` | Upload an image to a registry. | `docker push myuser/myimage:1.0.0` |
| `docker pull IMAGE` | Download an image from a registry. | `docker pull postgres:17-alpine` |
| `docker save IMAGE | docker load` | Save/load an image as a tar archive. | `docker save myimage | gzip > image.tar.gz` / `docker load < image.tar.gz` |
| `docker init` | Initialize a new Swarm and get sample commands. | `docker init` |
| `docker swarm init` | Make this machine a Swarm manager. | `docker swarm init --advertise-addr 127.0.0.1` |
| `docker swarm join TOKEN IP:2377` | Join a worker to the Swarm. | `docker swarm join --token abc123 192.168.1.1:2377` |
| `docker stack deploy -c COMPOSE.yaml NAME` | Deploy a stack to Swarm. | `docker stack deploy -c compose.yaml myapp` |
| `docker service ls` | List services in a Swarm. | `docker service ls` |
| `docker service scale NAME=REPLICAS` | Scale a service. | `docker service scale myapp_api=3` |
| `docker volume create NAME` | Create a named volume. | `docker volume create pgdata` |
| `docker volume inspect NAME` | Inspect a named volume. | `docker volume inspect pgdata` |
| `docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy:0.75.0 image IMAGE` | Scan an image with Trivy. | `docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy:0.75.0 image docker-learn:1.0.0` |
| `docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy:0.75.0 container NAME` | Scan a running container. | `docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy:0.75.0 container mycontainer` |

## Dockerfile instructions (exec form is standard for this course)

| Instruction | Description | Example |
| :--- | :--- | :--- |
| `FROM IMAGE` | Base image. Pin by version or digest. | `FROM node:22-alpine` |
| `FROM IMAGE AS NAME` | Name a build stage (multi-stage). | `FROM node:22-bookworm-slim AS build` |
| `WORKDIR PATH` | Set working directory. | `WORKDIR /app` |
| `COPY src dest` | Copy files from build context. | `COPY package.json ./` |
| `COPY --from=NAME|INDEX src dest` | Copy from another build stage. | `COPY --from=build /app/node_modules ./node_modules` |
| `RUN CMD` | Execute any command in a new layer. | `RUN npm ci --include=dev` |
| `ARG NAME=DEFAULT` | Build-time variable. Not available at runtime. | `ARG NODE_ENV=production` |
| `ENV KEY=VALUE` | Runtime environment variable. | `ENV NODE_ENV=production` |
| `EXPOSE PORT` | Document port (does not publish). | `EXPOSE 3000` |
| `HEALTHCHECK OPTIONS CMD` | Health test for the container. | `HEALTHCHECK --interval=10s --timeout=3s --retries=3 CMD node -e "..."` |
| `USER USER` | Run as non-root user. | `USER node` |
| `SHELL ["executable", "params"]` | Override the default shell. | Not commonly needed |
| `ONBUILD` | Run when this image is used as a base. | `ONBUILD RUN npm install` |
| `# syntax=docker/dockerfile:1` | Enable BuildKit features (heredocs, etc.). | At the top of the Dockerfile. |
| `HEALTHCHECK --interval=5s --timeout=2s --start-period=3s --retries=2 CMD ...` | Health check flags. | See above. |

## HEALTHCHECK flags

| Flag | Meaning |
| :--- | :--- |
| `--interval=5s` | Run the check every 5 seconds. |
| `--timeout=2s` | If the check takes longer than 2s, it counts as a failure. |
| `--start-period=3s` | Wait 3s after container start before first check. |
| `--retries=3` | If the check fails 3 times in a row, mark unhealthy. |

## Compose commands

| Command | Description | Example |
| :--- | :--- | :--- |
| `docker compose up` | Create and start services. | `docker compose up` |
| `docker compose up -d` | Start in detached mode. | `docker compose up -d` |
| `docker compose up --build` | Rebuild images if needed. | `docker compose up --build` |
| `docker compose up --wait` | Wait for all services to become healthy. | `docker compose up --wait` |
| `docker compose down` | Stop and remove services, networks. | `docker compose down` |
| `docker compose down -v` | Also remove named volumes. | `docker compose down -v` |
| `docker compose ps` | List running services. | `docker compose ps` |
| `docker compose ps --filter status=healthy` | List healthy services. | `docker compose ps --filter status=healthy` |
| `docker compose logs` | View output from services. | `docker compose logs api` |
| `docker compose logs --tail 3` | Last 3 lines. | `docker compose logs --tail 3 api` |
| `docker compose config` | Validate and print resolved config. | `docker compose config` |
| `docker compose config --services` | Print service names. | `docker compose config --services` |
| `docker compose config --images` | Print image names. | `docker compose config --images` |
| `docker compose --profile PROFILE up` | Start only services in given profiles. | `docker compose --profile api up` |
| `docker compose exec SERVICE CMD` | Run a command in a running service. | `docker compose exec api printenv` |
| `docker compose run --rm SERVICE CMD` | Run a one-off command. | `docker compose run --rm api echo hello` |
| `docker compose -f FILE.yaml up` | Use a specific Compose file. | `docker compose -f compose.yaml up` |
| `docker compose env` | Print environment variables that Compose would use. | `docker compose env` |

## Compose file keys (no top-level `version:` key)

| Key | Description | Example |
| :--- | :--- | :--- |
| `services:` | Map of service names to configurations. | See chapter files. |
| `services.NGINX.build` | Build context and Dockerfile. | `build: .` / `dockerfile: Dockerfile` |
| `services.NGINX.image` | Image name. | `image: myproxy:1.0.0` |
| `services.NGINX.ports` | Host:container port mappings. | `- "127.0.0.1:3000:3000"` |
| `services.NGINX.environment` | Environment variables. | `APP_ENV: production` |
| `services.NGINX.env_file` | Path to `.env` file. | `env_file: .env` |
| `services.NGINX.restart` | Restart policy. | `unless-stopped` |
| `services.NGINX healthcheck` | Health test configuration. | `healthcheck: test: ["CMD", "node", "-e", "..."]` |
| `services.NGINX.deploy.resources.limits` | Resource limits (Compose). | `memory: 256M` / `cpus: '0.5'` |
| `services.NGINX.networks` | Network membership. | ` - appnet` |
| `services.NGINX.deploy.restart_policy` | Restart policy (Swarm-level). | `condition: on-failure` |
| `volumes:` | Map of named volumes. | `pgdata:` |
| `volumes.NGINX.name` | Named volume name. | `pgdata` |
| `networks:` | Map of network definitions. | `appnet:` |
| `networks.appnet.driver` | Network driver. | `bridge` |
| `profiles:` | Service profiles (enable/disable). | `profiles: ["api"]` |
| `depends_on` | Service startup dependencies. | `depends_on: api: condition: service_healthy` |
| `env_file:` | Path to `.env` file(s). | `env_file: .env` |
| `command:` | Override the default CMD. | `command: ["node", "server.js"]` |

## `.env` file syntax

| Syntax | Meaning |
| :--- | :--- |
| `KEY=VALUE` | A variable assignment. No quotes around bare values. |
| `${KEY}` | Interpolate the value of `KEY` (Compose variable interpolation). |
| `$KEY` | May not be interpreted, or may be interpreted as a shell variable. Avoid. |
| `# COMMENT` | Ignored line. |
| blank line | Skipped. |
| `!NEGATION` | Not reliably supported in `.dockerignore`. Use positive patterns only. |

## Compose variable precedence (lowest to highest)

1. Default values in the Dockerfile `ENV` instruction.
2. `environment:` key in the service definition.
3. `environment_file:` in the service definition.
4. `.env` file in the compose project directory.
5. `-e KEY=VALUE` flag on the `docker compose up` command line.
6. `-e KEY=VALUE` flag on the `docker run` command line (outside compose).
7. Host environment variables.

Later sources **override** earlier ones.

## Common Dockerfile patterns

### Multi-stage build (two stages)

```dockerfile\n# syntax=docker/dockerfile:1\n# ---- Stage 1: build stage ----\nFROM node:22-bookworm-slim AS build\nWORKDIR /app\nCOPY package.json package-lock.json ./\nRUN npm ci --include=dev\nCOPY . .\nRUN npm run build 2>/dev/null || true\n\n# ---- Stage 2: runtime stage ----\nFROM node:22-alpine AS runtime\nWORKDIR /app\nENV NODE_ENV=production\nCOPY --from=build /app/node_modules ./node_modules\nCOPY --from=build /app/package.json ./\nCOPY --from=build /app/server.js ./\nUSER node\nEXPOSE 3000\nCMD [\"node\",\"server.js\"]\n```\n\n### Good cache ordering (copy dependency files first)

```dockerfile\n# syntax=docker/dockerfile:1\nFROM node:22-alpine\nWORKDIR /app\nCOPY package.json package-lock.json ./\nRUN npm ci --include=dev\nCOPY server.js ./\nUSER node\nEXPOSE 3000\nCMD [\"node\",\"server.js\"]\n```\n\n### With healthcheck

```dockerfile\n# syntax=docker/dockerfile:1\nFROM node:22-alpine\nWORKDIR /app\nCOPY server.js .\nEXPOSE 3000\nUSER node\n\nHEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \\\n  CMD [\"node\", \"-e\", \"fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\"\n\nCMD [\"node\",\"server.js\"]\n```\n\n### With .dockerignore

The file at the root of the build context, using patterns like:\n- `node_modules`\n- `.git`\n- `*.log`\n- `*.pem` / `*.key`\n- `secrets/`\n- `env/` / `.env`\n- `docs/` / `tests/` / `README.md`\n- `Dockerfile` / `.dockerignore` (prevents recursive copies)\n\n### With ARG + ENV

```dockerfile\n# syntax=docker/dockerfile:1\nFROM node:22-alpine\nARG NODE_ENV=production\nENV NODE_ENV=$NODE_ENV\n```\n\n### With --mount=type=cache

```dockerfile\n# syntax=docker/dockerfile:1\nFROM node:22-alpine\nRUN --mount=type=cache,target=/root/.npm npm ci --include=dev\n```\n\n### With --mount=type=secret

```dockerfile\n# syntax=docker/dockerfile:1\nFROM alpine:3.24\nRUN --mount=type=secret,id=DB_PASS,src=/run/secrets/db_pass \\\n    echo \"DB password is $(cat /run/secrets/DB_PASS)\" > /tmp/msg.txt\n```\n\n### With --mount=type=ssh

```dockerfile\n# syntax=docker/dockerfile:1\nFROM alpine:3.24\nRUN --mount=type=ssh,id=git ssh-keyscan github.com >> ~/.ssh/known_hosts \\\n    && git clone git@github.com:org/repo.git /app\n```\n\n### With ONBUILD

```dockerfile\nFROM node:22-alpine\nONBUILD COPY . /app\nONBUILD RUN npm install\n```\n\n### With CMD in exec (JSON) form (standard for this course)

```dockerfile\nCMD [\"node\", \"server.js\"]\n```\n\n### With ENTRYPOINT + CMD

```dockerfile\nENTRYPOINT [\"echo\"]\nCMD [\"hello\", \"from\", \"CMD\"]\n```\n\n## Common Docker flags (docker run)

| Flag | Meaning | Example |
| :--- | :--- | :--- |
| `--rm` | Auto-remove container when it exits. | `docker run --rm alpine echo hello` |
| `-d` | Detached mode (run in background). | `docker run -d alpine sh -c 'while true; do :; done'` |
| `-p HOST:CONTAINER` | Publish a port. | `docker run -p 3000:3000 alpine` |
| `-P` | Publish all exposed ports to random host ports. | `docker run -P alpine` |
| `--restart POLICY` | Restart policy. | `no`, `on-failure`, `always`, `unless-stopped` |
| `--memory SIZE` | Memory limit. | `--memory 256m` |
| `--memory-swap SIZE` | Total memory + swap. | `--memory-swap 512m` |
| `--memory-reservation SIZE` | Soft memory limit. | `--memory-reservation 64m` |
| `--cpus N` | CPU limit (fraction of one core). | `--cpus 0.5` |
| `--cpu-shares N` | Relative CPU weight. | `--cpu-shares 512` |
| `--pids-limit N` | Maximum number of processes. | `--pids-limit 50` |
| `--read-only` | Mount root filesystem as read-only. | `--read-only` |
| `--tmpfs PATH` | Mount a tmpfs (in-memory) directory. | `--tmpfs /tmp` |
| `--cap-drop=ALL` | Drop all Linux capabilities. | `--cap-drop=ALL` |
| `--security-opt no-new-privileges:true` | Prevent gaining new privileges. | `--security-opt no-new-privileges:true` |
| `--init` | Run an init process (forward SIGTERM). | `--init` |
| `-e KEY=VALUE` | Set an environment variable. | `-e APP_ENV=production` |
| `--env-file PATH` | Read environment variables from a file. | `--env-file .env` |
| `--user UID:GID` | Run as specific user/group. | `--user 1000:1000` |
| `--network NETWORK` | Connect to a network. | `--network appnet` |
| `--workdir PATH` | Set working directory inside container. | `--workdir /app` |

## Common Compose patterns

### Production-shaped compose.yaml

```yaml\nservices:\n  api:\n    build: .\n    restart: unless-stopped\n    ports:\n      - \"127.0.0.1:3000:3000\"\n    environment:\n      APP_NAME: docker-learn\n      APP_ENV: production\n      PORT: \"3000\"\n    networks:\n      - appnet\n    healthcheck:\n      test: [\"CMD\", \"node\", \"-e\", \"fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))]\n      interval: 10s\n      timeout: 3s\n      start_period: 5s\n      retries: 3\n    deploy:\n      resources:\n        limits:\n          memory: 256M\n    logging:\n      driver: json-file\n      options:\n        max-size: \"10m\"\n        max-file: \"3\"\n```\n\n### Development override (compose.override.yaml)

```yaml\nservices:\n  api:\n    ports:\n      - \"127.0.0.1:3080:3000\"\n    environment:\n      APP_ENV: development\n    command: [\"node\", \"--watch\", \"server.js\"]\n    volumes:\n      - .:/app\n      - node_modules_keep:/app/node_modules\n\nvolumes:\n  node_modules_keep:\n```\n\n### Compose with depends_on and health gating

```yaml\nservices:\n  api:\n    build: .\n    healthcheck:\n      test: [\"CMD\", \"node\", \"-e\", \"fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))]\n      interval: 10s\n      timeout: 3s\n      start_period: 5s\n      retries: 3\n  worker:\n    image: alpine:3.24\n    depends_on:\n      api:\n        condition: service_healthy\n    command: sh -c \"echo waiting for api; sleep 60\"\n```\n\n### Compose with env_file and interpolation

```yaml\nservices:\n  api:\n    build: .\n    environment:\n      - APP_ENV\n      - DB_HOST\n      - \"DB_PASSWORD=${DB_PASSWORD}\"\n    env_file: .env\n```\n\n### Compose with profiles

```yaml\nservices:\n  api:\n    build: .\n    profiles: [\"api\"]\n  db:\n    build: ./db\n    profiles: [\"db\", \"monitoring\"]\n  debug:\n    image: alpine:3.24\n    profiles: [\"debug\"]\n```\n\n```console\n$ docker compose --profile api up\n# Runs only the api service.\n\n$ docker compose --profile api --profile monitoring up\n# Runs api + db + monitoring.\n```\n\n### Compose with resource limits (deploy)

```yaml\nservices:\n  api:\n    deploy:\n      resources:\n        limits:\n          memory: 256M\n          cpus: '0.5'\n```\n\nOn plain Docker Engine (without Swarm), these are documented but have no enforcement effect.\nThey are included for compatibility and future use when running with Swarm.\n\n## Trivy scan commands

| Command | Description |
| :--- | :--- |
| `docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy:0.75.0 image --severity HIGH,CRITICAL --no-progress IMAGE` | Scan an image for HIGH and CRITICAL CVEs. |
| `docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy:0.75.0 image --severity MEDIUM --no-progress IMAGE` | Show medium and above. |
| `docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy:0.75.0 image --severity HIGH,CRITICAL --ignore-unfixed --no-progress IMAGE` | Show only fixed vulnerabilities. |
| `docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy:0.75.0 image --sbom --provenance --no-progress IMAGE` | Build and scan with SBOM and provenance. |
| `docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy:0.75.0 container --no-progress CONTAINER_NAME` | Scan a running container. |

## Key course principles (always followed)

1. Image versions are always pinned (`node:22-alpine`, never `node:latest`).
2. `docker compose` (v2+ plugin) only. The old `docker-compose` binary is never used.
3. No top-level `version:` key in Compose files. The Compose Specification ignores it.
4. `CMD` and `ENTRYPOINT` are always in **exec (JSON) form**, because `docker build --check` warns about shell form.
5. Destructive commands (`docker system prune -a`, `docker volume rm`, `docker volume prune -a`) are never run for you. They appear in docs only inside a clearly marked warning box.
6. Every chapter ends with cleanup commands that only remove what the chapter created.