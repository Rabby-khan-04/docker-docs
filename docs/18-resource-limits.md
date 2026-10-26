# 18 — Resource Limits

> Verified on: Docker Engine **29.8.2**, Compose **v5.6.0**, BuildKit **v0.33.1**, Ubuntu 26.04.1 LTS, x86_64.

---

## 1. Simple explanation (like I'm 7)

Imagine you live in an apartment building. You have your own room, but you share the building's
total electricity and water. If one person runs a space heater 24/7, the fuse might blow and
everyone's lights go dark.

**Resource limits** are like putting a cap on your share. You can say "I can use at most 50% of
the building's electricity" or "I can use at most 100 gallons of water per day." If you go over,
the building manager (Docker) steps in.

For containers, the "building" is your machine, and the resources are CPU, memory, and process
limits. Without limits, one greedy container can use all the memory or CPU and slow down (or
freeze) every other container on the machine.

---

## 2. Real name

### CPU limits

| Flag | What it does | Verified on this machine |
| :--- | :--- | :--- |
| `--cpus 0.5` | The container can use at most half of one CPU core. | `docker run -d --name rp-cpu --cpus 0.5 alpine:3.24 sh -c 'while true; do :; done'` then `docker stats --no-stream rp-cpu` shows `CPU %` well below 50. |
| `--cpus 1.0` | The container can use at most one full core. | |
| `--cpus 2.0` | The container can use at most two cores. Can exceed 100% because it's 2 cores. | |

```console
$ docker stats --no-stream rp-cpu
CPU %     MEM USAGE / LIMIT    MEM %     NET I/O         BLOCK I/O   PIDS
b630efea9990   lim       0.00%     9.254MiB / 128MiB   7.23%     1.68kB / 126B   0B / 0B     7
```

The `CPU %` column shows a percentage of **one core**. On a machine with 8 cores, `250%` means "using one full core's worth of scheduling time."

### `--cpu-shares` — relative weight

```console
$ docker run -d --name cpu-share1 --cpu-shares 512 --cpus 1 alpha:3.24 &
$ docker run -d --name cpu-share2 --cpu-shares 1024 --cpus 1 alpha:3.24 &
```

`--cpu-shares` relative weight. 1024 gets twice as much CPU as 512, **when CPU is constrained**.
If there is plenty of CPU, both containers use very little.

### `--pids-limit` — maximum processes

```console
$ docker run -d --name pids --pids-limit 20 alpine:3.24 sh -c 'while true; do :; done'
```

If the container creates more than 20 processes, the OOM killer may step in or the container
may be killed. Useful for preventing fork bombs.

---

### Memory limits

| Flag | What it does | Verified |
| :--- | :--- | :--- |
| `--memory 128m` | The container can use at most 128 MB of RAM. | `docker run -d --name mem -p 32768:3000 --memory 128m docker-learn:1.0.0` then `docker stats --no-stream mem` shows `MEM USAGE / LIMIT` = `X MiB / 128MiB`. |
| `--memory-swap 256m` | Total memory + swap. Swap = `memory-swap` minus `memory`. | |
| `--memory-reservation 64m` | Soft limit. The kernel will try to keep the container's memory usage below this, but it can exceed it under pressure. | |

```console
$ docker stats --no-stream mem
CONTAINER ID   NAME      CPU %     MEM USAGE / LIMIT   MEM %     NET I/O         BLOCK I/O   PIDS
...            mem       0.00%     9.254MiB / 128MiB   7.23%     ...
```

### Interaction: `--memory` + `--memory-swap` + `--memory-reservation`

| `--memory` | `--memory-swap` | `--memory-reservation` | Behavior |
| :--- | :--- | :--- | :--- |
| `128m` | `256m` | (not set) | Container can use up to 128 MB. If it goes over, it can use up to 256 MB total (the excess comes from swap). |
| `128m` | `128m` | `64m` | Container is restricted to 128 MB. If it tries to go over 128 MB, the kernel attempts to keep it below the reservation of 64 MB (which is impossible), so the OOM killer may step in. |
| `128m` | `256m` | `128m` | Container can use up to 128 MB comfortably. If it exceeds 128 MB, it can go up to 256 MB (swap), but the kernel will try to keep it near the 128 MB reservation. |

