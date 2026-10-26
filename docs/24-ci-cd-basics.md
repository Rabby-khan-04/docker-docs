# 24 — CI/CD Basics

> Verified on: Docker Engine **29.8.2**, Compose **v5.6.0**, BuildKit **v0.33.1**, Ubuntu 26.04.1 LTS, x86_64.

## 1. Simple explanation (like I'm 7)

**CI/CD** stands for **Continuous Integration** and **Continuous Deployment**. It is the automation that builds your image every time you push code, runs tests on it, and — if everything passes — pushes it to a registry so it can be deployed.

Without CI/CD, you have to manually type `docker build`, then `docker tag`, then `docker push`, then `docker pull` on the server. That is slow and error-prone.

With CI/CD, you write a configuration file (GitHub Actions, GitLab CI, etc.) and every `git push` triggers the whole pipeline automatically.

## 2. Real name

### GitHub Actions — the `docker/build-push-action`

The most common way to build and push images in CI is GitHub Actions. The official action is `docker/build-push-action`. A minimal workflow looks like this:

```yaml
# .github/workflows/docker.yml
name: Build and push Docker image

on:
  push:
    branches: [ main ]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Log in to Docker Hub
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}

      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: myusername/myapp:${{ github.sha }}
          cache-from: type=registry,ref=myusername/myapp:cache
          cache-to: type=registry,ref=myusername/myapp:cache,mode=max
```

| Step | What it does |
| :--- | :--- |
| `actions/checkout@v4` | Gets your source code into the GitHub runner. |
| `docker/login-action@v3` | Runs `docker login` with your secrets. |
| `docker/build-push-action@v5` | Builds the image and pushes it. `push: true` uploads it. |

### Reproducible tags from git SHAs

```console
# The SHA of the commit that triggered the build.
${{ github.sha }}  # full 40-char SHA
${{ github.ref_name }}  # branch name (e.g. "main")
```

You can also use `ref: refs/tags/v1.2.3` for git tags.

### Cache strategies

| Strategy | What it does | When to use |
| :--- | :--- | :--- |
| `type=registry` | Caches are stored in a registry (Docker Hub, GHCR, etc.). | Persistent across runner restarts. Best for long-running CI. |
| `type=github` | Caches are stored on GitHub Actions' server. | Default for new workflows. Good for short-lived runners. |
| `type=local` | Caches are stored on the runner's filesystem. | Useful for debugging, but lost when the runner dies. |
| `mode=max` / `mode=max` | Only push cache layers that are new. | Reduces cache size. |
| `mode=min` | Only pull cache layers that are missing. | Faster pull, but may not save much. |

### Running tests in CI

After the image is built, you can run a container from it and run your test suite:

```yaml
- name: Run tests
  run: |
    docker run --rm myusername/myapp:${{ github.sha }} npm test
```

Or, build, run, test, then push:

```yaml
- name: Build
  uses: docker/build-push-action@v5
  with:
    context: .
    push: false
    tags: myusername/myapp:${{ github.sha }}

- name: Run integration tests
  run: |
    docker run --rm myusername/myapp:${{ github.sha }} npm run test:integration
```

### GitLab CI example

```yaml
# .gitlab-ci.yml
stages:
  - build
  - test
  - deploy

image: docker:latest

services:
  - name: docker:dind
    alias: docker

build_image:
  stage: build
  script:
    - docker build -t registry.example.com/myapp:$CI_COMMIT_SHA .
    - docker push registry.example.com/myapp:$CI_COMMIT_SHA

test_image:
  stage: test
  script:
    - docker run --rm registry.example.com/myapp:$CI_COMMIT_SHA npm test

deploy_image:
  stage: deploy
  script:
    - ssh user@host "docker pull registry.example.com/myapp:$CI_COMMIT_SHA && docker run -d --name myapp ..."
```

### Reproducible builds from git SHAs

```console
# Build with a tag based on the git SHA
$ docker build -t myapp:${GITHUB_SHA} .

# Or with a tag based on the branch name
$ docker build -t myapp:main-$GIT_BRANCH .

# Pin to digest for absolute reproducibility
$ docker build --provenance=true -t myapp:1.0.0 .
$ docker images --digests
```

