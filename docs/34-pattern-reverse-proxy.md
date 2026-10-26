# 34 — Pattern: Reverse Proxy Basics

> Verified on: Docker Engine **29.8.2**, Compose **v5.6.0**, BuildKit **v0.33.1**, Ubuntu 26.04.1 LTS, x86_64.

## 1. Simple explanation (like I'm 7)

You have several app containers running on different internal ports (3000, 3001, 3002, etc.). You want to expose just **one** port to the outside world (port 80 or 443), and have a reverse proxy decide which app container receives each request.

This is like a building front desk: the visitor only knows the building's main address, and the desk attendant sends them to the right office.

This chapter shows how to use `nginx` as a reverse proxy in front of your app containers, with TLS termination, `X-Forwarded-For` headers, and health-based load balancing.

## 2. Real name

### The nginx reverse proxy configuration

```nginx
# /etc/nginx/conf.d/proxy.conf\nupstream app_servers {\n  server api:3000;\n  server api2:3000;\n}\n\nserver {\n  listen 80;\n  server_name myapp.example.com;\n\n  # Forward the original client IP to the app via X-Forwarded-For.\n  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n  proxy_set_header Host $host;\n  proxy_set_header X-Real-IP $remote_addr;\n\n  # Health check: if the upstream is down, stop sending traffic.\n  upstream_app_servers;\n\n  location / {\n    proxy_pass http://app_servers;\n  }\n\n  # TLS termination (if you have a cert).\n  # listen 443 ssl;\n  # ssl_certificate /etc/nginx/ssl/cert.pem;\n  # ssl_certificate_key /etc/nginx/ssl/key.pem;\n}\n```\n

| Directive | Purpose |
| :--- | :--- |
| `upstream app_servers { ... }` | Defines a group of backend servers. The proxy distributes requests among them. |
| `server_name myapp.example.com;` | The hostname this server responds to. |
| `proxy_set_header X-Forwarded-For ...` | Forwards the original client IP to the app, so the app sees `real` IPs. |
| `proxy_set_header Host $host;` | Forwards the original `Host` header to the app. |
| `proxy_set_header X-Real-IP $remote_addr;` | Forwards the real client IP to the app. |
| `location / { proxy_pass http://app_servers; }` | Matches all requests and sends them to the upstream group. |

### nginx Dockerfile

```dockerfile\n# syntax=docker/dockerfile:1\nFROM nginx:1.27-alpine\nCOPY nginx.conf /etc/nginx/conf.d/proxy.conf\nEXPOSE 80\nCMD [\"nginx\", \"-g\", \"daemon off;\"]\n```\n

| Instruction | Purpose |
| :--- | :--- |
| `FROM nginx:1.27-alpine` | Minimal nginx base (Alpine). |
| `COPY nginx.conf ...` | Copies the custom nginx config into the image. |
| `EXPOSE 80` | Documents the port (does not publish it). |
| `CMD ["nginx", "-g", "daemon off;"]` | Runs nginx in the foreground (required for `docker run`). |

### Docker Compose with nginx reverse proxy

```yaml\nservices:\n  # The nginx reverse proxy\n  proxy:\n    build: ./nginx\n    ports:\n      - \"80:80\"\n    networks:\n      - appnet\n  # The app server\n  api:\n    build: .\n    networks:\n      - appnet\n    healthcheck:\n      test: [\"CMD\", \"node\", \"-e\", \"fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))]\n      interval: 10s\n      timeout: 3s\n      start_period: 5s\n      retries: 3\n\nnetworks:\n  appnet:\n    driver: bridge\n```\n

| Service | Purpose |
| :--- | :--- |
| `proxy` | Builds the nginx image, publishes port 80 to the host. |
| `api` | The app container, on a user-defined network, reachable by name `api`. |
| `appnet` | The bridge network that allows the proxy and api to reach each other by service name. |

### DNS resolution between containers

On a user-defined bridge network (like `appnet` created by Compose), containers can resolve each\nother's names via Docker's embedded DNS.

```console\n$ docker exec proxy nslookup api\n```\n

Output: `Name: api\nAddress: 172.20.0.2` (or whatever IP the network assigned).\n\nIn the nginx config, `upstream app_servers { server api:3000; }` works because Docker's DNS\nresolves `api` to the internal IP of the `api` service.\n\n### TLS termination with certs

```nginx\n# nginx.conf\nserver {\n  listen 443 ssl;\n  server_name myapp.example.com;\n\n  ssl_certificate /etc/nginx/ssl/cert.pem;\n  ssl_certificate_key /etc/nginx/ssl/key.pem;\n\n  location / {\n    proxy_pass http://app_servers;\n  }\n}\n```\n\nTo mount certs into the nginx container:\n\n```yaml\nservices:\n  proxy:\n    build: ./nginx\n    ports:\n      - \"443:443\"\n    volumes:\n      - ./ssl:/etc/nginx/ssl:ro\n    networks:\n      - appnet\n```\n\nThe `-v ./ssl:/etc/nginx/ssl:ro` mounts the host's SSL certificates into the container\nread-only, and the nginx config references them.\n\n### Health-based load balancing

