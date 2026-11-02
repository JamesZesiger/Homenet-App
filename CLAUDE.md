# homeapp

Electron (castlabs build) launcher hosting Podman apps; see README.md.

## Rules

- Build only what is needed; the best code is the smallest code. Reuse what
  is already in this codebase, and never recreate what the standard library,
  the platform (Electron, Chromium, Podman) or an installed dependency already
  provides.
- Work on a feature branch; never commit to `main`. Merge only when asked.
- Never commit settings, secrets or `.env` files.
- `npm run check` (typecheck, lint, tests) must pass before committing.
- Off-the-shelf apps run unmodified: integrate through `catalog/` and the guest
  preload, never by patching their images.
- `src/shared/input/` is the one controller/spatial-nav implementation, shared
  by the launcher and the guest preload. Keep it framework-free.
- Every catalog setting carried over from homenet keeps its `homenetEnv` key.
- The launcher UI is expected to be replaced; keep logic out of it.

## Versioning

Semantic versioning, kept in `package.json` (`npm version <x.y.z> --no-git-tag-version`).
While below 1.0:

- A merge that adds user-facing features bumps the minor version (0.3.0 → 0.4.0).
- A merge that only fixes bugs bumps the patch version (0.3.0 → 0.3.1).
- CI, build tooling, docs and test-only changes leave the version alone.
- Breaking changes (settings, vault or data formats that need migrating) also
  bump the minor version, and say so in the PR.

Bump the version in the PR that makes the change. A release is a `vX.Y.Z` tag
on `main` matching `package.json`; pushing it makes CI publish the installer.
1.0.0 is the first release that replaces homenet on the TV box.
