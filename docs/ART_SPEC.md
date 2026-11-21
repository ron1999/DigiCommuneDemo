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
- The top of the head is around y = 20-24. The name tag floats just above it.
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

## Making it with an AI pixel-art tool

AI tools are good at single characters and weak at keeping separate pieces lined up across
frames. A workflow that tends to work:

1. **Make one base character first:** a plain, bald body in the 4 directions with a walk cycle,
   at 128 x 128 per frame, transparent background. Tools with "rotations" + "walk animation"
   features (e.g. PixelLab) do this well. This becomes `body.png` (+ `face.png`).
2. **Make each piece on that same base** using the tool's "edit / inpaint / reference image"
   feature, e.g. "add short hair" on each frame, so the hair sits exactly where the head is.
3. **Cut the piece out:** erase everything except the new part (the hair, the hoodie...) in a
   pixel editor (Aseprite, Piskel, or Libresprite, which is free) and save it as its own layer file.
4. **Turn recolorable pieces grey:** desaturate the layer (Hue/Saturation -> saturation 0),
   then adjust brightness so the main area is around mid grey.
5. **Line up and export** as a 640 x 512 sheet in the layout above.

Before generating a lot, test one file: replace `hair-0.png`, reload the game, and check it in
the wardrobe and while walking in all 4 directions.

## Keep it original

All art must be original: no Pokémon (or other game) characters, outfits, or styles copied
closely. Check the AI tool's terms allow commercial use of what you generate.

## Placeholder art

`scripts/make-placeholder-sprites.mjs` draws the current placeholder files.
**Don't run it after adding real art:** it overwrites every file in `client/public/sprites/`.
