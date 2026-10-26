# 02 — Install and First Container

> Verified on: Docker Engine **29.8.2**, Compose **v5.6.0**, BuildKit **v0.33.1**, Ubuntu 26.04.1 LTS, x86_64.

---

## 1. Simple explanation (like I'm 7)

Docker was already on this computer before you started reading this course, and it is
working. So this chapter has two jobs:

1. **Prove it works** from every angle, so that when something breaks later you know the
   basics were fine and the problem is something new.
2. **Explain what was installed and where**, so you can repair it later.

Here is the mental picture. Docker has two halves:

- **The engine**, a service that runs quietly in the background all day. It is the one
  doing the work. Think of it as a power station.
- **The command line tool**, the thing you type. It is just a remote control. Think of
  it as the switch in your living room.

When you type a `docker` command, the tool sends a request over a socket to the
background service. The service does the work and sends back the answer. They are
separate programs and they can even be on separate machines.

This matters because of the most common Docker troubleshooting situation: the service is
not running, the tool still works, and every command fails with a connection error. That
is chapter 23's most frequent case.

---

## 2. Real name

| Term | What it actually is |
| :--- | :--- |
| **Docker Engine** | The daemon (`dockerd`). A long-running background service. Owns images, containers, networks and volumes. Started at boot by systemd. |
| **Docker CLI** | The `docker` program. Sends requests to the Engine over a Unix socket. |
| **Docker Compose** | A separate plugin (`docker compose`) that reads a YAML file and makes many Engine calls for you. Not part of the Engine itself. |
| **Docker Desktop** | A GUI installer for macOS and Windows. Bundles the Engine, Compose, Buildx and a Linux VM. **Not used on this machine.** |
| **Docker context** | A saved connection config (address, TLS certs) that the CLI uses. Lets one CLI talk to several Engines. |
| **Docker-root** | The directory where all Docker data lives: `/var/lib/docker` on your machine. |

Your machine has Engine and CLI from the official apt repository, not Docker Desktop:

```console
$ systemctl is-active docker
active

$ systemctl status docker --no-pager
● docker.service - Docker Application Container Engine
     Loaded: loaded (/usr/lib/systemd/system/docker.service; enabled; preset: enabled)
     Active: active (running) since Thu 2026-10-08 09:45:01 +06; 5h 14min ago
 TriggeredBy: ● docker.socket
       Docs: https://docs.docker.com
   Main PID: 1539 (dockerd)
      Tasks: 61
```

Three details in that output worth understanding:

- **`enabled`** — systemd will start the Engine automatically at boot. If you ever install
  Docker on a server and it stops working after a reboot, check this.
- **`TriggeredBy: docker.socket`** — the Engine is socket-activated. The socket is what
  your CLI connects to, and systemd starts `dockerd` on demand.
- **`Main PID: 1539 (dockerd)`** — the actual daemon process. If you ever need to see what
  it is doing, `journalctl -u docker` shows its log. See chapter 23.

---

## 3. Command example

### Test 1 — the official smoke test

```console
$ docker run hello-world
```

You saw the full output in chapter 01. The important lines:

```console
Hello from Docker!
This message shows that your installation appears to be working correctly.
...
Status: Downloaded newer image for hello-world:latest
```

If you see `Hello from Docker!`, five things are proven at once: the CLI works, the Engine
is reachable, the Engine can reach the internet, TLS and certificate verification to
Docker Hub work, and the runtime can create namespaces and cgroups.

Clean it up:

```console
$ docker rm <container-id>
$ docker rmi hello-world
```

Or, if you never looked at the output, let `docker run` clean up after itself:

```console
$ docker run --rm hello-world
```

`--rm` means "delete this container when it exits." It does **not** remove the image. You
will see `--rm` a lot; it is the difference between leaving a mess and not.

### Test 2 — versions, client and server separately

```console
$ docker version
```

This prints two blocks, and the split is the point:

