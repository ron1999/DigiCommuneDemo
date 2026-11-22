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
  room.ts            load/save your own room (save_room RPC)
  pets/species.ts    pet species list (original creatures), sanitizePet
  pets/pets.ts       your pets: load, adopt_starter, set_active_pet, rename_pet
  pets/petArt.ts     placeholder pet art drawn on a canvas (shared by game and panels)
  supabase.ts        Supabase client (reads VITE_ env vars)
  session.ts         current player's name and avatar
  config.ts          tile size, map size, speed, zoom
  scenes/TownScene.ts   the world (town OR a home: restarts with new PlaceData to travel), doors, furniture, networking, reconnect
  scenes/UIScene.ts     overlay: title, status text, touch joystick
  world/townMap.ts      seeded town map generator (same for every player)
  world/tileset.ts      placeholder tile art drawn in code (town + room interior tiles)
  world/rooms.ts        room templates (size, slots), furniture list, default room
  world/furniture.ts    placeholder furniture art drawn in code
  avatar/avatar.ts      avatar options (the numbers), sanitizing
  avatar/sprites.ts     loads layer PNGs, tints grey layers, stacks them into one sheet per look
  avatar/textures.ts    turns a look into a Phaser texture + walk animations, feet-based origin
  entities/NameTag.ts, RemotePlayer.ts, PetFollower.ts (pet that hops after its owner)
  net/network.ts        Colyseus connection with timeout
  ui/chat.ts, wardrobe.ts, shop.ts, hud.ts, decorate.ts, petsPanel.ts   HTML overlay panels
client/index.html        all HTML + CSS for overlays (login, topbar, wardrobe, shop, chat)
client/public/sprites/   character layer sheets (128x128 frames, 5 cols x 4 rows): see docs/ART_SPEC.md
scripts/make-placeholder-sprites.mjs   regenerates PLACEHOLDER sprites (overwrites real art!)
docs/ART_SPEC.md         format the character art must follow
server/src/
  index.ts           Express + Colyseus startup (loads server/.env via dotenv)
  TownRoom.ts        runs the shared 'town' AND each player's 'home' (filterBy owner): join auth, move, chat, avatar relay
  auth.ts            verifies a Supabase login token and reads username, avatar, and active pet
  avatar.ts          server-side avatar validation
supabase/
  001_profiles.sql, 002_fix_profile_access.sql, 003_economy.sql, 004_rooms.sql, 005_pets.sql   run in order in the Supabase SQL Editor
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
- **Character art:** 128x128 pixel-art frames, layered (body, face, outfit, hair, accessory), 4 directions x (stand + 4 walk frames). Skin/outfit/hair layers are drawn in grey and tinted in `sprites.ts`, so colors stay as numbers. Current files are placeholders from `scripts/make-placeholder-sprites.mjs`; the owner is making real art with an AI pixel-art tool following `docs/ART_SPEC.md`. Character positions (local, server, remote) are the **feet**.
- **World scale:** 64px tiles, camera zoom 1. Tile art is still drawn in code at 32px and scaled 2x (`world/tileset.ts`); real tile art comes later. Tile size must match in `client/src/config.ts` and `TILE` in `server/src/TownRoom.ts`.
- **Rooms:** pre-made templates with predefined furniture slots (no free placement). Saved in `rooms` via `save_room()` (checks ownership and that furniture fits the slot). Templates and furniture are shop items (`roomTemplate_N`, `furniture_N`). Keep in sync: `client/src/world/rooms.ts` (FURNITURE, ROOM_TEMPLATES) <-> `supabase/004_rooms.sql` (items, room_templates), and the largest room size <-> `HOME` in `server/src/TownRoom.ts`. Enter by walking into any town door or the Home button; leave by the doormat or Town button. For now only the owner can enter (server `onAuth` + RLS). Planned: roles Owner/Builder/Visitor/Blocked, visibility public/friends/invite.
- **Pets:** 6 original species (`SPECIES`): 0-2 are free starters (one per account, picked after character creation), 3-5 to be found by exploring later. Species count must match in `client/src/pets/species.ts`, `MAX_SPECIES` in `server/src/auth.ts`, and the check in `005_pets.sql`. The active pet follows its owner everywhere; the server reads it from the database on join and when the client sends `avatar` (a general "re-read me" message), then broadcasts `pet`.
- **Daily reward:** day boundary is midnight America/New_York (set in both `claim_daily_reward()` SQL and `DAY_TIMEZONE` in `client/src/economy.ts`). 50 coins + 10 per streak day, max 100. New accounts get 100 coins.
- **Link boards (planned):** only verified users, open in a new tab with a warning, report/remove tools.

## Status
- Milestone 1: tile town, movement, touch joystick. Done and tested.
- Milestone 2: Colyseus multiplayer + chat bubbles. Done and tested.
- Milestone 3: Supabase accounts, server-side login check. Done and tested.
- Milestone 4: avatar customization + wardrobe, synced live. Done and tested (+ 4.1/4.2 fixes: older-phone CSS, auto-reconnect, timeouts, startup error box, server logging).
- Milestone 5: wallet, daily rewards, shop, locked wardrobe items, server-verified avatar updates. Done and tested (per owner, 2026-11-21).
- Sprites: layered 128x128 characters with walk animations, 64px tiles. Done (placeholder art), 2026-11-21.
- Milestone 6: personal rooms (3 templates, 14 furniture, Decorate panel, door travel). Done 2026-11-21; tested by Claude in the browser (home, decorate preview, save + reload, doormat exit). Not yet tested: walking in through a town door, buying furniture/templates, phones.
- Milestone 7: starter pet (pick + name), follower, Pets panel (follow/stay home/rename, collection 1/6). Done 2026-11-21; tested by Claude in the browser on the owner's account. Not yet tested: seeing another player's pet (needs 2 accounts), phones.

## Project folder and Git
- This folder (`~/Documents/GitHub/DigiCommune`) is the single working copy, a clone of https://github.com/ron1999/DigiCommuneDemo (public), managed in GitHub Desktop (the owner pushes with its Push button). Work happens on a branch per milestone, merged into `main` once tested. The `~/Documents/ClaudeCode/DigiCommuneDemo/DigiCommune-milestoneN*` folders and zips are frozen snapshots; don't edit them.
- Commit after each working step so any change can be undone. `.env` files stay local (ignored by Git).
- `supabase/002_fix_profile_access.sql` was missing from the Milestone 5 snapshot; recover it from the owner's earlier copy if found.

## Roadmap (remaining)
Target: test release by Fri 2026-11-27.
1. ~~Personal rooms with templates and slots~~ (done)
2. ~~Starter pet + companion following, collection screen~~ (done)
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
