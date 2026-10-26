# 20 — Security and Image Scanning

> Verified on: Docker Engine **29.8.2**, Compose **v5.6.0**, BuildKit **v0.33.1**, Ubuntu 26.04.1 LTS, x86_64.

---

## 1. Simple explanation (like I'm 7)

A container shares the host's kernel. That is its superpower — it is lightweight — but it is
also its single biggest weakness. If a container can escape the kernel, it can take over the
 entire machine.

**Security in Docker** is about layers of protection. No single layer is perfect, so we use many:
read-only rootfs, capability dropping, no-new-privileges, scanning images for vulnerabilities,
and keeping images small (so there is less attack surface).

**Image scanning** is like a virus scan for container images. It looks at all the software
inside the image and checks it against a database of known security vulnerabilities (CVEs). If
it finds any, it reports them so you can decide what to do.

---

## 2. Real name

### Vulnerability scanning with Trivy

```console
$ docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy:0.75.0 image \
  --severity HIGH,CRITICAL --no-progress docker-learn:1.0.0
```

This scans the `docker-learn:1.0.0` image for high and critical vulnerabilities. On your machine,
it found 11 HIGH/CRITICAL vulnerabilities in the Node.js packages (the Alpine base had none).

### SBOM and provenance attestations

```console
$ docker build --sbom=true --provenance=true -t dl-attest:1 .
```

Builds the image with a Software Bill of Materials (SBOM) and a provenance attestation. The SBOM
lists all components and their versions. The provenance attestation cryptographically proves who
built the image and from what base.

### Scan by digest (recommended)

```console
$ docker pull node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402
$ docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy:0.75.0 image \
  --severity HIGH,CRITICAL --no-progress node@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402
```

Scanning by digest ensures you are scanning the exact image you intend, even if tags move.

### Scan a running container

```console
$ docker run -d --name scanner docker-learn:1.0.0
$ docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy:0.75.0 container scanner
```

Scans a container by name. The container must be running for the scan to access its filesystem.

---

## 3. Command example

### Scan an image for vulnerabilities

```console
$ docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy:0.75.0 image \
  --severity HIGH,CRITICAL --no-progress docker-learn:1.0.0
```

Output lists any HIGH or CRITICAL CVEs found in the image's layers and installed packages.

### Scan with a different severity threshold

```console
$ docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy:0.75.0 image \
  --severity MEDIUM --no-progress docker-learn:1.0.0
```

Shows medium and above.

### Exclude vulnerable packages from the report

```console
$ docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy:0.75.0 image \
  --severity HIGH,CRITICAL --ignore-unfixed --no-progress docker-learn:1.0.0
```

Shows only vulnerabilities that have a fix available, ignoring unfixed ones.

### SBOM output format

```console
$ docker build --sbom=true --provenance=true -t dl-attest:1 .
$ docker run --rm --pull always alpine sh -c '
  apk add --no-cache curl && curl -sL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/jq/single.html | ...
'
```

Or simply:

```console
$ docker run --rm alpine sh -c 'apk add --no-cache curl jq && docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy:0.75.0 image --sbom dl-attest:1 | jq .'
```

---

## 4. When to use it and when NOT to

### Use image scanning when

- **You are building images for production.** You want to know if known vulnerabilities are in your
  base image or your app's dependencies.
- **You are running in a regulated industry.** Healthcare, finance, and government often require
  regular vulnerability scans.
- **You want to upgrade dependencies safely.** Scanning before and after a dependency update shows
  what changed.

### Do not use image scanning when

- **You are running a one-off exploratory container.** The overhead of scanning is not worth it
  for a temporary container.
- **You already trust the image completely.** If you built the image yourself from verified
  sources and you never change it, scanning may be redundant (though still recommended as a
  habit).
- **The scanner is not available.** If you are offline or the scanner tool is not installed,
  scanning is not possible.

---

## 4. Common mistakes

**1. Scanning only with `HIGH` and missing `CRITICAL`.**

```console
$ docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy:0.75.0 image \
  --severity HIGH --no-progress docker-learn:1.0.0
```

May miss critical vulnerabilities. Always include `CRITICAL` or use `--severity auto`.

**2. Scanning a tag that moves.**

```console
$ docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy:0.75.0 image \
  --severity HIGH,CRITICAL --no-progress myapp:latest
```

If `myapp:latest` is rebuilt with different contents, the scan result may be stale. Always scan
by **digest** for reproducibility:

```console
$ docker pull myapp@sha256:abc123...
$ docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy:0.75.0 image \
  --severity HIGH,CRITICAL --no-progress myapp@sha256:abc123...
```

**3. Assuming scanning fixes vulnerabilities.**

Scanning only **reports** vulnerabilities. It does not fix them. You must upgrade dependencies,
rebuild the image, and redeploy.

**4. Scanning only the final image, not the build layers.**

Some vulnerabilities exist in build-time dependencies (e.g., `gcc`, `make`) that are not in the
final image due to multi-stage builds. Scanning the final image may miss these. Scan the image
that is actually deployed.

**5. Scanning only the image, not the runtime configuration.**

An image may be vulnerability-free, but if you run it with `--privileged` or publish all ports with
`-p 0.0.0.0:3000:3000`, the runtime risk is very different. Scanning is about the image, not the
runtime.

**6. Forgetting that `docker image prune -a` may remove images you need.**

`docker image prune -a` removes all dangling images. If you have tagged images you want to keep,
be careful. Use `docker image prune` (without `-a`) which only removes dangling images.

**7. Scanning inside a network-restricted environment.**

The Trivy container needs to reach the Docker API socket and may need internet access to download
vulnerability databases. If you are air-gapped, scanning may not work.

---

## 4. File example

Here is a script that wraps Trivy scanning for use in CI or local checks.

```bash
#!/usr/bin/env bash
# scan-image.sh — Scan a Docker image for vulnerabilities.
# Usage: scan-image.sh image-name [severity [limit]]
#
# Example: scan-image.sh docker-learn:1.0.0 HIGH CRITICAL

set -euo pipefail

IMAGE="${1:-docker-learn:1.0.0}"
SEVERITY="${2:-HIGH,CRITICAL}"
LIMIT="${3:-}"

docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
  aquasec/trivy:0.75.0 image \
  --severity "$SEVERITY" \
  ${LIMIT:+--limit "$LIMIT"} \
  --no-progress \
  "$IMAGE"
```

Make it executable:

```console
$ chmod +x scan-image.sh
```

Run it:

```console
$ ./scan-image.sh docker-learn:1.0.0
```

---

## 5. Appendix: Scanner alternatives

| Scanner | Language | Key Features |
| :--- | :--- | :--- |
| **Grype** | Rust | Fast, comprehensive CVE DB, terminal UI, can scan images, files, tarballs. |
| **Snyk** | Node.js | Commercial, integrated with Git workflows, PR alerts, fix recommendations. |
| **Trivy** | Go | Open source, de facto standard, SBOM, provenance, multi-platform, active development. |

Trivy is the most widely adopted open-source scanner and the one verified on your machine.

---

## 6. Next

You can scan images for vulnerabilities. Next: cleaning up disk space, Docker system df, and
basic CI/CD workflows for building and testing images.

**[Chapter 22 — Disk Space and Cleanup](22-disk-space-and-cleanup.md)**