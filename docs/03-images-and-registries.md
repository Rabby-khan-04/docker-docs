# 03 — Images, Tags, Digests and Registries

> Verified on: Docker Engine **29.8.2**, Compose **v5.6.0**, BuildKit **v0.33.1**, Ubuntu 26.04.1 LTS, x86_64.

---

## 1. Simple explanation (like I'm 7)

An **image** is a frozen lunchbox. It has food in it and it will never change. Ever.

A **container** is a person opening that lunchbox and eating the food. You can have
many people open many identical lunchboxes at the same time. Each person gets their own
copy of the food to eat and mess up, and it does not affect the other people's food, and
it does not affect the original lunchbox.

So:

- Image = the recipe and the ingredients, sealed.
- Container = one person eating from one copy of it.
- You can throw away a person and the lunchbox is still fine.
- The lunchbox only changes if you cook a **new** one.

**Tags** are just sticky notes on the lunchboxes. Somebody wrote "node:22-alpine" on a
box. The note does not change what is inside the box. And here is the sneaky part:
**somebody can change the note to say something different without changing the box at
all.** That is why `latest` is dangerous.

**Digests** are the real fingerprint of the box, stamped into the box itself. It cannot
be swapped. If you want to be certain you are running the exact same thing on every
machine, you use the digest.

**Registries** are warehouses. Docker Hub is the big public one that ships with Docker.
When you run an image you do not have, Docker goes to the warehouse and fetches it.

---

## 2. Real name

### Image versus container

The distinction that matters most, stated precisely:

| | Image | Container |
| :--- | :--- | :--- |
| Is it | a set of layers plus metadata | a running process created from an image |
| Changes | never (it is immutable and content-addressed) | constantly, in its own writable layer |
| How many | can have any number of tags | many containers per image |
| Created by | `docker build`, `docker pull`, or `docker commit` | `docker run`, `docker create` |
| Deleted by | `docker rmi` | `docker rm` |
| Survives `docker rm` | yes | no |

An image on disk is a **stack of layers**. Each layer is a tar archive of file changes,
stored compressed, identified by a hash. The list of layers plus some JSON config is the
image. Chapter 09 covers layers in depth; for now the mental model is a cake: same layers,
one after another, and containers do not duplicate the cake.

### Tags and digests

An image has one or more **names**, and each name has a **tag**:

```
node          -> library/node          (Docker Hub's "official" namespace, implicit)
node:22       -> library/node:22
node:22-alpine-> library/node:22-alpine
```

Full form is `registry.example.com/yourname/yourapp:1.0.0`. Three parts:

1. **Registry host** — where to fetch it. Omitted means `docker.io`. If the first component
   contains a dot or a colon, Docker treats it as a registry hostname; otherwise it is a
   username/namespace.
2. **Repository name** — `node`, or `yourname/yourapp`.
3. **Tag** — after the colon. Optional. Defaults to `latest`.

**A tag is a mutable pointer. Not a version number.** Docker Hub's
`node:22-alpine` is republished whenever the Node project ships a new 22.x Alpine build.
The tag keeps its name; the contents change. So this can be true at once:

```console
$ docker pull node:22-alpine
Status: Downloaded newer image for node:22-alpine
```

Two weeks later, on a different machine, the same command gives you **different bytes**.
Nothing changed in your code. This is the single most important operational fact in this
chapter, and it is why the whole course pins versions.

**A digest is the content hash.** `sha256:0a7108bf...` is computed from the image's
manifest and layers. If a single byte differs anywhere, the digest differs. You cannot
lie with a digest.

```
node@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402
```

Use tags for humans during development. Use digests when reproducibility matters — CI
deploys, production, anything where "it worked yesterday and not today" is a bug you do
not want.

### Registries

A registry is a server that stores and serves images. The protocol has two parts, and
knowing the split explains some confusing errors:

| Name | Role |
| :--- | :--- |
| **index.docker.io** | Docker Hub's public frontend. Search, tags, web UI. |
| **registry-1.docker.io** | Docker Hub's actual image storage, where pull and push go. |
| **Docker Hub** | Both of the above plus accounts and rate limiting. Where you publish for free. |
| **Private registry** | Same protocol, your own server: GitHub Container Registry, GitLab, AWS ECR, Google Artifact Registry, Harbor, or your own. |