```console
Client: Docker Engine - Community
 Version:    29.8.2
 Context:    default
 Debug Mode: false
 Plugins:
  buildx: Docker Buildx (Docker Inc.)
    Version:  v0.37.1
    Path:     /usr/libexec/docker/cli-plugins/docker-buildx
  compose: Docker Compose (Docker Inc.)
    Version:  v5.6.0
    Path:     /usr/libexec/docker/cli-plugins/docker-compose

Server: Docker Engine - Community
 Engine:
  Version:          29.8.2
  API version:      1.56 (minimum version 1.40)
  Go version:       go1.26.8
  Git commit:       8af9fe3
  Built:            Wed Sep 30 19:32:32 2026
  OS/Arch:          linux/amd64
  Experimental:     false
 containerd:
  Version:          v2.3.6
  GitCommit:        ee2735368117d2eb259779949d5e75cdafec9761
 runc:
  Version:          v1.5.1
  GitCommit:        v1.5.1-0-g8f2685a4
 docker-init:
  Version:          0.19.0
  GitCommit:        de40ad0
```

`Client:` is the CLI. `Server:` is the Engine. **They can be different versions.** If your
CLI is newer than your Engine, you get errors about API versions and the fix is usually to
upgrade the Engine, not the CLI.

Flag-by-flag on this output:

| Field | Meaning |
| :--- | :--- |
| `API version: 1.56 (minimum version 1.40)` | The Engine API this CLI speaks. `(minimum version 1.40)` is the oldest Engine it can still talk to. |
| `Plugins: buildx / compose` | Extra subcommands installed as CLI plugins. Compose and Buildx are plugins, not built into `docker`. |
| `containerd / runc / docker-init` | The layers underneath. `runc` is what actually creates containers; you almost never touch it directly. |
| `docker-init: 0.19.0` | A tiny init process available for `--init`. Chapter 10 explains why you want it. |

**Flag-by-flag on `docker version` itself:** it has no flags. If you want only one half,
use `docker version --format '{{.Server.Version}}'` or just `docker --version` for the
short client string.

### Test 3 — verify the CLI knows where the Engine is

```console
$ docker context ls
NAME        DESCRIPTION                               DOCKER ENDPOINT               ERROR
default *   Current DOCKER_HOST based configuration   unix:///var/run/docker.sock
```

`unix:///var/run/docker.sock` is that socket from chapter 01. It is a file on your machine.
Anyone who can read/write it has full control of the Engine — which is precisely why
chapter 19 spends so long on it.

```console
$ docker context inspect default --format '{{json .Endpoints.docker.Host}}'
"unix:///var/run/docker.sock"
```

You almost certainly do not need contexts yet. Know they exist, move on. They matter if
you ever connect to a remote Engine over SSH or TLS, which is how CI runners and remote
Docker hosts are reached.

### Test 4 — the install provenance

On your machine, Docker came from the official repository, not from a third-party script:

```console
$ apt-cache policy docker-ce
docker-ce:
  Installed: 5:29.8.2-1~ubuntu.26.04~resolute
  Candidate: 5:29.8.2-1~ubuntu.26.04~resolute
  Version table:
 *** 5:29.8.2-1~ubuntu.26.04~resolute 500
        500 https://download.docker.com/linux/ubuntu resolute/stable amd64 Packages
        100 /var/lib/dpkg/status
     5:29.8.1-1~ubuntu.26.04~resolute 500
```

```console
$ cat /etc/apt/sources.list.d/docker.sources
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: resolute
Components: stable
Architectures: amd64
Signed-By: /etc/apt/keyrings/docker.asc
```

This is what a reproducible install looks like: a pinned repository, GPG-signed
(`Signed-By: /etc/apt/keyrings/docker.asc`), with the package version recorded. You can
answer "is this Docker safe to update?" and "can I reproduce this environment?" because
the answer is written down. Contrast that with the `curl | sh` install, covered below.

---

## 4. File example

No Dockerfile in this chapter — but one system file is worth reading, because it is where
all your images and containers actually live:

```console
$ docker info --format '{{.DockerRootDir}}'
/var/lib/docker
```

That directory holds every image layer, every container's writable layer, all volumes and
all container metadata. On a normal system it is tens of gigabytes and it can fill a disk.
That is the whole subject of chapter 22.

You cannot read it as your normal user, and that is intentional:

```console
$ ls /var/lib/docker/
ls: cannot open directory '/var/lib/docker/': Permission denied
```

