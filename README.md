<div align="center">

<img src="public/nats.svg" alt="NATS Dashboard logo" width="80" height="80" />

# NATS Dashboard

**An open-source web UI to monitor and manage NATS servers, JetStream streams, consumers, Key-Value stores and Object stores. Self-hosted, and running in one Docker command.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Docker Image](https://img.shields.io/docker/v/sahilkhaire/nats-dashboard?label=docker&sort=semver)](https://hub.docker.com/r/sahilkhaire/nats-dashboard)
[![Docker Pulls](https://img.shields.io/docker/pulls/sahilkhaire/nats-dashboard)](https://hub.docker.com/r/sahilkhaire/nats-dashboard)
[![GitHub Stars](https://img.shields.io/github/stars/sahilkhaire/nats-dashboard?style=social)](https://github.com/sahilkhaire/nats-dashboard/stargazers)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](#contributing)

[Quick start](#quick-start) · [Features](#features) · [Configuration](#configuration) · [FAQ](#faq) · [Contributing](#contributing)

</div>

---

## What is NATS Dashboard?

**NATS Dashboard** is a free, open-source **NATS monitoring and management GUI**. It gives you one browser view of your [NATS](https://nats.io) messaging system: server health, client connections, **JetStream** streams and consumers, consumer lag, cluster routes, gateways, leaf nodes, accounts, **NATS KV** buckets and **NATS Object Store** buckets.

It reads the NATS HTTP monitoring endpoints (`/varz`, `/connz`, `/jsz`, `/routez`, `/gatewayz`, `/leafz`, `/accountz`, `/healthz`) and connects over the NATS protocol for JetStream operations. You do not need Prometheus, Grafana, or the `nats` CLI to use it.

Use it to:

- **Monitor NATS in real time.** Message rates, bytes in and out, CPU, memory, slow consumers.
- **Debug JetStream.** Inspect streams, browse messages, check consumer lag (`num_pending`, `num_ack_pending`), and see ack throughput.
- **Manage JetStream without the CLI.** Create, edit, purge, seal, mirror and duplicate streams. Create and delete consumers. Publish test messages.
- **Work with KV and Object Store.** Browse keys, read and write values, view revision history, watch changes live, and upload or download objects.
- **Watch clusters and superclusters.** Routes, gateways and leaf nodes, for both standalone servers and clustered deployments.

> Works with **NATS Server 2.x** and **JetStream**, standalone or clustered, on Docker, Kubernetes, VMs or your laptop.

<!-- Add a screenshot here, e.g. docs/screenshot.png. Screenshots help a lot with GitHub search and social previews. -->

---

## Quick start

### Docker (recommended)

```bash
docker run -d --name nats-dashboard -p 3000:3000 \
  -e NATS_URL=nats://host.docker.internal:4222 \
  -e NATS_MONITORING_URL=http://host.docker.internal:8222 \
  sahilkhaire/nats-dashboard:latest
```

Open **http://localhost:3000**.

Your NATS server needs HTTP monitoring turned on, and JetStream if you want stream features:

```bash
nats-server -js -m 8222
```

### Docker Compose

```bash
git clone https://github.com/sahilkhaire/nats-dashboard.git
cd nats-dashboard
cp .env.example .env      # set NATS_URL, NATS_MONITORING_URL, NATS_TOKEN
docker compose up -d
```

The dashboard runs at **http://localhost:3000**. If you don't have a NATS server yet, this starts one (with JetStream and monitoring) next to the dashboard:

```bash
docker compose -f docker-compose.yml -f docker-compose.nats.yml up -d
```

### From source (Node.js)

Requires **Node.js 20+**.

```bash
git clone https://github.com/sahilkhaire/nats-dashboard.git
cd nats-dashboard
npm install
npm run dev               # development, http://localhost:5173
```

Production build:

```bash
npm run build
npm run start             # http://0.0.0.0:3000
```

The dev server binds to `0.0.0.0`, so other machines on your network can open `http://<your-ip>:5173`.

---

## Features

### Monitoring

| Page | What it shows |
|------|---------------|
| **Overview** | Server stats, live message and byte rates, connections, JetStream usage, health |
| **Connections** | Client connections, subscriptions per client, pending bytes, slow consumer alerts |
| **JetStream** | Memory and storage usage, stream and consumer totals, API stats |
| **Streams** | All streams with message counts, bytes, subjects, retention, and traffic sparklines |
| **Consumers** | Consumer lag (`num_pending`, `num_ack_pending`, redelivered), incoming and outgoing rates, ack throughput |
| **Subscriptions** | Subject routing stats and fanout |
| **Cluster** | Route connections between cluster nodes |
| **Gateways** | Supercluster gateway connections |
| **Leaf Nodes** | Leaf node connections |
| **Accounts** | Multi-account (multi-tenant) stats |
| **Health** | `/healthz` status for the server and JetStream |

### JetStream stream management

Each stream has a detail page with these tabs:

- **Properties.** View and edit stream config.
- **Messages.** Browse and delete individual messages.
- **Consumers.** Lag, rates and ack throughput per consumer. Create and delete consumers.
- **Publish.** Send messages with headers, a message ID or a per-message TTL, or schedule them for later.
- **Schedule.** Purge a stream once or on a recurring schedule.
- **Analytics.** Traffic charts over time.
- **Relations.** Mirrors and sources.

Stream actions: **create, update, purge, delete, duplicate, mirror, seal, leader step-down, remove follower**. You can also export any stream's config as a **`nats` CLI command** or **Terraform** resource.

### Key-Value and Object Store

- **NATS KV:** create and delete buckets, list keys, get, put, delete and purge values, view revision history, and watch a bucket live (server-sent events).
- **NATS Object Store:** create buckets, then upload, download, inspect and delete objects.

These run through the dashboard server using `nats.js`, so you don't need the `nats` CLI installed. See the [KV / Object Store API contract](docs/kv-object-api-contract.md).

### Usability

- **Multiple connections.** Save several NATS servers and switch between them. Saved connections stay in your browser's `localStorage`.
- **NATS CLI context support.** Reads your existing `nats context` profiles automatically.
- **Built-in NATS CLI console.** Run `nats` commands from the browser (requires the `nats` binary on the dashboard host).
- **Optional login.** Protect the dashboard with a username and password, checked on the server.
- **Dark and light themes,** sortable tables, regex search, pagination, and configurable refresh intervals.

---

## Configuration

### Environment variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NATS_URL` | NATS protocol URL (port 4222), used for JetStream, KV and Object Store | `nats://localhost:4222` |
| `NATS_MONITORING_URL` | HTTP monitoring URL (port 8222). Derived from `NATS_URL` if unset | `http://<NATS_URL host>:8222` |
| `NATS_TOKEN` | Token, if your NATS server uses token auth | — |
| `NATS_NAME` | Connection name shown in the UI | `docker` |
| `NATS_DESCRIPTION` | Label shown in the connection switcher | `Docker NATS Server` |
| `PORT` | Port the dashboard listens on | `3000` |
| `DASHBOARD_USERNAME` | Enables login when set together with `DASHBOARD_PASSWORD` | — |
| `DASHBOARD_PASSWORD` | Login password | — |
| `VITE_NATS_URL` | Default monitoring URL in dev mode (`npm run dev`) | `http://localhost:8222` |

See [`.env.example`](.env.example) for a full example.

### Connecting to NATS in Docker

**NATS in another container:** use the service name as the host.

```bash
NATS_URL=nats://nats:4222
NATS_MONITORING_URL=http://nats:8222
```

**NATS on the host machine:** use `host.docker.internal` (Mac and Windows) or the host IP (Linux).

```bash
NATS_URL=nats://host.docker.internal:4222
```

### Enabling NATS monitoring

The dashboard needs the NATS HTTP monitoring port. Start the server with `-m 8222`, or add this to your config:

```conf
http_port: 8222
jetstream: enabled
```

> **Tip:** Add connections with the monitoring URL (`http://host:8222`) to see everything. A `nats://host:4222` URL alone shows JetStream data, but not connections, routes, subscriptions or CPU and memory.

### Standalone vs cluster

| Mode | What you see |
|------|--------------|
| **Standalone** | A single server. Cluster, Gateways and Leaf Nodes pages show empty states. |
| **Cluster** | The header shows `Cluster (N)`. The Cluster page lists routes, and topology shows routes and remotes. |

### NATS CLI context

- **Dev mode:** contexts are read live from `~/.config/nats/context/`.
- **Production:** run `npm run sync-context` before `npm run build` to bundle your contexts into the app.

---

## How it works

```
Browser (React + Vite + Tailwind)
        │  REST + server-sent events
        ▼
Dashboard server (Node.js)  ──HTTP──▶  NATS monitoring  :8222  (/varz /connz /jsz ...)
        │
        └────────NATS protocol────▶  NATS server  :4222  (JetStream, KV, Object Store)
```

- **Frontend:** React 18, React Router, Tailwind CSS, Radix UI, Recharts.
- **Backend:** a small Node.js server that proxies the monitoring endpoints (which avoids CORS problems), runs JetStream, KV and Object Store operations with [`nats.js`](https://github.com/nats-io/nats.js), and handles optional login.

---

## FAQ

### What is the best UI for NATS?

NATS Dashboard is a free, open-source web UI for NATS that covers both **monitoring** (server stats, connections, cluster, accounts) and **management** (JetStream streams, consumers, KV and Object Store). It runs with one `docker run` command.

### How do I monitor NATS JetStream?

Start NATS with `-js -m 8222`, run NATS Dashboard, and open the **JetStream**, **Streams** and **Consumers** pages. You'll see storage usage, message counts, consumer lag and ack rates, refreshed live.

### How do I check NATS consumer lag?

Open the **Consumers** page or a stream's **Consumers** tab. Each consumer shows `num_pending` (messages not yet delivered), `num_ack_pending` (delivered but not acknowledged), redeliveries, and its current processing rate.

### Can I view and edit NATS KV values in a browser?

Yes. The **KV** page lists buckets and keys, shows each key's value and revision history, lets you put, delete and purge keys, and can watch a bucket for live changes.

### Does it work with a NATS cluster or supercluster?

Yes. It supports standalone servers, clusters (routes), superclusters (gateways) and leaf nodes.

### Do I need Prometheus or Grafana?

No. NATS Dashboard reads the NATS monitoring endpoints directly. For long-term metrics storage and alerting, it works alongside Prometheus and Grafana rather than replacing them.

### How is this different from `nats-surveyor` or `nats top`?

`nats-surveyor` exports metrics to Prometheus, and `nats top` is a terminal view. NATS Dashboard is a browser UI that lets you **look at and change** JetStream resources: streams, consumers, messages, KV and objects.

### Is it secure to expose?

Set `DASHBOARD_USERNAME` and `DASHBOARD_PASSWORD` to require login. Credentials are checked on the server and never sent to the browser, and repeated failed logins are rate-limited. For public deployments, also put it behind HTTPS and a reverse proxy.

### Is it free for commercial use?

Yes. NATS Dashboard is MIT-licensed.

---

## Contributing

Contributions are welcome: bug reports, feature ideas, docs and pull requests.

1. Fork the repo and create a branch: `git checkout -b feat/my-feature`
2. Run it locally: `npm install && npm run dev`
3. Start a local NATS server: `docker run -d -p 4222:4222 -p 8222:8222 nats:latest -js -m 8222`
4. Commit using [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`)
5. Open a pull request

Found a bug or have an idea? [Open an issue](https://github.com/sahilkhaire/nats-dashboard/issues).

If NATS Dashboard is useful to you, **please star the repo**. It helps other people find the project.

---

## License

[MIT](LICENSE) © Sahil Khaire

NATS is a [CNCF](https://www.cncf.io/) project. This dashboard is a community project and is not affiliated with Synadia or the NATS maintainers.

<sub>**Keywords:** NATS dashboard, NATS UI, NATS GUI, NATS web UI, NATS monitoring, NATS JetStream UI, JetStream dashboard, JetStream monitoring, NATS consumer lag, NATS KV UI, NATS key-value browser, NATS Object Store UI, NATS admin panel, NATS management console, NATS cluster monitoring, open-source NATS tool, self-hosted NATS dashboard, Docker NATS dashboard.</sub>
