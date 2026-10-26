# 26 — Swarm and Kubernetes Intro

> Verified on: Docker Engine **29.8.2**, Compose **v5.6.0**, BuildKit **v0.33.1**, Ubuntu 26.04.1 LTS, x86_64.

## 1. Simple explanation (like I'm 7)

You started with one container. Then you added more with `docker compose`. But what if you have 10 containers, or 100, or you want them to run across multiple machines?

**Docker Swarm** and **Kubernetes** are the two ways to orchestrate many containers. They handle scaling, self-healing, service discovery, and rolling updates.

This chapter gives you the shortest possible introduction to both, so you know when you've outgrown Compose and what to look at next.

## 2. Real name

### Docker Swarm — Docker's native orchestration

| Concept | Description |
| :--- | :--- |
| `docker init` | Initialize a new Swarm: `docker init` |
| `docker swarm init` | Make this machine a Swarm manager. |
| `docker swarm join` | Join other machines to the Swarm as workers. |
| `docker stack deploy` | Deploy a stack (defined with `compose.yaml`) to the Swarm. |
| `docker service ls` | List services running in the Swarm. |
| `docker service ps` | Show tasks (running instances) for a service. |
| `docker service scale` | Scale a service up or down. |

#### Minimal Swarm setup

```console
# On the manager machine:
$ docker init

# Follow the prompts. It will:
# 1. Initialize a Swarm
# 2. Create an overlay network
# 3. Add a sample service
# 4. Give you commands to join workers

# On a worker machine:
$ docker swarm join --token <TOKEN> <MANAGER_IP>:2377
```

#### Deploy a stack to Swarm

```console
$ docker stack deploy -c compose.yaml myapp
```

This reads `compose.yaml` and creates the described services in the Swarm.

#### Swarm vs Compose

| Aspect | Compose | Swarm |
| :--- | :--- | :--- |
| **Scope** | Single machine | Multiple machines (cluster) |
| `docker compose up` | Creates containers on one machine | N/A (Compose is not orchestration) |
| `docker stack deploy` | N/A | Deploys to a Swarm cluster |
| Scaling | Not supported (well, `docker compose up --scale`) | `docker service scale` |
| Self-healing | No | Yes (restart on failure, replace crashed tasks) |
| Rolling updates | No | Yes |

### Kubernetes — the industry standard

Kubernetes is much more powerful than Swarm, but also much more complex.

| Concept | Description |
| :--- | :--- |
| `pod` | One or more containers that share network and storage. The smallest unit. |
| `deployment` | Manages `pod` replicas, rolling updates, and self-healing. |
| `service` | Stable network address to access a set of `pod`s. |
| `namespace` | Virtual clusters within a single Kubernetes cluster. |
| `ingress` | HTTP-level load balancing and TLS termination. |

#### Minimal Kubernetes manifest

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp
spec:
  replicas: 3
  selector:
    matchLabels:
      app: myapp
  template:
    metadata:
      labels:
        app: myapp
    spec:
      containers:
        - name: myapp
          image: myusername/myapp:1.0.0
          ports:
            - containerPort: 3000
---
apiVersion: v1
kind: Service
metadata:
  name: myapp
spec:
  selector:
    app: myapp
  ports:
    - port: 80
      targetPort: 3000
