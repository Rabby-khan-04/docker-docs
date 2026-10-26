# 07 — Ports and Networking

> Verified on: Docker Engine **29.8.2**, Compose **v5.6.0**, BuildKit **v0.33.1**, Ubuntu 26.04.1 LTS, x86_64.

---

## 1. Simple explanation (like I'm 7)

Imagine each container is a house on a street. Every house has its own front door with a
number on it. A house's door number **3000** means nothing outside that street, because
every house has a 3000.

Now imagine twenty houses, each with a door numbered 3000. How does the mailman know which
one is yours? **You give yours a different number from outside.** You say: "whenever
something comes for door **3011**, deliver it to the house whose door says 3000."

That translation — **3011 outside, 3000 inside** — is all Docker port publishing is.

**EXPOSE** is different, and it confuses everyone. Writing `EXPOSE 3000` in a Dockerfile is
like writing "my door number is 3000" on a piece of paper inside your own house. It is a
note to the next person. It tells nobody outside anything. **EXPOSE publishes nothing.**

Now for containers talking to each other. If all twenty houses are on the same street, the
mailman knows everyone's name. You say "deliver this to **alice**" and it works. That is a
**user-defined network**, and the free name-based delivery is automatic DNS.

If the houses are on *different* streets, you can still reach each other, but you must use
the full street address — a numeric IP. That is Docker's **default bridge** network.

---

## 2. Real name

### Port publishing

| Term | Meaning |
| :--- | :--- |
| **Container port** | The port your app listens on *inside* the container. Set in the app and in `EXPOSE`. |
| **Host port** | The port on your machine. Only this one is reachable from outside. |
| **Publish / map** | `-p HOST:CONTAINER`. One to one mapping through the host's NAT. |
| **Expose** | `EXPOSE` in a Dockerfile. **Documentation only.** No effect at all without `-p`. |
| **Bind address** | Which host addresses listen. `127.0.0.1` for local only, `0.0.0.0` for everything. |

### Docker's network drivers

On your machine, `docker info` lists: `bridge host ipvlan macvlan null overlay`.

| Driver | Use it for | When |
| :--- | :--- | :--- |
| **bridge** (default) | One container talking to published ports on the host | Fine for single containers |
| **user-defined bridge** | Containers talking to **each other by name** | **The default choice for Compose and any multi-container app** |
| **host** | The container shares the host's network stack | Almost never on Linux; avoids NAT overhead in high-performance or socket-activation setups |
| **none** | No networking at all | Build-time isolation, security-sensitive work |
| **overlay** | Containers across multiple Docker hosts | Swarm mode (chapter 26) |

### The default bridge versus a user-defined network

This is the most important networking fact in the chapter:

| | Default `bridge` | User-defined bridge |
| :--- | :--- | :--- |
| Automatic DNS by container name | **No** | **Yes** |
| Reach the host | Yes, via the gateway IP | Yes, via `host.docker.internal` on Desktop, gateway IP on Linux |
| Isolation | All default-bridge containers see each other | Only containers you attach to it |
| Recommended | No | Yes |

Verified on your machine:

```console
$ docker run --rm alpine:3.24 sh -c 'ping -c 1 -W 2 ch07-app'
ping: bad address 'ch07-app'
```

On the **default** bridge, `ch07-app` does not resolve. The name means nothing there.

The same lookup on a **user-defined** network:

```console
$ docker run --rm --network learn-net alpine:3.24 sh -c 'nslookup ch07-app'
Non-authoritative answer:
Name:	ch07-app
Address: 172.20.0.2
```

Docker runs a tiny DNS server on every user-defined network and hands containers a
`resolv.conf` pointing at it. This is why `docker compose` works with no DNS configuration
anywhere: the service name just works.

### NAT, and where your traffic actually goes

For published ports the path is:

```
your machine's app  ──►  127.0.0.1:3011  ──►  Docker's NAT rules  ──►  container:3000
                        (host port)            (iptables/nftables)      (container port)
```

And for containers on a user-defined network, the bridge does layer-2 forwarding directly —
no NAT, no published ports, no host involvement at all. That path is faster and simpler,
and it is why `app:3000` between containers is the right way to talk to a database.

---

## 3. Command example

### `EXPOSE` publishes nothing — proven

