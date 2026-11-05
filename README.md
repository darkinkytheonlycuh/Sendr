# Sendr

**Forever file sharing. No accounts. Up to 1 TB per file. Built-in Terms, DMCA takedowns and moderation.**

Drop any file, get a link that never expires. Files live on *your* disk in a custom-built
storage engine (plain chunks + tiny JSON metadata - fully inspectable, fully yours).

---

## Features

- **1 TB uploads** via a custom chunked-transfer engine (chunk size grows automatically for huge files) (parallel chunks, retry with backoff, pause/resume)
- **Resume after refresh** - unfinished uploads are remembered in your browser; re-select the file and continue where you stopped
- **Forever links** (`/d/<id>`) - nothing expires, nothing auto-deletes
- **Password locks** (scrypt-hashed) on any send (gates downloads; not end-to-end encryption)
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
| `SENDR_MAX_BYTES` | `1099511627776` (1 TiB) | Max file size |
| `SENDR_BLOB_ACCESS` | *(auto-detected)* | `public` or `private`: the access mode of your Vercel Blob store. Optional; set it to skip the first-request probe. |
| `SENDR_ADMIN_TOKEN` | *(unset = moderation off)* | Secret for `/admin` (reports + takedowns). Use a long random string. |
| `SENDR_ABUSE_EMAIL` | *(unset)* | Shown on the legal pages as your abuse / DMCA contact |
| `SENDR_OPERATOR_NAME` | `the operator of this Sendr site` | Your name or company, shown in the Terms |
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

Downloads stream straight out of the chunk files (no reassembly step), so even a 1 TB
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

### Self-hosted server / VPS (recommended for "forever" + 1 TB)

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

### Vercel

The site deploys as-is. Sendr detects Vercel automatically and switches its storage
engine to **Vercel Blob** (Vercel's own storage product - still zero services outside
the Vercel platform). One-time setup in your Vercel dashboard:

1. Open your project -> **Storage** tab -> **Create Database/Blob Store** (Vercel Blob).
2. Connect it to the project. This injects `BLOB_READ_WRITE_TOKEN` automatically.
3. Redeploy. Done - uploads now survive across instances and links stay live.

Without a Blob store connected, Sendr falls back to per-instance `/tmp`, where
multi-chunk uploads fail (`not_found`) because serverless instances do not share
storage. The client shows a plain explanation in that case.

Capacity is whatever your Vercel plan includes for Blob (small on Hobby, larger on
Pro). For unlimited capacity at disk cost, self-host with the commands above.

## Legal and moderation

Running a public upload site makes you responsible for responding to abuse. Sendr ships with:

- **Terms of Service** (`/terms`), **Privacy Policy** (`/privacy`) and a **Copyright & DMCA policy** (`/copyright`)
- A required **"I own this / accept the Terms"** checkbox before any upload (enforced server-side too)
- A **report form** (`/report`) that collects all the elements of a valid DMCA notice, plus a "Report this file" link on every download page
- An **admin page** (`/admin`, needs `SENDR_ADMIN_TOKEN`) to review reports and remove files. Removed files have their bytes deleted; the link then shows a *451 removed* notice

Things only you can do (the code cannot do them for you):

1. Set `SENDR_OPERATOR_NAME` and `SENDR_ABUSE_EMAIL`, then rebuild (legal pages are pre-rendered at build time).
2. For US DMCA safe harbor, **register a designated agent** with the U.S. Copyright Office
   (dmca.copyright.gov, small fee) and check the reports regularly.
3. Have a lawyer review the Terms for your country. They are a reasonable starting point, not legal advice.

## How "forever" works

Finished uploads are never deleted by timers or inactivity. A file disappears only if its owner
deletes it, or an admin removes it. That only holds while the storage exists, so:

- **Self-hosting / VPS / Docker:** as permanent as that disk. Back it up.
- **Vercel:** you *must* connect Vercel Blob (or set the `R2_*` variables for Cloudflare R2).
  Without it files live in per-instance `/tmp` and vanish. The upload box now shows a warning
  when this is the case. Note that Vercel's 4 MB chunk cap means 1 TB files need ~262k chunks there.

## Security notes

- Delete keys & passwords are only ever stored **hashed** (SHA-256 / scrypt).
- Unlocks and mutations are rate-limited; wrong passwords get a delay.
- HTML/SVG/etc. are always forced to download (`nosniff`, strict inline whitelist).
- IDs are random base32 - unguessable, unlisted.
