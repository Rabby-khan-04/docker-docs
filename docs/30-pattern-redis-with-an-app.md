# 30 — Pattern: Redis with an App

> Verified on: Docker Engine **29.8.2**, Compose **v5.6.0**, BuildKit **v0.33.1**, Ubuntu 26.04.1 LTS, x86_64.

## 1. Simple explanation (like I'm 7)

Redis is an in-memory key-value store that can be used as a cache, a session store, or a message queue. Putting Redis next to your app is a common pattern: the app checks Redis first, and if data is not there, it falls back to the database.

This chapter shows how to run Redis in Docker, connect an app to it, set memory limits, and use health gating so dependent services start only when Redis is ready.

## 2. Real name

### The Redis Docker image

The official Redis image is `redis:version`. It is ready to use out of the box.

| Command | What it does |
| :--- | :--- |
| `redis-cli ping` | Pings Redis and gets `PONG` if it is running. |
| `redis-cli SET key value` | Sets a key-value pair. |
| `redis-cli GET key` | Gets the value for a key. |
| `redis-cli EXPIRE key seconds` | Sets a time-to-live on a key. |

### Redis memory limits

```console
$ docker run -d --name redis-demo --memory 256m --memory-swap 512m redis:7-alpine
```

| Flag | What it does |
| :--- | :--- |
| `--memory 256m` | The container can use at most 256 MB of RAM. |
| `--memory-swap 512m` | Total memory + swap. Swap = 512m - 256m = 256 MB of swap. |
| Without `--memory` | The container can use all available host RAM. This is the default. |

### Redis appendonly vs appendfsync

| Setting | What it does | Trade-off |
| :--- | :--- | :--- |
| `--appendonly yes` | Persists every write to disk immediately. | Safest, but slower write performance. |
| `--appendonly no` (default in some images) | Data is only in memory. Lost if the container restarts. | Fastest, but data loss on restart. |
| `--appendfsync always` | Sync to disk on every write. | Safest, but slowest. |
| `--appendfsync everysec` | Sync to disk once per second. | Good compromise. |
| `--appendfsync no` | Never sync to disk (rely on OS caching). | Fastest, but can lose up to 1 second of data. |

### Redis in Compose with memory limits and health gating

```yaml
services:
  redis:
    image: redis:7-alpine
    container_name: redis-cache
    restart: unless-stopped
    networks:
      - appnet
    memory: 256m
    memory_swap: 512m
    command: ["redis-server", "--maxmemory", "256mb", "--appendonly", "yes"]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      start_period: 3s
      retries: 3

  api:
    build: .
    depends_on:
      redis:
        condition: service_healthy
    networks:
      - appnet
    environment:
      REDIS_URL: redis://redis:6379
```

| Field | Purpose |
| :--- | :--- |
| `memory: 256m` | Compose `deploy.resources.limits.memory` (documented, enforced on Swarm). |
| `memory_swap: 512m` | Compose equivalent of `--memory-swap`. |
| `command: ["redis-server", "--maxmemory", "256mb"]` | Limits Redis's own memory usage to 256 MB. |
| `depends_on: condition: service_healthy` | The `api` service will not start until Redis reports `healthy`. |
| `command: ["redis-server", "--appendonly", "yes"]` | Enables RDB/AOF persistence. |

### Health gating between Redis and app

```yaml
services:
  api:
    build: .
    depends_on:
      redis:
        condition: service_healthy
    environment:
      REDIS_URL: redis://redis:6379
  worker:
    image: alpine:3.24
    depends_on:
      redis:
        condition: service_healthy
    command: sh -c "redis-cli SET job:status complete; echo done"
```

The `api` and `worker` services will not start until Redis reports `healthy`.

## 3. Command example\n\n### Redis in Compose with memory limits\n\n```yaml\nservices:\n  redis:\n    image: redis:7-alpine\n    container_name: redis-cache\n    restart: unless-stopped\n    networks:\n      - appnet\n    memory: 256m\n    memory_swap: 512m\n    command: ["redis-server", "--maxmemory", "256mb", "--appendonly", "yes"]\n    healthcheck:\n      test: ["CMD", "redis-cli", "ping"]\n      interval: 5s\n      timeout: 3s\n      start_period: 3s\n      retries: 3\n\n  api:\n    build: .\n    depends_on:\n      redis:\n        condition: service_healthy\n    environment:\n      REDIS_URL: redis://redis:6379\n\nnetworks:\n  appnet:\n    driver: bridge\n```\n\n```console\n$ docker compose up -d\n```\n\n```console\n$ docker compose ps\n```\n

Output: `redis-cache` should be `Up` and `healthy`. `api` should be `Waiting` (depends on redis\nbeing healthy).\n\n```console\n$ sleep 6\n$ docker compose ps\n```\n