The image says `EXPOSE 3000`. Start it with **no** `-p`:

```console
$ docker run -d --name ch07-nopub docker-learn:1.0.0
$ docker port ch07-nopub
```

`docker port` prints **nothing**. No port is published. Now prove the app is still running
and reachable *from inside*:

```console
$ docker exec ch07-nopub node -e "fetch('http://localhost:3000/health').then(r=>r.text()).then(t=>console.log('internal:',t))"
internal: {
  "status": "ok"
}
```

So the app works. It is just invisible from outside. `EXPOSE` is a note in a file.

### `-P` publishes everything `EXPOSE` mentions, on a random port

```console
$ docker run -d --name ch07-expose -P docker-learn:1.0.0
$ docker port ch07-expose
3000/tcp -> 0.0.0.0:32768
3000/tcp -> [::]:32768
```

`-P` (uppercase) did publish it — to **32768**, a random high port. Useful for poking at
images you are exploring. Useless for anything you need to remember a URL for.

**Never use `-P` in production.** You do not know which port you got, so nothing can point
at it reliably.

### `-p` with an explicit host port

```console
$ docker run -d --name ch07-app --network learn-net -p 3015:3000 docker-learn:1.0.0

$ docker port ch07-app
3000/tcp -> 0.0.0.0:3015

$ curl -s http://localhost:3015/health
{
  "status": "ok"
}
```

Read `-p 3015:3000` as **"arriving at 3015 goes in at 3000."** Left is the host, right is the
container. Getting these backwards is the single most common beginner networking error, and
the symptom is that the container exits immediately with a bind error.

Supported forms:

| Form | Meaning |
| :--- | :--- |
| `-p 3015:3000` | Host port 3015 → container 3000, bound on all host addresses |
| `-p 127.0.0.1:3015:3000` | **Same, but only from this machine.** Safer. |
| `-p 3015:3000/udp` | UDP instead of TCP |
| `-p 3015:3000/tcp -p 3015:3000/udp` | Both protocols |
| `-p 127.0.0.1::3000` | Random host port, loopback only |

### Bind to `127.0.0.1` unless you have a reason not to

This is the security-relevant flag in this chapter:

```console
$ docker run -d --name ch07-loopback -p 127.0.0.1:3014:3000 docker-learn:1.0.0
$ docker port ch07-loopback
3000/tcp -> 127.0.0.1:3014

$ curl -s http://localhost:3014/health
{
  "status": "ok"
}
```

Works from this machine. Now try from your machine's network address:

```console
$ hostname -I | awk '{print $1}'
192.168.0.171

$ curl -s --max-time 3 http://192.168.0.171:3014/health
FAILED (as expected)
```

Refused. Now compare with the default, which binds to **all** interfaces:

```console
$ docker port ch07-app
3000/tcp -> 0.0.0.0:3015
```

`0.0.0.0` means every network interface. Anyone on your LAN, and possibly the internet if
this machine is public, can reach that port.

**Rule: `-p 127.0.0.1:HOST:CONTAINER` unless you specifically need remote access.** It costs
nothing and closes off a whole class of accident. A database published on `0.0.0.0` with a
weak password is how a lot of systems get compromised.

### User-defined network and DNS by name

```console
$ docker network create learn-net
db8f69ed76c1a123492e476cbcf5f3d641093e476c0229275f17b83ae25797d3

$ docker run -d --name ch07-app --network learn-net -p 3015:3000 docker-learn:1.0.0
```

The network got a subnet:

```console
$ docker network inspect learn-net --format '{{json .IPAM.Config}}'
{"Subnet":"172.20.0.0/16","Gateway":"172.20.0.1"}

$ docker inspect ch07-app --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}'
172.20.0.2
```

Now the useful part — talk to it **by name**, from another container, with no published port
involved:

```console
$ docker run --rm --network learn-net alpine:3.24 sh -c 'wget -qO- http://ch07-app:3000/health'
{
  "status": "ok"
}
```

`http://ch07-app:3000/health`. No `localhost`, no IP, no published host port. Docker
resolved `ch07-app`, connected to `172.20.0.2`, and got the answer.

**This is the pattern that makes Compose work**, and it is the right way for one container to
reach another:

