# Dogent

Document-driven AI development system. Write specs in your vault, trigger a run, get tested and deployed code.

## Components

| Package | Status | Description |
| --- | --- | --- |
| [`vault/`](./vault) | 🚧 0.1 | Obsidian plugin that syncs your vault to your own S3, Git, or Google Drive |
| `studio/` | planned | Desktop app that reads vaults and orchestrates AI runs |
| `engine/` | planned | Code generation, test loop, and deployment runtime |

## Concept

1. Write project specs as Obsidian notes in a vault. **One vault = one project.**
2. The Vault plugin syncs the vault to your chosen storage (S3 / Git / Drive).
3. Dogent Studio (desktop) reads the vault and runs the AI pipeline.
4. The engine generates code, runs unit + E2E tests, iterates until green, and deploys.

You only edit documents. The system handles the rest.

## Status

Early development. The Vault plugin is the first component and is functional.
