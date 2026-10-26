# 25 — BuildKit and Buildx

> Verified on: Docker Engine **29.8.2**, Compose **v5.6.0**, BuildKit **v0.33.1**, Ubuntu 26.04.1 LTS, x86_64.

## 1. Simple explanation (like I'm 7)

**BuildKit** is the new engine inside Docker that makes builds faster, more powerful, and able to build for different computer architectures. The old builder still works, but BuildKit is the default now and has features the old one does not have.

**Buildx** is a CLI plugin that extends `docker build` to use BuildKit with extra capabilities, especially multi-platform builds (building an image that runs on both amd64 and arm64).

Think of the old `docker build` as a basic bicycle, and Buildx as a hybrid e-bike with more gears and the ability to handle different terrains.

## 2. Real name

### BuildKit — the new build engine

BuildKit is enabled by default on Docker Engine 29.8.2. You can check:

```console
$ docker info | grep -i buildkit
BuildKit: enabled
```

Without BuildKit, many Dockerfile features (heredocs, cache mounts, `--mount=type=cache`) are not available.

### Buildx — the CLI plugin

```console
$ docker buildx version
```

Output: `docker buildx version v0.37.1 go1.23.0 linux x86_64`

Buildx is automatically available as a `docker` subcommand on Docker Engine 29.8.2 with Buildx v0.37.1 installed.

### Create a builder instance

```console
$ docker buildx create --name mybuilder --use
```

Output: `mybuilder` doesn't exist, creating it. 

```console
$ docker buildx inspect --bootstrap
```

This creates a new builder instance and sets it as the current default. The `--bootstrap` flag starts the builder daemon.

### Platform-based builds

```console
$ docker buildx build --platform linux/amd64,linux/arm64 -t myusername/myapp:1.0.0 --push .
```

This builds the image for both amd64 (most laptops/servers) and arm64 (Raspberry Pi, Apple Silicon) and pushes to the registry.

### Cache backends

| Backend | Command | Where it lives |
| :--- | :--- | :--- |
| **registry** | `--cache-from type=registry,ref=name:tag` | Docker Registry (Hub, GHCR, ECR) |
| **gha** | `--cache-from type=gha` | GitHub Actions cache storage |
| **local** | `--cache-from type=local,mode=max=/tmp/cache` | Runner's filesystem |
| **none** | No cache | Fresh start, no reuse |

### `--platform` vs `--compatible`

```console
$ docker buildx build --platform linux/arm64 --compatible -t myimage:1.0.0 .
```

| Flag | Meaning |
| :--- | :--- |
| `--platform linux/arm64` | Build for arm64. If you amd64 machine, BuildKit uses QEMU to emulate. |
| `--compatible` | Relax platform matching. If the platform is not available, fall back to the host platform. |

Without `--compatible`, building for arm64 on an amd64 machine will fail if QEMU is not available.

### Building without QEMU emulation

If you only need to build for the host platform:

```console
$ docker buildx build --platform linux/amd64 -t myimage:1.0.0 .
```

This uses the native builder, no QEMU needed.

### BuildKit frontend syntax

```dockerfile
# syntax=docker/dockerfile:1
```

This declares "I want the latest stable Dockerfile syntax" and lets BuildKit pull it in. It also enables heredocs (`COPY <<'EOF'` and `RUN <<'EOF'`), which I use throughout this course.

Without this directive, BuildKit uses a bundled version of the Dockerfile frontend. It is implicit in most modern builds, but you can be explicit.

### QEMU and cross-compilation

When you `--platform linux/arm64` on an amd64 machine, BuildKit uses **QEMU** to emulate the target CPU. This works, but it is slower than native builds.

The first such build downloads QEMU (~50 MB). Subsequent builds use the QEMU cache, which is much faster.

### QEMU cache

BuildKit caches QEMU translations. On subsequent builds for the same target platform, the cached QEMU is used, speeding up cross-compilation.

```console
$ docker buildx imagetools inspect myimage:1.0.0
```

Shows the platform(s) the image supports.

### `docker buildx du` — show builder cache size

```console
$ docker buildx du
```

