# Character art spec

How to make character art that drops straight into the game. The game already works with
placeholder art in this exact format, so you can replace files **one at a time** and see each
one in the game right away.

## The short version

- Every file is a PNG with a **transparent background**, in `client/public/sprites/`.
- Every file is a **sprite sheet of 128 x 128 frames**, laid out as **5 columns x 4 rows**
  (so the whole image is **640 x 512**).
- Every file draws **one piece** of the character (body, outfit, hair, ...), and all pieces line
  up exactly when stacked on top of each other.
- Pieces that the player can recolor (skin, outfit, hair) are drawn in **grey**.

## Sheet layout

|        | col 0 | col 1 | col 2 | col 3 | col 4 |
|--------|-------|-------|-------|-------|-------|
| row 0  | facing **down** (toward the camera): standing | walk 1 | walk 2 | walk 3 | walk 4 |
| row 1  | facing **left**: standing | walk 1 | walk 2 | walk 3 | walk 4 |
| row 2  | facing **right**: standing | walk 1 | walk 2 | walk 3 | walk 4 |
| row 3  | facing **up** (back to the camera): standing | walk 1 | walk 2 | walk 3 | walk 4 |

- The walk cycle is 4 frames that loop: step with one foot, pass, step with the other foot, pass.
  It plays at 8 frames per second.
- **Right** is usually just **left mirrored**.

## Where the character sits in each frame

These must be the same in every frame of every file, or the pieces won't line up:

- Centered left-to-right (middle of the body at x = 64).
- **Feet touch y = 116** (12 px from the bottom). The game stands the character on this line.
- The top of the head is around y = 20-32 (the current PixelLab base: y ≈ 31, about 85 px tall). The name tag floats just above y = 20.
- The character is about **64 px wide and 96 px tall**, about 1 x 1.5 world tiles (tiles are 64 px).

Tip: open a placeholder file from `client/public/sprites/` in your editor and draw your new
art on a layer on top of it, so everything stays aligned.

## Files

Layers are stacked in this order, back to front. **Bold** = drawn in grey and recolored by the game.

| File | What it is | Notes |
|---|---|---|
| **`body.png`** | Head, neck, arms, hands, legs: bare skin | Recolored with the 5 skin tones. No face. |
| `face.png` | Eyes, eyebrows, mouth | Keeps its own colors. Empty in the "up" row. |
| **`outfit-0.png`** | T-shirt (+ trousers, shoes) | Shirt in grey; trousers/shoes may keep their own colors. |
| **`outfit-1.png`** | Hoodie | |
| **`outfit-2.png`** | Overalls (+ shirt underneath) | Overalls in grey; the shirt may keep its own color. |
| **`hair-0.png`** | Short hair | |
| **`hair-1.png`** | Long hair | |
| **`hair-2.png`** | Spiky hair | |
| (none) | Bald | `hair-3.png` doesn't exist on purpose. |
| `accessory-1.png` | Glasses | Keeps its own colors. |
| `accessory-2.png` | Cap | Keeps its own colors. |
| `accessory-3.png` | Headband | Keeps its own colors. |

The numbers in the names must match the order of the options in `client/src/avatar/avatar.ts`.
Adding a new option (say a 4th outfit) means a new file **and** updating the option lists and
the shop items (see CLAUDE.md, "Avatar").

## How recoloring works (for the grey layers)

The game swaps grey for the player's chosen color:

- **Mid grey (about #808080-#8C8C8C)** becomes exactly the chosen color. Use it for the main area.
- **Darker greys** become shadows of that color, **lighter greys** become highlights.
  2-4 grey shades per piece is plenty.
- **Very dark pixels (below about #282828)** stay as drawn. Use them for outlines.
- **Colored pixels** (anything that isn't grey) stay as drawn. Use color for parts that should
  *not* change, like buttons, shoe soles, or a logo.

So: draw recolorable pieces in greys with a near-black outline, and you get every color
combination for free.

## How the current art is made (PixelLab + a script)

The character layers in `client/public/sprites/` are built from **one** PixelLab character, so
every layer lines up exactly in every frame:

1. **Base character** (PixelLab MCP, ~4 generations): `create_character` in `standard` mode,
   4 directions, `size` 88 (stored on a 124 x 124 canvas), `chibi` proportions, low top-down
   view, prompt "bald, plain light grey sleeveless top and grey shorts, barefoot". Then
   `animate_character` with the template `walking-4-frames` for **south, north and west**
   (one direction per call on the trial plan; east is west mirrored).
2. **Raw frames are kept** in `scripts/art-src/base-character/` (PixelLab download ZIP:
   `rotations/<dir>.png` = standing, `animations/walk4/<dir>/frame_00N.png` = walk).
3. **Run** `node scripts/build-character-layers.mjs` (needs no installs). It:
   - places every frame with the feet on y = 116, same offset for a whole direction (keeps the bob);
   - `body.png`: the base's skin pixels turned grey by brightness (main skin tone = mid grey);
   - `face.png`: eyes and mouth (non-skin pixels and inner dark lines inside the head);
   - `outfit-N.png`: the base's own shirt/shorts pixels recoloured, plus sleeves, trouser legs
     and shoes painted onto the arm/leg pixels of that same frame;
   - `hair-N.png` and `accessory-N.png`: painted onto the head pixels / eye positions of each frame.
   Edit the functions in that script (`outfitHoodie`, `hairLayer`, `cap`, ...) to change a style.

Why not one PixelLab "variant" per layer? Each variant (`create_character_state`) costs 10-25
generations and gets its own separately generated walk, so cutting layers out by comparing
frames doesn't line up. Deriving the layers from one base is free and exact.

To swap in a different base character: generate it the same way, replace the PNGs in
`scripts/art-src/base-character/`, and re-run the script. It expects a light grey top and
darker grey shorts (that's how it finds the clothes), and skin in warm tones.

**Status (2026-11-21):** the owner did not like these code-drawn hair/outfit layers; they are a
stopgap. Characters are moving to **preset characters** in the approved style (below). Mix-and-match
layers may come back later with a PixelLab Tier 1 plan (`transfer_outfit` / `edit_animation`).

## Body types (2026-11-22)

The character system is built on Sprout's style. Per gender (male, female) there are sliders for:

- **Build** (5 steps, real PixelLab art): slim, lean, average, stocky, heavyset.
- **Muscle** (2 steps, real art): soft, muscular.
- **Height** (5 steps, made by script): -12, -6, 0, +6, +12 px from the average height
  (97 px, feet to top of head). `scripts/body-shapes.mjs` adds or removes pixel rows in the legs
  (60%) and torso (40%). The game applies it to the stacked sheet, so every layer stretches with
  the same rows and stays lined up.

That gives 20 bodies: `client/public/sprites/bodies/<gender>-<build>[-muscular].png`, each a
640 x 512 sheet in the same layout as the layer sheets (rows down/left/right/up, col 0 standing +
4 walk frames, feet on y = 116, standing frame exactly 97 px tall). Bodies are bald (hair is a
layer) in a plain white tank top and grey shorts (underwear), skin in the original "Sunset" tone.

How they were made (about 190 generations in total):
1. One `create_image_pro_flash` 208 x 128 image per gender per muscle (5 figures, slim to
   heavyset, same height), styled on Sprout and the approved lineups; then one
   `edit_image_pro_flash` per image to make everyone bald (6 generations each).
   Sources: `scripts/art-src/bodies/<gender>-builds.png` and `<gender>-muscular.png`
   (the versions with hair are in `with-hair/`).
2. `node scripts/build-body-bases.mjs` cuts them into
   `scripts/art-src/bodies/base/<name>.png` (96 x 128, feet y = 116, height 97).
3. Each base became a PixelLab character (`create_character_pro_flash` with the base as
   `first_frame_url`, about 2 generations) and got the template walk `walking-4-frames` for
   south, west and north (3 generations). Character ids: `scripts/art-src/bodies/characters.json`.
4. `node scripts/build-body-sheets.mjs` downloads the walks (kept in
   `scripts/art-src/bodies/walk/<name>/`), cleans the walk's shading with
   `scripts/walk-shading.mjs` (the template walk paints the back limbs in muddy dark reds and
   sometimes puts cloth colours on bare legs; every pixel is mapped back onto the standing art's
   own colours with shadow and highlight limits), normalizes the height and writes the sheets.

**Skin tones** (10, free, `node scripts/skin-tones.mjs [--preview out.png]`): a palette swap, not
a tint. Every skin pixel (warm and saturated) is mapped to one of 8 brightness steps and repainted
with that step of a hand-picked 8-colour ramp (shadows lean red, highlights warm), so shading
stays crisp. Output: `client/public/sprites/bodies/skins/<tone>/<body>.png` plus `skins.json`
(wardrobe order, names, swatch). The original sheets are the "Sunset" tone. Run it again after
rebuilding the bodies. To add or change a tone, edit `TONES` in the script.

**Outline:** every body and every item gets the same dark outline, #1B110A (`scripts/outline.mjs`:
near-black lines are unified to it and every silhouette edge pixel is set to it). New art
pipelines must call `applyOutline()` too.

**Head items** (hair, hats, glasses, bandanas) are drawn ONCE per gender and placed on
every body by following the head (`node scripts/build-head-items.mjs <item>`):
1. The three standing views (front, side, back) of the reference body (`male-average` /
   `female-average`) are put side by side in one 192 x 128 image (64 px per view, frame
   columns 32-95).
2. `edit_image_pro_flash` draws the item on all three views at once (6 generations per gender),
   in one pure key colour (bright cobalt blue for tintable items like hair) so it cuts out
   exactly. Save it as `scripts/art-src/head/<item>/<gender>.png` with an `item.json`
   (`key`, `tint`).
3. The script cuts the item out, turns tintable items grey (mid grey = chosen colour), adds the
   shared outline, finds the head (top + centre) in every frame of every body, and writes
   `client/public/sprites/head/<item>/<body>.png` (640 x 512, ready to stack).
   Tintable items use the MEDIAN key brightness across all three views as mid grey, so every
   view tints to the same colour.
4. Hairstyles are unisex: each style is drawn on both reference bodies (12 generations per
   style). Current set (2026-11-22): hair-messy, hair-bob, hair-buzz, hair-long, hair-curls,
   hair-ponytail, hair-buns, hair-undercut, hair-locs, hair-spiky (+ Bald = no layer).
   Rebuild one with `node scripts/build-head-items.mjs <id>`.

**Faces** (2026-11-22): every body frame gets the SAME clean reference head per gender
(`scripts/stamp-heads.mjs`, called by `build-body-sheets.mjs`): the frame's head is erased down
to the chin and `scripts/art-src/heads/<gender>.png` (a PixelLab edit of the reference body's
three views: clean bald scalp, crisp eyes with ONE pure green iris pixel each = eye colour key,
brows, nose, mouth) is pasted on the frame's head position. Leftover hair stubs under the chin
are cleaned and walk frames the AI broke (hair or background on the head, stray specks above
the head) are replaced or fixed. After rebuilding the bodies, re-run `skin-tones.mjs` and
`build-head-items.mjs` for every item.

**Clothing** (`node scripts/build-clothing.mjs <item>`): PixelLab `edit_animation` draws the
garment on a KEY body's 4 walk frames per direction (10 generations per direction) in pure
magenta. The script cuts it out (magenta incl. pale pinks), makes it grey/tintable with the
shared outline, and writes `client/public/sprites/clothing/<item>/<body>.png`. Bodies that
borrow a key body's garment ("fits" in `scripts/art-src/clothing/<item>/item.json`) get it moved
to follow their head, then CONFORMED: skin poking out past the garment's sides (up to 4 px) and
small holes over skin are filled with fabric, row by row. Holes the AI leaves in a garment
(transparent or unkeyed pixels inside it, tiny skin specks) are filled with the fabric around
them; `"solidRows": true` (the skirt) fills every row edge to edge.

Clothing is drawn on 6 key bodies only (per gender: slim, average, heavyset; lean -> slim,
stocky -> average, soft and muscular share a fit), about 90 generations per item instead of 600.

**Starter wardrobe (done, 12 items x 20 bodies)**, all grey/tintable, one slot each:

| Slot | Items |
|---|---|
| `top` | `top-hoodie`, `top-tee`, `top-flannel`, `top-sweater` |
| `bottom` | `bottom-jeans`, `bottom-cargo`, `bottom-skirt`, `bottom-trousers` |
| `onepiece` | `onepiece-overalls` (worn over a top, replaces a bottom) |
| `shoes` | `shoes-sneakers`, `shoes-boots`, `shoes-sandals` |

Stacking order in the game: body (skin-tone sheet), bottom, shoes, top, onepiece, hair,
headwear, glasses, then the height stretch. Tint every clothing layer like hair (grey
pixels only; the outline colour stays as is). Known small flaws: a dark shadow patch on one side
frame of the heavyset overalls; 2-3 skin pixels on one female-average jeans frame.

Fixing a bad AI frame: move the old `<dir>_1..4.png` aside, regenerate that one direction with a
new seed, re-run the build. Frames from two runs of the same direction can be mixed.

**Accessories (done)** are head items, built like hair (`build-head-items.mjs`), listed for the
game in `client/public/sprites/head/items.json` (id, name, kind, tint, plus `mask` for hats and
`underHat` for hair):

| Kind | Items | Notes |
|---|---|---|
| `hat` | `hat-beanie`, `hat-cap`, `hat-sunhat`, `hat-bucket`, `hat-mushroom` | each has `head/<hat>/mask/<body>.png` |
| `glasses` | `glasses-round`, `glasses-square`, `glasses-sun` | |
| `band` | `band-bandana` (headband) | drawn over the hair, no mask |
| `neck` | `neck-bandana` | under the hair (long hair falls over it) |

Head stack order: neck, hair, band, hat, glasses. **Hats and hair:** before drawing a hat,
erase the hair pixels where the hat's mask sheet is opaque (everything above the hat's brim), so
big hair doesn't poke through. Hair with `"underHat": "tuck"` (the big curls) isn't drawn at all
under a hat.

Piercings and tattoos were removed (2026-11-23, owner): at 1-4 pixels they were too hard to see
in the game. The hand-placed versions are kept outside the repo in case they come back.

Every prompt starts with the owner's words, exactly: "Please no AI slop or generic vibe. I want
it look like if stardew valley & scott pilgrims pixel art styles had a baby, not an exact copy
of either."

## Preset characters (the approved style)

Complete, ready-made characters players pick from: no tinting, no layers.

- Files: `client/public/sprites/presets/<name>.png`, each a 640 x 512 sheet in **exactly the same
  layout** as the layer sheets above (rows down/left/right/up, col 0 standing + 4 walk frames,
  feet on y = 116). So the game can draw a preset sheet wherever it now draws a composed look.
- Current presets: `sprout.png` (messy brown hair, green cropped jacket, red sneakers) and
  `fern.png` (teal hair with a flower, mustard overalls, green rain boots). They are about
  75-85 px tall.
- Built by `node scripts/build-presets.mjs` from `scripts/art-src/presets/<name>/` (PixelLab
  character export: `rotations/` = 8 standing views, `animations/walk4/<south|west|north>/`).
  The standing frame is the walk frame with the legs closest together (the PixelLab standing
  rotation is drawn slightly bigger than the walk, which would make the character jump in size).
- How one is made (about 5-10 generations):
  1. The first image: `create_image_pro_flash` 96 x 96 (5 gens, best quality), or
     `create_image_pixen` 96 x 96 (1 gen, good enough for Fern). Prompt: the character + "Stardew
     Valley and Scott Pilgrim pixel art style, chunky expressive proportions, bold clean dark
     outlines, vibrant colors, warm golden-hour sunset rim light", transparent background, facing
     the viewer.
  2. `create_character_pro_flash` with that image as `source_image_id` / `first_frame_url`
     (2 gens at 96 px: only the rotations are charged).
  3. `animate_character` template `walking-4-frames`, one call each for south, west, north
     (1 gen each).
  4. Download `/mcp/characters/<id>/download`, unzip `Idle/rotations` and `Idle/animations` into
     `scripts/art-src/presets/<name>/`, run the script.

## Art direction (all new art)

A mix of **Stardew Valley and Scott Pilgrim** pixel-art style, used only as a reference for the
general style and vibe (never copy their characters or assets), in a **solarpunk** world with lots
of whimsical foliage and mushrooms and **warm sunset lighting** as the default mood. Put
"Stardew Valley and Scott Pilgrim pixel art style" plus "warm sunset light" in every PixelLab prompt.

## Tiles and furniture (PixelLab)

- **Tiles**: `client/public/tiles/tiles.png` is one row of 32 x 32 tiles in the order of `T` in
  `client/src/world/townMap.ts`; the game scales them 2x. Built by `node scripts/build-tiles.mjs`
  from the downloads in `scripts/art-src/tiles/` (four `create_topdown_tileset` sheets in standard
  mode, 1 generation each: grass/path, water/grass, wood/carpet, ceramic/wood, plaster/brick; plus
  `create_image_pixen` 32px sprites for the tree, mushrooms, door and doormat; since 2026-11-22
  grass, path, water and the flower tile come from the World set below). `tileset.ts` draws
  the old code tiles first, then swaps in each tile of the PNG once it loads.
- **Furniture**: `client/public/furniture/furniture_N.png`, one file per piece at its slot size in
  game pixels (64 per tile). Built by `node scripts/build-furniture.mjs` from
  `scripts/art-src/furniture/frame_N.png`, which came from ONE `create_1_direction_object` call
  (size 64, 16 `item_descriptions`, 10 generations; frames 14-15 are spare: mushroom lamp,
  hanging plant). `furniture.ts` loads them itself and falls back to the code-drawn pieces.
- To add a piece: generate it at 64 x 64, save it as the next `frame_N.png`, add its slot to
  `SLOTS` in the script, and add it to `FURNITURE` (+ the SQL items) as usual.

## World (town ground, foliage, lighting) — 2026-11-22

The golden-hour solarpunk town set. Built by `node scripts/build-world.mjs` (then
`node scripts/build-tiles.mjs`, which takes its plain grass / path / water / flower tiles from it).

**Prompts.** Every PixelLab prompt starts with the owner's sentence, word for word:
"Please no AI slop or generic vibe. I want it look like if stardew valley & scott pilgrims pixel art
styles had a baby, not an exact copy of either." then "Studio Ghibli film mood" (approved as a
general mood reference only), then the piece, "golden-hour sunset light from the upper left", warm
gold highlights, deep teal-green / lavender shadows, "dark brown outline", and for sprites
"no ground under it, transparent background". **Show the owner one still of each piece and get
approval before animating it.**

**Scale.** Drawn at 32 px per tile and scaled 2x with nearest-neighbour (64 px game tiles), like
the old tiles. The build writes everything already at 2x.

**Ground** (`client/public/world/terrain/`): two corner (Wang) autotile sheets, 4 x 4 tiles of 64 px,
`create_topdown_tileset` **pro** mode at 32 px (15 generations each) with a fixed 26-colour
"golden hour meadow" palette: `grass-path` (path lower, grass upper) and `water-grass` (water lower,
the *same* grass upper via `upper_base_tile_id`, with a low mossy bank). Each `.json` maps a corner
key to a sheet frame: key = corners NW, NE, SW, SE as 4 digits, 1 = grass, 0 = path/water
(`"1111"` plain grass, `"0000"` plain path/water). Use them as a **dual grid**: draw one ground tile
on every tile *corner* (offset half a tile), whose 4 corners are the 4 map tiles around that corner.
Edges then land exactly on tile borders. Treat wall/door/lot tiles as path (dirt under buildings).

**Decor** (`client/public/world/decor/<name>.png` + `world/decor.json`): one horizontal strip of
frames per piece; `decor.json` lists `frameWidth`, `frameHeight`, `frames`, `fps`, `originX/Y`
(put the origin there and the sprite at the tile's bottom-centre, depth = y), `blocks`, `glow`.

| Pieces | Size (1x) | Animation |
|---|---|---|
| tree-oak, tree-blossom, tree-willow, tree-mushroom, tree-solar (lantern tree) | 64 x 96 | PixelLab `animate_object` v3, 8 frames, end frame = the still so the loop closes (1 gen each) |
| bush-berry, bush-hedge | 48 x 48 | same (1 gen each) |
| flowers-gold, flowers-blue, flowers-poppy, grass-tuft, fern, reeds | 32 x 32/48 | free: `swayFrames` in `scripts/world-sway.mjs` (bends the top more than the base, whole pixels) |
| mush-red, mush-glow | 32 x 32 | free: `bobFrames` (1 px cap bob) |
| lilypads | 32 x 32 | free: `driftFrames` (slow 1 px drift) |
| log-shelf, lamp | 48 x 32, 32 x 64 | static (the lamp and glow mushrooms get light from the overlay) |

Sources: `scripts/art-src/world/terrain/`, `decor/<name>.png` (stills) and `decor/<name>/00-07.png`
(PixelLab loops); first tries that were redone are in `rejected/`. The build maps every decor pixel
to the nearest colour of the approved palette (ground sheets + the first test pieces) so all pieces
share one warm palette. To add a piece: generate the still with the prompt rules above, get it
approved, add it to `DECOR` in `scripts/build-world.mjs`, animate (AI or free), rebuild.

**Lighting.** Colours are warm already (palette); the golden-hour mood is finished in Phaser with a
light overlay, not baked in: a warm MULTIPLY tint (about `#FFF0D8`), a soft ADD sun glow from the
upper left, a dusky purple vignette, and soft additive light pools on `glow` pieces (lamps, glow
mushrooms, the lantern tree). Mock-up: `scripts/art-src/world/preview/town-preview.png`.

**Buildings** (`client/public/world/buildings/<name>.png` + `world/buildings.json`, keyed by
property id): one `create_map_object` sprite per place, sized to its footprint at 1x (e.g. 6 x 5
tiles = 192 x 160), "seen from the front and slightly above" (some came out angled; the owner is
fine with that). building-0 cottage, 1 greenhouse tea house, 2 bakery workshop, 3 community hall;
lots once built: 4 hill home, 5 townhouse, 6 mushroom house, 7 garden cottage (128 x 160, its roof
rises a tile above its 4 x 4 lot). Every door is in the front (bottom) wall: places south of the
road got front doors and a `walkway` (2026-11-22, `client/src/world/properties.ts`). `doorX` in the
json is the middle of the door in the image; place the image so `doorX` sits on the middle of the
door tile and `baseY` on the bottom edge of the footprint (depth = that bottom edge). Draw grass
under a building's wall tiles (only the door and walkways are path); an unbuilt lot stays a dirt plot.

**Building vines.** Each building is an 8-frame strip (`frames`, `fps` in buildings.json) whose
hanging vines sway. Made with PixelLab `inpaint_image` (10 generations per building; image and
mask sent as `upload:` refs from `get_upload_url`): a mask of rectangles under the eaves
(`scripts/art-src/world/buildings/vines/rects.json`), prompt "lush, full, leafy green ivy vines
growing out from under the roof eave...". The inpaint draws faint box lines at the mask edge, so
only the vine-coloured pixels (greens, lavenders) plus their dark outline are lifted into
`buildings/vines/<name>.png`; the approved building stays the base. `hangFrames` in
`scripts/world-sway.mjs` bends each rect's vines (top fixed under the eave, bottom swings 1-2 px).
The cottage also has a softer lavender-wisteria variant (`building-0-wisteria.png`, listed under
`variants`). The loose vine stills (`decor/vine-ivy`, `vine-wisteria`, `vine-fringe`) are approved
but kept for trees, fences or walls; on buildings use the inpaint method so vines fit the eaves.

## Pets (2026-11-22)

Cats and dogs for now; built so lizards and other animals slot in without changing any code.

**Look (approved by the owner):** small and simple, like classic cute pixel pets: few flat
colours, simple 2-tone shading, a big head, a clear silhouette, a thick clean outline, little dot
eyes, no texture noise. NOT the detailed 64 px style (the owner called that AI slop).

**Sheets:** `client/public/sprites/pets/<sheet>.png`, **240 x 192: 48 x 48 frames, 5 columns x 4
rows**, the same layout as the characters (rows down/left/right/up, col 0 standing + 4 walk
frames; right = left mirrored). Feet on **y = 45**, centered at x = 24. Drawn at **1x** in the game
(same pixel size as the characters), so a cat is about knee-to-thigh height next to a player.
Full colour, not tinted. Walk plays at 8 fps like the player.

| Sheet | Animal | How it's made |
|---|---|---|
| `cat-tabby.png` | cat, orange tabby | PixelLab (base cat) |
| `cat-silver.png` | cat, silver tabby | recolour of cat-tabby |
| `cat-cocoa.png` | cat, cocoa tabby | recolour of cat-tabby |
| `cat-black.png` | cat, black, yellow-green eyes | recolour of cat-tabby (+ eyes painted at `TABBY_EYES`) |
| `dog-corgi.png` | dog, ginger corgi type | PixelLab (base dog) |
| `dog-beagle.png` | dog, floppy-eared beagle type | PixelLab |
| `dog-mutt.png` | dog, fluffy cream mutt | PixelLab |

**Build:** `node scripts/build-pets.mjs`. It reads every folder in `scripts/art-src/pets/<sheet>/`
(PixelLab character export: `rotations/` = 8 standing views for reference,
`animations/walk4/<south|west|north>/frame_00N.png`; a side walk saved as `east/` instead of
`west/` is mirrored, for when PixelLab's west view turns the head away but its east view is fine),
places each direction with the feet on
y = 45, picks the walk frame with the legs closest together as the standing frame, removes
specks, applies the shared outline `#1B110A`, and then writes the recoloured coats listed in
`COATS` at the top of the script (the orange fur is recoloured by brightness; outline, eyes,
white patches and pink ears/nose stay). A recolour is free. Dark coats need the extra options
(`white`, `lines`, `pinkBelow`, `eyes`): the black cat repaints its eyes yellow-green at the
tabby's eye pixels (`TABBY_EYES`, checked by hand per frame), since dark eyes vanish in black fur.
If the tabby's source frames are ever regenerated, re-check `TABBY_EYES`.

**How a new base animal is made (about 8-15 generations):**
1. `create_character_pro_flash`, `template_id` cat/dog (bear/horse/lion also exist; for a lizard
   use `custom` and animate with `mode: "v3"`), **48 x 48**, `max_colors` 12, prompt = the owner's
   opening line + "simple clean small pixel art ..., standing on all four legs, clear readable
   silhouette, big round head, only a few flat colours with simple 2-tone shading, small cute dot
   eyes, thick clean dark outline, no texture noise, no dithering". For a matching set pass the
   tabby's (cats) or corgi's (dogs) south view as `style_image` (6 gens).
2. Check the side views: PixelLab often turns the head away or leaves the eye out. Cheapest fix:
   if the east view is good, animate east instead of west (the script mirrors it; the mutt). Else re-turn the front view with `first_frame_url` + another `seed` (1 gen each). If the side view
   still isn't right, `edit_image_pro_flash` the side view (5 gens) and animate the side walk from
   it with `animate_character` `mode: "v3"`, `custom_start_frame_url`, 4 frames (1 gen). That's how
   the tabby's side walk was made (`scripts/art-src/pets/cat-tabby/side-edited.png`).
3. `animate_character` `template_animation_id: "walk-4-frames"` for south, west, north (1 gen
   each). Check every frame at 8x: tails that come and go and drifting eyes are common. The
   tabby's back walk and the mutt's back walk are v3 redos (`mode:
   "v3"`, 4 frames, `keep_first_frame: false`, e.g. "tail held up the whole time"); the corgi's
   front-walk eyes and a pink rump speck were fixed by hand in its source frames.
4. Download `/mcp/characters/<id>/download`, copy `Idle/rotations` and `Idle/animations/walk4`
   into `scripts/art-src/pets/<family>-<coat>/`, run the script.

PixelLab ids: tabby `29b77d33-895c-43c8-89b3-75010d8ebb1b`, corgi `c0d4a263-2fd7-4306-958d-d5602e908395`, beagle
`39a99824-b919-4a32-bc42-63712e9c916f`, mutt `21e1b3e5-78c1-4e6a-9c81-7b0b5a32c424`.

## UI (2026-11-23)

Wood-and-parchment frames, chunky pixel buttons and a pixel font, in the golden-hour palette of
the world. Everything is in `client/public/ui/`, drawn at **1 art pixel = 1 CSS pixel**.

**Palette:** outline `#1B110A` (same as the characters); wood `#4A2E1C` `#7A4E2C` `#B07A45`
`#D9A562`; parchment `#FFF4D6` `#F3E2B8` `#E2C68E`; moss `#3E5E2A` `#5E8A3A` `#8FB84A`; gold
`#F2B544` `#E08A3A`; rose `#C8574A` `#8E3B2E`; glow teal `#6FC7B8`. These are CSS variables at
the top of the `<style>` in `client/index.html`.

**Font:** Jersey 15 (`ui/fonts/Jersey15.ttf`, SIL Open Font License, `OFL.txt` next to it).
One weight, so no bold: use size for emphasis (titles 30-48 px, buttons 18-20 px, small text
16 px). Pixelify Sans was tried first and dropped: its capital C looks like an O and B like 8.

**Files** (built by `node scripts/build-ui.mjs` from the PixelLab downloads in `scripts/art-src/ui/`):

| File | What | 9-slice (CSS `border-image-slice`) |
|---|---|---|
| `panel.png` 176x176 | carved wood frame + parchment, leaves and a mushroom on the corners | 64, drawn 64 px wide, border 38 px (the art overlaps the padding) |
| `btn-main / btn-wood / btn-danger(.png, -down.png)` 56x29 | green main action, wood normal, rose danger; `-down` = pressed | 11 12 13 |
| `input.png` 56x34 | parchment text field in a wood frame (bottom edge mirrored from the top: the AI cut it off) | 12 |
| `tab.png`, `slot.png`, `round.png` | spare tab, item slot, round brass-rim button (used as the joystick knob) | 10 / 14 / - |
| `bubble.png` 16x16, `bubble-tail.png` 7x5, `nametag.png` 12x12 | hand-placed pixels (no AI): chat bubble, its tail, the dark wood name plate | 6 / - / 4 |
| `joy-ring.png` 100x100 | joystick ring (hand-placed, radius = `JOY_RADIUS` in `UIScene.ts`) | - |
| `icons/<name>.png` 32x32 | coin, shop, wardrobe, friends, pets, home, decorate, store, manage, logout, chat, send, gift, close, lock, star + spares search, gear, mushroom, lantern | - |
| `login-bg.png` | the golden-hour world test scene, behind the login box | - |

**States:** hover = CSS `brightness(1.08)` (only on devices with a mouse; the AI hover art was
blotchy), pressed = the `-down` image plus 3 px lower text, disabled/locked = greyed with a padlock
icon. Top bar icons come from CSS `::before`, so code can change a button's text freely; at 900 px
and narrower the top bar shows icons only.

**In the game (Phaser):** `client/src/ui/theme.ts` loads the small images and the font;
`NameTag.ts` draws the name plate and the chat bubble with Phaser `NineSlice` (WebGL only: on the
Canvas renderer they fall back to outlined text and a plain box).

**How the art was made:** `create_ui_asset` (256 px, the palette above, 10 generations each) for
the panel and a kit of buttons/tab/slot/round button/input; `update_ui_asset(split)` then
`create_ui_states` (hover + pressed for 3 buttons, 25 generations); one `create_1_direction_object`
at 32 px with 16 `item_descriptions` for the icons (64 candidates, 10 generations; all 64 are in
`scripts/art-src/ui/icons/`, picks are listed in `ICONS` in the build script). Total 55 generations.
Every prompt starts with the owner's style sentence (see "Art direction").

**To add an icon:** pick a frame from `scripts/art-src/ui/icons/` (or generate more the same way),
add it to `ICONS` in `scripts/build-ui.mjs`, run the script, and use `/ui/icons/<name>.png`.

## Keep it original

All art must be original: no Pokémon (or other game) characters, outfits, or styles copied
closely. Check the AI tool's terms allow commercial use of what you generate.

## Placeholder art

`scripts/make-placeholder-sprites.mjs` draws the old code-only placeholder files.
**Don't run it:** it overwrites every file in `client/public/sprites/`. Use
`scripts/build-character-layers.mjs` instead.