The registry API distinguishes **read** and **write**: pull is anonymous, push needs a
token. That is why `docker pull node:22-alpine` works with no login and `docker push`
does not.

### Why `latest` is dangerous

`latest` does not mean newest. It means "whatever the publisher last pushed to this
default tag." In practice:

- `postgres:latest` gave you PostgreSQL 9.x for years, long after 16 shipped. People built
  against a nine-year-old database and had no idea why new features were missing.
- `node:latest` switched from even-numbered to odd-numbered lines. You pinned nothing and
  silently changed Node major versions in production.
- Some publishers never update `latest` at all, so it can be years stale.

Rule for this course, and for your own projects: **never use `latest` in a Dockerfile, a
Compose file, or a production tag.** Pin something meaningful. Chapter 21 covers the
production version of this.

---

## 3. Command example

### Inspect an image's identity

```console
$ docker image inspect docker-learn:1.0.0 --format 'ID: {{.Id}}
Created: {{.Created}}
Size: {{.Size}}
Layers: {{len .RootFS.Layers}}
User: {{.Config.User}}
Entrypoint: {{json .Config.Entrypoint}}
Cmd: {{json .Config.Cmd}}
WorkingDir: {{.Config.WorkingDir}}
ExposedPorts: {{json .Config.ExposedPorts}}
RepoTags: {{json .RepoTags}}'
```

Actual output:

```console
ID: sha256:356fc65d66d49f2674289cc0054924ddb22c09254913d84f5a28a11497d5a372
Created: 2026-10-08T14:49:09.344364176+06:00
Size: 237556944
Layers: 7
User: node
Entrypoint: ["docker-entrypoint.sh"]
Cmd: ["node","server.js"]
WorkingDir: /app
ExposedPorts: {"3000/tcp":{}}
RepoTags: ["docker-learn:1.0.0"]
```

Line by line:

| Field | What it tells you |
| :--- | :--- |
| `ID` | The image's content hash. **Never changes**, no matter how many tags point at it. |
| `Created` | When the image was built. Note this is the build time, not the upstream publish time. |
| `Size` | 237 MB on disk, counting shared layers. |
| `Layers` | **7 layers.** This image is a stack. Chapter 09 explains each one. |
| `User: node` | This image will run as a non-root user. Set by `USER node` in the Dockerfile; chapter 19 covers why that matters. |
| `Entrypoint` | `["docker-entrypoint.sh"]` — inherited from the `node:22-alpine` base image, not from our Dockerfile. |
| `Cmd` | `["node","server.js"]` — our `CMD`. |
| `WorkingDir: /app` | Where commands start. |
| `ExposedPorts` | `{"3000/tcp":{}}` — documentation only. Publishing still needs `-p`. Chapter 07. |

Notice `Entrypoint` came from the base image. This is why **base images should have
minimal entrypoints** — it is a common source of surprise behaviour, and chapter 10 covers
it in detail.

### Get the digest of an image you already have

```console
$ docker image inspect node:22-alpine --format '{{index .RepoDigests 0}}'
node@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402
```

`RepoDigests` is only populated for images pulled from a registry. A locally built image
has no digest until you push it, because nothing has computed one publicly yet.

### Pin to a digest — reproducibility

```console
$ docker pull node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402
Digest: sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402
Status: Image is up to date for node@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402
docker.io/library/node@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402
```

Flag by flag:

| Part | Meaning |
| :--- | :--- |
| `docker pull` | Download an image if not present locally |
| `node` | Repository on Docker Hub |
| `@` | **Take everything after this as a digest, not a tag** |
| `sha256:0a7108bf...` | The exact content hash |

This is the strongest guarantee Docker offers. Run that on every machine, forever, and you
get the identical filesystem every time. Chapter 21 uses this for deploys.

It now appears as a fourth name pointing at the same image:

```console
$ docker images | grep node
node:22-alpine                                     0a7108bf6c7b   238MB   61.1MB
node:22-alpine-exact                               0a7108bf6c7b   238MB   61.1MB
node:24-bookworm                                   3d27e5c11e57  1.66GB    428MB
node@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402   0a7108bf6c7b   238MB   61.1MB
```

