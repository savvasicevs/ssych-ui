# SSICEVS UI

A small, dark, Fey-inspired component library for AI-heavy product surfaces — copy-paste or install via the shadcn CLI.

**Live library & previews →** https://ssicevs-ui.vercel.app

## Install

Each component is a shadcn registry item. With a shadcn-ready project:

```bash
npx shadcn@latest add https://ssicevs-ui.vercel.app/r/sidebar.json
```

Swap `sidebar` for any component slug — the CLI pulls its npm deps and any registry dependencies. Run `npx shadcn@latest init` first if your project isn't set up for shadcn yet. Components rely on the standard `cn()` helper in `lib/utils.ts` (clsx + tailwind-merge), included here.

## Components

| Slug | What it is |
| --- | --- |
| `sidebar` | Collapsible accordion sidebar with an active rail |
| `macos-dock` | Magnifying macOS dock (rounded tiles + Phosphor icons) |
| `browser-window` | Chrome / Safari mock window frame |
| `macbook-frame` | Front-facing MacBook mockup |
| `card-stack` · `card-grid` · `card-list` | Project-card layouts |
| `project-card` | Shared cutout project card |
| `gradient-button-group` | Segmented gradient button group |
| `accordion` | Accordion with a synced visual stage |

> **Gated components** — `cutout-card` and `bento-gallery` require signing in at the [live library](https://ssicevs-ui.vercel.app) before install. Their source isn't in this repo.

## Tech

React 19 · TypeScript · Tailwind CSS v4 · [Motion](https://motion.dev) · [Phosphor Icons](https://phosphoricons.com)

---

This repo mirrors the component source + shadcn registry (`/r/*.json`). The interactive library lives at [ssicevs-ui.vercel.app](https://ssicevs-ui.vercel.app).
