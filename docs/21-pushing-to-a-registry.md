# 21 — Pushing to a Registry

> Verified on: Docker Engine **29.8.2**, Compose **v5.6.0**, BuildKit **v0.33.1**, Ubuntu 26.04.1 LTS, x86_64.

---

## 1. Simple explanation (like I'm 7)

You have built an image locally. Now you want to share it with someone else, or deploy it to a
server that does not have the image. You need a **registry** — a warehouse where images are stored.

Docker Hub is the default public warehouse. You can also use private warehouses like GitHub Container
Registry, AWS ECR, or your own server.

To get an image into a registry, you **tag** it with the registry name, then **push** it.

---

## 2. Real name

### Docker Hub

The default public registry. Everyone with a Docker account has a namespace on Docker Hub.

```console
$ docker login --username YOUR_USERNAME
```

After logging in, you can push to your namespace:

```console
$ docker tag docker-learn:1.0.0 YOUR_USERNAME/docker-learn:1.0.0
$ docker push YOUR_USERNAME/docker-learn:1.0.0
```

### Registry API endpoints

| Name | Purpose |
| :--- | :--- |
| **index.docker.io** | Docker Hub's public frontend (search, tags, UI). |
| **registry-1.docker.io** | Docker Hub's actual image storage (where `push` and `pull` go). |
| **registry.example.com** | Any registry that speaks the Docker registry HTTP API v2. |

### `docker tag` — rename the image

```console
$ docker tag SOURCE_IMAGE TARGET_IMAGE
```

| Part | Meaning |
| :--- | :--- |
| `SOURCE_IMAGE` | The image you already have (local). |
| `TARGET_IMAGE` | The new name, including registry, namespace, and tag. |

**Important:** Tagging does not copy data. Both names point at the same image ID. No extra disk space is used.

### `docker push` — upload the image

```console
$ docker push USERNAME/IMAGE:TAG
```

| Part | Meaning |
| :--- | :--- |
| `docker push` | Upload the image to the registry. |
| `USERNAME/IMAGE:TAG` | The destination. If you omit the registry, it defaults to Docker Hub. |

To push to a private registry:

```console
$ docker login registry.example.com
$ docker tag docker-learn:1.0.0 registry.example.com/my-app:1.0.0
$ docker push registry.example.com/my-app:1.0.0
```

### Piggybacking on an existing image

If someone else has already published an image, you can use it directly:

```console
$ docker pull postgres:17-alpine
```

No login, no tagging, no pushing required. Public images are anonymous-readable.

### Piggybacking with a twist — your image in someone else's namespace

```console
$ docker tag docker-learn:1.0.0 hub.docker.com/YOUR_USERNAME/docker-learn:1.0.0
```

This fails unless you are authorized for that namespace. You can only tag into your own namespace
(or a namespace you have admin access to).

---

## 3. Command example

### Log in to Docker Hub

```console
$ docker login --username YOUR_USERNAME --password-stdin
```

| Flag | Meaning |
| :--- | :--- |
| `--username YOUR_USERNAME` | Your Docker Hub username. |
| `--password-stdin` | Read the password from stdin. **Never type your password on the command line** — it would land in your shell history and be visible to anyone on the machine via `ps`. |

Use an **access token**, not your actual Docker Hub password. Tokens are revocable, scoped, and can
be limited to read or write. Docker Hub's UI has "Personal access tokens."

### Tag an image for Docker Hub

```console
$ docker tag docker-learn:1.0.0 YOUR_USERNAME/docker-learn:1.0.0
```

The tag **must** carry your username. You cannot push `docker-learn:1.0.0` to Docker Hub as a
public image unless YOUR_USERNAME is the owner of that image.

### Push to Docker Hub

```console
$ docker push YOUR_USERNAME/docker-learn:1.0.0
```

The upload progress is shown layer by layer. After pushing, the image is available at:

```console
$ docker pull YOUR_USERNAME/docker-learn:1.0.0
```

### Push to a private registry

```console
$ docker login registry.example.com
$ docker tag docker-learn:1.0.0 registry.example.com/my-app:1.0.0
$ docker push registry.example.com/my-app:1.0.0
```

Login prompts for a username and password (or token). The registry may require TLS certificates.

### List your repositories on Docker Hub

```console
$ curl -s "https://hub.docker.com/v2/repositories/?namespace=YOUR_USERNAME&name=docker-learn&page_size=1"
```

Returns JSON with your repository information.

---

## 5. When to use it and when NOT to

### Use a registry when

- **You want to deploy the same image to multiple machines.** Push once, pull everywhere.
- **You want to decouple building from deploying.** Build on your laptop, push to a registry, and
  deploy from the registry in production.
- **You want image retention.** The registry stores your images so you can pull them later, even
  from a different machine.

### Do not use a registry when

- **You are sharing an image with one other person locally.** `docker save` / `docker load` is
  faster and does not require network access.
- **The image contains secrets you do not want on a registry.** Even private registries make the
  image world-readable to anyone who can authenticate. Use `docker save` / `docker load` or
  mount secrets via volumes at runtime instead.
- **You just need to back up one image.** `docker save IMAGE | docker load` on the target machine.

---

## 6. Common mistakes

**1. `docker push` without tagging with your username.**

```console
$ docker tag docker-learn:1.0.0 docker-learn:1.0.0
$ docker push docker-learn:1.0.0
```

Fails with: `denied: requested access to the resource is denied`. Retag as
`yourusername/docker-learn:1.0.0` first.

**2. `docker login` with your password on the command line.**

```console
$ docker login -u me -p MyRealPassword     # do not do this
```

The password is now in `~/.bash_history` and visible to any local user via `ps`. Use
`--password-stdin` and a token.

**3. Pushing to a registry without logging in first.**

```console
$ docker push registry.example.com/my-app:1.0.0
```

Fails with authentication error. Always `docker login REGISTRY` first.

**4. Tagging an image with `latest` and pushing it.**

```console
$ docker tag docker-learn:1.0.0 docker-learn:latest
$ docker push docker-learn:latest
```

`latest` is not a reliable tag — it can change whenever the publisher republishes. Pin by digest
for production use: `docker tag docker-learn:1.0.0 docker-learn@sha256:abc123...`.

**5. Forgetting that `docker push` uploads all layers.**

Even if you only changed one file, `docker push` uploads all layers that are not already on the
registry. If you frequently make small changes, consider using layer caching or building your
images in a CI system with layer caching.

**6. Pushing an image that has a `Dockerfile` in it.**

```console
$ docker build -t myimage .
$ docker push myimage
```

This fails because `docker push` expects an image, not a build context. Build first, then push.

**7. Not logging out of a registry you no longer use.**

```console
$ docker logout registry.example.com
```

This removes the credential helper state. Good practice after you finish working with a registry.

**8. Pushing an image that another user already owns in the same namespace.**

```console
$ docker tag docker-learn:1.0.0 hub.docker.com/someotheruser/docker-learn:1.0.0
$ docker push hub.docker.com/someotheruser/docker-learn:1.0.0
```

Fails with `denied: conflicting with another tag`. You can only tag into your own namespace.

---

## 6. Next

You can push images to a registry. Next: cleaning up disk space, Docker system df, and basic
CI/CD workflows for building and testing images.

**[Chapter 22 — Disk Space and Cleanup](22-disk-space-and-cleanup.md)**