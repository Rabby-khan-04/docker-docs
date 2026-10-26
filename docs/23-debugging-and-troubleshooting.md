# 23 — Debugging and Troubleshooting

> Verified on: Docker Engine **29.8.2**, Compose **v5.6.0**, BuildKit **v0.33.1**, Ubuntu 26.04.1 LTS, x86_64.

## 1. Simple explanation (like I'm 7)

Docker can be mysterious. A container won't start, it exits right away, or you cannot connect to it. This chapter gives you a **symptom-first triage flow** — you look at the symptom, check a few things in order, and find the cause.

Think of it like a car that won't start: you check the fuel, the battery, the starter, and then the engine. Docker has the same kind of diagnostic steps.

## 2. Real name

### Symptom-first triage flow

When something goes wrong, follow this order:

| Symptom | First check | Second check | Third check |
| :--- | :--- | :--- | :--- |
| **Container won't start** | `docker ps` — is it listed? | `docker inspect` — what is `State.Status` and `ExitCode`? | `docker logs` — any output? |
| **Container exits immediately** | `docker inspect --format '{{.State.ExitCode}}'` | `docker logs` — what does the app print? | `docker diff` — what changed? |
| **Cannot connect to app** | `docker ps` — is the port mapped? | `docker inspect` — is `EXPOSE` set? | `curl` inside the container — can the app reach itself? |
| **OOM killed** | `docker stats` — memory usage vs limit | `docker inspect` — `OOMKilled` true | `docker run` without `--memory` — does it still happen? |
| **Permission denied on a mount** | `docker inspect` — user/group IDs | `ls -la` on the mount point | `id` inside the container |
| **DNS fails between containers** | `docker compose ps` — are they on the same network? | `docker exec` — `nslookup` or `ping`? | `docker network inspect` — is DNS enabled? |

### `docker inspect` — the most important debugging tool

```console
$ docker inspect container-name --format '{{json .State}}'
```

This dumps the full JSON state of the container. You can extract specific fields with Go templates:

```console
# Is it running?
$ docker inspect container-name --format '{{.State.Status}}'
# Exit code?
$ docker inspect container-name --format '{{.State.ExitCode}}'
# OOM killed?
$ docker inspect container-name --format '{{.State.OOMKilled}}'
# Restart count?
$ docker inspect container-name --format '{{.RestartCount}}'
# Host config (memory, cpu, etc.)?
$ docker inspect container-name --format '{{.HostConfig}}'
```

### `docker logs` — see what the app printed

```console
$ docker logs container-name
$ docker logs --tail 20 container-name    # last 20 lines only
$ docker logs --timestamps container-name  # add timestamps
$ docker logs --tail 20 --timestamps container-name  # both
```

### `docker diff` — what changed in the writable layer

```console
$ docker diff container-name
```

Shows `C` (created), `D` (deleted), or `M` (modified) for each file in the writable layer.

### `docker events` — see what happened on the daemon

```console
$ docker events --since 5m
```

Lists events (container start, stop, kill, restart, image pull, etc.) from the last 5 minutes.

### Common patterns and their fixes

| Problem | Cause | Fix |
| :--- | :--- | :--- |
| Container exits immediately | `CMD` runs and exits, or `ENTRYPOINT` exits, or OOM | Add `tail -f /dev/null` or a loop in `CMD`, or add resource limits |
| `docker stop` hangs 10s | Shell-form `CMD` makes PID 1 a `sh` child | Use exec form for `CMD`, or add `--init` |
| `curl` inside container fails | Container has no network, or DNS not working | Check network mode, `docker network inspect`, `docker exec` ping/nslookup |
| Port conflict | Two services publish same host port | Use different host ports, or use user-defined network without `-p` |
| `docker compose up` hangs | Healthcheck never succeeds, or `depends_on` without condition | Fix healthcheck, add `condition: service_healthy` |
| `docker run` permission denied on bind mount | UID/GID mismatch between host and container | Use ` -u $(id -u):$(id -g)` or fix ownership on the host |
| Image build is slow | Cache invalidation from wrong layer order | Reorder Dockerfile: copy dependency files first, then source |
| `docker push` fails | Not logged in, or tag does not include username | `docker login`, then `docker tag YOURUSER/IMAGE:TAG` |

### `docker container` commands for debugging

| Command | What it does |
| :--- | :--- |
| `docker container ls` / `ps` | List containers |
| `container start` / `stop` / `restart` | Control container state |
| `container exec` | Run a command inside a running container |
| `container top` | Show running processes inside a container |
| `container stats` | Live resource usage |
| `container wait` | Block until container exits, return exit code |
| `container kill` | Force kill a container with a signal |
| `container rename` | Rename a container |