- Use a **user-defined network**, never the default bridge.
- Refer to the other container **by name**.
- **Do not publish a port** for container-to-container traffic.

### Containers cannot resolve each other on the default bridge

```console
$ docker run --rm alpine:3.24 sh -c 'ping -c 1 -W 2 ch07-app'
ping: bad address 'ch07-app'
```

You must use the IP:

```console
$ docker run --rm alpine:3.24 sh -c 'wget -qO- --timeout=3 http://172.17.0.1:3015/health'
{
  "status": "ok"
}
```

That works, but the IP changes whenever the container is recreated. **If you find yourself
using IPs between containers, you have the wrong network.** Go back and make a user-defined
network.

### Attaching containers to a network at run time

```console
$ docker network connect learn-net <container>
$ docker network disconnect learn-net <container>

$ docker network inspect learn-net --format '{{range .Containers}}{{.Name}} {{end}}'
redis-learn ch07-app
```

After connecting `redis-learn`, both names appear. After disconnecting:

```console
$ docker network disconnect learn-net redis-learn
$ docker network inspect learn-net --format '{{range .Containers}}{{.Name}} {{end}}'
ch07-app
```

**This is genuinely useful.** You can attach an already-running container to a new network
without recreating it, so it can reach a database you just started. No downtime, no
`docker run` again.

Note the direction of the mistake this invites: `docker network connect` **adds** a network.
It does not move the container. To move it you disconnect from the old one too.

### `host` networking

```console
$ docker run --rm --network host alpine:3.24 sh -c 'ip addr show lo | head -3'
1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN qlen 1000
    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00
    inet 127.0.0.1/8 scope host lo
```

The container's loopback interface is the **host's** loopback. `scope host` is the marker. It
is literally the host's network stack, so:

- `-p` is **ignored** — there is no separate port space.
- Port conflicts are real: two `host`-network containers both wanting port 3000 cannot
  coexist.
- The container can reach every host service on `localhost`.
- Any process on the host can reach the container on `localhost`.