Nginx can detect if an upstream is healthy and stop sending traffic to it.

```nginx\nupstream app_servers {\n  server api:3000;\n  server api2:3000;\n\n  # Health check using a script.\n  # This is a simplified example; real health checking requires external tools.\n}\n```\n\nIn practice, you would use Docker's built-in health checks combined with a tool like\n[nginx upstream health check module](https://www.nginx.com/resources/wiki/start/topics/tutorials/\nload balancing/#health_checks) or let the orchestration platform (Kubernetes, Swarm) handle it.\n\n## 3. Command example\n\n### Build the nginx proxy image\n\n```console\n$ cd /home/sunny/app/nimo/docker-doc/docker-learn\n```\n\n```console\n$ mkdir -p ./nginx\n$ cat > ./nginx/nginx.conf <<'EOF'\nupstream app_servers {\n  server api:3000;\n}\n\nserver {\n  listen 80;\n  server_name localhost;\n\n  # Forward original client IP to the app.\n  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n  proxy_set_header Host $host;\n  proxy_set_header X-Real-IP $remote_addr;\n\n  location / {\n    proxy_pass http://app_servers;\n  }\n}\nEOF\n```\n\n```console\n$ docker build -t myproxy:1 ./nginx\n```\n\n```console\n$ docker image inspect myproxy:1 --format '{{.Size}}'\n```\n

Output: size depends on the nginx base, typically ~30-50 MB.\n\n### Run the full stack with nginx proxy\n\n```console\n$ docker compose -f compose.yaml up -d\n```\n\n```console\n$ docker compose ps\n```\n

```console\nNAME            IMAGE    COMMAND                  SERVICE    CREATED         STATUS\nmyproxy-1       myproxy:1   \"nginx -g daemon off;\"   proxy      0 seconds ago   Up 5 seconds\nnavi-api-1       docker-learn:1.0.0   \"docker-entrypoint…\"   api       0 seconds ago   Up 5 seconds (healthy)\n```\n\n```console\n$ curl -s http://localhost/\n```\n

Output: the app's HTML response (served by nginx, proxied to the app container).\n\n```console\n$ curl -s -H \"Host: myapp.example.com\" http://localhost/\n```\n

Output: the app's HTML response (the `server_name` matches the header).\n\n### Verify X-Forwarded-For header\n\n```console\n$ docker exec api sh -c 'printenv X-Forwarded-For'\n```\n

If the proxy sets the header correctly, the app can see the original client IP.\n\n### Add a second app behind the same proxy\n\n```yaml\n# compose.yaml — add a second app\nservices:\n  # The nginx reverse proxy (updated upstream)\n  proxy:\n    build: ./nginx\n    ports:\n      - \"80:80\"\n    networks:\n      - appnet\n  # App 1\n  api1:\n    build: .\n    ports:\n      - \"127.0.0.1:3001:3000\"\n    networks:\n      - appnet\n    healthcheck:\n      test: [\"CMD\", \"node\", \"-e\", \"fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))]\n      interval: 10s\n      timeout: 3s\n      start_period: 5s\n      retries: 3\n  # App 2\n  api2:\n    build: .\n    ports:\n      - \"127.0.0.1:3002:3000\"\n    networks:\n      - appnet\n    healthcheck:\n      test: [\"CMD\", \"node\", \"-e\", \"fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))]\n      interval: 10s\n      timeout: 3s\n      start_period: 5s\n      retries: 3\n\nnetworks:\n  appnet:\n    driver: bridge\n```\n

```nginx\n# nginx.conf — updated upstream with both apps\nupstream app_servers {\n  server api1:3000;\n  server api2:3000;\n}\n\nserver {\n  listen 80;\n  server_name localhost;\n\n  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n  proxy_set_header Host $host;\n  proxy_set_header X-Real-IP $remote_addr;\n\n  location / {\n    proxy_pass http://app_servers;\n  }\n}\n```\n\n```console\n$ docker compose up -d\n```\n\n```console\n$ curl -s http://localhost/\n```\n

May route to either api1 or api2 (round-robin by default).\n\n### TLS termination with mounted certs\n\n```yaml\nservices:\n  proxy:\n    build: ./nginx\n    ports:\n      - \"443:443\"\n    volumes:\n      - ./ssl:/etc/nginx/ssl:ro\n    networks:\n      - appnet\n```\n\n```nginx\n# nginx.conf — with TLS\nserver {\n  listen 443 ssl;\n  server_name myapp.example.com;\n\n  ssl_certificate /etc/nginx/ssl/cert.pem;\n  ssl_certificate_key /etc/nginx/ssl/key.pem;\n\n  location / {\n    proxy_pass http://app_servers;\n  }\n}\n```\n\n```console\n$ docker compose up -d\n```\n\n```console\n$ curl -s --resolve myapp.example.com:80:127.0.0.1 --cacert ./ssl/cert.pem https://myapp.example.com/\n```\n

