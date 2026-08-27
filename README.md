# Deskop

A self-hosted office flow desktop app: staff accounts, presence, document sharing, a "ringer"
to summon a colleague, 1:1 voice/video calls with screen sharing, internal messaging (DMs +
department channels), a staff directory, role-based access control, and an admin dashboard.
Built with Electron + React on the client and Node/Express/Socket.io on the server.

This is still a **prototype** in a few specific ways: no TURN server (calls need LAN or
STUN-reachable networks), file/message/report storage is local JSON on the server rather than a
real database, and sessions are in-memory bearer tokens rather than JWTs. Access control is
role-based (`admin` vs `staff`) rather than a granular per-feature permission matrix.

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

Pick one machine to act as the office server (a spare desktop, an always-on machine, etc).

**Easiest: download the standalone server** — no Node.js needed on that machine. Grab
`deskop-server-win.zip` from the [latest release](https://github.com/vassetng/deskop/releases/latest),
unzip it, and double-click `deskop-server.exe`. A console window stays open while it runs.

**From source** (if you're already set up for development):

```bash
npm run server
```

It listens on port 4000 by default (`PORT=xxxx npm run server` to change it). Note the machine's
LAN IP — but staff shouldn't need this; see below.

### Building the standalone server .exe

```bash
cd server
npm run dist:win
```

Bundles the server to a single CommonJS file with esbuild (sidesteps `pkg`'s flaky ESM support),
then packages it with `pkg` into `server/dist/deskop-server.exe`. To distribute it, zip that
`.exe` together with the `server/public/` folder (the standalone build reads `data/`,
`uploads/`, and `public/` from next to wherever the `.exe` is actually placed, not from inside
the repo) — that's exactly what `deskop-server-win.zip` on the releases page is.

## Run the app (per staff laptop)

```bash
npm run app
```

This starts the Vite dev server and opens the Electron window. On first launch, the app
auto-discovers the office server over the LAN (a lightweight UDP broadcast, no config needed on
either side) and lists it with a **Join** button — no IP address to find or type. It also
auto-fills the username field from the signed-in Windows account, so on a matching account
staff just enter their passcode and sign in.

If nothing turns up (different subnet, firewalled network, or connecting from outside the
office), a **Connect manually** link reveals the old picker — **Localhost**, **WiFi/LAN** (type
an address), or **Online** (a `https://` address plus a connection password, if the server has
one set — see below).

The very first time the server ever runs (empty `server/data/staff.json`), it creates a
default admin account and prints the credentials to the console:

```
No staff accounts found — created a default admin login:
  username: admin
  password: admin123
```

Log in with that, then create real staff accounts from the **Admin** tab → **Staff** (set their
department and role there too) — change the default admin password from the same screen isn't
built in yet, so at minimum create a new admin account and remove the default one once you're
set up.

### Connection password (for the "Online" mode)

If you expose the server beyond your LAN, set a shared connection password so only clients that
know it can connect at all (checked before login, on every socket connection):

```bash
CONNECTION_PASSWORD=yourpassword npm run server
```

Leave it unset for normal LAN use — no extra password is required by default.

## Website / download page

Visiting the server's address in a browser (e.g. `http://192.168.1.10:4000`) shows a Deskop
landing page with a features overview and a Download section. It's a static page at
`server/public/index.html`, served by the same Express server — no separate hosting needed.

The Windows download button links to `/downloads/deskop-setup.exe`. That file doesn't exist
until you build it (see below); until then the page automatically falls back to "run from
source" instructions.

There's also a separate public marketing site in `site/` (deployed independently, e.g. to
Vercel) with its own Download section pointing at the GitHub Releases page — that one offers
both the server zip and the app installer, since it's meant for people who aren't already on
the office network.

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

- **Roster**: see everyone currently online in the left sidebar, with quick Ring/Call buttons.
- **Ring**: pops a full-screen alert + system notification + sound on their screen. They can
  Accept (starts a call) or Dismiss.
- **Call**: 1:1 video call directly from the roster or the directory.
- **Screen share**: during a call, click "Share screen" to swap your video feed for your screen;
  click again to switch back to your camera.
- **Files**: drag a file onto the dropzone (or click it) to upload; it appears for everyone
  connected to the same server, with a Download link. Uploads are attributed to your logged-in
  account, not a typed name.
- **Directory**: every staff account (online or not), searchable by name/username and filterable
  by department, with Message/Ring/Call buttons (Ring and Call are disabled for offline staff;
  Message always works — DMs are delivered when they're next online).
- **Messages**: direct messages with any staff member, plus your department's channel. Admins
  see and can post in every department's channel; everyone else only sees their own — enforced
  server-side, not just hidden in the UI. Click 📎 to attach a file to a DM or channel post —
  access to the attachment itself follows the same rule as the message it's on (only the two DM
  participants, or that department's members and admins), it's not visible from the general
  Files tab.
- **Daily report**: each staff member can submit a short end-of-day report (tasks completed,
  blockers, plan for tomorrow). Submitting again the same day updates that day's report rather
  than creating a duplicate.
- **Admin** (only visible to `admin`-role accounts):
  - **Overview** — online/total staff counts, today's report counts, a recent-activity feed
    (logins, rings, calls, report submissions, account creation).
  - **Reports** — everyone's reports for a chosen date, with a "Mark reviewed" toggle so you can
    track what's been read.
  - **Staff** — create/remove staff accounts, set their department and role.
  - **Departments** — add/remove department channels.

## Troubleshooting

- **"Electron failed to install correctly"**: on some setups, Electron's postinstall step
  downloads the binary but the extraction silently fails, leaving `node_modules/electron/dist`
  with only a `locales/` folder and no `electron.exe`. Fix: delete `node_modules/electron/dist`,
  re-extract the cached zip (Windows: `Expand-Archive <path-to-cached-zip> -DestinationPath
  node_modules/electron/dist`; the zip lives under `%LOCALAPPDATA%\electron\Cache`), then write
  `node_modules/electron/path.txt` containing `electron.exe` (or just `electron` on
  macOS/Linux).

## Notes for production hardening (not done here)

- Sessions are an in-memory token map — they're wiped on every server restart (everyone has to
  log in again) and don't scale past one server process. Swap for JWTs or a real session store.
- Add password reset / change-password flow (currently only account creation exists; changing a
  password requires an admin to delete and recreate the account).
- Add a TURN server for calls across restrictive networks/NAT.
- Code-sign the Windows installer and add auto-update (electron-builder supports both once you
  have a certificate).
- Build macOS/Linux installers too (currently Windows-only; add `mac`/`linux` targets to the
  `build` config in `app/package.json` and matching `dist:mac`/`dist:linux` scripts).
- Move file/message/report/staff storage to a real database instead of local JSON files.
- Support group calls (needs an SFU, e.g. mediasoup/LiveKit, instead of mesh WebRTC).
- Granular per-feature permissions instead of just `admin`/`staff` roles, if needed.
