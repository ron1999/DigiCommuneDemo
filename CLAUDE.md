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
  friends.ts         friends/requests/blocks (my_friends etc. RPCs), room visibility, get_room for visiting
  properties.ts      houses + shops in town: town_properties, claim/release, entry rules, shop stock, links (008 RPCs)
  pets/species.ts    pet species list (cats + dogs, family + sheet per species), sanitizePet
  pets/pets.ts       your pets: load, adopt_starter, set_active_pet, rename_pet
  pets/petArt.ts     loads pet sprite sheets (sprites/pets/) for the game (walk anims) and panel icons
  supabase.ts        Supabase client (reads VITE_ env vars)
  session.ts         current player's name and avatar
  config.ts          tile size, map size, speed, zoom
  scenes/TownScene.ts   the world (town OR a home: restarts with new PlaceData to travel), doors, furniture, networking, reconnect
  scenes/UIScene.ts     overlay: title, status text, touch joystick
  world/townMap.ts      seeded town map generator (same for every player)
  world/tileset.ts      placeholder tile art drawn in code (town + room interior tiles)
  world/properties.ts   PROPERTIES: claimable town buildings + empty lots (ids, tile rects, doors)
  world/rooms.ts        room templates (size, slots), furniture list, default room
  world/furniture.ts    placeholder furniture art drawn in code
  avatar/avatar.ts      avatar options (the numbers), sanitizing
  avatar/sprites.ts     loads layer PNGs, tints grey layers, stacks them into one sheet per look
  avatar/textures.ts    turns a look into a Phaser texture + walk animations, feet-based origin
  entities/NameTag.ts, RemotePlayer.ts, PetFollower.ts (pet that walks after its owner, 4 directions)
  net/network.ts        Colyseus connection with timeout
  ui/chat.ts, wardrobe.ts, shop.ts, hud.ts, decorate.ts, petsPanel.ts, friendsPanel.ts   HTML overlay panels
  ui/placePanel.ts      the Place panel: claim a building/lot, Manage (name, who can come in, guests, bans), Storefront + link warning
client/public/ui/ + client/src/ui/theme.ts   UI art (frames, buttons, icons, Jersey 15 font), built by scripts/build-ui.mjs, see docs/ART_SPEC.md "UI"
client/index.html        all HTML + CSS for overlays (login, topbar, wardrobe, shop, chat)
client/public/sprites/   character layer sheets (128x128 frames, 5 cols x 4 rows): see docs/ART_SPEC.md
scripts/make-placeholder-sprites.mjs   regenerates PLACEHOLDER sprites (overwrites real art!)
docs/ART_SPEC.md         format the character art must follow
server/src/
  index.ts           Express + Colyseus startup (loads server/.env via dotenv)
  TownRoom.ts        runs the shared 'town', each player's 'home' (filterBy owner) AND each 'property' (filterBy property id): join auth, move, chat, avatar relay
  auth.ts            verifies a Supabase login token and reads username, avatar, and active pet; get_property check for houses/shops
  avatar.ts          server-side avatar validation
  presence.ts        who is online and where (one server process; would need Redis presence to scale out)
