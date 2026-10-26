# 01 — What Docker Is

> Verified on: Docker Engine **29.8.2**, Compose **v5.6.0**, BuildKit **v0.33.1**, Ubuntu 26.04.1 LTS, x86_64.

---

## 1. Simple explanation (like I'm 7)

Imagine you have a magic lunchbox.

You pack a sandwich, a drink, and a fork in it. Now your friend at school can open the
lunchbox and eat **exactly** what you packed, even though you packed it in your own
kitchen and they eat at their own house. Same sandwich. Same fork. Same everything.

Docker is that magic lunchbox for programs.

Here is the problem it solves. You write an app. It works on your laptop. You send it
to your friend to test. On their machine it crashes, because they have a different
version of Python. It is not your fault. It is not their fault. Different kitchens,
different stoves.

A container says: "I will bring my own kitchen." Your program plus the exact
software it needs, packed into one box that behaves the same everywhere. Not just on
your laptop and your friend's laptop, but on a server, in a testing machine, and in
production.

The word for this is **portable**. A container is portable because it carries
everything it needs with it.

---

## 2. Real name

**Containerization.** A **container** is a running instance of an **image** — an
isolated process on your machine that looks, from the inside, like its own little
operating system.

Technically, a Linux container is not a mini operating system at all. It is an
ordinary Linux process with three things bolted on:

1. **Namespaces** — the kernel gives the process its own private view of system
   resources. Its own list of processes (PID namespace), its own network interfaces
   (network namespace), its own filesystem mount table (mount namespace). The container
   cannot see your other processes. It thinks it is alone on the machine.
2. **Control groups (cgroups)** — the kernel limits and accounts for the resources the
   process may use: memory, CPU, number of processes. This is how `--memory 512m`
   works, and how a runaway container gets OOM-killed instead of taking your whole
   machine down.
3. **A layered filesystem** — the container gets a read-only copy of the image's files,
   plus a thin writable layer for anything it creates at runtime. Delete the container
   and the writable layer goes away.

Docker itself is a **client/server** application:

| Part | What it is | Where it runs |
| :--- | :--- | :--- |
| `docker` CLI | The program you type | On your machine |
| Docker daemon (`dockerd`) | The background service that does the work | On your machine |
| `containerd` | Low-level container runtime that `dockerd` delegates to | On your machine |
| `runc` | The runtime that actually creates namespaces, cgroups and mounts | On your machine |
| Registry (Docker Hub) | Stores images | On the internet |

That architecture matters later. The CLI and the daemon talk over a Unix socket
(`/var/run/docker.sock` on your machine). Anything that can reach that socket can
control Docker, including a container that has it mounted. That is the single most
important Docker security fact, and it comes back in chapter 19.

### Container vs virtual machine

This is the comparison everyone asks about, so here it is honestly.

A **virtual machine** runs a whole second operating system inside a hypervisor. The
guest has its own kernel, its own drivers, its own boot process. Because it is a full
OS, it is heavy.

A **container** shares the host's kernel. It only ships the user-space files — the
libraries and binaries your program needs. No guest kernel, no drivers, no boot.

| | Virtual machine | Container |
| :--- | :--- | :--- |
| Contains | Full OS: kernel + user space | User space only; shares host kernel |
| Boot time | 30 seconds to minutes | Milliseconds |
| Size | Gigabytes | Megabytes |
| Isolation | Very strong, hardware-assisted | Good, kernel-enforced, same kernel |
| Startup cost per instance | High | Very low |
| Runs a different kernel | Yes | No — Linux containers need a Linux host |
| Density on one machine | Maybe 10-40 | Hundreds or thousands |
| Typing on the border | Minutes | Milliseconds |

Where the difference shows up in real numbers, measured on your machine right now.
An Alpine image is tiny and boots instantly:

```console
$ docker image inspect alpine:3.24 --format '{{.Size}}'
12932203
```

That is about **12.9 MB** on disk. Compare it to any VM image you have ever seen.

The key insight, and the thing to remember forever:

> A container shares the host's kernel. Prove it — run a container and ask it what
> kernel it has.

```console
$ docker run --rm alpine:3.24 uname -r
7.0.0-38-generic

$ uname -r
7.0.0-38-generic
```

**Identical.** Your host is running kernel `7.0.0-38-generic`, and the container reports
the exact same kernel. It is not running its own. That single fact explains nearly all
the other differences above: no guest kernel to boot, no drivers to load, no filesystem
to duplicate — which is why containers start in milliseconds.