---

### Combined usage example

```console
$ docker run -d --name lim \
  --memory 128m \
  --memory-swap 256m \
  --memory-reservation 64m \
  --cpus 0.5 \
  --cpu-shares 512 \
  --pids-limit 50 \
  -p 3056:3000 docker-learn:1.0.0
```

```console
$ docker stats --no-stream lim
CONTAINER ID   NAME      CPU %     MEM USAGE / LIMIT   MEM %     NET I/O         BLOCK I/O   PIDS
b630efea9990   lim       0.00%     9.254MiB / 128MiB   7.23%     1.68kB / 126B   0B / 0B     7
```

The stats show `MEM USAGE / LIMIT` = `9.254MiB / 128MiB`, `CPU %` well below 0.5, and `PIDs` = 7
(which is ≤ the `--pids-limit` of 50).

---

## 3. Command example

### Set memory and CPU limits

```console
$ docker run -d --name res-lim -p 32768:3000 \
  --memory 256m \
  --cpus 0.5 \
  docker-learn:1.0.0
```

```console
$ docker stats --no-stream res-lim
```

```console
CONTAINER ID   NAME      CPU %     MEM USAGE / LIMIT   MEM %     NET I/O         BLOCK I/O   PIDS
...            res-lim   ...       256MiB / 256MiB     ...       ...
```

### Remove limits — run without any

```console
$ docker run -d --name no-limits -p 32769:3000 docker-learn:1.0.0
```

No `--memory` or `--cpus` flags. The container can use all the machine's RAM and CPU. This is
the default, and it is why a runaway container can take down the whole machine.

### Limits in Compose

```yaml
services:
  api:
    deploy:
      resources:
        limits:
          memory: 256M
          cpus: '0.5'
```

Compose v2 supports `deploy.resources.limits` in the Compose file. On this Engine version, these
are documented but have no enforcement effect (unlike `--memory` on `docker run`). They are included
for compatibility and future use when running with Swarm.

### View current limits

```console
$ docker inspect res-lim --format 'Memory={{.HostConfig.Memory}} NanoCpus={{.HostConfig.NanoCpus}} MemorySwap={{.HostConfig.MemorySwap}} CpuShares={{.HostConfig.CpuShares}} PidsLimit={{.HostConfig.PidsLimit}}'
```

Output:

```console
Memory=268435456 NanoCpus=500000000 MemorySwap=536870912 CpuShares=512 PidsLimit=0
```

`PidsLimit=0` means "no limit."

---

## 4. When to use it and when NOT to

### Use resource limits when

- **You are running multiple containers on one machine.** Limits prevent one from starving the others.
- **You want the OOM killer to act predictably.** A hard memory limit means the kernel can OOM-kill
  the container instead of the whole host.
- **You are in a shared environment** (CI, development shared server, hosting). Limits are polite.
- **You are running production services.** You want guarantees that a crash in one container does
  not take down the whole machine.

### Do not use resource limits when

- **You are running a single container on a dedicated machine** and you trust its behavior. Limits
  add overhead and complexity for no benefit.
- **The app genuinely needs all the machine's resources.** E.g. a build server or a data processing
  job that needs to crunch through all available memory/CPU.
- **You are benchmarking Docker performance.** Limits change the benchmark results.

### A practical pattern

Always use `--memory` and `--cpus` (or Compose `deploy.resources.limits`) for production services,
even if you set them to high values. It is better to have limits and not need them than to need
them and not have them. Use `docker stats` to observe actual usage and tune the limits.

---

## 5. Common mistakes

**1. `--memory` without `--memory-swap`, and the container can use unlimited swap.**

