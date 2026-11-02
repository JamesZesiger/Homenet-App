# homeapp

A 10-foot home server shell: one Electron app that runs self-hosted services as
**Podman** pods and drives them, and itself, with a game controller, a keyboard
or a mouse. It is a candidate replacement for [homenet](../homenet).

- **Runtime:** castlabs Electron (Widevine) so streaming can later play in-app.
- **Apps:** each `catalog/<id>/` is a Kubernetes Pod (`pod.yaml`) that
  `podman kube play` runs, plus `homeapp.json` describing its settings.
  Off-the-shelf images (Immich, Audiobookshelf, Pi-hole) run unchanged.
- **Input:** `src/shared/input/` turns gamepad buttons into intents and moves
  focus spatially. The same code is injected into hosted apps (Immich etc.)
  through `src/preload/guest.ts`, so they are controller-navigable too.

## Controls

| Controller | Keyboard | Does |
|---|---|---|
| D-pad / left stick | Arrows | Move focus |
| A | Enter | Activate (on a field: start typing / open picker) |
| B | Esc | Back: un-edit field → close dialog → page back → launcher |
| X | / | Search |
| Start | — | Settings |
| LB / RB | — | In an app: history back / forward |
| LT / RT | — | Page up / down |
| Guide | — | Return to the launcher |

## Development (WSL2 / Linux)

```sh
sudo apt install -y podman      # rootless podman
npm install
npm run dev                     # opens in WSLg
npm run check                   # typecheck + lint + tests
```

**Dev runs start fresh.** Anything unpackaged (`npm run dev`, `npm start`)
uses a scratch profile each run and stops its pods when it closes; only the
movie/show catalogue is kept (`~/.config/homeapp-dev/`), so TMDB isn't
re-fetched every run. Set `TMDB_API_KEY` in your shell so search works without
re-entering the key each time.

The castlabs Electron binary downloads on first launch (or run
`node node_modules/electron/install.js`).

**Pi-hole on port 53:** rootless podman can't bind ports below 1024. Either
`sudo sysctl net.ipv4.ip_unprivileged_port_start=53` (persist it in
`/etc/sysctl.d/`), or set Pi-hole's DNS port to e.g. 5353 in its settings.

**Behind the Cisco Umbrella proxy:** an npm `cafile` holding only the Umbrella
root breaks downloads from hosts it doesn't intercept (GitHub). Point `cafile`
at a bundle of the system CAs plus the Umbrella root instead.

## Windows (production)

Install Podman Desktop (or `podman machine init && podman machine start`), then
`npm run dist:win` builds an NSIS installer in `dist/`. Host paths such as
`C:\Photos` are translated to `/mnt/c/Photos` for the podman machine.

## Search

Search covers popular US movies and shows in English (50+ TMDB votes) on
Netflix, Hulu, Disney+, Prime Video, Crunchyroll, HBO Max and Paramount+. The
catalogue downloads from TMDB in the background on first start (needs a free
TMDB API key: Settings › Advanced, or `TMDB_API_KEY`) and refreshes weekly.
Play opens the title on the service when Wikidata knows its page there, and the
service's search for it otherwise.

## Data

- App settings: `settings.json` in Electron's userData directory
  (`%APPDATA%/homeapp` on Windows, `~/.config/homeapp` on Linux).
- App state: podman named volumes `homeapp-<id>-<volume>`. Stopping an app
  removes its pod, never its volumes. Pods keep running after homeapp closes;
  stop them from Settings › Advanced.
- Catalogue: `titles.json` and `title-links.json` beside the settings.
- Media: host folders set per app (photo library, audiobooks).

Each setting's `homenetEnv` names the homenet `.env` key it replaces, for the
planned homenet migration (`docker volume export` → `podman volume import`).