Only `root` can browse it. Do not `sudo` your way in and start deleting things by hand —
Docker's own bookkeeping in `/var/lib/docker/image/` and `/var/lib/docker/volumes/` will not
survive hand-editing. Use `docker system df` and the prune commands from chapter 22
instead.

### Install reference for other operating systems

You do not need this on your machine, but you will meet people who do, and you will
eventually want Docker on a Mac. These are the official methods.

**Ubuntu / Debian / Linux (what you have, shown for completeness)**

```bash
# 1. Remove any previous, conflicting packages. This does NOT delete your images
#    or containers, but it can break a working Docker, so only do it if a
#    previous install is in the way.
sudo apt remove docker \
                docker-engine \
                docker.io \
                containerd \
                rund

# 2. Install Docker's official GPG key into a dedicated keyring location.
sudo install -m 0755 -d /etc/apt/keyrings

# 3. Add the official repository.
#    The "resolute" below is your Ubuntu codename. On Ubuntu 22.04 it is
#    "jammy", on 24.04 it is "noble". Check yours with: . /etc/os-release && echo $VERSION_CODENAME
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# 4. Install.
sudo apt update
sudo apt install docker-ce docker-ce-cli containerd.io \
                 docker-buildx-plugin docker-compose-plugin

# 5. Verify.
sudo docker run hello-world
```

**Fedora / RHEL / Rocky / Alma**

```bash
sudo dnf -y install dnf-plugins-core
sudo dnf config-manager --add-repo https://download.docker.com/linux/fedora/docker-ce.repo
sudo dnf install docker-ce docker-ce-cli containerd.io \
                docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo docker run hello-world
```

**Arch / Manjaro**

```bash
sudo pacman -S docker
sudo systemctl enable --now docker
sudo docker run hello-world
```

**macOS and Windows** — install **Docker Desktop** from <https://www.docker.com/products/docker-desktop/>.
It bundles the Engine, Compose, Buildx, a GUI, and — crucially — a small Linux virtual
machine, because macOS and Windows have no Linux kernel for containers to share. Installing
Docker Desktop is why `docker` suddenly works on a Mac in one step with no extra setup.
Chapter 01 explains why that VM is necessary.

**The convenience script, and why production should not use it**

```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
```

This is fine for a laptop or a throwaway CI sandbox. Do not use it for a server you care
about, because:

- It installs the newest available version, unpinned. Two servers built a month apart get
  different Docker versions.
- It rewrites your apt/yum repo configuration without telling you what it changed.
- You cannot easily answer "which version is this, and how do I get back to it?"

Your machine uses the proper repository method shown above, which is why
`apt-cache policy docker-ce` can tell you the exact version.

---

## 5. When to use it and when NOT to

### Use Docker Engine directly when

- **The machine is already Linux.** A server, a VM, a cloud instance, a WSL2 distribution.
  No GUI needed, no extra VM, lowest overhead. This is your situation.
- **You are running on a cloud VM.** VPS providers' images often ship Docker or make it a
  two-minute install.
- **You want minimal attack surface and no GUI.** Engine plus the two plugins is all you
  need.
- **You are in CI.** Most CI systems are Linux containers or Linux VMs, so Engine is the
  natural fit.

### Use Docker Desktop when

- **You develop on macOS or Windows.** There is no alternative that is not much worse.
  Desktop supplies the Linux VM, the GUI, and file sharing between your folders and
  containers.
- **You want a GUI.** Desktop shows running containers, lets you browse images and manage
  volumes with a mouse, and can show Kubernetes clusters. Engine has no GUI at all.
- **You want one consistent environment on every OS.** If half your team is on Windows and
  half on macOS, Desktop is how everyone ends up with the same Docker.
- **You want Kubernetes tooling.** Desktop ships a single-node Kubernetes (kind) cluster
  for learning. Chapter 26 covers what that is.

### Do not install Docker when

- **You only need to run one packaged app on one server.** Installing the app is simpler.
  Chapter 01 has more on this.
- **You are on a shared host and not root.** Docker needs root, or membership of the
  `docker` group — and `docker` group membership is effectively root, because it can mount
  any host device. Know that before you add someone.
- **You are on a kernel older than 4.x.** Modern Docker needs a modern kernel for
  namespaces and cgroups v2. Your machine is on 7.0, so this is not a concern.