Useful when: an app needs to talk to a host service on `localhost`, or you are debugging
whether NAT is the problem. **Do not use it in production** — it removes the isolation that
makes containers worth running, and it works differently on macOS and Windows (where Docker
Desktop's VM means host networking means the *VM's* loopback, not your Mac's).

### `none` networking

```console
$ docker run --rm --network none alpine:3.24 sh -c 'ip addr show; ping -c 1 -W 2 8.8.8.8'
1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN qlen 1000
    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00
    inet 127.0.0.1/8 scope host lo
       valid_lft forever preferred_lft forever
       inet6 ::1/128 scope host
       valid_lft forever preferred_lft forever
---
PING 8.8.8.8 (8.8.8.8): 56 data bytes
ping: sendto: Network unreachable
```

Only `lo`. Loopback works, nothing else exists. `Network unreachable` — no route, because
there is no route.

Used for: builds that must not reach the network (chapter 12's `RUN --network=none` pattern),
and security-sensitive processing.

### Finding who is using a port

```console
$ docker ps --filter publish=3023 --format '{{.Names}}'
```

Or with plain Linux tools:

```console
$ ss -tlnp | grep 3015
```

When Docker publishes a port, the process you find is `docker-proxy` or nothing at all —
with the modern nftables backend, Docker does its NAT in the kernel and there may be no
listening process to see. That surprises people. `ss` shows nothing listening on the host
port, yet `curl` works. **Use `docker ps` to find port owners, not `ss`.**

---

## 4. File example

The real file for this chapter is a Compose file, because a user-defined network plus name
resolution *is* what Compose gives you for free. It is introduced properly in chapter 15,
but here is a minimal version so you can see the concept rather than take it on faith.

**`compose.networking.yaml`** — saved in your project at
`docker-learn/compose.networking.yaml`:

```yaml
# Minimal two-container app, showing networking only.
#
# THE KEY IDEA IN THIS FILE: both services are on `appnet`, a
# user-defined network. Because of that, the `client` container reaches
# `api` by the name `api` -- no IP addresses, no published ports for
# container-to-container traffic.

services:
  # The API. Not published. Nothing outside this network needs it.
  api:
    build:
      context: .
    image: docker-learn:1.0.0
    # `init: true` is Compose's spelling of `docker run --init`. It makes
    # `compose down` shut down cleanly and fast. Chapter 10 explains why.
    init: true
    environment:
      APP_ENV: production
    networks:
      - appnet
    # NOTE: no `ports:` key. Deliberate. See the comment below.

  # A throwaway client that proves container-to-container works by name.
  client:
    image: alpine:3.24
    networks:
      - appnet
    # Runs once, prints, exits. wget exits non-zero if it cannot reach the
    # API, which --exit-code-from turns into the command's exit status.
    command: >
      sh -c "wget -qO- http://api:3000/health"
    depends_on:
      - api

networks:
  # Compose creates this automatically and removes it on `compose down`.
  # Named networks give automatic DNS, so `api` resolves with no config.
  appnet:
    driver: bridge
```

**The one line that matters most is the absence of `ports:` on `api`.** The API is not
reachable from your machine, and that is correct. Compose's `ports:` exists to reach a
service from the host; container-to-container traffic should go over the network using the
service name, with no port publishing at all.

**Run it:**

```bash
$ cd /home/sunny/app/nimo/docker-doc/docker-learn
$ docker compose -f compose.networking.yaml up --abort-on-container-exit --exit-code-from client
```

Actual output, captured on this machine:

```console
 Container docker-learn-api-1 Created
 Container docker-learn-client-1 Created
 Container docker-learn-api-1 Started
api-1  | [docker-learn] listening on http://0.0.0.0:3000 (env=production)
 Container docker-learn-client-1 Started
client-1  | {
client-1  |   "status": "ok"
client-1  | }
client-1 exited with code 0
 Compose Stopping Aborting on container exit...
 Container docker-learn-api-1 Stopping
 Container docker-learn-api-1 Stopped
 Container docker-learn-client-1 Removing
 Container docker-learn-client-1 Removed
 Container docker-learn-api-1 Removing
 Container docker-learn-api-1 Removed
 Network docker-learn_appnet Removing
 Network docker-learn_appnet Removed
api-1 exited with code 143
```

That `{"status": "ok"}` came from **another container, by name, over an unpublished port.**
Compare with the `docker run` version from earlier in the chapter — same idea, expressed in a
file.

Two flags in that command:

| Flag | Meaning |
| :--- | :--- |
| `--abort-on-container-exit` | Stop **everything** as soon as any container exits. Without it, `api` keeps running after `client` finishes and the command never returns. |
| `--exit-code-from client` | Return `client`'s exit code. `0` means `wget` reached the API; non-zero means it did not. **This is how you turn a manual check into a CI test.** Chapter 24 builds on it. |

Three details in that output worth understanding rather than ignoring:

- **The container is named `docker-learn-api-1`, not `api`.** Compose prefixes the
  **project name** (taken from the directory, `docker-learn`) and appends `-1` for the
  replica number. This is why two Compose projects can coexist on one machine without
  colliding. Chapter 15 covers project names properly.
- **The DNS name is `api`, not `docker-learn-api-1`.** Compose registers **both** on the
  network's DNS: the short service name for humans, and the full container name for
  uniqueness. Use the short one.
- **`api-1 exited with code 143`.** That is a **clean** shutdown on `SIGTERM`, thanks to
  `init: true`. Delete the `init: true` line and this becomes `137` after a ten-second
  timeout — the chapter 04 story. `init: true` is cheap and worth having in every
  long-running service.

Cleanup — `docker compose down` removes the containers **and** the network it created:

```bash
$ cd /home/sunny/app/nimo/docker-doc/docker-learn
$ docker compose -f compose.networking.yaml down
```

Two things to notice:

1. **`down` does not delete named volumes unless you add `-v`.** This Compose file has no
   volumes, but chapters 29 and 32 depend on that distinction, and getting it wrong deletes
   your database.
2. **Resources you did not declare are not touched.** `compose down` only removes what is in
   that Compose file. Your `infra_default` and `evalery_default` networks and your other
   containers are untouched.

---

## 5. When to use it and when NOT to

### Port publishing: the decision

| Situation | Do this |
| :--- | :--- |
| Your laptop, testing by hand | `-p 3000:3000` or `-p 127.0.0.1:3000:3000` |
| A web app that needs a reverse proxy | Publish the proxy's port only. **Never publish the app's port.** Chapter 34. |
| A database, locally | `-p 127.0.0.1:5432:5432`. Never `0.0.0.0`. |
| One container talking to another | **Publish nothing.** Use a network and the service name. |
| Nothing needs to reach it | Publish nothing. The app works fine inside its network. |
| A container on another machine needs it | Publish it, and secure it. Consider a reverse proxy or a VPN. |

### User-defined network

Use one, always, as soon as you have two containers. It gives you DNS by name, isolation from
other projects, and no NAT on the container-to-container path.

Two things it also does that people do not expect:

- **Only containers you attach can talk.** Attach a container to two networks and it can
  reach both — useful for putting a proxy on a public network and the app on a private one.
- **Names resolve to the container's current IP.** Recreate the container, keep the name,
  and the name still works. IPs change; names do not.

### When NOT to use host networking

- **Almost always.** It removes network isolation, makes port conflicts real, and behaves
  differently on Docker Desktop than on Linux.
- The exception: an app that binds a Unix socket and needs socket activation, or a
  high-throughput service where you have measured NAT to be the bottleneck. Measure first.

### When NOT to use `EXPOSE` alone

Never rely on it. It does nothing. It is a comment. Write it anyway — it is documentation
for humans and for tooling — but understand it has zero runtime effect.

### `--network none`

Use it for builds that should not reach the internet (so a compromised build step cannot
exfiltrate anything), and for one-off processing where no network is wanted.

### macOS and Windows

On Docker Desktop, your containers run inside a Linux VM. `host.docker.internal` is provided
to let containers reach services on your Mac or PC — and it is the single biggest source of
"works on my machine" networking problems between Linux and macOS developers. Chapter 31
covers this.

---

## 6. Common mistakes

**1. Believing `EXPOSE 3000` publishes port 3000.** It does not. Verified above:
`docker port` shows nothing, and the app is unreachable from outside while working fine
inside. `EXPOSE` is documentation.

**2. Reversing `-p`.**

```console
$ docker run -p 3000:3015 ...     # wrong
```

You want `-p HOST:CONTAINER`. So `-p 3015:3000` for a container listening on 3000. Getting it
backwards means nothing arrives, and often the container exits with a bind error.

**3. Using `-P` (uppercase) and not knowing which port you got.** It publishes every
`EXPOSE`d port on a **random** host port. `docker port <name>` tells you. Fine for
exploring, useless in production.

**4. Publishing on `0.0.0.0` when `127.0.0.1` would do.** Verified above: the loopback
binding refuses connections from your LAN address, the default one would accept them. Every
published port is a hole in your firewall you did not think about.

**5. Publishing a database to the world.**

```console
$ docker run -p 5432:5432 postgres:17-alpine     # now on every interface
```

On a cloud VM this is a real and heavily exploited mistake. `-p 127.0.0.1:5432:5432`, or
publish nothing and connect from another container by name.

**6. Using IPs between containers.** They change on every recreate, they break on scale, and
they work only because you got lucky. Use names on a user-defined network.

**7. Relying on DNS on the default bridge.** `ping: bad address 'ch07-app'` — verified. The
default bridge has no name resolution. If you are reading container IPs out of `docker
inspect`, you are on the wrong network.

**8. Publishing ports for container-to-container traffic.** Unnecessary and slower — every
request goes out through the host's NAT. It also means every container is reachable from
anything that can reach the host.

**9. Forgetting the app must bind `0.0.0.0`, not `127.0.0.1`.** The single most common
"connection refused" in Docker. Inside the container, your app is in its own namespace;
`127.0.0.1` there is **not** the container's reachable address.

```javascript
// WRONG -- only reachable from inside the container itself
server.listen(3000, '127.0.0.1')

// RIGHT -- reachable via the bridge and via published ports
server.listen(3000, '0.0.0.0')
```

Our sample app does this correctly, which is why it works. Check your own app. Most Node
tutorials use `app.listen(PORT)` with no host, which defaults to all interfaces — fine — but
explicit is better.

**10. Two containers, one host port.** `Bind for 0.0.0.0:3023 failed: port is already
allocated` — verified in chapter 04. Find the owner with
`docker ps --filter publish=3023`.

**11. Using host networking "because it fixes DNS".** It fixes it by removing the network
entirely. Find the real problem instead.

**12. Expecting `docker compose down` to delete your data.** It removes containers and
networks. **Volumes need `-v`**, which is also exactly how you lose a database by accident.
Chapters 29 and 32 cover this in detail.

**13. Running `docker network connect` and expecting it to move the container.** It adds.
Disconnect from the old network too, or you are connected to both.

**14. Assuming `ss` or `netstat` will show who owns a port.** With the nftables backend
Docker does NAT in the kernel and there is no listening process to see. `ss` shows nothing,
`curl` works. Use `docker ps`.

**15. Creating a network per container.** One network for the whole app. Networks are
cheap, but they are also the isolation boundary, and one network per container means one
`docker network connect` per connection instead of one network.

---

## 7. Try it yourself

**Exercise.** Prove that `EXPOSE` does nothing, that loopback binding really blocks the
network, and that containers can talk by name with no published port.

**Step 1 — `EXPOSE` alone publishes nothing:**

```console
$ docker run -d --name exercise-nopub docker-learn:1.0.0
$ docker port exercise-nopub
$ curl -s --max-time 2 http://localhost:3000 || echo "unreachable, as expected"
```

Nothing from `docker port`. Unreachable. But the app is running fine inside:

```console
$ docker exec exercise-nopub node -e "fetch('http://localhost:3000/health').then(r=>r.text()).then(t=>console.log(t))"
```

`EXPOSE 3000` in the Dockerfile did not publish 3000.

**Step 2 — compare `-p` against `-p 127.0.0.1:`:**

```console
$ docker run -d --name exercise-open -p 3060:3000 docker-learn:1.0.0
$ docker run -d --name exercise-loopback -p 127.0.0.1:3061:3000 docker-learn:1.0.0
$ docker port exercise-open
3000/tcp -> 0.0.0.0:3060
$ docker port exercise-loopback
3000/tcp -> 127.0.0.1:3061
```

One is `0.0.0.0` (everything), one is `127.0.0.1` (this machine only). Both work for
`curl localhost`.

**Hint.** Step 3 is the one that matters.

**Step 3 — container to container by name, with no published port:**

```console
$ docker network create exercise-net
$ docker run -d --name exercise-api --network exercise-net docker-learn:1.0.0
$ sleep 2
$ docker run --rm --network exercise-net alpine:3.24 sh -c 'wget -qO- http://exercise-api:3000/health'
```

```json
{
  "status": "ok"
}
```

`exercise-api` resolved by name. **Notice there is no `-p` on `exercise-api` at all.** It is
not reachable from your machine, and it is perfectly reachable from another container. That
is how you should wire applications together.

Now show that it does not resolve on the default bridge:

```console
$ docker run --rm alpine:3.24 sh -c 'wget -qO- --timeout=2 http://exercise-api:3000/health' || echo "unresolvable, as expected"
```

**Step 4 — the reverse direction: reach a published port from a container.**

```console
$ docker run --rm alpine:3.24 sh -c 'wget -qO- --timeout=3 http://172.17.0.1:3060/health'
```

`172.17.0.1` is the default bridge's gateway — your host. This works but requires knowing the
gateway IP. **Do not build anything on this.** It is why `host.docker.internal` exists on
Docker Desktop, and why that is a portability trap between Linux and macOS.

**Step 5 — add an existing container to the network without recreating it:**

```console
$ docker network connect exercise-net exercise-api
$ docker network inspect exercise-net --format '{{range .Containers}}{{.Name}} {{end}}'
```

**Step 6 — clean up the network and containers:**

```console
$ docker rm -f exercise-nopub exercise-open exercise-loopback exercise-api
$ docker network rm exercise-net
$ docker rm -f ch07-app ch07-loopback ch07-expose
$ docker network rm learn-net
```

`docker network rm` refuses if anything is still attached, which is a useful safety check.
It will not touch `infra_default` or `evalery_default` — the networks belonging to your
existing projects — because those names are not in the list.

---

## 8. Next

You can publish ports and wire containers together. Next: building your own images. Your
first Dockerfile, instruction by instruction, and reading a build log so the output stops
looking like magic.

**[Chapter 08 — Your First Dockerfile](08-first-dockerfile.md)**