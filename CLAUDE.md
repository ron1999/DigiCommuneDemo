# DigiCommune: project guide for Claude Code

A browser-based, tile-world social hub (Pokémon-style overworld, but a hangout space, not a battler). Friends walk around a shared town, chat, customize their characters, earn and spend coins, and (planned) decorate rooms, collect creature companions, trade, and gift. Works on desktop and mobile browsers. Test version for 20-200 players. All creatures, names, and art must be **original** (no Pokémon IP).

## About the owner
- Solo developer with HTML/CSS/JS basics, newer to TypeScript, servers, and databases.
- Explain changes in plain language, give exact steps for anything done outside the code (Supabase dashboard, terminal commands), and say what to expect when it works.
- Ask before destructive actions (deleting files, resetting the database, force-pushing).
- Hosting budget is free/hobby tiers for now.

## Tech stack
| Layer | Choice |
|---|---|
| Game client | Phaser 3 + TypeScript, built with Vite (`client/`) |
| Multiplayer server | Colyseus 0.15 on Node.js, TypeScript run by `tsx` (`server/`) |
| Database + auth | Supabase (Postgres, Auth, Row Level Security) |
| Planned hosting | Cloudflare Pages (client), Fly.io (server) |

## Repo layout
```
client/src/
  main.ts            login/sign-up UI, starts the game, wires buttons
  auth.ts            Supabase login, profile, saveAvatar (via RPC)
  economy.ts         wallet/shop/daily-reward state + RPC calls
  supabase.ts        Supabase client (reads VITE_ env vars)
  session.ts         current player's name and avatar
  config.ts          tile size, map size, speed, zoom
  scenes/TownScene.ts   the world: map, local player, remote players, networking, reconnect
  scenes/UIScene.ts     overlay: title, status text, touch joystick
  world/townMap.ts      seeded town map generator (same for every player)
  world/tileset.ts      placeholder tile art drawn in code
  avatar/avatar.ts      avatar options, sanitizing, drawing (shared Painter interface)
  avatar/textures.ts    turns an avatar into a Phaser texture
  entities/NameTag.ts, RemotePlayer.ts
  net/network.ts        Colyseus connection with timeout
  ui/chat.ts, wardrobe.ts, shop.ts, hud.ts   HTML overlay panels
client/index.html        all HTML + CSS for overlays (login, topbar, wardrobe, shop, chat)
server/src/
  index.ts           Express + Colyseus startup (loads server/.env via dotenv)
  TownRoom.ts        the single shared room: join auth, move, chat, avatar relay
  auth.ts            verifies a Supabase login token and reads username + avatar
  avatar.ts          server-side avatar validation
supabase/
  001_profiles.sql, 002_fix_profile_access.sql, 003_economy.sql   run in order in the Supabase SQL Editor
```

## Running locally
Two terminals:
```
cd server && npm install && npm run dev     # listens on port 2567
cd client && npm install && npm run dev     # http://localhost:5173, --host so phones on the same Wi-Fi can open the Network URL
```
Test multiple players with a private/incognito window or another browser (tabs of the same browser share one login, and the server allows one connection per account).