### `docker image` commands for debugging

| Command | What it does |
| :--- | :--- |
| `docker image ls` | List images |
| `docker image inspect` | Full image JSON state |
| `docker image history` | Show each build step and its exit status |
| `docker image prune` / `-a` | Remove unwanted images |
| `docker image df` | Show disk usage per image |

### `docker network` commands for debugging

| Command | What it does |
| :--- | :--- |
| `docker network ls` | List networks |
| `docker network inspect` | Show network details (IPAM, DNS, etc.) |
| `docker network connect` / `disconnect` | Add/remove a container from a network |

### `docker container` logs tail with follow

```console
$ docker logs -f container-name
```

Follows the output in real time, like `tail -f`.

---\n

## 3. Command example\n\n### Container won't start — triage flow\n\n```console\n$ docker run -d --name bad-demo docker-learn:1.0.0\n```\n\n```console\n$ docker ps -a --filter name=bad-demo\n```\n\n```console\n$ docker inspect bad-demo --format '{{.State.Status}} {{.State.ExitCode}}'\n```\n\nIf the status is ` exited ` and exit code is `137`, the container was OOM-killed. If it is ` exited ` with code `1`, the app inside crashed.\n\n```console\n$ docker logs bad-demo\n```\n\nIf the app printed an error message, you can see it here. If nothing is printed, the `CMD` may have exited immediately.\n\n```console\n$ docker diff bad-demo\n```\n\nIf files were created or modified in the writable layer, they will show up here.\n\n### Container exits immediately — what killed it?\n\n```console\n$ docker run -d --name exit-demo docker-learn:1.0.0\n$ sleep 2\n$ docker inspect exit-demo --format '{{.State.OOMKilled}} {{.State.ExitCode}}'\n```\n\nOutput: `true  137` — the kernel OOM killer terminated the container because it exceeded its memory limit.\n\n### Cannot connect to the app — triage\n\n```console\n$ docker run -d --name net-demo -p 3099:3000 docker-learn:1.0.0\n$ curl -s http://localhost:3099/\n```\n\nIf `curl` returns the app's HTML, the port mapping is correct. If `curl` fails with `connection refused`,\ncheck that the app is listening on port 3000 inside the container.\n\n```console\n$ docker exec net-demo sh -c 'node -e \"const http = require(\"http\"); const server = http.createServer((req, res) => res.end(\"ok\")); server.listen(3000);\"'\n```\n\nStarts a quick server inside the container. Then try `curl` again from the host.\n\n### OOM killed — check memory limits\n\n```console\n$ docker stats --no-stream exit-demo\n```\n\n shows `MEM USAGE / LIMIT`. If the usage is at or near the limit, the OOM killer is the likely cause.\n\n```console\n$ docker run -d --name no-mem -p 3100:3000 docker-learn:1.0.0\n$ sleep 3\n$ docker inspect no-mem --format '{{.State.OOMKilled}}'\n```\n\nWithout `--memory`, the container has no limit and will not be OOM-killed.\n\n### Permission denied on a bind mount\n\n```console\n$ docker run -d --name mount-demo -v $(pwd):/app -p 3101:3000 docker-learn:1.0.0\n$ docker exec mount-demo touch /app/test.txt 2>&1\n```\n\nOutput: `touch: cannot touch '/app/test.txt': Permission denied`. The host file is owned by your user,\nbut the container runs as `node` (UID 1000). Fix with ` -u $(id -u):$(id -g)` or change ownership.\n\n### DNS fails between containers in Compose\n\n```console\n$ docker compose up -d\n$ docker exec api nslookup worker\n```\n\nIf `nslookup` fails, check the network. By default Compose creates a bridge network `appnet`;\nmake sure both services are on it (the `networks:` key in their definitions).\n\n```console\n$ docker network inspect appnet\n```\n\nShould show a `IPAM` block with DNS settings.\n\n---\n\n## 4. When to use it and when NOT to\n\n### Use debugging steps when\n\n- **A container won't start** or exits immediately — follow the triage flow above.\n- **You cannot connect** to an app running inside a container.\n- **You suspect resource limits** (OOM, CPU) are causing crashes.\n- **You have permission issues** on bind mounts or volumes.\n- **DNS between containers** is not resolving.\n\n### Do not skip the triage flow.**\n\nRunning `docker rm -f container` and starting over without diagnosing the cause will\njust repeat the same problem. The triage flow takes seconds and prevents wasted time.\n\n### Do not rely on `docker restart` to fix logical errors.**\n\nRestarting a container does not fix configuration bugs, missing dependencies, or wrong\nport mappings. It only recovers from transient failures.\n\n### Do not ignore `docker events` for intermittent failures.**\nIf a container starts and stops sporadically, `docker events --since 10m` can reveal the\npattern (e.g., it always stops after 47 seconds, suggesting a timeout or resource limit).\n\n---\n