```

#### `kubectl` commands

| Command | What it does |
| :--- | :--- |
| `kubectl create -f manifest.yaml` | Create resources from a file. |
| `kubectl get pods` | List pods. |
| `kubectl get services` | List services. |
| `kubectl describe pod <name>` | Show detailed info about a pod. |
| `kubectl logs <pod>` | Show pod logs. |
| `kubectl scale deployment <name> --replicas=5` | Scale a deployment. |
| `kubectl rollout status deployment/<name>` | Check rolling update status. |

#### Kubernetes vs Compose vs Swarm

| Aspect | Compose | Swarm | Kubernetes |
| :--- | :--- | :--- | :--- |
| **Scope** | Single machine | Single cluster (multiple machines) | Data-center scale (any number of machines) |
| **Learning curve** | Low | Medium | High |
| **Package format** | `compose.yaml` | Native Docker CLI | YAML manifests or Helm charts |
| **Self-healing** | No (manual restart) | Yes | Yes |
| **Rolling updates** | No | Yes | Yes |
| **Service discovery** | DNS by service name (built-in) | DNS by service name (built-in) | DNS + environment variables + Service API |
| **Ecosystem** | Huge (tools, GUIs, integrations) | Small (mostly Docker tools) | Huge (Helm, OpenShift, Argo, etc.) |

### When you outgrow Compose

| Sign | Next step |
| :--- | :--- |
| **You have more than 3-5 containers** on one machine. | Stick with Compose, or move to Swarm. |
| **You need multi-machine orchestration.** | Try Swarm (easy transition from Compose) or Kubernetes (standard). |
| **You need auto-scaling** (add replicas when CPU is high). | Kubernetes (with Horizontal Pod Autoscaler). |
| **You need advanced networking** (mesh, external DNS, service mesh). | Kubernetes (with CNI plugins, Ingress, Service Mesh). |
| **You are in a production enterprise** with compliance requirements. | Kubernetes (industry standard, certifications, GUIs). |

## 3. Command example\n\n### Initialize a Swarm (on one machine)\n\n```console\n$ docker init\n```\n\nFollow the prompts. It will initialize a Swarm on your machine, create an overlay network,\nand give you a `docker swarm join` command to use on worker machines.\n\n```console\n$ docker swarm init\n```\n\n```console\n$ docker swarm init --advertise-addr <this-machine-ip>\n```\n

Output: `Swarm initialized: current node (<node-id>) is now a manager.`\n\n### Join a worker to the Swarm\n\n```console\n$ docker swarm join --token <TOKEN> <MANAGER_IP>:2377\n```\n\nAfter joining, check:\n\n```console\n$ docker swarm ls\n```\n

Shows the managers and their status.\n\n### Deploy a stack to the Swarm\n\n```console\n$ docker stack deploy -c compose.yaml myapp\n```\n

This reads `compose.yaml` and creates the described services in the Swarm. The project name\nis derived from the stack name: `myapp-api-1`, `myapp-db-1`, etc.\n\n### List services in the Swarm\n\n```console\n$ docker stack services myapp\n```\n

Output: `NAME            REPLICAS  IMAGE          COMMAND    PORTS\napi               1/1       myimage:1.0.0   \ndb                1/1       postgres:17-alpine   \n\n### Scale a service in the Swarm\n\n```console\n$ docker service scale myapp_api=3\n```\n

Increases the `api` service to 3 replicas. The Swarm schedules them across available nodes.\n\n### Kubernetes — create a deployment\n\n```console\n$ kubectl create -f k8s-deployment.yaml\n```\n

Where `k8s-deployment.yaml` contains a Deployment and Service manifest (see the "Real name" section above).\n\n```console\n$ kubectl get pods\n```\