The `api` should now be `Up` because Redis is healthy.\n\n### Set and get a key in Redis\n\n```console\n$ docker compose exec redis-cli SET mykey hello\n```\n

Output: `OK`.\n\n```console\n$ docker compose exec redis-cli GET mykey\n```\n

Output: `hello`.\n\n### Simulate data loss with `--appendonly no`\n\n```console\n# Run Redis without persistence.\n$ docker run -d --name redis-no-persist --memory 256m redis:7-alpine\n$ docker compose exec redis-cli SET test-key hello\n$ docker compose down\n# Container and in-memory data are gone.\n$ docker compose up -d redis-no-persist\n$ docker compose exec redis-cli GET test-key 2>&1\n```\n

Output: `(nil)` — the key is lost because `--appendonly no` was not set (or the default).\n\n### Run Redis with persistence\n\n```console\n$ docker run -d --name redis-persist --memory 256m --memory-swap 512m redis:7-alpine --appendonly yes\n$ docker compose exec redis-cli SET persist-key hello\n$ docker compose down\n# Stop the container, but the volume persists data.\n$ docker compose up -d redis-persist\n$ docker compose exec redis-cli GET persist-key\n```\n

Output: `hello` — the key survived the container restart because `--appendonly yes` was set.\n\n### Redis memory limit enforcement\n\n```console\n$ docker compose exec redis-cli INFO memory\n```\n

Output shows `used_memory_human` and `maxmemory_human`. If Redis reaches the 256 MB limit, it\nwill start returning errors on `SET` commands.\n\n### Remove Redis cleanly\n\n```console\n$ docker compose down\n```\n

