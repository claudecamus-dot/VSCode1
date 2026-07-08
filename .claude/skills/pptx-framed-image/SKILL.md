---
name: pptx-framed-image
description: Insert an image into a PowerPoint template "frame" so it takes the frame's EXACT shape (rounded/diagonal corners) by cloning the frame's prstGeom onto the picture — not by rounding the PNG in PIL. Ships a procedural fun/nature (summer) placeholder-image generator. Use when filling the OCTO "cadre blanc" visual placeholders (the « ici mettre une Photo » frames, round2DiagRect), when inserted images don't respect the frame's rounded borders, or when you need on-brand placeholder imagery without an image API.
---

# pptx-framed-image

Fills a template's shaped photo frame with an image that follows the frame's
corners exactly, and generates fun summer/nature placeholder images to drop in.

## Why geometry-cloning, not PIL rounding

The OCTO "cadre blanc" frame is **not** a plain rounded rectangle: it's a
`round2DiagRect` (adj1=50000, adj2=0) — one diagonal pair of corners rounded,
the other pair square. Rounding the PNG with a uniform PIL radius can never
match that, so the corners poke out or leave white gaps.

Instead: place the picture at the frame's rendered bounds, then **clone the
frame's own `<a:prstGeom>` onto the picture's `<p:spPr>`**. PowerPoint clips the
image to the identical preset shape (same preset, same adjustments) — correct
for `round2DiagRect` and any other preset, with no pixel guessing.

## Instructions

### Step 1 — read the frame's geometry from the layout
The frame lives in a slide *layout* as a group whose inner shape carries the
`prstGeom`. Read its rendered bounds (from the group) and geometry (from the
inner shape):

```python
import sys; sys.path.insert(0, ".claude/skills/pptx-framed-image/scripts")
from framed_image import frame_geometry, place_image_in_frame, round2diag_geom

# group_shape = the layout group that positions the frame
left, top, width, height, geom = frame_geometry(group_shape, "Google Shape;213;p17")
```

If you already know the preset (OCTO cadre blanc), skip the lookup and build it:
`geom = round2diag_geom(50000, 0)` with bounds
`FR_63 = (6270019, 304800, 2593200, 3705000)` (visuel à droite) /
`FR_67 = (571494, 306825, 2593200, 3705000)` (visuel à gauche).

### Step 2 — crop the image to the frame aspect FIRST
Clipping preserves aspect; it does not letterbox. Crop the source to the frame's
`width/height` ratio (≈ 0.700 for the cadre blanc) before inserting, so the
preset clip lands cleanly with no distortion. A **stretched** picture (source
aspect ≠ frame aspect, `stretch fillRect`) is the #1 "image looks off in the
frame" bug. Do it in one call:

```python
from framed_image import cover_crop_to_aspect
aspect = width / height                      # EMU ratio, ≈ 0.700
cover_crop_to_aspect("photo_raw.jpg", "photo.png", aspect)   # center cover-crop
```

### Step 3 — insert and clip
```python
place_image_in_frame(slide, "photo.png", left, top, width, height, geom=geom)
```
The picture is dropped at the exact frame bounds and clipped to `geom`.

### Step 3b — audit the frame region BEFORE trusting the render
The framed image's visible border/edge comes from the **layout/master**, not the
picture. When you resize or refill a frame you expose whatever the old picture
used to cover — the frame shape's own `<a:ln>` border, a stray
`straightConnector1` on the edge, a teardrop poking one pixel past the bounds.
These read as a *partial black border / sliver / stray line*, and a glance at the
render misses them (dark photo content hides thin lines).

```python
from framed_image import frame_obstructions
for o in frame_obstructions(slide, left, top, width, height):
    print(o["source"], o["id"], o["name"], o["reason"])   # empty list == clean
```
Fix each hit at its source in the layout: set the frame shape's line to `noFill`
to drop a border (match a clean reference frame that has fill + `ln=noFill`), or
delete/hide the stray connector. A layout is often shared by 2+ slides — check
`layout -> slides` before editing so you don't disturb another slide.

### Step 4 — fun / nature placeholder images (optional)
When you have no real photo yet, generate an on-theme summer placeholder
(« L'Été de l'IA ») instead of leaving « ici mettre une Photo »:

```python
from nature_images import generate_to
# size = frame aspect; corners are added by the clip in Step 3, NOT here
generate_to("sunset.png", "sunset", 900, 1286, seed=0)
```
Scenes: `sunset`, `ocean`, `mountains`, `forest`, `tropical`, `meadow`.

### Step 5 — verify by real render
Geometry checks are not enough for visuals: render the deck to images
(LibreOffice, or PowerPoint COM on Windows) and look — confirm every frame is
filled, corners follow the frame, nothing overflows. Pairs with the
`pptx-verify` skill.

## Known pitfalls (all hit in real use — the audit catches them)
- **Stretched image** — source aspect ≠ frame aspect + `stretch fillRect`. Fix
  with `cover_crop_to_aspect` (Step 2), not by resizing the picture.
- **Frame border** — the frame shape on the layout carries the visible outline
  (`<a:ln>`) and fill, *not* the picture. Two frames that look different usually
  differ only in this `a:ln`. To match a clean frame: fill + `ln=noFill`.
- **Stray edge line** — a `straightConnector1` decoration sitting on the frame
  edge shows once the picture no longer overlaps it. Delete it from the layout.
- **White mask / z-order** — a template white rectangle placed *in front* of the
  frame clips an enlarged picture's corner. Move it behind the picture (it still
  masks its layout target). `frame_obstructions` scans layout+master; front-of-
  picture slide masks are a separate manual z-order check.

## Tests
`python .claude/skills/pptx-framed-image/tests/test_framed_image.py` (9 tests)
checks: the built preset's adjustments; that the inserted picture carries the
frame preset (exactly one geometry child, schema-ordered after `xfrm`) at the
frame bounds; that it stays inside the slide; that `geom=None` leaves a plain
rect; that every nature scene renders at the requested size; that
`cover_crop_to_aspect` hits the frame aspect with no stretch; and that
`frame_obstructions` flags a stray edge line / frame border while ignoring a
shape fully covered by the frame.

## Environment notes
- Windows here has PowerPoint COM (only reliable pptx→image route) and
  LibreOffice, but no poppler/pdftoppm (no PDF→PNG).
- Pure Pillow + python-pptx; no network, no image API.