Output shows how much space the builder cache uses, including shared and private caches, and what is reclaimable.

### Builder prune

```console
$ docker buildx prune
```

Removes unused builder cache. Like `docker image prune` but for Buildx builders.

## 3. Command example\n\n### Enable Buildx and create a builder\n\n```console\n$ docker buildx create --name mybuilder --use\n$ docker buildx inspect --bootstrap\n```\n\n```console\n$ docker buildx version\n```\n\nOutput: `docker buildx version v0.37.1 go1.23.0 linux x86_64`\n\n### Build for multiple platforms and push\n\n```console\n$ docker buildx build --platform linux/amd64,linux/arm64 \\\n  --tag myusername/myapp:1.0.0 \\\n  --push .\n```\n\nThis builds for both amd64 and arm64, using QEMU emulation on the amd64 host, and pushes the multi-platform image to Docker Hub.\n\n### Build for a single platform (native, no QEMU)\n\n```console\n$ docker buildx build --platform linux/amd64 -t myusername/myapp:1.0.0 .\n```\n\nNo QEMU needed — native build on the host platform.\n\n### Build with cache from a registry\n\n```console\n$ docker buildx build --platform linux/amd64 \\\n  --cache-from type=registry,ref=myusername/myapp:cache \\\n  --cache-to type=registry,ref=myusername/myapp:cache,mode=max \\\n  -t myusername/myapp:1.0.0 \\\n  .\n```\n\nReuses cache layers from a previously pushed image. On a fresh CI runner, the local cache starts\nempty, but the registry cache persists across runs.\n\n### Build with --compatible flag\n\n```console\n$ docker buildx build --platform linux/arm64 --compatible -t myimage:1.0.0 .\n```\n\nIf the arm64 build fails due to QEMU issues, `--compatible` will fall back to building for the\nhost platform (amd64).\n\n### Build and export a tar archive\n\n```console\n$ docker buildx build --platform linux/amd64 -t myimage:1.0.0 --output type=docker .\n```\n\nOutputs the image as a Docker daemon image (not a tarball). Use `type=oci` for OCI archive.\n\n### Build with heredocs (enabled by `# syntax=docker/dockerfile:1`)\n\n```dockerfile\n# syntax=docker/dockerfile:1\nFROM alpine:3.24\nRUN <<'EOF'\necho \"hello\"\necho \"world\"\nEOF\n```\n\nHeredocs are a BuildKit feature that lets you write multi-line RUN commands without escaping.\nThe `<<'EOF'` (single-quoted delimiter) means no variable expansion inside the heredoc.\n\n### `docker buildx imagetools` — inspect multi-platform images\n\n```console\n$ docker buildx build --platform linux/amd64,linux/arm64 -t myimage:1.0.0 --push .\n$ docker buildx imagetools inspect myimage:1.0.0\n```\n

Output shows the platforms supported and the architecture of each.

### Builder prune

```console
$ docker buildx prune
```

Removes unused builder cache. Like `docker image prune` but for Buildx builders.

---\n

## 4. When to use Buildx and when NOT to\n\n### Use Buildx when\n\n- **You need multi-platform images.** Build for amd64 and arm64 (or arm64 and riscv64) in one command.\n- **You want advanced cache control.** `--cache-from` / `--cache-to` with registry, GHA, or local backends.\n- **You are using BuildKit features** like `--mount=type=cache`, heredocs, or `COPY <<'EOF'`.\n- **You want to inspect build metadata.** `docker buildx imagetools` shows platform support.\n\n### Do not use Buildx when\n\n- **You just want a simple build for the host platform.** Plain `docker build` is sufficient.\n- **You are on an older Docker Engine** that does not have Buildx installed. (Docker Engine 29.8.2 has it.)\n- **You need `docker build` behavior exactly as it was before Docker 20.10.** Buildx changes some defaults.\n\n### A practical Buildx pattern\n\n```console\n# Build for multiple platforms with cache\n$ docker buildx build \\\n  --platform linux/amd64,linux/arm64 \\\n  --cache-from type=registry,ref=myuser/myapp:cache \\\n  --cache-to type=registry,ref=myuser/myapp:cache,mode=max \\\n  --tag myuser/myapp:$GIT_SHA \\\n  --push .\n```\n

