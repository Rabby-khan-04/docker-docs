# 29 — Pattern: PostgreSQL with Persistence

> Verified on: Docker Engine **29.8.2**, Compose **v5.6.0**, BuildKit **v0.33.1**, Ubuntu 26.04.1 LTS, x86_64.

## 1. Simple explanation (like I'm 7)

A database usually stores data on disk. If you run PostgreSQL inside a container and the container is\nremoved, the data is gone — unless you have a **persistent volume** that survives the container's\nlifetime.

This chapter shows how to run PostgreSQL in Docker with a named volume so your data survives\n`docker compose down`, `docker rm`, and even machine reboots.

## 2. Real name

### PostgreSQL Docker image

The official PostgreSQL image is `postgres:version`. It is ready to use out of the box.

| Environment variable | Purpose | Example |
| :--- | :--- | :--- |
| `POSTGRES_PASSWORD` | Superuser password. Required for first start. | `POSTGRES_PASSWORD=secret` |
| `POSTGRES_USER` | Create a custom user. | `POSTGRES_USER=learn` |
| `POSTGRES_DB` | Create a default database. | `POSTGRES_DB=learndb` |

### Named volumes in Docker

| Command | What it does |
| :--- | :--- |
| `docker volume create pgdata` | Creates a named volume called `pgdata`. |
| `docker volume inspect pgdata` | Show volume details (path on host, driver, etc.). |
| `docker volume prune` | Removes **anonymous** volumes only. **Does not** remove named volumes. |
| `docker volume rm pgdata` | Removes the named volume and its data. **Be careful.** |
| In `compose.yaml`: `volumes: - pgdata:/var/lib/postgresql/data` | Mounts the named volume at the PostgreSQL data directory. |

### PostgreSQL healthcheck

```dockerfile
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \\
  CMD pg_isready -U learn -d learndb
```

`pg_isready` checks if PostgreSQL is accepting connections. Exit code 0 = ready, non-zero = not ready.

### Backup and restore

```console
# Backup (run inside the container or via docker exec)
$ docker exec pg-db pg_dump -U learn learndb > backup.sql

# Restore
$ docker exec -i pg-db psql -U learn learndb < backup.sql
```

Or, using a backup container:

```console
$ docker run --rm -v pgdata:/var/lib/postgresql/data -v $(pwd):/backup alpine sh -c \'cd /var/lib/postgresql/data && cp -r pg_dark /backup/\'
```

## 3. Command example\n\n### PostgreSQL in Compose with a named volume\n\n```yaml\nservices:\n  db:\n    image: postgres:17-alpine\n    container_name: pg-db\n    restart: unless-stopped\n    environment:\n      POSTGRES_PASSWORD: secret\n      POSTGRES_USER: learn\n      POSTGRES_DB: learndb\n    volumes:\n      - pgdata:/var/lib/postgresql/data\n    networks:\n      - appnet\n    healthcheck:\n      test: [\"CMD\", \"pg_isready\", \"-U\", \"learn\", \"-d\", \"learndb\"]\n      interval: 10s\n      timeout: 3s\n      start_period: 5s\n      retries: 3\n\nnetworks:\n  appnet:\n    driver: bridge\n```\n\n```console\n$ cd /home/sunny/app/nimo/docker-doc/docker-learn\n$ docker compose up -d\n```\n\n```console\n$ docker compose ps\n```\n

Output: `pg-db` should be `Up` and `healthy` (after the start-period).\n\n```console\n$ docker compose exec db pg_isready -U learn -d learndb\n```\n

Output: `pg_db is ready` — PostgreSQL is accepting connections.\n\n### Create a table and insert data\n\n```console\n$ docker compose exec db psql -U learn -d learndb -c \"\n  CREATE TABLE IF NOT EXISTS visits (\n    id SERIAL PRIMARY KEY,\n    counted_at TIMESTAMP DEFAULT NOW()\n  );\n  INSERT INTO visits (counted_at) VALUES (NOW());\n\"\n```\n\n### Backup the data\n\n```console\n$ docker compose exec db pg_dump -U learn -d learndb > /tmp/opencode/backup.sql\n```\n\n### Simulate data loss and restore\n\n```console\n# Remove the container (but NOT the volume).\n$ docker compose down\n```\n\nThe `pgdata` volume is preserved. The data is still there.\n\n```console\n# Restart the database.\n$ docker compose up -d db\n```\n\n```console\n$ docker compose exec db pg_isready -U learn -d learndb\n```\n