## 3. Command example\n\n### GitHub Actions workflow — minimal\n\nCreate `.github/workflows/docker.yml`:\n\n```yaml\nname: Build and push Docker image\n\non:\n  push:\n    branches: [ main ]\n\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - name: Checkout repository\n        uses: actions/checkout@v4\n\n      - name: Log in to Docker Hub\n        uses: docker/login-action@v3\n        with:\n          username: ${{ secrets.DOCKERHUB_USERNAME }}\n          password: ${{ secrets.DOCKERHUB_TOKEN }}\n\n      - name: Build and push\n        uses: docker/build-push-action@v5\n        with:\n          context: .\n          push: true\n          tags: myusername/docker-learn:${{ github.sha }}\n          cache-from: type=registry,ref=myusername/docker-learn:cache\n          cache-to: type=registry,ref=myusername/docker-learn:cache,mode=max\n```\n\n### GitHub Actions — build and run tests\n\n```yaml\nname: Build, test, and push Docker image\n\non:\n  push:\n    branches: [ main ]\n\njobs:\n  build-test-push:\n    runs-on: ubuntu-latest\n    steps:\n      - name: Checkout repository\n        uses: actions/checkout@v4\n\n      - name: Log in to Docker Hub\n        uses: docker/login-action@v3\n        with:\n          username: ${{ secrets.DOCKERHUB_USERNAME }}\n          password: ${{ secrets.DOCKERHUB_TOKEN }}\n\n      - name: Build image\n        uses: docker/build-push-action@v5\n        with:\n          context: .\n          push: false\n          tags: myusername/docker-learn:${{ github.sha }}\n\n      - name: Run npm test inside the image\n        run: |\n          docker run --rm myusername/docker-learn:${{ github.sha }} npm test\n\n      - name: Push image\n        uses: docker/build-push-action@v5\n        with:\n          context: .\n          push: true\n          tags: myusername/docker-learn:${{ github.sha }}\n          cache-from: type=registry,ref=myusername/docker-learn:cache\n          cache-to: type=registry,ref=myusername/docker-learn:cache,mode=max\n```\n\n### GitLab CI — full pipeline\n\n```yaml\nimage: docker:latest\n\nstages:\n  - build\n  - test\n  - deploy\n\nservices:\n  - name: docker:dind\n    alias: docker\n\nbuild_image:\n  stage: build\n  script:\n    - docker build -t registry.example.com/myapp:$CI_COMMIT_SHA .\n    - docker push registry.example.com/myapp:$CI_COMMIT_SHA\n\ntest_image:\n  stage: test\n  script:\n    - docker run --rm registry.example.com/myapp:$CI_COMMIT_SHA npm test\n\ndeploy_image:\n  stage: deploy\n  script:\n    - ssh user@deploy-host \"docker pull registry.example.com/myapp:$CI_COMMIT_SHA && docker run -d --name myapp -p 80:80 registry.example.com/myapp:$CI_COMMIT_SHA\"\n```\n\n### Build with --provenance and --sbom for supply-chain security\n\n```console\n$ docker build --provenance=true --sbom=true -t myapp:1.0.0 .\n```\n\nThis embeds a provenance attestation (who built it, from what base) and a Software Bill of Materials\n(SBOM — list of all components and versions) into the image. Verified in chapter 20.\n\n### Push with cache from a previous build\n\n```console\n$ docker build --cache-from type=registry,ref=myusername/myapp:cache \\\n   --cache-to type=registry,ref=myusername/myapp:cache,mode=max \\\n   -t myusername/myapp:latest .\n```\n\nReuses cache layers from a previously pushed image in the registry. On a fresh runner (e.g.\nGitHub Actions), the local cache starts empty, but the registry cache persists.\n\n---\n