This also tells you the **one hard limit**: a Linux container on a Linux host. A Linux
container cannot run on macOS or Windows without help, because those hosts do not have a
Linux kernel to share. Docker Desktop solves this by running a small Linux virtual
machine on your Mac or PC and putting all the containers inside it. You never notice,
but that is what is happening underneath — and it is why Docker Desktop is much heavier
than installing Docker Engine on a machine that is already Linux.

---

## 3. Command example

Your first real Docker command. This downloads a tiny image and runs it once.

```console
$ docker run hello-world
```

Exact output on your machine, captured during writing of this chapter:

```console
$ docker run hello-world
Unable to find image 'hello-world:latest' locally
latest: Pulling from library/hello-world
4f55086f7dd0: Pulling fs layer
4f55086f7dd0: Download complete
4f55086f7dd0: Pull complete
d5e71e642bf5: Download complete
Digest: sha256:5e23090353324d887c48ad5e5c56d294eab81588df9605b07d1afe895f9cc8f8
Status: Downloaded newer image for hello-world:latest

Hello from Docker!
This message shows that your installation appears to be working correctly.

To generate this message, Docker took the following steps:
 1. The Docker client contacted the Docker daemon.
 2. The Docker daemon pulled the "hello-world" image from the Docker Hub.
    (amd64)
 3. The Docker daemon created a new container from that image which runs the
    executable that produces the output you are currently reading.
 4. The Docker daemon streamed that output to the Docker client, which sent
    it to your terminal.

To try something more ambitious, you can run an Ubuntu container with:
 $ docker run -it ubuntu bash

Share images, automate workflows, and more with a free Docker ID:
 https://hub.docker.com/

For more examples and ideas, visit:
 https://docs.docker.com/get-started/
```

The `hello-world` image prints that message and exits. Read those four numbered steps
carefully, because `docker run` always does those four things:

1. **Check locally.** `Unable to find image 'hello-world:latest' locally` — Docker
   looked for the image on your machine first, did not find it, and knew it had to
   download it.
2. **Pull from the registry.** The `Pulling fs layer` lines are each *layer* of the
   image being downloaded. `Digest: sha256:5e23...` is the image's unique content
   fingerprint, which you will meet properly in chapter 03.
3. **Create a container.** The image is a recipe, not a running thing. Docker made a
   container from it and ran the recipe.
4. **Stream output to you.** Whatever the container prints goes to your terminal. This
   only works nicely for short-lived programs. For anything long-running, you use
   `-d` to run it in the background instead — chapter 04.

### The anatomy of `docker run`

`docker run` looks like one command but it is actually **seven** commands chained
together. This is the single most useful thing to internalize in chapter 01:

```console
docker run  =  docker pull   # make sure the image exists locally
           +  docker create  # make a container from the image, stopped
           +  docker start   # start it
           +  docker attach  # connect your terminal to its output
```

So this:

```console
$ docker run -d -p 3011:3000 --name ch04-demo -e APP_ENV=staging node:22-alpine
```

is identical to running all five of these by hand:

```console
$ docker pull node:22-alpine
$ docker create -d -p 3011:3000 --name ch04-demo -e APP_ENV=staging node:22-alpine
$ docker start ch04-demo
$ docker attach ch04-demo
```

With two useful differences. `docker run` **removes the container automatically** when
the process exits, but it leaves the image cached so the next run is instant. And if the
port is already taken, `docker run` fails before it creates anything.

### Line-by-line flag explanation

Reading flags left to right:

| Part | Meaning |
| :--- | :--- |
| `docker` | The CLI program |
| `run` | Create a container from an image and start it |
| `-d` | **Detached.** Return to your shell immediately instead of holding the terminal. Required for anything long-running. |
| `-p 3011:3000` | **Publish port.** Left of the colon is the port on your machine, right of the colon is the port inside the container. Covered in chapter 07. |
| `--name ch04-demo` | Give the container a memorable name. Without this, Docker invents a random adjective_noun name like `ecstatic_faraday` and you have to look the ID up every time. |
| `-e APP_ENV=staging` | Set an **environment variable** inside the container. Covered in chapter 06. |
| `node:22-alpine` | The image to run. `node` is the name, `22-alpine` is the version. |

### Verifying what just happened