## 5. Common mistakes\n\n**1. `docker ps` shows the container is `Up` but you cannot connect.**\n\nThe port may not be mapped correctly, or the app is listening on a different internal port.\n\n```console\n$ docker inspect container-name --format '{{.NetworkSettings.Ports}}'\n```\n\nCheck the port mappings.\n\n**2. `docker logs` shows nothing.**\n\nIf `CMD` exits immediately, there are no logs. Add `tail -f /dev/null` or a `while true; do\nsleep 3600; done` to keep the container running while you debug.\n\n**3. `docker stop` hangs for 10 seconds.**\n\nThis is usually because `CMD` is in shell form (`CMD echo hello`), making PID 1 a `sh` child.\n`sh` does not forward `SIGTERM` to your app. Use exec form for `CMD` (as this course does).\n\n**4. Assuming `docker diff` shows all filesystem changes.**\n\n`docker diff` only shows changes in the **writable layer** of a running or stopped container.\nIf you committed an image from a container, the writable layer is preserved in the new image.\n\n**5. `docker inspect` output is too verbose.**\n\nUse Go templates to extract exactly what you need:\n\n```console\n$ docker inspect container --format '{{.State.Status}}'\n$ docker inspect container --format '{{.State.ExitCode}}'\n$ docker inspect container --format '{{.HostConfig.Memory}}'\n```\n\n**6. Forgetting that `docker container prune` only removes stopped containers.**\n\nRunning containers are never removed by `docker container prune`. Use `docker stop` first if you\nwant to remove them, or use `docker system prune`.\n\n**7. `docker compose up` hangs because of a faulty healthcheck.**\n\nIf the healthcheck command is not in the image, or the timeout is too short, or the app never\nactually listens on the checked port, the healthcheck will fail and `docker compose up --wait`\nwill wait until the timeout. Debug the healthcheck first.\n\n**8. `docker exec` into a container that is restart-looping.**\n\nIf the container's `CMD` exits immediately, `docker exec` may not work because the container\nis not running. Wait for it to stabilize, or use `docker container wait` to block until it exits.\n\n**9. Assuming all containers on the same bridge network can reach each other by name.**\n\nBy default, containers on a user-defined bridge network can resolve each other's names via Docker's\nembedded DNS. But if you use `network_mode: host`, there is no embedded DNS, and containers\nmust use `localhost` or IP addresses.\n\n**10. `docker events` flooding the terminal.**\n\nPress `Ctrl+C` to stop. You can also filter events: `docker events --filter container=abc123` or\n`docker events --filter event=start`.\n\n---\n

## 6. Try it yourself\n\n**Exercise.** Practice the triage flow on a misconfigured container.\n\n**Step 1 — create a container that will not start properly:**\n\n```console\n$ docker run -d --name triage-test -p 3102:3000 docker-learn:1.0.0\n$ sleep 3\n```\n\n```console\n$ docker ps -a --filter name=triage-test\n```\n\n```console\n$ docker inspect triage-test --format '{{.State.Status}} {{.State.ExitCode}}'\n```\n\n**Step 2 — check the logs:**\n\n```console\n$ docker logs triage-test\n```\n\n**Step 3 — apply the triage flow:**\n\n1. Is the container running? `docker ps -a`.\n2. What is the exit code? `docker inspect --format '{{.State.ExitCode}}'`.\n3. What do the logs say? `docker logs`.\n4. Are resource limits involved? `docker stats`.\n5. Can you fix the issue based on what you learned?\n\n**Step 4 — fix and verify:**\n\nIf the app exited immediately, try running with a keep-alive CMD:\n\n```console\n$ docker run -d --name triage-fixed -p 3102:3000 \\\n  docker-learn:1.0.0 \\\n  sh -c 'while true; do sleep 3600; done'\n```\n\n```console\n$ docker ps --filter name=triage-fixed\n```\n\nThe container should now be `Up`.\n\n**Step 5 — clean up:**\n\n```console\n$ docker rm -f triage-test triage-fixed\n```\n\n---\n

## 7. Next\n\nYou can systematically diagnose and fix container problems. Next: building images in CI pipelines,\nrunning tests against the built image, and reproducible deployments from git SHAs.\n\n**[Chapter 24 — CI/CD Basics](24-ci-cd-basics.md)**