supabase/
  001_profiles.sql, 002_fix_profile_access.sql, 003_economy.sql, 004_rooms.sql, 005_pets.sql, 006_friends.sql, 007_presets.sql, 008_shops_homes.sql, 009_body_types.sql, 010_accessories.sql, 011_pets_cats_dogs.sql   run in order in the Supabase SQL Editor
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
- **Avatar:** 26 small integers stored in `profiles.avatar`: preset, gender, build, muscle, height, skin, hairStyle, hairColor, top, topColor, bottom, bottomColor, onepiece, onepieceColor, shoes, shoesColor, hat, hatColor, glasses, glassesColor, band, bandColor, neck, neckColor (24). Piercings/tattoos (`face`, `faceColor`) were removed 2026-11-23: 012 refunded buyers and retired the items; `save_avatar` (010) still stores face 0. Option counts must stay in sync in THREE places: `client/src/avatar/avatar.ts`, `LIMITS` in `server/src/avatar.ts`, and the `items` in `supabase/009_body_types.sql` + `010_accessories.sql` (one item per option; price 0 = free; `save_avatar` is in 010). Old looks (outfitStyle/outfitColor/accessory) are filled in with defaults; those items are retired (price 0, buyers refunded by 009).
- **Character art:** 128x128 frames, 4 directions x (stand + 4 walk frames), see `docs/ART_SPEC.md` "Body types". `sprites.ts` stacks: body sheet in the chosen skin tone (`sprites/bodies/[skins/<tone>/]<gender>-<build>[-muscular].png`, a palette swap, not tinted) > bottom > shoes > top > overalls (replaces the bottom) > neck > hair (`sprites/head/<style>/<body>.png`; under a hat, hair is erased where `head/<hat>/mask/<body>.png` is opaque, and Curls is hidden entirely) > headband > hat > glasses, all listed in `sprites/head/items.json`; clothes in `sprites/clothing/<item>/<body>.png`; clothes and hair are grey and tinted. Then the height stretch (port of `scripts/body-shapes.mjs`, -12..+12 px in legs/torso, feet fixed). The art is ~8 MB, so files load on demand per look; a sheet is drawn with what's loaded and redrawn when the rest arrives (`onSheetUpdated` refreshes Phaser textures and the wardrobe preview). Character positions (local, server, remote) are the **feet**. The old layer files (`body.png`, `face.png`, `outfit-*`, `hair-*`, `accessory-*`) are no longer used.
- **World scale:** 64px tiles, camera zoom 1. Tile art is still drawn in code at 32px and scaled 2x (`world/tileset.ts`); real tile art comes later. Tile size must match in `client/src/config.ts` and `TILE` in `server/src/TownRoom.ts`.
- **Rooms:** pre-made templates with predefined furniture slots (no free placement). Saved in `rooms` via `save_room()` (checks ownership and that furniture fits the slot). Templates and furniture are shop items (`roomTemplate_N`, `furniture_N`). Keep in sync: `client/src/world/rooms.ts` (FURNITURE, ROOM_TEMPLATES) <-> `supabase/004_rooms.sql` (items, room_templates), and the largest room size <-> `HOME` in `server/src/TownRoom.ts`. Enter by walking into any town door or the Home button; leave by the doormat or Town button. For now only the owner can enter (server `onAuth` + RLS). Planned: roles Owner/Builder/Visitor/Blocked, visibility public/friends/invite.
- **Pets:** 7 original cats and dogs (`SPECIES`, each with a `family` and a `sheet`): 0-2 are free starters (Tabby, Corgi, Shadow; one per account, picked after character creation), 3-6 to be found later. Ids are saved in the database: only append, never reorder. The highest id must match in `client/src/pets/species.ts`, `MAX_SPECIES` in `server/src/auth.ts` (6), and the check in the newest pets SQL (`011_pets_cats_dogs.sql`). The old placeholder species were swapped 1:1 by id (names kept). Art: `client/public/sprites/pets/<sheet>.png`, 48 px frames drawn at 1x, built by `scripts/build-pets.mjs` (see docs/ART_SPEC.md "Pets"); new animal families (lizards...) = a new sheet + a new `family` value + appended species. The active pet follows its owner everywhere; the server reads it from the database on join and when the client sends `avatar` (a general "re-read me" message), then broadcasts `pet`.
- **Friends & visiting:** `friendships` (pending/accepted) and `blocks`; all changes through RPCs in `006_friends.sql`. Rooms have `visibility` private/friends/public (default friends). `can_visit_room()` decides entry; the server calls it in `onAuth` with the visitor's token. Owner can send `removeVisitor` (close code 4002); owner's Decorate save sends `roomChanged` so visitors reload via `get_room()`. Friends' online status comes from `server/src/presence.ts` via the `online` message.
- **Houses & shops (Milestone 9):** 8 claimable `properties` in town (ids 0-3 = the 4 buildings, 4-7 = empty lots). Keep in sync: `PROPERTIES` in `client/src/world/properties.ts` <-> rows in `supabase/008_shops_homes.sql` <-> `MAX_PROPERTY_ID` in `server/src/TownRoom.ts`. Walking onto a door: claimed -> go inside (`property` room), unclaimed -> claim panel. Claim as a house or shop: your first house and first shop are free, then each costs the place's price (buildings 250, lots 200); max 2 of each (`MAX_PER_USE`). Claiming a lot builds on it (the town map draws walls for lots with an owner). Each place has its own template/slots (decorated with the same Decorate panel, saved by `save_property_room`), visibility (private = guests only / friends / public), guest list + ban list (`property_access`), and respects `blocks`. `can_enter_property()` decides; the server calls `get_property` with the player's token in `onAuth`. Giving a place back refunds unsold stock only. Your personal room (Home button) is separate and unchanged.
- **Player shops:** owners buy stock of catalog items at wholesale (60% of catalog price, `wholesale_price()` <-> `wholesalePrice()` in `client/src/properties.ts`), set a price from 1 to 2x catalog, buyers get the unlock and the owner gets the coins (`buy_from_shop`, both sides logged in `ledger` as `shop_buy`/`shop_sale`). Max 12 lines, 99 each. Up to 5 https-only links per shop; they open in a new tab after a "You are leaving DigiCommune" warning; 3 reports hide a link from visitors. Any shop owner can add links for now (no "verified" check yet).
- **Character presets:** avatar field `preset` (0 = Custom, built from the body-type options; 1 = Sprout, a complete sheet in `sprites/presets/`). Fern removed until redrawn. Wardrobe has tabs Body / Hair / Clothes / Extras; rows hide when they don't apply (`when` in `CATEGORIES`).
- **Town art:** `client/src/world/townArt.ts` draws the town over the plain tile layer (which stays, hidden, for collision and doors): ground as a dual grid (each 64px ground tile sits on a tile corner) from `public/world/terrain/*`, animated decor from `public/world/decor.json` placed by a fixed hash of the tile (same for every player; trees/flowers replace the look of TREE/FLOWER tiles, lamps have no collision), building pictures from `buildings.json` (8-frame strips: vines sway) aligned on their door tile (signs float above the picture), and a camera-fixed golden-hour overlay (warm multiply tint, sun glow, vignette) plus glowing light pools. Images load with plain `Image()` (the scene loader may be busy). Rooms don't use it. In dev, `window.__dcGame` is the Phaser game (for console checks).
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
- Milestone 9: houses and shops (claim buildings/lots, Manage panel, guest/ban lists, Storefront with stock + links). Done 2026-11-22. 008 run by the owner. Tested: SQL on a local Postgres (PGlite) incl. re-run, claim/ban/stock/buy/refund/link checks; in the browser: claim panel on a lot, building appears, Storefront (stock, link, link warning, remove + refund), Manage (visibility, guest-list error), server lets the owner into the shop and refuses an unclaimed one. Not yet tested: walking in through the door and the inside view, a second account buying, phones.
- Body types + starter wardrobe wired in (2 genders x 5 builds x soft/muscular, 5 heights, 10 skin tones, 10 hairstyles + bald, 12 clothing items, 12 cloth colors). Done 2026-11-22 on `milestone-9-shops-homes`. Tested in the browser: wardrobe tabs, live preview, composed sheets for several looks (all directions, walk frames, height). 009 run by the owner. Accessories (5 hats, 3 glasses, headband, neck bandana, 5 piercings/tattoos) added the same day: composed sheets checked in the browser; needs 010 run. Not yet tested: saving a look, other players seeing it, phones. Known art flaws: shadow on one heavyset overalls side frame; tallest + Curls clips a few top rows of hair.
- Milestone 8: friends list, requests, online status, visiting rooms, room visibility, blocking, asking visitors to leave, live redecorate. Done 2026-11-22. Tested in the browser: request + accept (2 accounts), online status, visiting a friend's room (Decorate hidden). Not yet tested: live redecorate seen by a visitor, Ask to leave, Only me / blocking keeping someone out.
- Pets redo: PixelLab cats and dogs (4 cats incl. recolours, corgi, beagle, fluffy mutt), sheet-based follower with 4-direction walk, panel icons from the sheets, 011 SQL. Done 2026-11-23 (uncommitted). Tested: SQL on PGlite incl. re-run; in the browser (dev server, no login) the follower loads each sheet and plays the right walk row per direction, stands when the owner stops; panel icons + silhouettes. Needs 011 run. Not yet tested: logged-in game (starter picker, Pets panel, other players' pets), phones.

## Project folder and Git
- This folder (`~/Documents/GitHub/DigiCommune`) is the single working copy, a clone of https://github.com/ron1999/DigiCommuneDemo (public), managed in GitHub Desktop (the owner pushes with its Push button). Work happens on a branch per milestone, merged into `main` once tested. The `~/Documents/ClaudeCode/DigiCommuneDemo/DigiCommune-milestoneN*` folders and zips are frozen snapshots; don't edit them.
- Commit after each working step so any change can be undone. `.env` files stay local (ignored by Git).
- `supabase/002_fix_profile_access.sql` was missing from the Milestone 5 snapshot; recover it from the owner's earlier copy if found.

- Town art + front doors: wired 2026-11-23. Tested in the browser: ground, decor, buildings, light; claim panel from the front of building 2 and lot 6; entering building 3 and lot 4 from the front and leaving (you appear below the door). Not yet tested on phones (performance with ~250 animated sprites).

## Roadmap (remaining)
Target: test release by Fri 2026-11-27.
1. ~~Personal rooms with templates and slots~~ (done)
2. ~~Starter pet + companion following, collection screen~~ (done)
3. ~~Friends list + visiting rooms, basic roles (Owner/Visitor/Blocked)~~ (done)
3b. ~~Homeowners and shop owners~~ (done, Milestone 9)
4. Test release with moderation (report, mute), rate limits, deploy to Cloudflare Pages + Fly.io

After the test release: exploring/spawns/activities, collaborative room editing (Builder role), gifting, trading, link boards, private messages.

## Known limitations / things to harden before a public launch
- The server trusts the position the client sends (only clamped to map bounds).
- The shop sells everything all the time (no rotating stock yet).
- Only 8 places exist in town; nothing reclaims places from inactive owners yet, and banning someone doesn't kick them if they're already inside (use Ask to leave).
- Shop links: anyone with a shop can add them (planned: verified users only, admin review of reports).
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