## Environment variables (never commit real values)
- `client/.env`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SERVER_URL` (leave empty locally), `VITE_PLACEHOLDER_EMAIL_BASE`
- `server/.env`: `SUPABASE_URL`, `SUPABASE_ANON_KEY` (**no `VITE_` prefix** on the server)
- Never use or add a `service_role` key unless truly required, and never in client code.
- Vite and tsx only read `.env` at startup: restart after editing.
- `.gitignore` must be named exactly `.gitignore` and cover `node_modules/`, `dist/`, `.env`, `.env.*` (keep `!.env.example`).

## Key design decisions
- **Auth:** username + password. Supabase needs an email, so the client builds a hidden placeholder from `VITE_PLACEHOLDER_EMAIL_BASE` using plus-addressing (`base+username@gmail.com`). Do not change that base: it would lock out existing accounts. Email confirmation is OFF in Supabase. Real email/phone attachment is planned for later.
- **Server is the source of truth:** the server verifies the login token (`server/src/auth.ts`) and takes the username and avatar from the database, never from the client. One connection per account (a new login kicks the old one with close code 4001).
- **Economy lives in the database, not the client:** coins, inventory, daily rewards, and avatar saves go through `security definer` Postgres functions (`claim_daily_reward`, `buy_item`, `save_avatar`) called with `supabase.rpc`. Tables are read-only for players via Row Level Security. Every coin change is logged in `ledger`.
- **Avatar:** six small integers (skin, hairStyle, hairColor, outfitStyle, outfitColor, accessory), stored in `profiles.avatar`. Option counts must stay in sync in THREE places: `client/src/avatar/avatar.ts`, `server/src/avatar.ts`, and the `items` seed in `supabase/003_economy.sql`.
- **Art is placeholder:** drawn from shapes in code. Real (AI-generated) art will replace `drawAvatar` and `world/tileset.ts` later; keep the numbers-based avatar format.
- **Rooms (planned):** pre-made templates with predefined item slots (no free placement), roles Owner/Builder/Visitor/Blocked, visibility public/friends/invite.
- **Daily reward:** day boundary is midnight America/New_York (set in both `claim_daily_reward()` SQL and `DAY_TIMEZONE` in `client/src/economy.ts`). 50 coins + 10 per streak day, max 100. New accounts get 100 coins.
- **Link boards (planned):** only verified users, open in a new tab with a warning, report/remove tools.

## Status
- Milestone 1: tile town, movement, touch joystick. Done and tested.
- Milestone 2: Colyseus multiplayer + chat bubbles. Done and tested.
- Milestone 3: Supabase accounts, server-side login check. Done and tested.
- Milestone 4: avatar customization + wardrobe, synced live. Done and tested (+ 4.1/4.2 fixes: older-phone CSS, auto-reconnect, timeouts, startup error box, server logging).
- Milestone 5: wallet, daily rewards, shop, locked wardrobe items, server-verified avatar updates. Done and tested (per owner, 2026-11-21).

## Project folder and Git
- This folder (`DigiCommuneDemo/DigiCommune/`) is the single working copy, tracked with Git since 2026-11-21. The old `DigiCommune-milestoneN*` folders and zips beside it are frozen snapshots; don't edit them.
- Commit after each working step so any change can be undone. `.env` files stay local (ignored by Git).
- `supabase/002_fix_profile_access.sql` was missing from the Milestone 5 snapshot; recover it from the owner's earlier copy if found.

## Roadmap (remaining)
Target: test release by Fri 2026-11-27.
1. Personal rooms with templates and slots
2. Starter pet + companion following, collection screen
3. Friends list + visiting rooms, basic roles (Owner/Visitor/Blocked)
4. Test release with moderation (report, mute), rate limits, deploy to Cloudflare Pages + Fly.io

After the test release: exploring/spawns/activities, collaborative room editing (Builder role), gifting, trading, link boards, private messages.

## Known limitations / things to harden before a public launch
- The server trusts the position the client sends (only clamped to map bounds).
- The shop sells everything all the time (no rotating stock yet).
- Placeholder email scheme should become a real email/phone flow.
- No moderation, rate limits beyond chat/avatar cooldowns, or automated tests yet.
- Early milestones were only syntax-checked, never fully type-checked against Phaser/Colyseus types; run `npm run build` in `client/` and in `server/` to catch type errors.

## Gotchas learned the hard way
- Copying folders over existing ones in Finder with **Replace** deletes `.env` and `node_modules`. Use Merge (hold Option).
- Newer Supabase projects do not automatically grant table access to logged-in users: new tables need explicit `grant select ... to authenticated` (see 002 and 003).
- Supabase rejects made-up email domains, hence the plus-address approach.
- Colyseus `onAuth` runs before `onJoin`; throwing a `ServerError(401|500, msg)` rejects the join and the client shows the message in the top-right status text.
- Older iPhones lack the CSS `inset` and `dvh` units; use explicit top/left/right/bottom and a `vh` fallback.
- Phones drop WebSockets when backgrounded; `TownScene` reconnects on `visibilitychange`.

## Working conventions
- Prefer small, reviewable changes; explain what changed and how to test it.
- Keep secrets out of Git; check `git status` for `.env` before committing.
- Keep the client and server avatar limits in sync (see above).
- After SQL changes, add a new numbered file in `supabase/` instead of editing old ones, and make it safe to re-run.