One image ID, four names. `docker images` lists **names**, not images. One image can have
many tags, and one tag can point at only one image.

### Tag an image

Tagging is free, local, and instant — it just adds or moves a name:

```console
$ docker tag docker-learn:1.0.0 docker-learn:demo
$ docker images | grep docker-learn
docker-learn:1.0.0     356fc65d66d4   238MB   60.7MB
docker-learn:demo      356fc65d66d4   238MB   60.7MB
```

Flag by flag: `docker tag` takes `<source>` then `<target>`. Both can be
`name:tag` or just `name` (implying `:latest`).

Two things worth knowing:

- **Tagging does not copy anything.** No disk space is used. Both names are the same
  image ID.
- **Tagging moves names, it does not create new images.** `docker tag a b` then
  `docker tag c a` leaves `b` still pointing at the old image, and `a` now on `c`. Tags do
  not follow.

### Dangling images — untagged leftovers

Build an image without giving it a name and you get a **dangling** image:

```console
$ cd /home/sunny/app/nimo/docker-doc/docker-learn
$ docker build .
...
#9 naming to moby-dangling@sha256:1c9e1808aa23c10ada4fe7a5cf1098075d7959676ccaceb58cc420d721032d50 done

$ docker images --filter dangling=true
IMAGE        ID             DISK USAGE   CONTENT SIZE   EXTRA
<untagged>   1c9e1808aa23        238MB         60.7MB
```

`<untagged>` means: an image exists, but no name points at it. It is invisible in normal
`docker images` output, so it accumulates silently. The usual causes are rebuilding the
same thing with different tags, and `docker commit`.

This is why `docker images -a` and `docker image prune` exist. Chapter 22 covers cleanup
properly, including why pruning is the command most likely to hurt you.

### Search Docker Hub

```console
$ docker search node --limit 5 --filter is-official=true
NAME      DESCRIPTION                                     STARS     OFFICIAL
node      Node.js is a JavaScript-based platform for s…   14206     [OK]
```

| Part | Meaning |
| :--- | :--- |
| `docker search` | Query Docker Hub. Registry-specific search is thin here; most people browse hub.docker.com instead. |
| `node` | Search term |
| `--limit 5` | Max results |
| `--filter is-official=true` | Only Docker-curated official images |

**`OFFICIAL [OK]` is a trust signal, not a guarantee.** It means Docker vetted the
publisher account and the image is built from the upstream project's own repo. It does
**not** mean the image is free of vulnerabilities or that it is the best choice. Official
images exist for base operating systems and runtimes, not for your specific application
framework. And a random image called `my-postgres-fast` with 3 stars is one typo away from
running someone else's code as root on your machine. Chapter 20 is about this.

### Log in and push

I did not run `docker login` — it needs your credentials and it writes to
`~/.docker/config.json` on your machine. Here is exactly what it does and what you will
do in chapter 21.

```console
$ docker login --username YOUR_DOCKERHUB_USERNAME --password-stdin
```

| Part | Meaning |
| :--- | :--- |
| `docker login` | Save credentials for a registry |
| `--username YOUR_DOCKERHUB_USERNAME` | Your Docker Hub username |
| `--password-stdin` | **Read the password from stdin.** Never type a password on the command line — it lands in your shell history and in `ps` output where other users can read it. |
| *(no server)* | Defaults to Docker Hub. For another registry: `docker login ghcr.io` |

Use an **access token**, not your Docker Hub password. Tokens are revocable, scoped, and
can be limited to read or write. Docker Hub's UI has "Personal access tokens"; anything
doing `push` needs write scope.

Then push:

```console
$ docker tag docker-learn:1.0.0 YOUR_DOCKERHUB_USERNAME/docker-learn:1.0.0
$ docker push YOUR_DOCKERHUB_USERNAME/docker-learn:1.0.0
```

The tag **must** carry your username, or the registry rejects it — you cannot push to
someone else's namespace. Full mechanics in chapter 21.

---

## 4. File example