Output: `pg_db is ready` — data is still accessible.\n\n```console\n$ docker compose exec db psql -U learn -d learndb -c \"SELECT COUNT(*) FROM visits;\"\n```\n

Output: the same rows you inserted earlier — data survived the container removal.\n\n### Remove the volume (data loss!)\n\n```console\n$ docker compose down -v\n```\n\nThe `pgdata` volume is removed. All data is lost.\n\n```console\n$ docker compose up -d db\n```\n\n```console\n$ docker compose exec db psql -U learn -d learndb -c \"SELECT COUNT(*) FROM visits;\"\n```\n

Output: `ERROR: relation "visits" does not exist` — the data is gone.\n\n## 4. When to use these patterns and when NOT to\n\n### Use PostgreSQL persistence patterns when\n\n- **You need a real database** without installing PostgreSQL on the host machine.\n- **You want data to survive container restarts and redeploys.** Named volumes make this possible.\n- **You are running PostgreSQL in Docker Compose** for development or staging.\n- **You need to back up and restore** data periodically.\n\n### Do not use these patterns when\n\n- **You are running a short-lived job** that does not need persistent data. Use an ephemeral\n  container instead (no volumes).\n- **You need high availability** (primary-replica setups, automated failover). This chapter covers\n  a single-node PostgreSQL instance. For HA, look at Patroni, PgBouncer, or Kubernetes operators.\n- **You are running production critical data** without backups. Named volumes survive container\n  restarts, but they are not a backup strategy. If the host machine dies, the volume data may be\n  lost. Use proper backups (pg_dump, cloud snapshots).\n- **You need PostgreSQL features** that the official image does not support (e.g., PostGIS, \nextensions). You can add them with `RUN apt-get install -y ...` or by extending the image.\n\n### A practical PostgreSQL pattern\n\n```dockerfile\n# In compose.yaml (or Dockerfile if customizing)\nservices:\n  db:\n    image: postgres:17-alpine\n    restart: unless-stopped\n    environment:\n      POSTGRES_PASSWORD: secret\n      POSTGRES_USER: learn\n      POSTGRES_DB: learndb\n    volumes:\n      - pgdata:/var/lib/postgresql/data\n    networks:\n      - appnet\n    healthcheck:\n      test: [\"CMD\", \"pg_isready\", \"-U\", \"learn\", \"-d\", \"learndb\"]\n      interval: 10s\n      timeout: 3s\n      start_period: 5s\n      retries: 3\n\nnetworks:\n  appnet:\n    driver: bridge\n\nvolumes:\n  pgdata:\n```\n\n```console\n$ docker compose up -d db\n$ docker compose exec db pg_isready -U learn -d learndb\n$ docker compose exec db psql -U learn -d learndb -c \"\\dt\"\n```\n

Lists tables in the database. You should see none initially, or any tables you created earlier.\n\n## 5. Common mistakes\n\n**1. `docker compose down -v` removing the data volume.**\n\n```console\n$ docker compose down -v\n```\n

Removes named volumes declared in the Compose file. **Do not use `-v`** if you want to keep the\nPostgreSQL data. Use `docker compose down` (without `-v`) to preserve the volume.\n\n**2. Forgetting `POSTGRES_PASSWORD`.**\n\nThe official PostgreSQL image requires `POSTGRES_PASSWORD` on first start. If you omit it, the\ncontainer will fail to start.\n\n**3. Using a bind mount instead of a named volume.**\n\n```yaml\n# Anti-pattern: bind mount\nvolumes:\n  - ./pgdata:/var/lib/postgresql/data\n```\n\nBind mounts are slower than named volumes and can corrupt on some filesystems (especially macOS\nand Windows). On Linux, named volumes are preferred for production.\n\n**4. Not using a healthcheck.**\n\nWithout a healthcheck, `docker compose depends_on: condition: service_healthy` cannot wait for\nPostgreSQL to be ready, and your app may try to connect before the database is ready.\n\n**5. `pg_dump` fails because the password is not passed.**\n\n```console\n$ docker exec db pg_dump -U learn learndb > backup.sql\n```\n\nMay prompt for a password or fail. Use the environment variable:\n\n```console\n$ docker exec -e POSTGRES_PASSWORD=secret db pg_dump -U learn -d learndb > backup.sql\n```\n\n**6. Assuming data survives `docker rm -f` automatically.**\n\n`docker rm -f` removes the container but preserves named volumes. However, if you used a bind\nmount (deprecated pattern), the data on the host may or may not be preserved depending on ownership.\nAlways use named volumes for reliable data survival.\n\n**7. Not pinning the PostgreSQL version.**\n\n```yaml\nimage: postgres:17-alpine\n```\n

