# Taskora brand assets

Source master: `Logo.png` (full marketing lockup with tagline).

## Asset matrix

| File | Content | Usage |
|------|---------|--------|
| `mark.png` | Board + pastilles + T (no text) | Favicon base, app icon, header UI |
| `wordmark.png` | « Taskora » only | Docs, footer |
| `lockup.png` | Mark + wordmark **without** tagline | Login, splash, README compact |
| `lockup-full.png` | Full marketing (icon + name + tagline) | Pitch, print, social |
| `mark-navy.png` / `mark-white.png` | Monochrome mark | Dark header, badges, print |
| `lockup-navy.png` / `lockup-white.png` | Monochrome lockup | Slides, OSS badges |
| `*-256/512/1024.png` | Sized exports | Stores, PWA, social |

Copies used by the app:

- `frontend/src/assets/brand/` — Vite imports (`BrandLogo`: mark, wordmark, lockup, mono)
- `frontend/public/brand/favicon-*.png` — PWA / manifest icons

## Favicon

- `frontend/public/favicon.svg` — simplified mark  
- `frontend/public/favicon.png` — 32×32 raster  
- `frontend/public/apple-touch-icon.png` — 180×180  
- `frontend/public/brand/favicon-192.png` / `favicon-512.png` — install icons  

## UI policy

- **Auth / marketing screens:** `variant="lockup"`  
- **App topbar:** `variant="mark"` (compact)  
- **Tagline** stays in marketing assets only, not in app chrome  

## Product colors (aligned with logo)

| Token | Hex | Role |
|-------|-----|------|
| Navy | `#0f172a` | Text / header |
| Violet | `#7c3aed` | Primary accent (`ora`) |
| Blue | `#3b82f6` | Pastille / gradient |
| Green | `#22c55e` | Badges / success |
| Yellow | `#eab308` | Pastille accent |
