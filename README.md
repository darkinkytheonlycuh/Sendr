# Sendr

**Forever file sharing. No accounts. Up to 200 GB per file. 100% custom code â€” zero third-party services.**

Drop any file, get a link that never expires. Files live on *your* disk in a custom-built
storage engine (plain chunks + tiny JSON metadata â€” fully inspectable, fully yours).

---

## Features

- **200 GB uploads** via a custom chunked-transfer engine (parallel chunks, retry with backoff, pause/resume)
- **Resume after refresh** â€” unfinished uploads are remembered in your browser; re-select the file and continue where you stopped
- **Forever links** (`/d/<id>`) â€” nothing expires, nothing auto-deletes
- **Password locks** (scrypt-hashed) on any send
- **Instant previews** â€” images, video (seekable, HTTP Range), audio, PDF, text/code
- **Your Vault** â€” every upload gets a secret delete key stored locally; manage or delete without accounts
- **Live download page** for in-progress sends (auto-unlocks when the file lands)
- **Stats band**, toasts, confetti, particle network, tilt cards, glitch 404 â€” heavy animation everywhere
- Dark / gray / white theme, fully responsive, `prefers-reduced-motion` respected

## Stack

Next.js 14 (App Router) Â· React 18 Â· hand-written CSS (no UI libs) Â· Node `fs` streaming.
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

## Configuration (env vars)

| Variable | Default | Meaning |
| --- | --- | --- |
| `SENDR_DATA_DIR` | `<project>/.sendr-data` · auto `/tmp/sendr-data` on Vercel | Where files + metadata live. Point at any big disk. |
| `SENDR_MAX_BYTES` | `214748364800` (200 GiB) | Max file size |
| `SENDR_CHUNK_SIZE` | `16777216` self-host · auto `4194304` on Vercel | Upload chunk size |
| `SENDR_PENDING_TTL_HOURS` | `168` (7 days) | Abandoned unfinished uploads get swept |

## How it works

```
Browser                         Server (custom engine)
â”€â”€â”€â”€â”€â”€â”€                         â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
POST /api/upload/init      â†’    creates id + delete-token-hash + meta.json
PUT  /api/upload/chunk     â†’    streams each raw chunk to .sendr-data/files/<id>/c000000â€¦
POST /api/upload/complete  â†’    verifies every chunk size, flips status â†’ ready
GET  /api/dl/<id>          â†’    stitches chunks into one stream, supports Range/206,
                                counts downloads, forces safe Content-Disposition
```

Storage layout:

```
.sendr-data/
â”œâ”€â”€ meta/<id>.json          name, size, type, status, downloads, password hash, delete-key hash
â””â”€â”€ files/<id>/c000000â€¦     the actual bytes, chunk by chunk (never duplicated)
```

Downloads stream straight out of the chunk files (no reassembly step), so even a 50 GB
file starts downloading instantly.

## API

| Route | Purpose |
| --- | --- |
| `GET /api/info` | max size + chunk size |
| `POST /api/upload/init` | `{name,size,type,password?}` â†’ `{id, token}` |
| `PUT /api/upload/chunk?id&index` | raw body, header `x-sendr-token` |
| `POST /api/upload/complete` | `{id,token}` â†’ public meta |
| `POST /api/upload/resume` | `{id,token}` â†’ `{have:[chunkIndexes]}` |
| `POST /api/upload/abort` | delete a pending upload |
| `GET /api/files/:id` | public metadata |
| `DELETE /api/files/:id` | header `x-sendr-token`, destroys permanently |
| `POST /api/files/:id/unlock` | `{password}` check |
| `GET /api/dl/:id` | download / preview stream (`?disp=inline`, `?pw=`, Range OK) |
| `GET /api/stats` | aggregate counters (cached 10 s) |

## Deploying

### Self-hosted (recommended for "forever" + 50 GB)

Any box with disk space:

```bash
SENDR_DATA_DIR=/var/sendr npm run build && npm start   # port 3000
```

Or Docker:

```bash
docker build -t sendr .
docker run -p 3000:3000 -v sendr-data:/data sendr
```

### Vercel

The site deploys as-is, but know the platform's rules:

1. **Request bodies are capped at ~4.5 MB.** Set `SENDR_CHUNK_SIZE=4194304` (4 MiB) in
   your Vercel project env so every chunk fits. The client picks this up automatically
   from `/api/info`.
2. **Serverless filesystems are ephemeral.** `/tmp` is small and wiped â€” permanent
   storage of real files needs a persistent disk somewhere. That's a platform limit,
   not a code limit: this app stores everything through its own storage layer, so if
   you want Sendr links to truly last forever, run it on any machine/VPS with a disk
   (Docker command above) â€” same code, zero changes.

For long transfers on paid plans you can also add `export const maxDuration = 60;`
to `app/api/upload/chunk/route.js`.

## Security notes

- Delete keys & passwords are only ever stored **hashed** (SHA-256 / scrypt).
- Unlocks and mutations are rate-limited; wrong passwords get a delay.
- HTML/SVG/etc. are always forced to download (`nosniff`, strict inline whitelist).
- IDs are random base32 â€” unguessable, unlisted.

MIT licensed. Have fun sending. âœˆï¸