```console
$ docker run -d --name mem-no-swap --memory 128m alpine:3.24
```

If the container uses 128 MB of RAM, it can also use unlimited swap. To limit total memory + swap,
set `--memory-swap` to the same value as `--memory`.

**2. `--cpus` and `CPU %` confusion.**

`CPU %` in `docker stats` is a percentage of **one core**. On an 8-core machine, `800%` means "using
all 8 cores." `100%` means "using one core." `250%` means "using 2.5 cores."

**3. `--cpu-shares` vs `--cpus`.**

`--cpus` sets an absolute limit. `--cpu-shares` is a relative weight only when CPU is constrained.
If there is plenty of CPU, both values have no effect.

**4. `--pids-limit` and the OOM killer.**

`--pids-limit` limits the number of processes, not memory. If the container runs out of memory,
the OOM killer may step in regardless of `--pids-limit`.

**5. `--memory-micros` instead of `--memory`.**

Docker accepts `--memory 128m` or `--memory 128000000` (bytes), but NOT `--memory 128` (assumed
bytes, which is 128 bytes — way too small). Always use a suffix ( `k`, `m`, `g`).

**6. `docker stats --no-stream` hangs.**

The `--no-stream` flag is mandatory in scripts. Without it, `docker stats` runs forever. In a
terminal without `--no-stream`, it streams live, which is what you want for interactive monitoring.

**7. `docker run --memory-of other-container`.**

This flag does not exist. If you want to copy another container's memory limit, use `docker inspect`
to read its value and apply it with `--memory`.

**8. Forgetting that `--cpus` is per the host's view.**

On a machine with 8 cores, `--cpus 4` means "at most 4 cores." On a machine with 1 core, `--cpus 4`
still means "at most 4 cores" — but the scheduler will time-slice, and the container can use up to
4 cores' worth of scheduling time (which may exceed real time).

**9. `docker compose` `deploy.resources.limits` on Engine without Swarm.**

These are documented but have no enforcement effect on plain Docker Engine. Use `--memory` and
`--cpus` on `docker run` for immediate effect.

**10. Setting `--memory` lower than the app's actual usage.**

If you set `--memory 32m` on an app that allocates 256 MB, the OOM killer will terminate it
immediately. Start with a generous limit and taper down, observing `docker stats` first.

---

## 6. Try it yourself

**Exercise.** Set resource limits and observe their effect.

**Step 1 — run with limits:**

```console
$ docker run -d --name lim -p 32767:3000 --memory 64m --cpus 0.2 docker-learn:1.0.0
```

```console
$ sleep 3
$ docker stats --no-stream lim
```

```console
CONTAINER ID   NAME      CPU %     MEM USAGE / LIMIT   MEM %     NET I/O         BLOCK I/O   PIDs
...            lim       ...       6.216MiB / 64MiB    ...       ...
```

The `MEM USAGE / LIMIT` should show `64MiB`, and `CPU %` should be well below 20.

**Step 2 — observe the OOM killer.**

```console
$ docker run -d --name mem-oom --memory 32m --cpus 0.1 docker-learn:1.0.0
$ sleep 10
$ docker inspect mem-oom --format '{{.State.ExitCode}} oom={{.State.OOMKilled}}'
```

If the app allocates more than 32 MB, the container should be OOM-killed (`exit` may be 0 or 137,
`OOMKilled=true`).

**Step 3 — remove limits and compare.**

```console
$ docker run -d --name no-limits docker-learn:1.0.0
$ sleep 5
$ docker stats --no-stream no-limits
```

No `LIMIT` column — the container can use all available memory/CPU.

**Step 4 — clean up:**

```console
$ docker rm -f lim mem-oom no-limits
```

---

## 7. Next

You can set CPU, memory, and process limits on containers. Next: restart policies, security
settings (read-only rootfs, capability dropping), and how to keep containers running reliably.

**[Chapter 19 — Restart Policies and Runtime Security](19-restart-policies-and-security.md)**