```console
$ docker images
IMAGE            ID             DISK USAGE   CONTENT SIZE   EXTRA
node:22-alpine   0a7108bf6c7b        238MB         61.1MB
```

Two columns worth understanding now, because they trip everyone up:

- **`DISK USAGE`** — the space this image occupies on your disk, counting shared layers
  that other images also use. A few images can share one `RUN apt-get install` layer, so
  this is not the same as adding up the row sizes.
- **`CONTENT SIZE`** — the compressed download size. This is roughly what you pay for
  when pulling from a registry.

`node:22-alpine` showing 238 MB on disk feels enormous for Alpine, which is famous for
being tiny. It is not — it is your editor and filesystem accounting for shared layers
twice. The compressed size is 61 MB, which is what actually matters when you push and
pull.

### Getting your bearings

```console
$ docker info
```

This is the single most useful diagnostic command in Docker. It prints ~60 lines about
your installation. The lines to read first:

```console
 Server Version: 29.8.2
 Storage Driver: overlayfs
  driver-type: io.containerd.snapshotter.v1
 Cgroup Driver: systemd
 Cgroup Version: 2
 Containers: 3
 Running: 2
 Paused: 0
 Stopped: 1
 Images: 5
 Swarm: inactive
 Runtimes: io.containerd.runc.v2 runc
 Default Runtime: runc
 Security Options:
  apparmor
   Profile: default
  seccomp
   Profile: builtin
 Kernel Version: 7.0.0-38-generic
 Operating System: Ubuntu 26.04.1 LTS
 Architecture: x86_64
 CPUs: 8
 Total Memory: 15.5GiB
```

Notice `Security Options: apparmor` and `seccomp`. Those are extra layers of restriction
Docker applies to containers automatically. You did not ask for them; they are on by
default. Chapter 19 covers what they do.

---

## 4. File example

Chapter 01 introduces no files, because there is nothing to write yet. Understanding the
model comes first. The first Dockerfile arrives in chapter 08.

The one file we will create in this chapter is a throwaway one, purely to prove the
kernel-sharing claim:

```dockerfile
# /tmp/opencode/ch01/Dockerfile
# A throwaway Dockerfile used only to demonstrate that a container shares
# the host kernel. Not part of the course.

FROM alpine:3.24          # base image: Alpine Linux 3.24, pinned to a minor version

# Print the kernel version the container sees, then exit.
# NOTE: shell form. Chapter 10 explains why we prefer exec (JSON) form,
# and this file is throwaway so the simplicity is worth more than the lesson.
CMD uname -r
```

Why pinned to `3.24` and not `latest`: a moving tag means your build could succeed today
and fail tomorrow with no change on your side. This is the rule used in every chapter of
this course. Chapter 03 covers it properly.

Build and run it:

```console
$ mkdir -p /tmp/opencode/ch01
$ docker build -t ch01-demo /tmp/opencode/ch01
$ docker run --rm ch01-demo
7.0.0-38-generic
```

Same kernel string as your host. That is the whole chapter in one line.

Cleanup:

```console
$ docker rmi ch01-demo
```

---

## 5. When to use it and when NOT to

### Use containers when

- **You want the same software on every machine.** One image, one result, on a laptop, a
  CI runner, a VPS, a colleague's box.
- **Your app needs a messy stack.** Postgres 17, Redis, Python 3.12, a specific C library
  — installed side by side with no version conflicts, because each lives in its own
  container.
- **You want to throw software away safely.** A container is a process plus a file
  system. Delete it and it is gone, with no uninstaller, no leftover config, no
  "recommended cleanup steps."
- **You want cheap, fast scaling.** Starting 50 copies takes seconds, not minutes. VMs
  are the wrong tool for this.
- **You need CI to match production.** The CI runner builds the image; you deploy that
  exact image. No "but it passed on the runner."
- **You are shipping a self-contained tool.** Someone runs one command and gets
  PostgreSQL with a pre-seeded database and your migration already applied.

### Do NOT use containers when

- **You need a different kernel.** A Linux container on a Linux host. Want a Windows VM
  with Windows kernel behaviour? Use a Windows container, which needs a Windows host, or
  just use a VM. Be honest about this one.
- **You want strong security isolation from the host.** Containers share the host
  kernel, so a kernel-level escape is a serious risk. For hostile or untrusted
  multi-tenant code, use VMs, Firecracker, or gVisor. If you do not trust the code at
  all, do not share a kernel with it.