## 4. When to use CI/CD and when NOT to\n\n### Use CI/CD when\n\n- **You are building images for production.** Automated builds ensure every commit produces\n  a consistent image.\n- **You want to run tests on every push.** Catching bugs before they reach production.\n- **You need to deploy to multiple machines.** Push once, pull everywhere from the registry.\n- **You want reproducible tags.** Git SHA tags mean you can always rebuild the exact same image.\n\n### Do not use CI/CD when\n\n- **You are exploring a new idea quickly.** Manual `docker build` is faster for one-off experiments.\n- **You have a very small project** with one or two contributors and no deployment pipeline.\n- **The build takes less than 30 seconds.** The CI pipeline overhead may not be worth it.\n\n### A practical CI/CD pattern\n\n1. **Push code** → GitHub Actions triggers.\n2. **Checkout** source code.\n3. **Build image** with layer caching ( `--cache-from` / `--cache-to` ).\n4. **Run tests** inside the built image.\n5. **If tests pass**, push the image to a registry with a reproducible tag (git SHA).\n6. **Deploy** from the registry to staging or production.\n\n## 5. Common mistakes\n\n**1. Forgetting `push: true` in the build-push-action.**\n\nWithout `push: true`, the image is built locally but never uploaded to the registry.\n\n**2. Using `latest` tag in CI.**\n\n```console\n tags: myusername/myapp:latest\n```\n\n`latest` overwrites the previous image with the same name. Always use a reproducible tag\nlike `${{ github.sha }}` or a git version.\n\n**3. Not caching between runs.**\n\nWithout `--cache-from` / `--cache-to`, every build starts from scratch on a fresh runner.\nThis makes builds slow and defeats the purpose of CI.\n\n**4. Storing Docker Hub passwords in plain text in the workflow file.**\n\nAlways use GitHub Secrets (`${{ secrets.DOCKERHUB_TOKEN }}`) or GitLab CI variables.\nNever commit passwords to the workflow YAML.\n\n**5. `docker build` without `--provenance` / `--sbom` in CI.**\n\nIf you want supply-chain security, add these flags. They are opt-in because they increase\nbuild time slightly, but they provide valuable attestations.\n\n**6. `docker run` in a test step leaving behind containers.**\n\nAlways use `--rm` in `docker run` for test steps, or clean up explicitly. Otherwise\naccumulated test containers waste disk space and may interfere with later steps.\n\n**7. Not pinning the base image digest in CI.**\n\nIf your Dockerfile uses `FROM node:22-alpine` without a digest, a new base image pull may\nchange the build output. Pin by digest for reproducibility: `FROM node:22-alpine@sha256:...`.\n\n**8. Using `docker save` / `docker load` in CI instead of `docker push` / `docker pull`.**\n\n`save`/`load` is for moving images between machines without a registry. `push`/`pull` is the\nCI/CD pattern for storing images in a registry.\n\n---\n

## 6. Try it yourself\n\n**Exercise.** Create a minimal GitHub Actions workflow that builds, tests, and pushes the\nsample app.\n\n**Step 1 — set up GitHub Secrets.**\n\nIn your GitHub repository, go to Settings → Secrets and variables → Actions → New repository secret:\n\n- Name: `DOCKERHUB_USERNAME`\n- Value: your Docker Hub username\n\n- Name: `DOCKERHUB_TOKEN`\n- Value: a Docker Hub personal access token (not your password). Create one at\n  https://hub.docker.com/settings/security.\n\n**Step 2 — create the workflow file.**\n\n```bash\n$ mkdir -p .github/workflows\n$ cat > .github/workflows/docker.yml <<'EOF'\nname: Build and push Docker image\n\non:\n  push:\n    branches: [ main ]\n\njobs:\n  build-test-push:\n    runs-on: ubuntu-latest\n    steps:\n      - name: Checkout repository\n        uses: actions/checkout@v4\n\n      - name: Log in to Docker Hub\n        uses: docker/login-action@v3\n        with:\n          username: ${{ secrets.DOCKERHUB_USERNAME }}\n          password: ${{ secrets.DOCKERHUB_TOKEN }}\n\n      - name: Build image\n        uses: docker/build-push-action@v5\n        with:\n          context: .\n          push: false\n          tags: myusername/docker-learn:${{ github.sha }}\n\n      - name: Run npm test inside the image\n        run: |\n          docker run --rm myusername/docker-learn:${{ github.sha }} npm test\n\n      - name: Push image\n        uses: docker/build-push-action@v5\n        with:\n          context: .\n          push: true\n          tags: myusername/docker-learn:${{ github.sha }}\n          cache-from: type=registry,ref=myusername/docker-learn:cache\n          cache-to: type=registry,ref=myusername/docker-learn:cache,mode=max\nEOF\n```\n\n**Step 3 — push a commit and watch the pipeline run.**\n\n```console\n$ git add .github/workflows/docker.yml\n$ git commit -m "add CI/CD pipeline"\n$ git push origin main\n```\n\nGitHub Actions should start automatically. Check the Actions tab in your repository.\n\n**Step 4 — verify the image was pushed.**\n\n```console\n$ docker pull myusername/docker-learn:${GITHUB_SHA}\n```\n\nThe image should be available on Docker Hub.\n\n**Step 5 — clean up (local only).**\n\n```console\n$ docker rmi myusername/docker-learn:${GITHUB_SHA}\n```\n\n---\n

## 7. Next\n\nYou can automate building, testing, and pushing Docker images. Next: BuildKit and buildx for\nfaster, multi-platform builds, and cache backends.\n\n**[Chapter 25 — BuildKit and Buildx](25-buildkit-and-buildx.md)**