---

## 6. Common mistakes

**1. Adding users to the `docker` group and calling it safe.** It is not a normal user
group. Membership lets a user run `docker run -v /:/host`, which is root on the host.
Chapter 19 covers this properly. On a shared machine, that is a full compromise.

**2. Running `curl ... | sudo sh` on a production server.** Works, but leaves you unable
to reproduce or roll back the install. Use the repository method.

**3. Expecting `docker` to work without the Engine running.** You get a socket error. The
fix is `sudo systemctl start docker`. See chapter 23.

**4. Confusing `docker --version` (client only) with `docker version` (client + server).**
If they disagree, your problem is a version mismatch, and `docker --version` hides it.

**5. Running the old `docker-compose` command.** On this machine, Compose is the
`docker compose` plugin, version v5.6.0. The old standalone `docker-compose` binary is
deprecated, is a separate program that can drift out of sync with the Engine, and does not
exist here:

```console
$ docker-compose version
bash: docker-compose: command not found
```

(Minor cosmetic detail: when your shell is bash the message is prefixed with
`/bin/bash: line 1:`. Other shells word it differently. The important part is
`command not found`.)

**Always `docker compose` with a space.** If you see `docker-compose` anywhere in a
tutorial, it is old. That includes the word `version:` at the top of old Compose files —
chapter 15 explains why that key is gone.

**6. Not installing the plugins.** `apt install docker-ce` alone gives you the Engine but
no Compose and no Buildx. You need `docker-buildx-plugin` and `docker-compose-plugin`.
You have both.

**7. Assuming Docker Desktop and Docker Engine are interchangeable.** Same commands,
different architecture. On Desktop the Engine lives inside a VM, so file mounts behave
slightly differently and file-watching is more fragile. If a bind mount tutorial works for
your colleague on a Mac but not for you, this is why — chapter 31 covers it.

**8. Forgetting `sudo` and getting "permission denied" on `/var/run/docker.sock`.** Two
fixes: add yourself to the `docker` group (accepting the risk noted above), or use
rootless Docker. Chapter 19 mentions rootless mode. You are already in the `docker` group:

```console
$ id
uid=1000(sunny) gid=1000(sunny) groups=1000(sunny),4(adm),24(cdrom),27(sudo),30(dip),46(plugdev),111(lpadmin),975(docker),976(sambashare)
```

**9. Installing with an old apt package named `docker.io`.** That is Ubuntu's own build,
versioned differently and often months behind. The `docker-ce` package from
`download.docker.com` is the official one, and that is what you have.

---

## 7. Try it yourself

**Exercise.** Confirm the installation from four independent angles, and find out what
happens when the daemon is unreachable — without actually breaking it.

**Step 1 — engine, CLI, Compose, BuildKit:**

```console
$ docker --version
$ docker version --format 'server={{.Server.Version}}'
$ docker compose version
$ docker buildx version
```

Expected: Engine **29.8.2**, Compose **v5.6.0**, Buildx **v0.37.1**, BuildKit **v0.33.1**.
If any differ from the table at the top of [the roadmap](00-roadmap.md), tell me and I
will correct every chapter.

**Step 2 — prove the old command is gone:**

```console
$ docker-compose version
```

**Hint.** Step 3 is the interesting one.

**Step 3 — see what a broken daemon looks like, safely.** Do not stop the real Docker
service; you have three containers of your own running on this machine. Instead, point a
fresh CLI at a socket that does not exist:

```console
$ DOCKER_HOST=unix:///tmp/opencode/no-such.sock docker ps
```

That is what every connection failure looks like. You have now seen the error message
before you need it, which is the point of this chapter. The `DOCKER_HOST` environment
variable overrides the context — remember that when reading the error message.

**Step 4 — read the daemon's own log:**

```console
$ journalctl -u docker --no-pager -n 10
```

This is where you look when nothing makes sense. Chapter 23 uses it heavily.

**Cleanup:** nothing to clean. You did not create any containers or images in this chapter.

---

## 8. Next

You have a healthy Engine and a working CLI. Now the vocabulary you need for everything
else: images versus containers, what a tag actually is, and what Docker Hub is.

**[Chapter 03 — Images and Registries](03-images-and-registries.md)**