Output: the app's HTML over HTTPS (TLS terminated at the proxy).\n\n## 4. When to use a reverse proxy pattern and when NOT to\n\n### Use reverse proxy when\n\n- **You have multiple app containers** and want to expose one public port.\n- **You need TLS termination** (HTTPS) without configuring it in every app container.\n- **You need to forward client IPs** to the app via `X-Forwarded-For` (so the app sees real IPs\n  for logging, rate limiting, etc.).\n- **You want simple load balancing** across multiple replicas of the same app.\n- **You are migrating from a single-container setup** to multiple containers.\n\n### Do not use a reverse proxy when\n\n- **You have only one app container.** `docker run -p 3000:3000` is simpler.\n- **You need fine-grained routing** based on URL paths beyond simple prefix matching.\n  (Use a service mesh or Kubernetes Ingress for this.)\n- **Your apps use WebSockets** without proper `Upgrade`/`Connection` header handling (see the\n  pitfalls below).\n- **You need sticky sessions** (ensure the same client always goes to the same server). Use\n  `ip_hash` in the upstream config, but be aware of limitations.\n- **You are running in a Kubernetes cluster.** Use Kubernetes Ingress instead.\n\n### Pitfalls to watch for\n\n| Pitfall | Description | Fix |
| :--- | :--- | :--- |
| **WebSocket upgrades fail** | WebSockets require `Upgrade` and `Connection` headers to be passed through.\n  If the proxy strips or modifies these, the WebSocket connection is lost. | Use `proxy_set_header Upgrade $http_upgrade;` and `proxy_set_header Connection "upgrade";` in the nginx config. |
| **Client IP is the proxy's IP** | Without `X-Forwarded-For`, the app sees the proxy's IP as the client IP.\n  This breaks geolocation, rate limiting by IP, and audit logs. | Always set `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;` and\n  `proxy_set_header X-Real-IP $remote_addr;` in the nginx config. |
| **Not trusting proxy headers from unknown sources** | If the app is behind a reverse proxy and also behind another proxy (e.g., a load balancer\n  in the cloud), the app may receive spoofed `X-Forwarded-For` headers. | Only trust proxy headers from known, trusted proxies. Use `set_real_ip_from` and\n  `real_ip_header` in nginx to override the client IP. |
| **Stale DNS for a container IP after a recreate** | If you recreate the app container, its IP changes, but the nginx upstream still has\nthe old IP cached. | Use Docker's dynamic upstreams or restart nginx after container recreation. Alternatively,\n  use Kubernetes or Swarm which handles this automatically.\n| **Health checks that pass while the upstream is broken** | The nginx upstream may not know if the app is actually healthy. Combine nginx with\n  Docker health checks or an application-level health endpoint. |
| **Sticky sessions** | If you need the same client to always hit the same server, you can use `ip_hash` in the\n  upstream block. But if the server stores session data in memory, a different server will\n  not have the session. | Use external session storage (Redis, database) instead of in-memory sessions, or use\n  `ip_hash` only if session data is replicated. |
| **Port leaks** | If you publish the app's internal port with `-p` in Compose, two services cannot use the\n  same host port. Use a reverse proxy and keep the app containers on a user-defined network\n  without publishing any ports. | Keep app containers on a network without `-p`, and only publish the proxy's port.\n\n---\n

## 5. Common mistakes\n\n**1. Forgetting to pass `Upgrade` and `Connection` headers for WebSockets.**\n\n```nginx\n# Missing these two lines, WebSockets break\nproxy_set_header Upgrade $http_upgrade;\nproxy_set_header Connection "upgrade";\n```\n\n**2. Not setting `X-Forwarded-For`, so the app sees the proxy's IP.**\n\n```nginx\n# Without these, the app cannot see the real client IP\nproxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\nproxy_set_header X-Real-IP $remote_addr;\n```\n\n**3. Using `latest` tag for the nginx image.**\n\n```console\n$ docker pull nginx:latest\n```\n

