# 19 — Restart Policies and Runtime Security

> Verified on: Docker Engine **29.8.2**, Compose **v5.6.0**, BuildKit **v0.33.1**, Ubuntu 26.04.1 LTS, x86_64.

---

## 1. Simple explanation (like I'm 7)

A **restart policy** is like a night guard for your container. If the container crashes or the
machine reboots, the guard decides whether to wake it back up, leave it dead, or keep it running
no matter what.

There are four policies, and one of them is subtler than people realize.

**Runtime security** is about making the container less dangerous if it gets compromised. You can
strip away unnecessary capabilities, make the root filesystem read-only, and prevent the container
from gaining new privileges.

---

## 2. Real name

### Restart policies

```console
$ docker run -d --name rp --restart always alpine:3.24 sh -c 'exit 1'
```

| Policy | Behavior | When it restarts |
| :--- | :--- | :--- |
| `no` (default) | Do not restart. | Never. |
| `on-failure` | Restart only if the container exits with a non-zero code. | Up to `max` retries (default 0 = unlimited). |
| `always` | Always restart, regardless of how it exited. | Always, even after `docker stop`/`docker start`. |
| `unless-stopped` | Same as `always`, **but** respects manual `docker stop`. | After manual stop, stays stopped. |

### Verified behavior

```console
$ docker run -d --name rp-always --restart always alpine:3.24 sh -c 'exit 1'
$ sleep 3
$ docker inspect rp-always --format '{{.State.Status}} restarts={{.RestartCount}}'
# Output: running restarts=3 (it keeps restarting)

$ docker stop rp-always
$ sleep 3
$ docker inspect rp-always --format '{{.State.Status}} restarts={{.RestartCount}}'
# Output: exited restarts=3 (manual stop had no effect)

$ docker run -d --name rp-unless --restart unless-stopped alpine:3.24 sh -c 'exit 1'
$ sleep 3
$ docker inspect rp-unless --format '{{.State.Status}} restarts={{.RestartCount}}'
# Output: running restarts=3

$ docker stop rp-unless
$ sleep 3
$ docker inspect rp-unless --format '{{.State.Status}} restarts={{.RestartCount}}'
# Output: exited restarts=3 (manual stop respected)
```

### `unless-stopped` vs `always` — the critical difference

- **`always`**: After `docker stop`, `docker start` causes another restart. The container never
  stays stopped.
- **`unless-stopped`**: After `docker stop`, the container stays stopped. `docker start` causes a
  restart.

This is the **only** restart policy that respects manual stops.

### Resource limits + restart policy interaction

If a container hits a resource limit (OOM, CPU limit), it exits with a non-zero code. This counts
as a failure for `on-failure` restart policy. `always` and `unless-stopped` will restart it
regardless.

---

### Runtime security

| Security measure | What it does | Verified effect |
| :--- | :--- | :--- |
| `--read-only` | Mounts the container's root filesystem as read-only. | Files cannot be written inside the container. |
| `--cap-drop=ALL` | drops all Linux capabilities. | `CapEff` in `/proc/self/status` becomes `0`. |
| `--security-opt no-new-privileges:true` | prevents the container from gaining new privileges via `setuid`/`setgid` or
  other mechanisms. | `NoNewPrivs: 1` in `/proc/self/status`. |
| `-v /var/run/docker.sock:/var/run/docker.sock` | mounts the Docker socket inside the container. | The container has full control of the Docker daemon (root-equivalent). **Avoid in production.** |

### `--read-only` with tmpfs

```console
$ docker run --rm --read-only --tmpfs /tmp --tmpfs /run alpine:3.24 touch /tmp/test
```

Without `--tmpfs /tmp`, the `touch` command fails with `EROFS` (read-only file system). With
`--tmpfs /tmp`, a temporary in-memory filesystem is mounted and the write succeeds.

### Capability dropping

```console
$ docker run --rm --cap-drop=ALL node:22-alpine grep CapEff /proc/self/status
```

Output: `CapEff: 0000000000000000` — all capabilities dropped. The container has no extra
privileges beyond the basic ones needed to run.

### No-new-privileges

```console
$ docker run --rm --security-opt no-new-privileges:true node:22-alpine grep NoNewPrivs /proc/self/status
```

Output: `NoNewPrivs: 1` — the container cannot gain new privileges (e.g., via `exec` into a
privileged binary, or via `setuid`/`setgid` binaries).

---

## 3. Command example

### Apply all three security measures together

```console
$ docker run -d --name secure \
  --read-only \
  --tmpfs /tmp \
  --tmpfs /run \
  --cap-drop=ALL \
  --security-opt no-new-privileges:true \
  node:22-alpine \
  sh -c 'echo "secure container"; touch /tmp/x 2>&1; echo "write result: $?"'
```

Output: `"secure container"` then `"write result: Error: EROFS: cannot create file, filesystem is read-only"`.

The container can read and run, but cannot write to the root filesystem. The `/tmp` tmpfs allows
temporary writes if needed.

### `docker run` with restart policy + security

```console
$ docker run -d --name secure-rp \
  --restart unless-stopped \
  --read-only \
  --cap-drop=ALL \
  --security-opt no-new-privileges:true \
  node:22-alpine
```

