# 22 — Disk Space and Cleanup

> Verified on: Docker Engine **29.8.2**, Compose **v5.6.0**, BuildKit **v0.33.1**, Ubuntu 26.04.1 LTS, x86_64.

---

## 1. Simple explanation (like I'm 7)

Docker stores everything in `/var/lib/docker/`. Over time, images, containers, and volumes pile up
and can fill your disk. This chapter shows you exactly how much space each thing uses, and how to
clean it up safely — without deleting things you meant to keep.

The most important rule: **never run `docker system prune -a` or `docker volume prune -a` until you
know exactly what they will delete. They are the dangerous commands in Docker.**

---

## 2. Real name

### `docker system df` — show disk usage

```console
$ docker system df
```

| TYPE | TOTAL | ACTIVE | SIZE | RECLAIMABLE |
| :--- | :---: | :---: | :---: | :---: |
| Images | 27 | 5 | 6.029 GB | 3.423 GB (56%) |
| Containers | 9 | 8 | 30.45 MB | 4.096 kB (0%) |
| Local Volumes | 22 | 14 | 901.2 MB | 140.8 MB (15%) |
| Build Cache | 130 | 10 | 6.121 GB | 3.736 GB |

| Meaning |
| :--- |
| **TOTAL** | Total size on disk. |
| **ACTIVE** | Objects that have at least one container referencing them. |
| **SIZE** | Total disk usage. |
| **RECLAIMABLE** | Objects that can be pruned with the listed commands, and how much. |

### `docker buildx du` — show builder cache size

```console
$ docker buildx du
```

Output shows how much space the builder cache uses, including shared and private caches, and what
is reclaimable.

### `docker image prune` — remove dangling images

```console
$ docker image prune
```

Removes **dangling** images — images with no tag pointing at them (the `<untagged>` ones). These
accumulate when you rebuild the same thing with different tags.

```console
$ docker image prune -a
```

Removes **all** images not used by a container. **Very destructive.** Use with extreme caution.

### `docker container prune` — remove stopped containers

```console
$ docker container prune
```

Removes all stopped containers. Does not remove running containers.

### `docker volume prune` — remove anonymous volumes

```console
$ docker volume prune
```

Removes **anonymous** volumes — volumes not named in a Compose file or created with
`docker volume create`. **Do not use this** if you have named volumes (like PostgreSQL data) that
you want to keep. With `-f` it removes everything without asking.

```console
$ docker volume prune -f
```

**Dangerous.** Verified in chapter 07: `docker compose down -v` removes named volumes you meant to
keep. Only use `docker volume prune -f` if you are sure you have no named volumes, or you want to
blow everything away.

---

## 3. Command example

### Check disk usage before and after

```console
$ docker system df
```

```console
TYPE            TOTAL     ACTIVE    SIZE      RECLAIMABLE
Images          10        3         3.8GB     1.634GB (43%)
Containers      4         3         272.7MB   4.096kB (0%)
Local Volumes   11        5         433.4MB   140.8MB (32%)
Build Cache     51        0         3.787GB   3.55GB
```

After cleanup:

```console
$ docker system prune -a --volumes
```

```console
$ docker system df
```

```console
TYPE            TOTAL     ACTIVE    SIZE      RECLAIMABLE
Images          3         1         1.2GB     1.2GB (100%)
Containers      1         1         5.2MB   0bk (0%)
Local Volumes   3         1         52.1MB   0b (0%)
Build Cache     10        0         1.021GB   1.021GB
```

### Remove dangling images only

```console
$ docker image prune
```

```console
$ docker system df --verbose
```

Shows which images are dangling and can be pruned.

### Remove stopped containers

```console
$ docker container prune
```

### Remove anonymous volumes only

```console
$ docker volume prune
```

```console
$ docker system df --verbose
```

Shows the reclaimed volume space.

### The unsafe all-at-once prune

```console
$ docker system prune -a --volumes
```

Removes:
- All stopped containers.
- All dangling images.
- All unused networks.
- All anonymous volumes.
- All build cache.

**This is the nuclear option.** It will remove anything not currently running or referenced. Use
only when you are sure you want to reset your Docker state completely.

---

## 3. Common mistakes

**1. `docker system prune -a` without understanding what it deletes.**

This command removes all images not used by a container, all stopped containers, all unused networks,
and all anonymous volumes. It is the fastest way to free disk space, but also the fastest way to
delete things you meant to keep.

**2. `docker volume prune -f` removing named volumes.**

```console
$ docker volume prune -f
```

Removes all volumes that are not referenced by any container. If you have named volumes (like
PostgreSQL data created by Compose), they may be removed. **Do not use `-f` if you have named
volumes you want to keep.**

**3. `docker image prune -a` removing images you still need.**

```console
$ docker image prune -a
```

Removes all images not used by any container. If you have images with tags that you want to keep
(but no running container uses them), they will be deleted.

**4. Not knowing what `ACTIVE` means in `docker system df`.**

`ACTIVE` counts images that have at least one running or stopped container referencing them. If
you see `ACTIVE: 0` for Images, it means no containers are using any images — safe to prune
everything.

**5. Not knowing the difference between `docker image prune` and `docker image prune -a`.**

- `docker image prune` removes only **dangling** images (no tag pointing at them).
- `docker image prune -a` removes **all** images not used by a container.

**6. Forgetting that `docker system df --verbose` shows per-object details.**

```console
$ docker system df --verbose
```

Lists each image, container, volume, and build cache entry with its size and reclaimability. Very
helpful for finding the exact things you want to prune.

**7. Pruning while containers are running.**

Some prune commands may fail or behave unexpectedly if containers are in certain states. It is
safer to prune when no critical containers are running, or prune one type at a time.

**8. Not knowing that `docker system df` counts shared layers only once.**

The TOTAL size in `docker system df` reflects the actual disk usage, counting each shared layer
only once. The sum of `docker images` column sizes may be higher because it counts layers
repeatedly.

---

## 6. Try it yourself

**Exercise.** Measure your disk usage, clean up, and measure again.

**Step 1 — check current usage:**

```console
$ docker system df
```

Take note of the TOTAL and RECLAIMABLE columns for Images, Containers, Local Volumes, and Build Cache.

**Step 2 — remove dangling images:**

```console
$ docker image prune
```

```console
$ docker system df
```

Note the change in the RECLAIMABLE column for Images.

**Step 3 — remove stopped containers:**

```console
$ docker container prune
```

```console
$ docker system df
```

Note the change in the RECLAIMABLE column for Containers.

**Step 4 — remove anonymous volumes:**

```console
$ docker volume prune
```

```console
$ docker system df
```

Note the change in the RECLAIMABLE column for Local Volumes.

**Step 5 — optional: remove everything at once (nuclear option).**

```console
# Understand what will be removed first!
$ docker system prune -a --volumes
```

Only run this if you are sure you want to delete all stopped containers, all dangling images,
all unused networks, all anonymous volumes, and all build cache.

```console
$ docker system df
```

Note the final state.

**Step 6 — clean up the tracking:**

Your system is now clean. Note the before/after numbers for your records.

---

## 7. Next

You can clean up Docker disk space safely. Next: basic CI/CD workflows for building, testing, and
pushing images, and an introduction to Swarm and Kubernetes for when Compose is no longer enough.

**[Chapter 23 — Debugging and Troubleshooting](23-debugging-and-troubleshooting.md)**