This single command:\n1. Builds for amd64 and arm64 (QEMU emulation on amd64 host)\n2. Caches from the registry (persists across runners)\n3. Tags with the git SHA (reproducible)\n4. Pushes to the registry\n5. The result is a multi-platform image with platform metadata\n\n## 5. Common mistakes\n\n**1. `docker buildx` not available.**\n\n```console\n$ docker buildx version\n```\n\nIf you get `docker: 'buildx' is not a docker command`, enable the plugin:\n\n```console\n$ docker plugin enable docker/buildx\n```\n\nOn Docker Engine 29.8.2, Buildx is already installed.\n\n**2. Forgetting `--push` when building with `buildx`.**\n\nWithout `--push`, the image is built locally but not uploaded to the registry.\n\n**3. Building for arm64 without `--compatible` on amd64.**\n\nIf QEMU is not set up, the build will fail. Add `--compatible` to fall back to the host platform.\n\n**4. Using `--platform` with the old `docker build` (no `buildx`).**\n\nThe `--platform` flag on plain `docker build` may not work or may behave differently.\nUse `docker buildx build --platform` instead.\n\n**5. Not cleaning up builder instances.**\n\n```console\n$ docker buildx rm mybuilder\n```\n\nRemove builder instances you no longer need.\n\n**6. Confusing `docker build` and `docker buildx build`.**\n\n`docker build` uses the legacy builder. `docker buildx build` uses BuildKit with extra features.\nOn Docker Engine 29.8.2, `docker build` automatically uses BuildKit, but `docker buildx` adds multi-platform and cache backend capabilities.\n\n**7. `--cache-from` and `--cache-to` on a fresh runner without a registry cache.**\n\nIf you use `type=local` cache and the runner is destroyed between jobs, the cache is lost.\nUse `type=registry` or `type=gha` for persistent caches.\n\n**8. Building multi-platform without realizing QEMU is being used.**\n\nOn an amd64 machine, `--platform linux/arm64` triggers QEMU emulation. It works, but is\nslower. Use `--compatible` to fall back, or build only for the host platform when possible.\n\n**9. `docker buildx du` showing unexpectedly large cache.**\n\nThe builder cache can grow over time. Use `docker buildx prune` to clean up unused cache layers.\n\n**10. Forgetting that `# syntax=docker/dockerfile:1` enables heredocs.**\n\nWithout this directive, `COPY <<'EOF'` and `RUN <<'EOF'` will fail or use the bundled frontend.\n\n---\n

## 6. Try it yourself\n\n**Exercise.** Use Buildx to build a multi-platform image and inspect it.\n\n**Step 1 — create a Buildx builder:**\n\n```console\n$ docker buildx create --name mybuilder --use\n$ docker buildx inspect --bootstrap\n```\n\n```console\n$ docker buildx version\n```\n\nOutput should show `v0.37.1`.\n\n**Step 2 — build for multiple platforms:**\n\n```console\n$ docker buildx build --platform linux/amd64,linux/arm64 \\\n  --tag test-multi:1.0.0 \\\n  .\n```\n\n```console\n$ docker buildx imagetools inspect test-multi:1.0.0\n```\n

Output should show both `linux/amd64` and `linux/arm64` platforms.\n\n**Step 3 — build with cache and push:**\n\n```console\n$ docker buildx build --platform linux/amd64 \\\n  --cache-from type=registry,ref=test-multi:cache \\\n  --cache-to type=registry,ref=test-multi:cache,mode=max \\\n  -t test-multi:1.0.0 \\\n  --push .\n```\n\n**Step 4 — clean up builder:**\n\n```console\n$ docker buildx rm mybuilder\n```\n\n---\n

## 7. Next\n\nYou can build faster, for multiple platforms, with advanced caching. Next: orchestration — when\nsingle-machine Compose is no longer enough, and you need Swarm or Kubernetes.\n\n**[Chapter 26 — Swarm and Kubernetes Intro](26-swarm-and-kubernetes.md)**