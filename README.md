# Sendr

**Forever file sharing. No accounts. Up to 200 GB per file. 100% custom code - zero third-party services.**

Drop any file, get a link that never expires. Files live on *your* disk in a custom-built
storage engine (plain chunks + tiny JSON metadata - fully inspectable, fully yours).

---

## Features

- **200 GB uploads** via a custom chunked-transfer engine (parallel chunks, retry with backoff, pause/resume)
- **Resume after refresh** - unfinished uploads are remembered in your browser; re-select the file and continue where you stopped
- **Forever links** (`/d/<id>`) - nothing expires, nothing auto-deletes
- **Password locks** (scrypt-hashed) on any send
- **Instant previews** - images, video (seekable, HTTP Range), audio, PDF, text/code
- **Your Vault** - every upload gets a secret delete key stored locally; manage or delete without accounts
- **Live download page** for in-progress sends (auto-unlocks when the file lands)
- **Stats band**, toasts, confetti, particle network, tilt cards, glitch 404 - heavy animation everywhere
- Dark / gray / white theme, fully responsive, `prefers-reduced-motion` respected

## Stack

Next.js 14 (App Router) + React 18 + hand-written CSS (no UI libs) + Node `fs` streaming.
**No Supabase, no Firebase, no S3, no third-party anything.**

## Quickstart

```bash
npm install
npm run dev        # http://localhost:3000
```

Production:

```bash
npm run build
npm start
```

On Windows without a system-wide Node install, just run:

```powershell
.\start-sendr.ps1
```

It uses portable Node from `..\tools\node` if needed, builds once, then serves on port 3000
bound to `0.0.0.0` so the site is reachable from your network / the internet.

## Configuration (env vars)

| Variable | Default | Meaning |
| --- | --- | --- |
| `SENDR_DATA_DIR` | `<project>/.sendr-data` (auto `/tmp/sendr-data` on Vercel) | Where files + metadata live. Point at any big disk. |
| `SENDR_MAX_BYTES` | `214748364800` (200 GiB) | Max file size |
| `SENDR_CHUNK_SIZE` | `16777216` self-hosted, auto `4194304` on Vercel | Upload chunk size |
| `SENDR_PENDING_TTL_HOURS` | `168` (7 days) | Abandoned unfinished uploads get swept |

## How it works

```
Browser                         Server (custom engine)
-------                         ----------------------
POST /api/upload/init      ->   creates id + delete-token-hash + meta.json
PUT  /api/upload/chunk     ->   streams each raw chunk to .sendr-data/files/<id>/c000000...
POST /api/upload/complete  ->   verifies every chunk size, flips status -> ready
GET  /api/dl/<id>          ->   stitches chunks into one stream, supports Range/206,
                                counts downloads, forces safe Content-Disposition
```

Storage layout:

```
.sendr-data/
|-- meta/<id>.json          name, size, type, status, downloads, password hash, delete-key hash
`-- files/<id>/c000000...   the actual bytes, chunk by chunk (never duplicated)
```

Downloads stream straight out of the chunk files (no reassembly step), so even a 200 GB
file starts downloading instantly.

## API

| Route | Purpose |
| --- | --- |
| `GET /api/info` | max size + chunk size |
| `POST /api/upload/init` | `{name,size,type,password?}` -> `{id, token}` |
| `PUT /api/upload/chunk?id&index` | raw body, header `x-sendr-token` |
| `POST /api/upload/complete` | `{id,token}` -> public meta |
| `POST /api/upload/resume` | `{id,token}` -> `{have:[chunkIndexes]}` |
| `POST /api/upload/abort` | delete a pending upload |
| `GET /api/files/:id` | public metadata |
| `DELETE /api/files/:id` | header `x-sendr-token`, destroys permanently |
| `POST /api/files/:id/unlock` | `{password}` check |
| `GET /api/dl/:id` | download / preview stream (`?disp=inline`, `?pw=`, Range OK) |
| `GET /api/stats` | aggregate counters (cached 10 s) |

## Deploying

### Your own Windows PC (free, works today)

1. Run `.\start-sendr.ps1` - site is now live on `http://<your-ip>:3000`.
2. Let people in:
   - **Same network:** friends on your Wi-Fi can already reach `http://<your-lan-ip>:3000`.
   - **Whole internet:** forward TCP port 3000 on your router to your PC, then share
     `http://<your-public-ip>:3000`. Allow Node through Windows Firewall when prompted.
   - **Public HTTPS URL without touching the router:** [Tailscale](https://tailscale.com)
     (free): `tailscale up` then `tailscale funnel 3000`.
3. Caveats of PC-hosting: links work while the PC is on, home IPs can change, and uploads
   are limited by your upload bandwidth. For an always-on public site use a tiny VPS.

### Self-hosted server / VPS (recommended for "forever" + 200 GB)

Any box with disk space:

```bash
SENDR_DATA_DIR=/var/sendr npm run build && npm start   # port 3000
```

Or Docker:

```bash
docker build -t sendr .
docker run -p 3000:3000 -v sendr-data:/data sendr
```

Put Caddy or nginx in front for HTTPS, done.

### Vercel (demo only)

The site deploys as-is and Sendr detects Vercel automatically: data goes to `/tmp`,
chunks shrink to 4 MiB, and missing-upload errors carry a plain explanation.

Know the platform's rules: each serverless instance has its own private `/tmp`, and
requests are load-balanced across instances, so multi-chunk uploads will fail with
`not_found` whenever chunks land on a different instance than `init`. That is a platform
limit, not a code limit. If you want Sendr links to truly last forever, run it on any
machine/VPS with a disk (commands above) - same code, zero changes.

## Security notes

- Delete keys & passwords are only ever stored **hashed** (SHA-256 / scrypt).
- Unlocks and mutations are rate-limited; wrong passwords get a delay.
- HTML/SVG/etc. are always forced to download (`nosniff`, strict inline whitelist).
- IDs are random base32 - unguessable, unlisted.
