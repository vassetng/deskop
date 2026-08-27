# Deskop

A prototype desktop app for office flow: staff presence, document sharing, a "ringer" to summon
a colleague, and 1:1 voice/video calls with screen sharing. Built with Electron + React on the
client and Node/Express/Socket.io on the server.

This is a **prototype**: no accounts/auth, no TURN server (calls need LAN or STUN-reachable
networks), and file storage is local disk on the server, not a database. See the plan doc for
what's intentionally out of scope.

## Requirements

- Node.js 18+
- All staff laptops and the server on the same network (or the server reachable at a fixed
  address staff can reach)

## Setup

From the repo root:

```bash
npm install
```

This installs both `server/` and `app/` via npm workspaces.

## Run the server

Pick one machine to act as the office server (a spare desktop, a always-on machine, etc). From
the repo root:

```bash
npm run server
```

It listens on port 4000 by default (`PORT=xxxx npm run server` to change it). Note the machine's
LAN IP (e.g. `192.168.1.10`) — staff will point the app at `http://192.168.1.10:4000`.

## Run the app (per staff laptop)

```bash
npm run app
```

This starts the Vite dev server and opens the Electron window. On first launch, enter your name
and the server address, then click Join.

## Website / download page

Visiting the server's address in a browser (e.g. `http://192.168.1.10:4000`) shows a Deskop
landing page with a features overview and a Download section. It's a static page at
`server/public/index.html`, served by the same Express server — no separate hosting needed.

The Windows download button links to `/downloads/deskop-setup.exe`. That file doesn't exist
until you build it (see below); until then the page automatically falls back to "run from
source" instructions.

### Building the Windows installer

```bash
cd app
npm run dist:win
```

This runs `electron-builder` and outputs `app/release/deskop-setup.exe`, which the server
serves automatically at `/downloads/deskop-setup.exe` — no config needed.

**Known issue on some Windows machines:** electron-builder needs to extract a helper archive
(`winCodeSign`, used for embedding the app icon via `rcedit`) that contains Unix symlinks for
its macOS tools. Extracting those requires Windows' `SeCreateSymbolicLinkPrivilege`, which most
accounts don't have by default. If the build fails with `Cannot create symbolic link: A required
privilege is not held by the client`, you have two options:

- Enable **Developer Mode** (Settings → Privacy & security → For developers), or run the build
  from an Administrator terminal, then re-run `npm run dist:win` — the clean fix.
- **Workaround without changing system settings:** only the two macOS `.dylib` "symlinks" fail;
  everything else (including the Windows `rcedit` tools electron-builder actually needs) extracts
  fine. After a failed build, complete the cache manually:
  1. Find the partially-extracted folder under
     `%LOCALAPPDATA%\electron-builder\Cache\winCodeSign\<random-number>`
     (delete any `.7z` sibling file, keep the folder).
  2. In `<folder>\darwin\10.12\lib`, copy `libcrypto.1.0.0.dylib` over the empty `libcrypto.dylib`,
     and `libssl.1.0.0.dylib` over the empty `libssl.dylib` (plain copies — the actual content
     doesn't matter for a Windows build, this just satisfies electron-builder's completeness
     check).
  3. Rename that folder from `<random-number>` to `winCodeSign-2.6.0` (still inside
     `Cache\winCodeSign\`).
  4. Re-run `npm run dist:win` — it will find the cache already populated and skip straight to
     building the installer.

## Using it

- **Roster**: see everyone currently online in the left sidebar.
- **Ring**: click "Ring" next to a name to pop a full-screen alert + system notification + sound
  on their screen. They can Accept (starts a call) or Dismiss.
- **Call**: click "Call" to start a 1:1 video call directly.
- **Screen share**: during a call, click "Share screen" to swap your video feed for your screen;
  click again to switch back to your camera.
- **Files**: drag a file onto the dropzone (or click it) to upload; it appears for everyone
  connected to the same server, with a Download link.
- **Daily report**: each staff member can submit a short end-of-day report (tasks completed,
  blockers, plan for tomorrow). Submitting again the same day updates that day's report rather
  than creating a duplicate.
- **Admin**: enter the admin code to view everyone's reports for a given day, picked by date.
  The code defaults to `admin123` — set your own with `ADMIN_CODE=yourcode npm run server`. The
  server also prints the active code to the console on startup. This is a simple shared
  passcode, not real per-user authentication — anyone with the code can view all reports.

## Troubleshooting

- **"Electron failed to install correctly"**: on some setups, Electron's postinstall step
  downloads the binary but the extraction silently fails, leaving `node_modules/electron/dist`
  with only a `locales/` folder and no `electron.exe`. Fix: delete `node_modules/electron/dist`,
  re-extract the cached zip (Windows: `Expand-Archive <path-to-cached-zip> -DestinationPath
  node_modules/electron/dist`; the zip lives under `%LOCALAPPDATA%\electron\Cache`), then write
  `node_modules/electron/path.txt` containing `electron.exe` (or just `electron` on
  macOS/Linux).

## Notes for production hardening (not done here)

- Add authentication and access control
- Add a TURN server for calls across restrictive networks/NAT
- Code-sign the Windows installer and add auto-update (electron-builder supports both once you
  have a certificate)
- Build macOS/Linux installers too (currently Windows-only; add `mac`/`linux` targets to the
  `build` config in `app/package.json` and matching `dist:mac`/`dist:linux` scripts)
- Move file storage to object storage and add a real database for the roster/file metadata
- Support group calls (needs an SFU, e.g. mediasoup/LiveKit, instead of mesh WebRTC)
