# DigiCommune

A browser-based, tile-world social hub where friends hang out, chat, customize their avatars and rooms, and collect creature companions. Play it on desktop or mobile.

> **Status:** Early prototype (v0.1). Not yet ready for public use.

## Vision

DigiCommune is a cozy overworld that is a **hangout space, not a battler**. Friends walk around a shared hub, chat, decorate their own rooms, and take their pets along. All creatures, names, and art are original.

## Prototype Features

- [ ] Shared hub town with real-time movement (keyboard and touch controls)
- [ ] Chat bubbles
- [ ] Username and password accounts
- [ ] Layered avatar customization
- [ ] Personal room with templates and swappable items
- [ ] Free starter pet that follows you
- [ ] Visit friends' rooms

## Planned After the Prototype

- Economy: coins, daily rewards, shops
- Gifting and trading
- Collaborative room editing with roles (Owner, Builder, Visitor)
- Link boards for sharing links in-world
- Exploring and collectible spawns
- Email and phone attached to accounts

## Tech Stack

| Layer | Choice |
|---|---|
| Game engine | Phaser 3 (TypeScript) |
| Maps | Tiled |
| Real-time server | Colyseus (Node.js) |
| Database and auth | Supabase |
| Frontend hosting | Cloudflare Pages |
| Server hosting | Fly.io |

## Getting Started

Requirements:

- [Node.js](https://nodejs.org) (LTS)
- [Git](https://git-scm.com)
- A free [Supabase](https://supabase.com) project

Setup instructions for running the client and server locally will be added as the first milestone lands.

## Environment Variables

Secrets are never committed to this repository. Create a local `.env` file (already ignored by Git) when instructed. Expected values will include:

```
SUPABASE_URL=
SUPABASE_ANON_KEY=
```

## Project Structure (planned)

```
DigiCommune/
├── client/    # Phaser game (browser)
├── server/    # Colyseus multiplayer server
├── shared/    # Types and data used by both
└── docs/      # Design doc and notes
```

## Contributing

This is a personal project in early development. Issues and suggestions are welcome once the prototype is playable.

## License

To be decided.