Output: `NAME                              READY   STATUS    RESTARTS   AGE\nmyapp-5f9b8c7d8b-z3q8j   1/1     Running   0   10s\n\n### Kubernetes — check the rollout status\n\n```console\n$ kubectl rollout status deployment/myapp\n```\n

Waits for the rolling update to complete. Output: `deployment "myapp" successfully rolled out`.\n\n### Kubernetes — scale a deployment\n\n```console\n$ kubectl scale deployment myapp --replicas=5\n```\n

Increases the replica count to 5. The Deployment controller adjusts the `pod`s accordingly.\n\n### Swarm vs Kubernetes — a quick comparison on this machine\n\n```console\n$ docker info | grep -i swarm\n```\n

Output: `Swarm: inactive` (Docker Engine 29.8.2 is not running a Swarm by default).\n\n```console\n$ kubectl version --client\n```\n

Output: `Client Version: version.Major: "1", Minor: "28"` (kubectl is available, but\nthe cluster may not be running. Kind or minikube can be used for local testing).\n\n## 4. When to use Swarm and when to use Kubernetes\n\n### Use Swarm when\n\n- **You are already using Docker Compose.** Swarm accepts the same `compose.yaml` files.\n- **You want simple multi-machine orchestration** without the complexity of Kubernetes.\n- **You have a small cluster** (fewer than 10 nodes).\n- **You want a gentle learning curve.** Swarm's CLI is familiar if you know `docker`.\n\n### Use Kubernetes when\n\n- **You need auto-scaling** based on CPU, memory, or custom metrics.\n- **You are in a large enterprise** with compliance, security, and multi-cluster requirements.\n- **You need a rich ecosystem** of tools (Helm, service meshes, GUIs, CI/CD integrations).\n- **You are running 10+ nodes** or need cross-cloud/federation capabilities.\n- **You need advanced networking** (service mesh, network policies, CNI plugins).\n\n### The honest recommendation for a beginner\n\n> **Start with Docker Compose.** When you outgrow it (multi-machine needs, auto-scaling, or\nenterprise requirements), evaluate Swarm (for a quick upgrade path from Docker) or Kubernetes\n(for the industry-standard platform).\n\nOn your machine (Docker Engine 29.8.2, single host), Compose + the possibility of `docker init`\nto add Swarm is the lowest-friction path. Kubernetes requires a cluster, which usually means\ninstalling kind, minikube, or a cloud provider cluster.\n\n## 5. Common mistakes\n\n**1. `docker stack deploy` without running a Swarm first.**\n\n```console\n$ docker stack deploy -c compose.yaml myapp\nerror: rpc error: code = 3 > description = could not find manager specified in request\n```\n

You must run `docker swarm init` first.\n\n**2. Confusing `docker compose up` with `docker stack deploy`.**\n\n`docker compose up` works on a single machine. `docker stack deploy` requires a Swarm manager.\nThey are not the same command.\n\n**3. Assuming Kubernetes is just `docker compose` with more steps.**\n\nKubernetes has a completely different model (pods, deployments, services, namespaces, nodes).\nThe learning curve is significant. Do not assume `kubectl run` works like `docker run`.\n\n**4. `docker swarm init` on a machine that already runs a Swarm.**\n\nIf a Swarm is already initialized, `docker swarm init` will error. Use `docker swarm join` on\nworkers, or `docker swarm leave` on the current manager before re-initializing.\n\n**5. Not exposing ports in Kubernetes Services.**\n\nBy default, a Kubernetes `Service` with `type: ClusterIP` is only reachable within the cluster.\nUse `type: NodePort` or `type: LoadBalancer` to expose it externally.\n\n**6. `kubectl create deployment` without specifying an image.**\n\n```console\n$ kubectl create deployment myapp\n```\n\nYou must specify the image: `kubectl create deployment myapp --image=myimage:1.0.0`.\n\n**7. Assuming `docker init` sets up a full Kubernetes cluster.**\n\n`docker init` only sets up a Docker Swarm, not Kubernetes. For Kubernetes, you need kind,\nminikube, or a cloud provider.\n\n**8. Leaving Swarm mode on all machines at once.**\n\n`docker swarm leave --force` on the manager leaves the cluster without a manager. Always leave\nworkers first, then the manager, or use `docker swarm leave` gracefully.\n\n**9. `kubectl` commands failing because no cluster is running.**\n\n```console\n$ kubectl get pods\n```\n\nOutput: `The connection to the server localhost:8080 was refused - did you specify the right\nhost or port?` This means no Kubernetes cluster is running. Use `kind create cluster` or\n`minikube start` to create one.\n\n**10. Assuming Compose files work identically in Swarm and Kubernetes.**\n\nCompose files need some adjustments for Swarm (`docker stack deploy` uses v2/v3 format).\nFor Kubernetes, you usually need to convert to manifest YAML or use the `kompose` tool.\n\n---\n

## 6. Try it yourself\n\n**Exercise.** Initialize a Swarm and deploy the sample app.\n\n**Step 1 — initialize the Swarm:**\n\n```console\n$ docker init\n```\n\nor\n\n```console\n$ docker swarm init --advertise-addr 127.0.0.1\n```\n\n```console\n$ docker swarm ls\n```\n

Output: `ID   HOSTNAME   ACTIVE   *   MANAGER   NODES\nx8y...   this-host   active   *   this-host   1\n\n**Step 2 — deploy the sample app as a stack:**\n\n```console\n$ docker stack deploy -c compose.yaml myapp\n```\n\n```console\n$ docker stack services myapp\n```\n

Output: `NAME            REPLICAS  IMAGE          COMMAND    PORTS\napi               1/1       docker-learn:1.0.0   \nworker            1/1       alpine:3.24   "sh -c echo api is healthy; sleep 60"\n\n**Step 3 — scale the api service:**\n\n```console\n$ docker service scale myapp_api=3\n```\n

```console\n$ docker stack services myapp\n```\

```console\nNAME            REPLICAS  IMAGE          COMMAND    PORTS\napi               3/3       docker-learn:1.0.0   \nworker            1/1       alpine:3.24   "sh -c echo api is healthy; sleep 60"\n\n**Step 4 — leave the Swarm (cleanup):**\n\n```console\n$ docker swarm leave --force\n```\n\n## 7. Next\n\nYou have a basic understanding of orchestration alternatives. Next: a real-world Node.js app\npattern — containerizing the docker-learn app with production-ready patterns.\n\n**[Chapter 27 — Pattern: Node.js App](27-pattern-nodejs-app.md)**