Without a version pin, `docker compose up` may pull a newer version with different behavior.\nPin by version (or digest) for reproducibility.\n\n**8. Running PostgreSQL on a host bind mount with wrong ownership.**\n\nIf you use a bind mount and the data directory is owned by `postgres` inside the container but\nyour user on the host, `pg_ctl` may fail to start. Use named volumes instead.\n\n**9. Not checking PostgreSQL logs when it won't start.**\n\n```console\n$ docker compose logs db\n```\

The logs often tell you exactly why PostgreSQL failed (e.g., invalid password, out of disk space,\nmissing dependencies).\n\n**10. `docker volume prune -f` removing the named PostgreSQL volume.**\n\n```console\n$ docker volume prune -f\n```\n

Removes **anonymous** volumes only. Named volumes (like `pgdata` created by Compose) are NOT\nremoved by `docker volume prune -f`. However, if you named the volume explicitly and it is\nnot referenced by any container, it could be removed. Always verify which volumes are in use\nbefore pruning.\n\n---\n

## 6. Try it yourself\n\n**Exercise.** Run PostgreSQL with a named volume, insert data, remove the container, and verify\ndata survives.\n\n**Step 1 — create a Compose file with PostgreSQL.**\n\n```bash\n$ cd /home/sunny/app/nimo/docker-doc/docker-learn\n```\n\n```yaml\nservices:\n  db:\n    image: postgres:17-alpine\n    container_name: pg-db\n    restart: unless-stopped\n    environment:\n      POSTGRES_PASSWORD: secret\n      POSTGRES_USER: learn\n      POSTGRES_DB: learndb\n    volumes:\n      - pgdata:/var/lib/postgresql/data\n    networks:\n      - appnet\n    healthcheck:\n      test: [\"CMD\", \"pg_isready\", \"-U\", \"learn\", \"-d\", \"learndb\"]\n      interval: 10s\n      timeout: 3s\n      start_period: 5s\n      retries: 3\n\nnetworks:\n  appnet:\n    driver: bridge\n\nvolumes:\n  pgdata:\n```\n\n**Step 2 — start PostgreSQL.**\n\n```console\n$ docker compose up -d db\n```\n\n```console\n$ docker compose ps\n```\n

```console\n$ docker compose exec db pg_isready -U learn -d learndb\n```\n

Output: `pg_db is ready` — PostgreSQL is running and accepting connections.\n\n**Step 3 — create a table and insert data.**\n\n```console\n$ docker compose exec db psql -U learn -d learndb -c \"\n  CREATE TABLE IF NOT EXISTS visits (\n    id SERIAL PRIMARY KEY,\n    counted_at TIMESTAMP DEFAULT NOW()\n  );\n  INSERT INTO visits (counted_at) VALUES (NOW());\n\"\n```\n\n**Step 4 — verify data survives container removal.**\n\n```console\n# Remove the db container, but keep the volume.\n$ docker compose down\n```\n\nThe `pgdata` volume is preserved (do not use `docker compose down -v`).\n\n```console\n# Restart the database.\n$ docker compose up -d db\n```\n\n```console\n$ docker compose exec db pg_isready -U learn -d learndb\n```\n

Output: `pg_db is ready` — data is still accessible.\n\n```console\n$ docker compose exec db psql -U learn -d learndb -c \"SELECT COUNT(*) FROM visits;\"\n```\n

Output: ` count\n----------\n 1` — the row you inserted earlier is still there.\n\n**Step 5 — clean up (remove the volume, data loss!).**\n\n```console\n$ docker compose down -v\n```\n\n```console\n$ docker compose up -d db\n$ docker compose exec db psql -U learn -d learndb -c \"SELECT COUNT(*) FROM visits;\"\n```\n

Output: `ERROR: relation "visits" does not exist` — data is gone because the volume was removed.\n\n**Step 6 — final cleanup.**\n\n```console\n$ docker compose down\n```\n\n---\n

## 7. Next\n\nYou have a PostgreSQL container with persistent data. Next: Redis next to your app — a cache\npattern with memory limits and health gating.\n\n**[Chapter 30 — Pattern: Redis with an App](30-pattern-redis-with-an-app.md)**