No Dockerfile needed for tags themselves, but here is the file that makes the
digest-pinning rule concrete, and it is the file you will build in chapter 08 anyway:

```dockerfile
# Dockerfile with a pinned base image.
# The pin is the whole point of this file.

# Pin by tag: readable, reproducible within a release window.
FROM node:22-alpine

# Pin by digest: the tag above plus the exact content hash.
# When Docker Hub republishes node:22-alpine, this line keeps pulling the
# bytes you tested. Use this for production and for anything you must be
# able to reproduce.
# FROM node@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402
```

Never both. `node:22-alpine@sha256:0a7108bf...` is valid Docker syntax and is the belt-and-
braces form, but the digest is what enforces reproducibility — the tag is then just a
comment that helps humans.

Build it and confirm the tag shows up:

```console
$ cd /home/sunny/app/nimo/docker-doc/docker-learn
$ docker build -t docker-learn:1.0.0 .
$ docker images docker-learn:1.0.0
```

Cleanup:

```console
$ docker rmi docker-learn:1.0.0 docker-learn:demo
```

`docker rmi` is safe against your other work: it removes only images, never containers,
and it refuses outright if a running container depends on one.

---

## 5. When to use it and when NOT to

### Tags versus digests

| Situation | Use | Why |
| :--- | :--- | :--- |
| Local development | `node:22-alpine` | Readable, and you actively want the newest 22.x patches. |
| A Dockerfile in a repo | `node:22-alpine` | Readable. Rely on CI and Dependabot/Renovate to bump it, so pin bumps are reviewed. |
| CI build | `node@sha256:...` | Reproducible. "That build passed" must mean those exact bytes. |
| Production deploy | `node@sha256:...` | Reproducible. No surprise patch-level change at 3am. |
| A base image you depend on heavily (Alpine, glibc runtime) | digest | Alpine in particular tracks security releases quickly; you may *want* the bump, but it should be a deliberate diff, not a surprise. |
| When the base image must float for security patches | tag + automated bumping + tests | Some teams deliberately auto-bump base images and let CI prove nothing broke. That is a reasonable policy. Just make it a decision, not an accident. |

### Registries

| Use a public registry when | Use a private registry when |
| :--- | :--- |
| The image is a public library or tool | The image contains any of your own code |
| You want `docker pull` to work anywhere | You have private base images |
| You want a single, discoverable place | You must control retention, auditing and who can pull |

Pick where you push deliberately:

| Registry | Notes |
| :--- | :--- |
| **Docker Hub** | Free, one free private repo per personal account, default for everyone. Anonymous pull rate limits are strict. |
| **GitHub Container Registry (GHCR)** | Free for public packages, tied to your GitHub permissions and repo. Good default if you already live in GitHub. |
| **GitLab Container Registry** | Same idea for GitLab. |
| **AWS ECR / Google Artifact Registry / Azure ACR** | Pay per GB, integrated with cloud IAM, usually unlimited pull. Sensible on AWS. |
| **Harbor** | Self-hosted, open source. Has vulnerability scanning built in, retention policies, and signed images. Worth it once you have a team. |
| **GitLab, Quay, Docker Hub Enterprise** | Other hosted options. |

Whichever you choose: images you push there are **private by default** except Docker Hub
public repos. Nothing is public unless you make it public. And an image in a registry is
world-readable to anyone who can authenticate — an image containing a secret is a leaked
secret, regardless of who can pull it. Chapter 20 covers preventing that.

### When NOT to bother

- **Not a single image per project.** A hard rule worth stating: **if you cannot say how
  to rebuild an image, delete it.** Not tagged in a registry, not in a Dockerfile, not
  reproducible from a git SHA — it is a liability, not an asset.
- **Not to version images by timestamp alone** (`myapp:20261008`). Fine as an
  *additional* tag, bad as the only one. Combine with the git SHA: `myapp:1.4.0-a1b2c3d`.
  Chapter 24 builds exactly this.
- **Not by editing a tag in place.** Retagging an existing tag to different content breaks
  anyone who pulled the old one, and it breaks layer caching in ways that are painful to
  debug. Move forward, do not move `1.0.0`.

---

## 6. Common mistakes