Without `-v`, the named volume (if any) is preserved. With `-v`, any anonymous volumes are\nremoved. Redis does not use named volumes by default (data is in the container's layer), so\n`docker compose down` removes the container and its data.\n\n## 4. When to use these patterns and when NOT to\n\n### Use Redis patterns when\n\n- **You need a cache** to reduce database load (e.g., caching database queries, session data).\n- **You need a fast key-value store** for sessions, rate limiting, or counters.\n- **You are running Redis next to your app** in Docker Compose and want DNS-based service\n  discovery (the app connects to `redis` by name, not by IP).\n- **You want memory limits** to prevent Redis from consuming all host RAM.\n- **You want health gating** so dependent services start only when Redis is ready.\n\n### Do not use these patterns when\n\n- **You need persistent survival across machine restarts.** Redis with `--appendonly yes` (AOF)\nsurvives container restarts, but if the host machine dies, the AOF file on a local volume may\nbe lost. For true persistence, consider Redis Cluster or a managed Redis service (Redis Labs,\nAmazon ElastiCache, etc.).\n- **You need data survival after `docker compose down -v`.** Redis data is in the container's\n  layer or a local file. Use a named volume or bind mount if you want data survival.\n- **You need clustering.** This chapter covers a single Redis instance. For Redis Cluster, you\n  need multiple Redis instances with cluster mode enabled.\n- **You are running a short-lived job** that only needs a temporary cache. Use `docker run`\n  without restart policies or named volumes.\n\n### A practical Redis pattern\n\n```yaml\nservices:\n  redis:\n    image: redis:7-alpine\n    restart: unless-stopped\n    networks:\n      - appnet\n    memory: 256m\n    memory_swap: 512m\n    command: ["redis-server", "--maxmemory", "256mb", "--appendonly", "yes"]\n    healthcheck:\n      test: [\"CMD\", \"redis-cli\", \"ping\"]\n      interval: 5s\n      timeout: 3s\n      start_period: 3s\n      retries: 3\n\n  api:\n    build: .\n    depends_on:\n      redis:\n        condition: service_healthy\n    environment:\n      REDIS_URL: redis://redis:6379\n\nnetworks:\n  appnet:\n    driver: bridge\n```\n\n```console\n$ docker compose up -d\n$ docker compose ps\n```\n

```console\nNAME            IMAGE     COMMAND                  SERVICE    CREATED          STATUS\ndl-redis-1       redis:7-alpine   \"redis-server ...\"   redis      0 seconds ago   Up 6 seconds (healthy)\ndl-api-1         docker-learn:1.0.0   \"docker-entrypoint…\"   api        0 seconds ago   Waiting (healthy deadline …)\n```\n\nThe `api` is waiting for Redis to become healthy. After ~5 seconds, Redis is healthy and the\napi starts.\n\n## 5. Common mistakes\n\n**1. `docker compose down -v` removing Redis data.**\n\nRedis data is stored in the container's writable layer or in an AOF/RDB file on a local volume.\n`docker compose down -v` removes anonymous volumes. If you used a named volume, it is preserved.\n\n**2. Forgetting `memory` and `memory_swap` on Redis.**\n\nWithout limits, Redis will try to use all available host RAM and may OOM-kill the host or\nother containers. Always set limits for Redis in production.\n\n**3. Using the default `--appendonly no`.**\n\nIf you restart the container without persistence, all data is lost. Use `--appendonly yes` if\nyou need data to survive container restarts.\n\n**4. `redis-cli` inside a Compose service needs the Redis CLI installed.**\n\n```console\n$ docker compose exec redis redis-cli ping\n```\n

The `redis-cli` tool is in the `redis:7-alpine` image. If you use a different base image,\nyou may need to install `redis-cli` separately.\n\n**5. `depends_on: condition: service_healthy` without a healthcheck.**\n\nThe `condition` can only be `service_healthy` if the service actually has a healthcheck configured.\nWithout it, the condition defaults to `service_running`, which may allow the dependent service to\nstart before the other one is ready.\n\n**6. Not checking Redis logs when it won't start.**\n\n```console\n$ docker compose logs redis\n```\n

The logs often tell you why Redis failed (e.g., out of memory, wrong command-line arguments,\ndependencies missing).\n\n**7. Assuming Redis data survives `docker rm -f`.**\n\n`docker rm -f` removes the container but preserves the data only if you are using a named\nvolume. Without a named volume, the data in the container's writable layer is lost.\n\n**8. `--maxmemory` set too low.**\n

If you set `--maxmemory 1mb` on Redis, it will quickly reach the limit and start returning\nerrors on `SET` commands. Start with a generous limit and observe `INFO memory` output.\n\n**9. `redis-cli` timeout hanging.**\n

If Redis is not yet healthy, `redis-cli ping` may hang. Use the healthcheck `timeout: 3s` to\nensure it does not block the Compose startup forever.\n\n**10. Mixing `redis-cli` with and without a password.**\n

If your Redis requires a password, use `redis-cli -a $PASSWORD ping`. Without the password,\n`redis-cli ping` may return `(error) NOAUTH Authentication required.`\n\n---\n

## 6. Try it yourself\n\n**Exercise.** Run Redis with an app, set and get keys, test persistence, and verify health gating.\n\n**Step 1 — create a Compose file with Redis.**\n\n```bash\n$ cd /home/sunny/app/nimo/docker-doc/docker-learn\n```\n\n```yaml\nservices:\n  redis:\n    image: redis:7-alpine\n    container_name: redis-cache\n    restart: unless-stopped\n    networks:\n      - appnet\n    memory: 256m\n    memory_swap: 512m\n    command: ["redis-server", "--maxmemory", "256mb", "--appendonly", "yes"]\n    healthcheck:\n      test: [\"CMD\", \"redis-cli\", \"ping\"]\n      interval: 5s\n      timeout: 3s\n      start_period: 3s\n      retries: 3\n\n  api:\n    build: .\n    depends_on:\n      redis:\n        condition: service_healthy\n    environment:\n      REDIS_URL: redis://redis:6379\n\nnetworks:\n  appnet:\n    driver: bridge\n```\n\n**Step 2 — start the services.**\n\n```console\n$ docker compose up -d\n```\n\n```console\n$ docker compose ps\n```\n

```console\n$ docker compose exec redis redis-cli ping\n```\n

Output: `PONG` — Redis is running.\n\n```console\n$ docker compose exec redis redis-cli SET visits 42\n```\n

Output: `OK`.\n\n```console\n$ docker compose exec redis redis-cli GET visits\n```\n

Output: `42` — the key is set and gettable.\n\n**Step 3 — test health gating.**\n\n```console\n# The api service should be Waiting until redis is healthy.\n$ docker compose ps\n```\n

```console\n$ sleep 6\n$ docker compose ps\n```\n

The `api` should now be `Up` because Redis is healthy.\n\n**Step 4 — test persistence across restart.**\n\n```console\n$ docker compose down\n# (Do not use -v, the data should survive if using --appendonly yes and a local file).\n$ docker compose up -d\n```\n\n```console\n$ docker compose exec redis redis-cli GET visits\n```\n

Output: `42` — the key survived the restart because `--appendonly yes` was set.\n\n**Step 5 — clean up.**\n\n```console\n$ docker compose down\n```\n\n---\n

## 7. Next\n\nYou have Redis running next to your app with memory limits and health gating. Next: hot reload\nin development — two-file dev setup with bind mounts and `--watch` for code reload.\n\n**[Chapter 31 — Pattern: Hot Reload in Development](31-pattern-hot-reload-dev.md)**