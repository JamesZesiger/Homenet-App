# homeapp

Electron (castlabs build) launcher hosting Podman apps; see README.md.

## Rules

- Work on a feature branch; never commit to `main`. Merge only when asked.
- Never commit settings, secrets or `.env` files.
- `npm run check` (typecheck, lint, tests) must pass before committing.
- Off-the-shelf apps run unmodified: integrate through `catalog/` and the guest
  preload, never by patching their images.
- `src/shared/input/` is the one controller/spatial-nav implementation, shared
  by the launcher and the guest preload. Keep it framework-free.
- Every catalog setting carried over from homenet keeps its `homenetEnv` key.
- The launcher UI is expected to be replaced; keep logic out of it.