**1. `FROM node:latest` in a Dockerfile.** Your build breaks one day with no code change.
Pin `node:22-alpine`. Always.

**2. Assuming a tag is a version number.** `node:22-alpine` moving is expected behaviour.
`latest` is not "newest", it is "whatever the publisher last pushed here".

**3. Building with no `-t` tag and never noticing the `<untagged>` images.** They fill your
disk invisibly. `docker images -a` shows them; `docker image prune` clears them.

**4. Pushing without your namespace in the tag.**

```console
$ docker tag docker-learn:1.0.0 docker-learn:1.0.0
$ docker push docker-learn:1.0.0
```

That fails with `denied: requested access to the resource is denied`. Retag as
`yourusername/docker-learn:1.0.0` first.

**5. `docker login` with your password on the command line.**

```console
$ docker login -u me -p MyRealPassword      # do not do this
```

The password is now in `~/.bash_history` and visible to any local user via `ps`. Use
`--password-stdin` and a token.

**6. Retagging `1.0.0` to different content after people have pulled it.** Their cache and
their caches downstream now disagree with your tag. Version numbers must be immutable.

**7. Believing `OFFICIAL [OK]` means safe.** It means Docker verified the publisher. Scan
anyway — chapter 20.

**8. Confusing `docker rmi` and `docker rm`.** `rmi` removes images. `rm` removes
containers. Using `rmi` on a running container's image fails, which is Docker protecting
you. Use `docker rm -f <container>` first.

**9. Expecting `RepoDigests` on a locally built image.** It is empty until you push, because
no registry has computed a public digest. `docker images` will show only your local tags.

**10. Assuming `docker pull` always gets the newest image.** If the tag is already local
and the pull is not forced, Docker contacts the registry, sees the digest matches, and does
nothing:

```console
$ docker pull node:22-alpine
Status: Image is up to date for node:22-alpine
```

To force a refresh of a moving tag, remove the image first or pull by digest. This is also
why "I ran `docker pull` and it still failed" is a real situation — chapter 23 covers it.

---

## 7. Try it yourself

**Exercise.** See for yourself that a tag is a movable label and a digest is not, and
produce a dangling image.

**Step 1 — count the names on one image:**

```console
$ docker tag docker-learn:1.0.0 exercise:one
$ docker tag docker-learn:1.0.0 exercise:two
$ docker images | grep -E 'docker-learn:1.0.0|exercise'
```

Three names, one image ID, no extra disk space used.

**Hint.** Step 2 is the one that teaches the lesson.

**Step 2 — prove tags are mutable.** Move a tag onto different content and watch the ID
change underneath a name you already used:

```console
$ docker tag node:22-alpine exercise:one
$ docker images | grep exercise
```

`exercise:one` now points at the `node:22-alpine` image ID (`0a7108bf6c7b`), not at
`docker-learn` (`356fc65d66d4`) — even though it is the same name as before. That is a tag
being repointed. It is exactly what Docker Hub does when a publisher updates `node:22-alpine`,
which is why pinning by digest is the fix.

**Step 3 — make a dangling image:**

```console
$ cd /home/sunny/app/nimo/docker-doc/docker-learn
$ docker build .
$ docker images --filter dangling=true
```

`<untagged>` appears. You now know why your disk grows after a few rebuilds.

**Step 4 — confirm the digest is the honest name:**

```console
$ docker image inspect docker-learn:1.0.0 --format '{{index .RepoDigests 0}}'
```

Compare with step 2: your local tag has no `RepoDigests` entry. A locally built image has
no registry digest until it is pushed.

**Cleanup for this chapter** — removes only the three names you created:

```console
$ docker rmi exercise:one exercise:two docker-learn:demo
```

If step 3 left a dangling image, remove it by ID (it shows as `<untagged>` in
`docker images -a`). Do **not** run `docker image prune -a` for this — that is a broad
destructive command and chapter 22 explains exactly what it deletes before you ever run it.

---

## 8. Next

You can pull images and push them. Now the actual day-to-day work: creating containers,
watching them, stopping them, removing them, and understanding every state a container can
be in.

**[Chapter 04 — Running Containers](04-running-containers.md)**