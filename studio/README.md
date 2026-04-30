# Dogent Studio

Desktop app for running document-driven AI projects. Part of the [Dogent](../) system.

## What it does

1. **Manages multiple Dogent projects.** Each project = one Obsidian vault + a local working directory + deploy settings.
2. **Pulls a vault** from S3 (or other backends) into the local directory.
3. **Runs Claude** with the project's `.dogent/conventions.md` injected as system prompt.
4. **Runs tests** (`npm test`, lint, typecheck, custom commands) and streams output.
5. **Deploys** to Vercel or AWS S3 with one click using stored credentials.

## Stack

- Electron 29
- React 18 + Vite
- TypeScript
- Anthropic SDK for Claude

## Develop

```bash
npm install
npm run dev
```

Opens a Vite dev server on :5173 and launches Electron pointed at it. Hot-reload works for the renderer; for `electron/` changes, restart with `Ctrl+C` and `npm run dev` again.

## Build

```bash
npm run build
```

Builds the renderer with Vite and packages the app with electron-builder.

## Settings & secrets

API keys and tokens (Anthropic, Vercel, AWS) are stored via Electron's `safeStorage` (Keychain on macOS) when available, plain-text on disk otherwise. Stored in `~/Library/Application Support/Dogent Studio/secrets.bin`.

## Project state

Stored in `~/Library/Application Support/Dogent Studio/projects.json`.