The container will restart automatically after a crash (unless-stopped), but it will run with
read-only rootfs, no extra capabilities, and no new-privileges.

---

## 4. When to use it and when NOT to

### Use runtime security when

- **You are running untrusted or potentially compromised code** in a container.
- **You are hosting multi-tenant workloads** where no container should be able to escape or
  privilege-escalate to affect others.
- **You are following the principle of least privilege.** Give the container only what it needs.

### Do not use `--read-only` when

- **Your app needs to write to its root filesystem.** Some apps write to `/tmp`, `/run`, or
  other absolute paths during normal operation. Use `--tmpfs /tmp` / `--tmpfs /run` to provide
  writable temporary directories.

### Do not use `--cap-drop=ALL` / `--security-opt no-new-privileges:true` when

- **Your app genuinely needs those capabilities.** Some networking plugins, device drivers, or
  legacy software require specific capabilities. Know what your app needs before dropping everything.
- **You are running trusted single-tenant workloads** where the overhead of security restrictions
  is not justified.

### Use restart policies when

- **You want the container to survive transient crashes.** `on-failure:5` restarts up to 5 times.
- **You want the container to always be running.** `always` or `unless-stopped` for production services.
- **You are using `docker compose up`** and want the service to come back after a restart.

### Do not use restart policies when

- **The crash indicates a fundamental problem** that a restart will not fix (e.g., corrupted config,
  missing dependency). Restarting will just loop forever. Fix the root cause instead.
- **You are running a one-off job.** `docker run` for a short task does not need a restart policy.

---

## 6. Common mistakes

**1. `docker stop` on a container with `restart: always` does not stop it.**

```console
$ docker stop rp-always
$ docker inspect rp-always --format '{{.State.Status}}'
# Output: running (the container was restarted, not stopped)
```

Use `unless-stopped` if you want manual stops to work.

**2. `docker start` on a `unless-stopped` container after manual stop does not restart it.**

```console
$ docker stop rp-unless
$ docker start rp-unless
$ docker inspect rp-unless --format '{{.State.Status}}'
# Output: exited (the container stays stopped)
```

3. **`--read-only` without `--tmpfs /tmp` or `--tmpfs /run`** and wondering why the app can't write
   temporary files.

4. **`--cap-drop=ALL` breaking the container.** Some containers need specific capabilities (e.g.,
   `NET_ADMIN` for networking plugins, `SYS_PTRACE` for debugging). Know what your app needs
   before dropping all capabilities.

5. **`--security-opt no-new-privileges:true` breaking the container.** Some installers and
   scripts use mechanisms that require new privileges. Know your app before restricting it.

6. **`docker stop` on a `restart: always` container and wondering why it restarts immediately.**
   The `always` policy does not respect manual stops. Use `unless-stopped` instead.

7. **`--read-only` and `--tmpfs` combined incorrectly.** If you need `/tmp` and `/run` to be writable,
   add both `--tmpfs /tmp` and `--tmpfs /run`. Omitting one makes the other's writes fail or the
   container fail to start.

8. **Assuming `docker stop` always stops the container.** With `restart: always`, `docker stop` sends
   SIGTERM, the container may not stop cleanly, and the restart policy immediately restarts it.
   Use `unless-stopped` if you need manual stops to work.

9. **`--security-opt no-new-privileges:true` and the `docker exec` privilege escalation.**
   Even with this flag, `docker exec` can still run commands inside the container. The flag prevents
   the container *itself* from gaining new privileges (e.g., via setuid binaries), but `docker exec`
   is a separate mechanism with its own access control.

10. **Dropping ALL capabilities and then wondering why the container can't do basic networking.**
    Some capabilities are needed for basic network operations. `NET_CLASS` and `NET_RAW` are often
    needed. `docker run --cap-drop=ALL` may break networking unless you know what you are doing.

---

## 6. Try it yourself

**Exercise.** Apply security measures and restart policies together.

**Step 1 — run a container with security measures:**

```console
$ docker run -d --name secure-test \
  --restart unless-stopped \
  --read-only \
  --tmpfs /tmp \
  --cap-drop=ALL \
  --security-opt no-new-privileges:true \
  node:22-alpine \
  sh -c 'echo "running secure container"; cat /etc/os-release'
```

```console
$ docker exec secure-test cat /etc/os-release
```

```console
$ docker exec secure-test touch /tmp/test 2>&1
```

The touch should fail with `ROPFS` (read-only filesystem).

**Step 2 — verify the process cannot gain new privileges.**

```console
$ docker exec secure-test grep NoNewPrivs /proc/self/status
```

Should output `NoNewPrivs: 1`.

**Step 3 — verify restart policy works.**

```console
$ docker container restart secure-test
$ sleep 2
$ docker inspect secure-test --format '{{.State.Status}}'
```

Should show `running` (restarted after the restart command).

**Step 4 — clean up:**

```console
$ docker rm -f secure-test
```

---

## 6. Next

You can control container restarts and enforce runtime security. Next: sending images to a
registry, cleaning up disk space, and basic CI/CD workflows.

**[Chapter 21 — Pushing to a Registry](21-pushing-to-a-registry.md)**