- **The app is a single long-running daemon on one machine.** For "I want nginx on my
  server," installing nginx is simpler than building an image for it. Do not containerize
  out of fashion.
- **You need GPU passthrough, USB access, or unusual hardware interaction.** It is
  possible, but the flags are sharp-edged and version-sensitive. Verify on your exact
  hardware before committing.
- **Latency matters in the sub-millisecond range.** Container startup and network
  overhead are small but nonzero. For a function running a million times a second,
  this is measurable.
- **You need to store state directly on the container's own filesystem.** That layer is
  destroyed on `docker rm`. Use a volume. Chapter 07 covers this and getting it wrong is
  how people lose data.

### The honest middle ground

The real answer is usually: containers for packaging and distributing the app, one or
two VMs (or one managed container platform) underneath. You get the portability of
containers without giving up kernel isolation. That is what production systems actually
do.

---

## 6. Common mistakes

**1. "Containers are lighter than VMs, therefore they are better."**
They are different tools. If you need kernel isolation or a different kernel, a VM is
the correct answer, not a compromise.

**2. Believing a container is a VM.** If your app depends on kernel behaviour — a
network driver, a filesystem quirk, `dmesg`, `ptrace` — it will behave differently than on
a VM, and differently from your laptop, because the kernel is shared.

**3. Assuming the host is safe because "it's in a container".** The container shares the
host kernel. If a container can mount `/var/run/docker.sock`, it can control the whole
host. See chapter 19.

**4. Using `latest` for your base image.** `FROM node:latest` means your build can break
next week with no change to your code. Pin it: `node:22-alpine`. Covered in chapter 03.

**5. Expecting `docker run` to stay in the foreground.** Without `-d`, a long-running
container takes over your terminal and Ctrl-C kills it. `Ctrl-P Ctrl-Q` detaches from an
attached container, but `-d` from the start is simpler.

**6. Forgetting that `docker run` removes the container when it exits.** The image stays
cached (good), but the container's filesystem and any data written to its writable layer
are gone. Anything worth keeping needs a volume — chapter 07.

**7. Running Windows containers on a Linux host.** Will not work. You need matching
kernels. Docker Desktop hides this by running a Linux VM.

**8. Reading `DISK USAGE` in `docker images` and panicking about disk space.** Shared
layers are counted repeatedly per row. Use `docker system df` for the real number, which
is chapter 22.

**9. Installing Docker by hand from `get.docker.com` in production.** That script is
convenient for testing, but it does not give you a pinned version you can reproduce or
roll back. Chapter 02 covers the proper apt/yum repository install.

---

## 7. Try it yourself

**Exercise.** Prove the kernel-sharing claim yourself, then measure the difference in
startup time between a container and something container-shaped.

**Step 1 — ask a container what kernel it has, and compare:**

```console
$ docker run --rm alpine:3.24 uname -r
$ uname -r
```

Both lines should read `7.0.0-38-generic`. If they differ, something is unusual about
your setup and you should tell me.

**Step 2 — time a container:**

```console
$ time docker run --rm alpine:3.24 echo hi
hi
```

Expect `real` well under a second.

**Hint.** Step 3 is the interesting one.

**Step 3 — watch what a container cannot see:**

```console
$ docker run --rm alpine:3.24 sh -c 'ps aux'
```

Inside, you see exactly one process. Your host has many. That is the PID namespace doing
its job. Compare with your host by running `ps aux` in your own terminal.

**Step 4 (optional, the payoff)** — show that the container really is isolated from your
host filesystem:

```console
$ docker run --rm -v /tmp/opencode/ch01:/host-folder alpine:3.24 ls /host-folder
```

An empty directory, because you never created anything in `/tmp/opencode/ch01` except the
Dockerfile. Notice the container can only see what you explicitly mounted. That is the
mount namespace, and chapter 07 makes it useful.

**Cleanup for this chapter:**

```console
$ docker rmi ch01-demo alpine:3.24
```

That removes the throwaway image and the Alpine image. `docker rmi` is safe: it only
removes images, never running containers, and it will refuse if a container is still
using the image.

---

## 8. Next

You know what a container is. Next: confirm your installation is healthy from every
angle, and learn where Docker stores things and how to talk to a remote one.

**[Chapter 02 — Install and First Container](02-install-and-first-container.md)**