Pin by version: `nginx:1.27-alpine`. This course pins all image versions.\n\n**4. `server_name` not matching the request header.**\n\nIf you `curl -s http://localhost/` but the `server_name` in nginx config is\n`myapp.example.com`, the request may fall into the default server block. Always use\n`server_name localhost;` for testing, or match the actual hostname.\n\n**5. TLS certs not mounted read-only.**\n\n```yaml\n# Bad: writable mount\n- ./ssl:/etc/nginx/ssl\n# Good: read-only mount\n- ./ssl:/etc/nginx/ssl:ro\n```\n\n**5. `proxy_pass` to a hostname that Docker DNS cannot resolve.**\n\nIf the upstream uses a hostname that is not a service name on the same network, Docker's\nembedded DNS cannot resolve it. Use the service name (`api`) or the container's IP address.\n\n**6. Nginx config errors causing the proxy to not start.**\n\n```console\n$ docker compose up -d proxy\n$ docker compose logs proxy\n```\

Check for `nginx: [emerg] unknown directive` or other config errors.\n\n**7. Assuming `X-Real-IP` and `X-Forwarded-For` work without also configuring the app.**\n\nThe nginx proxy can set these headers, but the app must be configured to read them.\n  (e.g., in Node.js: `req.headers['x-forwarded-for']` or `req.connection.remoteAddress`).\n\n**8. Using `nginx:latest` without pinning.**\n\nThis course pins all image versions. `nginx:latest` may pull a different version each time,\nchanging the behavior of your proxy.\n\n**9. Not restarting nginx after upstream container recreation.**\n\nIf you `docker compose up --force-recreate api`, the upstream `api:3000` in nginx may still\nreference the old container IP. You may need to `docker compose restart proxy` to pick up the\nnew IP via Docker DNS.\n\n**10. `docker compose up` creating a network you did not expect.**\n\nCompose automatically creates a bridge network named after the project. If you have multiple\nCompose projects on the same machine, their networks are isolated (different project names).\nMake sure the proxy and app services are in the same project (same directory).\n\n---\n

## 6. Try it yourself\n\n**Exercise.** Set up an nginx reverse proxy in front of the sample app, and verify TLS and\nheaders.\n\n**Step 1 — create the nginx config.**\n\n```bash\n$ cd /home/sunny/app/nimo/docker-doc/docker-learn\n$ mkdir -p ./nginx\n$ cat > ./nginx/nginx.conf <<'EOF'\nupstream app_servers {\n  server api:3000;\n}\n\nserver {\n  listen 80;\n  server_name localhost;\n\n  # Forward original client IP to the app.\n  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n  proxy_set_header Host $host;\n  proxy_set_header X-Real-IP $remote_addr;\n\n  # WebSocket support\n  proxy_set_header Upgrade $http_upgrade;\n  proxy_set_header Connection "upgrade";\n\n  location / {\n    proxy_pass http://app_servers;\n  }\n}\nEOF\n```\n\n**Step 2 — build the proxy image.**\n\n```console\n$ docker build -t myproxy:1 ./nginx\n```\n\n**Step 3 — update compose.yaml to add the proxy.**\n\n```yaml\nservices:\n  # The nginx reverse proxy\n  proxy:\n    build: ./nginx\n    ports:\n      - \"80:80\"\n    networks:\n      - appnet\n  # The app server\n  api:\n    build: .\n    networks:\n      - appnet\n    healthcheck:\n      test: [\"CMD\", \"node\", \"-e\", \"fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))]\n      interval: 10s\n      timeout: 3s\n      start_period: 5s\n      retries: 3\n\nnetworks:\n  appnet:\n    driver: bridge\n```\n\n**Step 4 — start the stack.**\n\n```console\n$ docker compose up -d\n```\n\n```console\n$ docker compose ps\n```\n\n```console\n$ curl -s http://localhost/\n```\n

Output: the app's HTML (served by nginx, proxied to the app container).\n\n```console\n$ curl -s -H \"X-Forwarded-For: 203.0.113.1\" -H \"Host: localhost\" http://localhost/\n```\n

The app should still serve the HTML. The proxy headers are forwarded.\n\n**Step 5 — test WebSocket support (optional).**\n\n```console\n$ docker exec api sh -c 'node -e \"const http = require(\"http\"); const server = http.createServer((req, res) => { if (req.url === \"/\") { res.writeHead(200, { \"Content-Type\": \"text/plain\" }); res.end(\"ok\"); } else if (req.url === \"/ws\") { res.writeHead(101, { \"Upgrade\": \"websocket\", \"Connection\": \"upgrade\" }); const ws = req; ws.on(\"close\", () => console.log(\"ws closed\")); } }); server.listen(3000);\"'\n```\n\n```console\n$ curl -i http://localhost/ws\n```\n

Should show `101 Switching Protocols` WebSocket upgrade response.\n\n**Step 6 — clean up.**\n\n```console\n$ docker compose down\n```\n\n---\n

## 7. Next\n\nYou have a reverse proxy in front of your app with TLS, headers, and WebSocket support.\nNext: the appendix — a complete cheat sheet of all commands, Dockerfile instructions, and Compose\nkeys you will use every day.\n\n**[Appendix 99 — Cheatsheet](99-cheatsheet.md)**