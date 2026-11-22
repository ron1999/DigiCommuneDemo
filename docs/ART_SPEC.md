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
layer) in a plain white tank top and grey shorts (underwear), one warm skin tone for now.

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

Clothing will be fitted to 6 key bodies only (per gender: slim, average, heavyset; lean -> slim,
stocky -> average, soft and muscular share a fit), to keep PixelLab costs at about 180
generations per item instead of 600. Head items (hair, hats, glasses, bandanas, piercings)
are planned as one sheet per gender placed per frame, still to be tested.

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
  `create_image_pixen` 32px sprites for the tree, mushrooms, door and doormat). `tileset.ts` draws
  the old code tiles first, then swaps in each tile of the PNG once it loads.
- **Furniture**: `client/public/furniture/furniture_N.png`, one file per piece at its slot size in
  game pixels (64 per tile). Built by `node scripts/build-furniture.mjs` from
  `scripts/art-src/furniture/frame_N.png`, which came from ONE `create_1_direction_object` call
  (size 64, 16 `item_descriptions`, 10 generations; frames 14-15 are spare: mushroom lamp,
  hanging plant). `furniture.ts` loads them itself and falls back to the code-drawn pieces.
- To add a piece: generate it at 64 x 64, save it as the next `frame_N.png`, add its slot to
  `SLOTS` in the script, and add it to `FURNITURE` (+ the SQL items) as usual.

## Keep it original

All art must be original: no Pokémon (or other game) characters, outfits, or styles copied
closely. Check the AI tool's terms allow commercial use of what you generate.

## Placeholder art

`scripts/make-placeholder-sprites.mjs` draws the old code-only placeholder files.
**Don't run it:** it overwrites every file in `client/public/sprites/`. Use
`scripts/build-character-layers.mjs` instead.
