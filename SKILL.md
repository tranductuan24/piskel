---
name: piskel-console-ui
description: Use when creating or editing Piskel pixel art; enforces strict one-line chain syntax, subject-specific completeness, measured geometry, complete outline topology, palette planning, visual QA, and refinement.
---

# Professional Piskel Drawing with Console UI

Use the in-app **`>_ API`** panel in `chain` mode as the default interface. The goal is not merely to produce valid pixels: deliver deliberate, readable, polished pixel art backed by measured geometry, complete edge topology, a controlled palette, deterministic commands, and visual review.

Do not start drawing immediately after reading the request. Do not submit a rough block-in, random pixel scatter, a minimally recognizable icon, or an object with missing contour segments as finished work. A missing intended top, bottom, side, corner, cap, or face-separation edge is a hard failure—not a minor polish issue.

## Default execution policy

- Open **`>_ API`** and keep **Command** set to `chain` by default.
- Write planned drawing operations in the Console UI chain editor and execute them there.
- Use multiple reviewed chain phases while developing; combine them into one reproducible chain only after validation.
- Keep every executable chain command and its complete JSON argument object, when present, on one physical editor line. This rule also applies to `draw.pixels`, regardless of array length.
- Prefer several named, compact, one-line `draw.pixels` commands over one unreadably large pixel payload.
- Switch to one-command mode only when a payload genuinely needs multiline editing, such as a very large `draw.pixels`, `document.write`, `frame.write`, or base64 import. Run that single operation, verify it, and switch immediately back to `chain`.
- Use `window.piskelAPI` directly only for a real data dependency that chains cannot express.
- Do not use DevTools, `eval`, private `pskl.*` mutation, or ad-hoc DOM drawing as a shortcut.

## Critical chain grammar — one physical line per command

Chain mode is a **line-oriented command script**, not a multiline JSON parser. The Console splits the source at every carriage return/newline and parses each non-comment physical line independently as:

```text
command.name {"complete":"JSON object on this same physical line"}
```

This is a hard execution invariant. Every executable chain example in this skill follows it except the one code block explicitly labeled **Invalid chain source**:

```text
one executable physical line = one command token + zero or one complete JSON object
```

A line may become long and appear visually wrapped by the editor. A **soft visual wrap is safe** because it inserts no newline. Pressing Enter, pasting pretty-printed JSON, or inserting an actual newline inside the command creates a new physical line and breaks the command.

### Valid chain source

Every executable line below starts with a registered command and ends with its complete JSON object on that same line:

```text
# Comments may occupy their own physical lines.
draw.rect {"layer":1,"frame":0,"x":4,"y":3,"width":12,"height":14,"color":"#26344f","fill":true}
draw.pixels {"layer":1,"frame":0,"pixels":[{"x":6,"y":5,"color":"#f4d35e"},{"x":9,"y":5,"color":"#f4d35e"},{"x":7,"y":9,"color":"#d95d39"},{"x":8,"y":9,"color":"#d95d39"}]}
frame.read {"layer":1,"frame":0,"format":"sparse"}
```

### Invalid chain source — never paste this in `chain`

The following pretty-printed `draw.pixels` command is invalid even though the JSON would be valid in a normal JSON editor:

```text
# INVALID: the command arguments were split across physical lines.
draw.pixels {
  "layer": 1,
  "frame": 0,
  "pixels": [
    {"x": 6, "y": 5, "color": "#f4d35e"},
    {"x": 9, "y": 5, "color": "#f4d35e"}
  ]
}
```

The first line asks Piskel to parse only `{`, so it reports `Chain line <N> has invalid JSON` and parsing stops. The later fragments cannot continue it; under the grammar, each physical line would be a separate command line. Do not add backslashes, trailing commas, JavaScript comments, or other continuation syntax—chain has no continuation syntax.

Correct it by compacting the entire command onto one physical line:

```text
draw.pixels {"layer":1,"frame":0,"pixels":[{"x":6,"y":5,"color":"#f4d35e"},{"x":9,"y":5,"color":"#f4d35e"}]}
```

### JSON rules inside a chain line

- Use double quotes for every JSON key and string; single quotes are invalid JSON.
- Use lowercase `true`, `false`, and `null`; do not use Python/JavaScript spellings such as `True`, `False`, `None`, or `undefined`.
- Use literal integer coordinates. Expressions such as `8+2`, variables, comments, functions, and hexadecimal numeric literals are not JSON.
- Do not leave a trailing comma before `}` or `]`.
- Arguments must be one JSON **object**, not a top-level array, string, number, or `null`.
- A command that needs no arguments may omit them or use `{}`.
- `#` is allowed only as the first non-whitespace character of a full comment line. Inline `# comments` become part of the argument text and invalidate JSON.
- A newline needed inside a JSON string must be encoded as `\n`; it must not be an actual line break.
- Comments and blank lines count toward the physical line number shown in an error, even though they are not executed.

### Safe `draw.pixels` chunking

Do not pretty-print a long `pixels` array. Use this priority order:

1. Replace repeated runs or solid masses with `draw.line`, `draw.rect`, `draw.ellipse`, or `draw.fill` when those primitives preserve the intended pixel geometry.
2. Split hand-authored pixels into semantic clusters such as `HEAD_OUTLINE`, `LEFT_HAND`, `BLADE_HIGHLIGHT`, or `BOTTOM_RIM`.
3. Put each cluster in a separate `draw.pixels` command whose complete JSON remains on one physical line. A practical review target is roughly 8–64 pixels per line; this is an organization guideline, not an API limit.
4. Keep cluster comments on their own `#` lines.
5. Check duplicate coordinates both within and across chunks. If a later chunk intentionally overwrites an earlier pixel, document why and place final outline repair last.
6. If a payload is still too large to edit reliably on one line, choose `draw.pixels` as a **single normal command**, paste pretty-printed JSON into **Arguments**, run and verify it, then restore Command to `chain` for all subsequent work.

Example of valid semantic chunking:

```text
# EYES — one complete command line
draw.pixels {"layer":1,"frame":0,"pixels":[{"x":6,"y":7,"color":"#f7f3e8"},{"x":9,"y":7,"color":"#f7f3e8"}]}
# BOOT BOTTOM OUTLINE — one complete command line
draw.pixels {"layer":1,"frame":0,"pixels":[{"x":5,"y":18,"color":"#171b2c"},{"x":6,"y":18,"color":"#171b2c"},{"x":9,"y":18,"color":"#171b2c"},{"x":10,"y":18,"color":"#171b2c"}]}
```

### Mandatory chain syntax preflight

Before every **Run**:

1. Confirm the Command field is exactly `chain` unless performing a declared single-command large-payload exception.
2. Scan for executable lines beginning with `{`, `}`, `[`, `]`, a quote, a comma, or a JSON key. Any such line usually means the preceding command was split.
3. Confirm every nonblank, non-comment line begins with exactly one command name and, if arguments are present, contains a complete object ending on that physical line.
4. Select **Format chain**. Formatting must succeed before execution; it parses every line and compacts each valid object without mutating the drawing.
5. Recheck that **Format chain** did not reveal an unintended command, target, color, or index.
6. Only then select **Run** or press `Ctrl/Command + Enter`.

Never ignore, work around, or describe `Chain line <N> has invalid JSON` as an art failure. It is a source-format failure. Fix the physical line first; no chain command has run when whole-chain parsing fails. By contrast, `Chain stopped at line <N> ... after <K> completed command(s)` is a runtime failure and earlier successful mutations remain applied.

## Non-negotiable quality contract

For every nontrivial drawing, the agent MUST:

1. Understand the subject, purpose, style, dimensions, background, and animation requirements.
2. Classify the deliverable as character, player, weapon, tile/tilemap, object, item, scene, effect, or an explicit combination.
3. Inspect the current editor state before changing it.
4. Produce a compact art brief, a subject-component manifest, and declared assumptions.
5. Calculate the composition, subject bounds, component boxes, anchors, symmetry, proportions, and frame/tile plan.
6. Define a small palette by visual role before assigning colors to pixels.
7. Build every required primary and structural component before decorative detail.
8. Build from silhouette to volume to material cues to controlled accents, not details first.
9. Define an outline policy and edge map for exterior, top, bottom, side, seam, and occluded edges.
10. Reapply and audit the final contour after every fill, shading, detail, and overlap pass.
11. Use deterministic, organized Console UI command chains with explicit targets and one physical line per command.
12. Validate command names, one-line JSON, indexes, dimensions, coordinate bounds, and completeness-manifest coverage.
13. Read back the resulting state/pixels and inspect the rendered image visually.
14. Perform at least one deliberate cleanup/refinement pass after the first render.
15. Run the applicable character/player/weapon/tilemap/object/item gate; recognizability alone is not completion.
16. Verify animation timing and loop continuity when multiple frames are requested.
17. Save or export only after all applicable quality gates pass.

Reason as deeply as needed, but record concise decisions, measurements, and checks rather than a stream-of-consciousness transcript.

## Definition of done

A drawing is complete only when both categories pass.

### Technical correctness

- Canvas, layer count, frame count, FPS, and background match the request.
- Every command succeeded; no chain error is ignored.
- Every chain command and complete argument object occupy one physical line; **Format chain** passes before Run.
- Every coordinate is an integer inside the intended frame.
- Shape extents and pixel arrays are within bounds.
- Commands target explicit layers/frames where ambiguity is possible.
- Every component marked required in the subject manifest is present, intentionally occluded, or explicitly outside the agreed scope; nothing is silently omitted.
- Fill/shading commands do not overwrite protected outline pixels.
- Every required exterior contour and visible face boundary is present after final compositing.
- Readback confirms expected dimensions, metadata, colors, outline extrema, and key pixels.
- No accidental palette, setting, selection, or current-frame state remains.

### Visual quality

- The silhouette reads at 1× scale and its intended exterior contour is continuous.
- The subject contains the identity-bearing, structural, functional, material, and integration cues required by its class and agreed resolution tier.
- Major components have deliberate proportion, attachment, overlap, and depth; the result is not a generic blob with decorative pixels.
- Topmost and bottommost visible forms are outlined according to the declared outline policy.
- Visible top/front/side/bottom faces have deliberate, connected edge ownership with no accidental gaps.
- Composition is balanced and important forms have breathing room.
- Values separate subject, background, shadow, and focal details.
- Lighting direction and material treatment are consistent.
- Pixel clusters are intentional; stray pixels and noisy checker patterns are removed.
- Curves and diagonals use controlled stair steps rather than jagged accidents.
- Details support the focal point instead of filling every empty area.
- The image has received a visual cleanup pass after its first complete render.
- Animation has clear poses, stable volumes, useful timing, and a clean loop.

Before completion, mark each applicable gate `PASS` with concrete evidence:

| Gate | Required evidence | If it fails |
| --- | --- | --- |
| Brief | Subject class, deliverable scope, style, canvas, background, focal point, and assumptions recorded | Clarify or revise the brief |
| Component coverage | Applicable subject blueprint selected; every required component has a status and pixel/occlusion evidence | Add missing structure before decoration |
| Geometry | Bounds, centers, anchors, proportions, component attachments, and all extents calculated | Recalculate before drawing |
| Palette | Every color has a role and useful value separation | Remove/replace colors |
| Silhouette | Subject reads at 1× without interior detail | Redesign major masses |
| Outline topology | Exterior loop, top/bottom extrema, corners, visible face seams, and occlusion transitions are complete | Repair contour and rerun outline audit |
| Form/light | Shading follows one declared light model | Rebuild shadow/light planes |
| Pixel craft | Clusters and contour steps are intentional; no obvious noise | Perform cluster cleanup |
| Technical | Commands succeed and readback matches dimensions/pixels | Fix smallest failing phase |
| Visual review | Actual render inspected at 1× and zoom | Capture and inspect it |
| Animation | Poses, anchors, timing, volume, and loop inspected | Revise frames/timing |

Any applicable gate without evidence is not a pass. `N/A` is acceptable only with a clear reason.

Complexity must be proportional to the request. More commands do not automatically mean better art; every command must have a visual purpose.

## Anti-sloppiness completeness standard

“Recognizable” and “technically rendered” are not synonyms for “complete.” A sword-shaped line, a humanoid blob with two eye pixels, one repeating terrain square, or a shaded rectangle presented as a finished prop fails even if the intended subject can be guessed.

A deliberate minimalist style may use very few pixels, but each retained pixel must solve a required job. Simplification means compressing anatomy, construction, function, and material into efficient clusters; it does not mean silently dropping them.

### Six required levels of completeness

Every subject must pass all applicable levels in this order:

1. **Semantic identity** — the class, role, action/state, view, and focal identity are unmistakable.
2. **Primary construction** — all major masses and identity-bearing components exist at planned proportions.
3. **Structural connection** — joints, sockets, handles, seams, supports, contacts, overlaps, and occlusions explain how components connect.
4. **Volume and material** — planes, light, shadow, thickness, openings, and material cues describe form rather than decorate a flat shape.
5. **World/UI integration** — ground contact, hand attachment, tile seams, icon padding, depth order, or other context-specific integration is correct.
6. **Pixel finish** — outline closure, cluster cleanup, focal hierarchy, readback, visual inspection, and the class-specific gate pass.

A later level cannot compensate for a missing earlier level. Texture does not replace anatomy. Glow does not replace weapon construction. A label does not replace a bottle rim. Grass speckles do not replace tile transitions. Highlights do not replace an object's missing top or bottom face.

### Required component status model

Before drawing, list every applicable component and assign exactly one status:

- **VISIBLE — REQUIRED**: must receive explicit geometry and pixel evidence.
- **PARTLY OCCLUDED**: draw the visible segment and name the form that owns the covering edge.
- **FULLY OCCLUDED**: acceptable only when the pose/view logically hides it; record its attachment location so surrounding geometry remains correct.
- **OUTSIDE AGREED SCOPE**: acceptable only because the requested crop, animation set, terrain system, or deliverable explicitly excludes it.
- **N/A BY DESIGN**: the subject genuinely does not have that component; state the design reason when omission could look accidental.

“Forgotten,” “too hard,” “canvas was getting full,” and “the silhouette is already recognizable” are never valid statuses. `N/A BY DESIGN` must follow from the brief established before drawing; it cannot be assigned retroactively to excuse a failed component. Do not hide difficult hands, feet, weapon junctions, inner tile corners, or object undersides behind arbitrary occluders merely to avoid drawing them.

Use this manifest before mutation:

```text
SUBJECT COMPLETENESS MANIFEST
Class/scope: <character | player | weapon | tile/tilemap | object | item | combination>
Deliverables: <single sprite, animation, atlas, map, icon set, etc.>
Resolution tier: <micro, compact, production, illustrated>
Identity-bearing features: <required list>
Primary masses/components: <required list>
Structural connections: <required joints/seams/sockets/supports>
Visible faces/openings: <top/front/side/bottom/interior and ownership>
Functional cues: <what proves use/gameplay/category>
Material cues: <one or more cues per visible material>
Contact/integration: <ground, hand, grid, UI bounds, neighboring tile, etc.>
Occlusion map: <front component -> covered component/edge>
Intentional exclusions: <item + reason>
Proof reads: <rows/sparse pixels and key coordinates to inspect>
```

Keep a compact version in chain comments. Expand it into a coverage ledger for every nontrivial subject:

| Component | Status | Bounds/anchors | Attachment/edge owner | Form/material cue | Pixel/readback evidence | Visual result |
| --- | --- | --- | --- | --- | --- | --- |
| `<name>` | `VISIBLE — REQUIRED` | `<x0..x1,y0..y1>` | `<joint/seam/occluder>` | `<required cue>` | `<key coordinates/read>` | `PENDING` |

After rendering, change `PENDING` to `PASS` only when actual pixels **and** the visual render prove it. Required-component coverage is binary: `9/10` is a failure, not “90% complete.” Every required row must pass before decorative polish, export, or a completion claim.

Mandatory stop conditions—do not export, save as final, or report completion while any applies:

- Any chain parse/runtime error is unresolved.
- Any required manifest row is `PENDING`, `FAIL`, or missing evidence.
- A difficult component was replaced by arbitrary occlusion, crop, glow, shadow, or background merge.
- Only silhouette/block-in or only one render pass has been completed for a nontrivial subject.
- Top/bottom extrema, component attachments, class-specific function, or final composite have not been audited.
- The image was not actually viewed; in that case report the visual gate as unverified, not passed.
- The deliverable name promises more states, directions, tiles, views, variants, or outputs than were produced.

### Detail hierarchy — build in this order

Allocate pixels and contrast by priority:

| Priority | Content | Completion rule |
| --- | --- | --- |
| A — identity | Head/face shape, player marker, weapon head/profile, terrain boundary, object function, item category cue | Must survive at 1× and silhouette/value-group inspection |
| B — structure | Anatomy, joints, grip, socket, supports, face planes, tile transitions, openings | Must explain attachment and volume before texture begins |
| C — material | Metal edge, wood grain direction, cloth fold clusters, glass rim/liquid, stone planes | Add at least one truthful cue for each important material |
| D — narrative wear | Chips, scratches, patches, decals, small props | Add only where they support history, scale, or focus |
| E — garnish | Sparkles, noise, extra highlights, decorative specks | Optional; delete first when they reduce clarity |

Never spend Priority D/E pixels while a Priority A/B requirement is missing or ambiguous.

### Resolution tiers and honest simplification

Choose a tier from actual canvas/subject occupancy, not from wishful detail:

| Tier | Typical occupied size | Required treatment |
| --- | --- | --- |
| Micro | roughly `8–16 px` on the shorter subject axis | Encode each major component as a clean cluster; use symbolic face/material cues; no random one-pixel texture |
| Compact | roughly `17–32 px` | Separate major masses, attachments, front/back overlap, at least three useful value roles, and class-defining subcomponents |
| Production | roughly `33–64 px` | Show joint/face transitions, thickness, material changes, controlled secondary forms, and stronger class-specific detail |
| Illustrated | above roughly `64 px` | Resolve secondary anatomy/construction, larger plane changes, controlled texture zones, and local material behavior without abandoning pixel clusters |

These are planning ranges, not permission to omit requested content. If all required information cannot fit:

1. Enlarge the canvas or reduce empty margins if the request allows.
2. Simplify low-priority garnish before structural features.
3. Use a more informative view or pose.
4. Convert tiny literal parts into readable symbolic clusters while preserving their location and role.
5. Ask for a scope/resolution decision when the conflict materially changes the deliverable.

Do not silently deliver an incomplete “draft” and label it final.

### Required scope naming

Name the deliverable honestly:

- One pose is a **single character/player sprite**, not a complete character sheet.
- One loop is an **animation**, not a complete player animation set.
- One repeating square is a **tile**, not a complete tileset or tilemap.
- A collection of tiles is a **tileset/atlas**; their arranged scene is a **tilemap**.
- One weapon view is a **weapon sprite/icon**, not a turnaround or full weapon pack.
- One inventory image is an **item icon**, not automatically a world pickup and UI set.

When the user asks for “complete,” “game-ready,” “full set,” or equivalent, list the exact views, states, transitions, variants, and outputs before drawing. Unnamed missing deliverables are a planning failure.

## Mandatory workflow

### Phase 1 — Interpret the request

Extract or decide:

- **Subject and action**: what is depicted and what it is doing
- **Subject class**: character, gameplay player, weapon, tile/tilemap, world object, inventory/pickup item, or combination
- **Deliverable scope**: single sprite, crop, facing direction, animation set, tileset topology, arranged map, icon set, turnaround, etc.
- **Use case**: icon, game sprite, portrait, tile, item, animation, concept
- **Style**: cute, realistic, retro, limited-palette, outlined, isometric, etc.
- **View**: front, side, top-down, three-quarter, isometric
- **Canvas**: width and height
- **Background**: transparent, flat color, scene, or tileable
- **Animation**: frame count, FPS, loop behavior, key action
- **Completeness promise**: exact required components/states/transitions and any exclusions
- **Constraints**: required colors, palette limit, symmetry, existing content to preserve

If the wording `titlemap` is ambiguous, determine from context whether it means **tilemap/tileset** or a title-screen/map graphic; clarify when those would produce different deliverables.

Ask a concise clarification only when an unresolved choice would materially change the result. Otherwise state reasonable assumptions in the art brief. Never resolve ambiguity by choosing the smallest or easiest scope without saying so.

### Phase 2 — Inspect and preserve

Open **`>_ API`**, keep Command set to `chain`, and run a read-only inspection:

```text
app.state
document.state {"pixels":"none"}
settings.state
history.state
```

If modifying an existing drawing, also inspect the relevant pixels:

```text
frame.read {"layer":0,"frame":0,"format":"sparse"}
document.read {"pixels":"all","format":"uint32"}
file.state {"includeSerialized":true}
```

Before destructive work on existing content, copy/download a full snapshot or serialized file. Do not use `document.new` unless replacement is intended.

### Phase 3 — Write the art brief

Create this compact planning record before mutation:

```text
ART BRIEF
Purpose: <where the art will be used>
Class/scope: <subject class and exact deliverables>
Subject/action: <clear one-sentence description>
Canvas/background: <W×H, transparent or color>
Resolution tier: <micro, compact, production, illustrated>
View/style: <viewpoint and pixel-art treatment>
Focal point: <highest-priority feature>
Light: <direction, softness, material response>
Subject bounds: <x0..x1, y0..y1>
Major proportions: <head/body/item ratios or shape hierarchy>
Required components: <identity, primary masses, structural connections>
Functional/material cues: <what proves purpose and materials>
Contact/integration: <ground, hand, grid neighbors, UI padding, etc.>
Occlusion/exclusion map: <what is hidden or outside scope and why>
Outline policy: <full dark, colored, selective, thickness, allowed exceptions>
Face/edge map: <top, front, side, bottom, shared seams, hidden edges>
Palette roles: <outline, shadow, base, light, highlight, accents>
Layers: <ordered bottom to top; include Outline layer if used>
Frames/tiles/FPS: <count, topology, timing, loop plan>
Proof plan: <class-specific gate, reads, screenshots, seam/repeat test>
Risks: <small details, clipping, readability, symmetry, etc.>
```

Put a short version in `#` comments at the top of the final command chain. **Format chain** preserves comment and blank lines while normalizing command lines.

### Phase 4 — Calculate geometry

Use integer pixel geometry before writing commands.

For canvas width `W` and height `H`:

```text
cx = (W - 1) / 2
cy = (H - 1) / 2
margin target = max(1, round(min(W, H) × 0.08))
x1 = x0 + objectWidth - 1
y1 = y0 + objectHeight - 1
mirrorX(x) = x0 + x1 - x
```

For a centered object of width `bw` and height `bh`:

```text
x0 = floor((W - bw) / 2)
y0 = floor((H - bh) / 2)
x1 = x0 + bw - 1
y1 = y0 + bh - 1
```

Bounds checks:

```text
0 <= x0 <= x1 < W
0 <= y0 <= y1 < H
x + rectangleWidth  <= W
y + rectangleHeight <= H
```

Example for a `24×24` canvas and a centered `16×19` subject:

```text
W=24, H=24
bw=16, bh=19
x0=floor((24-16)/2)=4, x1=19
y0=floor((24-19)/2)=2, y1=20
horizontal symmetry axis lies between x=11 and x=12
mirrorX(x)=23-x
margins: left=4, right=4, top=2, bottom=3
```

Before drawing, calculate and record:

- Overall subject bounding box and intended canvas occupancy (often 65–85% for a standalone icon, adjusted for the brief)
- Major component boxes and overlap order
- Identity-bearing component boxes; reserve space for them before low-priority detail
- Character line of action, ribcage/pelvis masses, visible joint landmarks, and limb tapers when applicable
- Player foot anchor, collision-facing footprint, equipment socket, and per-state occupancy when applicable
- Weapon action axis, grip interval, functional-end profile, thickness/taper, attachment sockets, and held angle when applicable
- Tile dimensions, atlas cells, edge signatures, adjacency masks, transition variants, and composed-map bounds when applicable
- Object perspective axes, support/contact points, face vertices, openings, wall thickness, and interactive part when applicable
- Item icon padding, optical center, baseline, stack overlap, category cue, and world-pickup anchor when applicable
- Ground/contact line or motion anchor
- Symmetry axis and any intentional asymmetry
- Outline thickness and diagonal step rhythm
- Topmost and bottommost occupied rows/columns and their protected contour pixels
- Row spans or polygon vertices for every visible top/front/side/bottom face
- Ownership of each shared face seam so it is drawn exactly once
- Highlight/shadow regions based on the light direction
- Animation offsets/rotations for every frame

Do not improvise coordinates line by line without a geometric plan.

### Phase 5 — Design the palette

Assign colors by role, not by spontaneous preference:

```text
Background / transparency
Outline or deepest occlusion
Deep shadow
Shadow
Base/local color
Light
Specular/highlight
Primary accent
Secondary accent (only if needed)
```

Starting targets, adjusted for style:

- `8×8` to `16×16`: about 3–7 purposeful colors
- `24×24` to `48×48`: about 5–12 purposeful colors
- Larger scenes: add colors only when they create a new material, depth plane, or focal role

Palette rules:

- Keep adjacent value steps visibly distinct.
- Reserve the brightest and/or most saturated color for focal information.
- Prefer hue-shifted shadows and lights when appropriate; avoid mechanically adding black/white.
- Avoid pure black outlines unless the requested style needs them.
- Reuse colors across components to unify the piece.
- Check that the silhouette and major planes remain readable in grayscale/value terms.
- Use only full `#RRGGBB` values in draw commands, or `transparent`.

Record the final palette before coding and use the exact same hex values consistently.

### Phase 6 — Plan layers and frames

Use semantic layers, ordered bottom to top. Typical structure:

```text
0 Background
1 Rear effects / rear limbs
2 Main silhouette / body
3 Foreground details / highlights
4 Front effects (optional)
5 Outline / ink repair (optional, always above the fills it protects)
```

For a simple object, keep fill and outline on one layer and redraw protected contour pixels last. For a complex multi-face or multi-part object, use a dedicated top outline layer so later face fills cannot erase the contour. Do not place an outline layer below a fill/detail layer that is allowed to cover it.

Do not create layers with no purpose. For small sprites, one object layer plus background may be enough.

For animation, define before drawing:

- Frame count and FPS
- Key poses
- Contact/anchor point that should remain stable
- Per-frame displacement table
- Which elements overlap in front/behind
- Where holds, anticipation, impact, recovery, and loop closure occur

Example offset table for a four-frame idle loop:

| Frame | Body Y | Secondary motion | Timing role |
| --- | ---: | --- | --- |
| 0 | 0 | neutral | base pose |
| 1 | -1 | delayed by 0 px | rise |
| 2 | -1 | delayed by 1 px | hold/apex |
| 3 | 0 | settle by 1 px | return |

Do not duplicate frames without an intentional hold or visible timing purpose.

### Phase 7 — Engineer outline and face topology

Treat outlines as planned geometry, not decoration added from memory. Before any fill command, classify every intended edge:

| Edge class | Rule |
| --- | --- |
| Exterior silhouette | Must remain visible and connected unless the declared style explicitly uses a selective/lineless edge |
| Top/bottom extremum | Must contain the planned cap/rim/terminal contour; never assume a side outline implies it |
| Visible face seam | Draw exactly once with the chosen separator value |
| Occlusion boundary | The front form owns the visible edge; remove the hidden rear edge |
| Hidden/shared edge | Do not draw through the covering face/object |
| Lit selective contour | May use a lighter outline color only when declared in the outline policy |
| Contact edge | Deliberately choose outline, cast shadow, or merge—not accidental disappearance |

#### Choose one outline policy

Record one policy before drawing:

1. **Full outline** — every exterior boundary pixel belongs to the allowed outline palette.
2. **Colored outline** — exterior boundaries remain complete, but lit and shadow sides use declared dark/light outline colors.
3. **Selective outline** — specific lit or contact segments may omit dark ink; every exception must be named in the art brief and still read against the background.
4. **Lineless** — forms rely on value/color boundaries; this must be requested or deliberately chosen and must not be confused with missing pixels.

If no policy is specified, default to a complete one-pixel colored/dark exterior outline. Do not silently switch to selective or lineless treatment to excuse a gap.

#### Build an edge map

For each visible component or face, record:

```text
Face/component: <name>
Bounds/vertices or row spans: <calculated geometry>
Exterior edges owned: <top, upper-left, upper-right, side, lower-left, lower-right, bottom>
Visible seams owned: <face transitions>
Edges hidden by: <front component/layer>
Protected extrema: <top row, bottom row, left/right terminal pixels>
Allowed outline colors: <exact #RRGGBB list>
```

For isometric or pseudo-3D objects, explicitly map top, front, side, and visible bottom/underside faces. A face is not complete merely because its interior color exists; its outer slopes, cap, corners, and shared seams must connect.

#### Reserve scanline endpoints

For a full one-pixel outline, plan every silhouette row as a span:

```text
y = row: xLeft .. xRight
```

- `xLeft` and `xRight` are protected contour pixels.
- Fill only `xLeft + 1 .. xRight - 1` when the span has an interior.
- A span one or two pixels wide may be entirely outline.
- Adjacent row endpoints must connect according to the intended 4- or 8-connected contour rhythm.

Perform the equivalent column check for top and bottom boundaries:

```text
x = column: yTop .. yBottom
```

- `yTop` and `yBottom` are protected.
- The global topmost and bottommost occupied rows require explicit commands or explicit documented exceptions.
- At diagonal caps, verify the terminal pixel/run connects to both neighboring slopes.

This row/column reservation is mandatory for objects whose top or bottom outline has previously disappeared.

#### Use overwrite-safe draw order

Missing top/bottom outlines are commonly caused by drawing dark ink first and then painting face fills or highlights over it. Use this order:

```text
1. OUTLINE UNDERPAINT — establish silhouette/edge mask
2. FACE FILLS — write only inside protected boundaries
3. SHADOW AND LIGHT — remain inset unless intentionally coloring an exterior edge
4. INTERNAL SEAMS — draw each visible face boundary once
5. DETAILS / OVERLAPS — apply planned occlusion
6. OUTLINE REPAIR — redraw all protected exterior and seam pixels after every overwrite-capable pass
7. OUTLINE AUDIT — read rows/sparse pixels and inspect the rendered contour
```

For rectangular/block forms, an overwrite-safe pattern is:

```text
# Outer ink mass first
draw.rect {"layer":1,"frame":0,"x":4,"y":3,"width":16,"height":18,"color":"#1b1f3a","fill":true}
# Inset fill cannot touch top/bottom/side outline
draw.rect {"layer":1,"frame":0,"x":5,"y":4,"width":14,"height":16,"color":"#5d7bd9","fill":true}
# Final explicit repair after shading/details
draw.line {"layer":1,"frame":0,"x1":4,"y1":3,"x2":19,"y2":3,"color":"#1b1f3a"}
draw.line {"layer":1,"frame":0,"x1":4,"y1":20,"x2":19,"y2":20,"color":"#1b1f3a"}
```

For irregular top/bottom faces, use calculated row spans and `draw.pixels`/`draw.line` to restore the exact cap, slopes, corners, lower rim, and terminal pixels. Never repair only the left/right sides.

#### Mandatory top/bottom face audit

After all fills and details, inspect each object/component using `frame.read` on its transparent object/outline layer when possible:

```text
frame.read {"layer":1,"frame":0,"format":"rows"}
frame.read {"layer":1,"frame":0,"format":"sparse"}
```

Check all of the following:

- **Top extreme**: the first occupied row has the intended outline/cap pixels.
- **Upper corners**: top edge connects to both side slopes without a one-pixel gap.
- **Face seam**: top-to-front or top-to-side transition is continuous and drawn once.
- **Left/right sides**: every row transition remains connected.
- **Lower corners**: side contours connect to the bottom slopes/rim.
- **Bottom extreme**: the last occupied row contains the planned terminal outline pixels.
- **Contact/underside**: any omitted bottom segment is justified by cast shadow, ground contact, or occlusion—not an overwrite.
- **Composite result**: a higher layer has not covered an edge that should remain visible.

For a full-outline style, derive the silhouette mask from nontransparent object pixels. Any occupied pixel adjacent to transparent/background space is a boundary pixel and must use one of the declared outline colors. Pay special attention to the global `minY`, `maxY`, `minX`, and `maxX` boundary sets.

A contour passes only when it forms the intended continuous loop under the chosen connectivity. Intentional holes, openings, contact merges, and selective-outline exceptions must be recorded; unexplained gaps fail the gate.

#### Common outline failures and required correction

| Failure | Typical cause | Required correction |
| --- | --- | --- |
| Missing top rim/cap | Interior fill or highlight reused `yTop` | Inset fill and redraw the complete top run last |
| Missing bottom rim | Shadow/background/ground overwrote `yBottom` | Assign edge ownership and redraw bottom terminal pixels after shadows |
| Broken upper/lower corner | Diagonal row spans do not meet | Recalculate endpoint progression and add the connecting pixel |
| One face looks detached | Shared seam omitted or split across layers | Assign one face as seam owner and draw one continuous separator |
| Double-thick seam | Both adjacent faces drew the same boundary | Keep only one seam owner |
| Outline disappears on lit side | Highlight touches exterior unintentionally | Inset highlight or use a declared lighter outline color |
| Rear outline shows through | Hidden edge drawn before front occluder | Remove the hidden segment; let the front form own the boundary |
| Outline vanishes only in composite | Higher layer overlaps it | Move/repair outline on a higher layer or correct overlap geometry |
| Flood fill leaks through a face | Outline loop had a gap before `draw.fill` | Close/audit the boundary first, then verify the fill seed and result |
| Bottom merges into background | Outline and background have insufficient contrast | Use a darker/lighter outline role or deliberate cast shadow |

Do not proceed to final export while any unexplained outline gap remains.

### Phase 8 — Build a professional command plan

Organize commands broad-to-fine:

1. Create or inspect the document.
2. Create/select semantic layers and frames.
3. Clear or establish the background.
4. Draw the outline underpaint, outer silhouette, and largest masses.
5. Draw every Priority A identity component and Priority B structural connection from the subject manifest.
6. Add inset interior base-color planes without touching protected contour pixels.
7. Add cast/form shadows according to the declared light.
8. Add truthful material cues without accidentally erasing lit-side edges.
9. Add facial/gameplay/functional focal details and only then controlled accents.
10. Apply planned overlaps and remove hidden edges.
11. Redraw the final top, bottom, side, corner, seam, and terminal outline pixels.
12. Run the subject-class completeness audit; repair missing anatomy, function, transition, contact, or icon cues.
13. Run the outline topology audit and clean isolated pixels.
14. Append verification reads.

Prefer primitives for coherent large forms:

- `draw.clear` for full-frame fills
- `draw.rect` for block masses and architecture
- `draw.line` for deliberate edges and row spans
- `draw.ellipse` for circular/organic foundations
- `draw.fill` for enclosed regions
- `draw.pixels` for hand-authored clusters, contour corrections, and small details
- `draw.replaceColor` for deliberate palette revisions

Do not emulate a large rectangle with hundreds of individual pixels. Do not use a primitive when its geometry produces a visibly crude result that needs hand-tuned clusters.

### Phase 9 — Preflight the code

Before selecting **Run**, verify every chain line:

- Command exists in `help` and uses the documented argument names.
- Each executable physical line contains exactly one command and, when arguments are present, one complete JSON object; no `draw.pixels` object/array is pretty-printed across lines.
- No executable line begins with a JSON fragment such as `{`, `}`, `[`, `]`, `"pixels"`, or an array entry.
- JSON uses double quotes, has no trailing commas/expressions/inline comments, is valid, and remains on one physical line.
- **Format chain** succeeds before Run; a formatting error is fixed rather than bypassed.
- All numeric drawing values are integers.
- Every `layer` and `frame` index exists at that point in the sequence.
- Every rectangle/ellipse fits: `x + width <= W`, `y + height <= H`.
- Every line endpoint and every explicit pixel is inside the frame.
- Top/bottom extrema, face vertices, row-span endpoints, corners, and seam ownership match the edge map.
- Every fill/shadow/highlight touching a protected boundary is intentional; otherwise it is inset.
- Every `draw.fill` seed is inside the intended closed region, and the outline has no leak before the fill runs.
- The final outline-repair commands occur after all commands capable of overwriting those pixels.
- Higher-layer overlaps cover only edges classified as hidden/occluded.
- `draw.pixels` has no accidental duplicate coordinates; later duplicates would silently overwrite earlier intent.
- Colors are valid full hex values or `transparent`.
- Creation commands precede commands that depend on their layers/frames.
- Destructive commands are intentional and preceded by preservation when needed.
- Final read commands target the same layers/frames that were drawn.

Use **Format chain** as a syntax/registry preflight. Formatting does not validate each command's semantic bounds, so the coordinate audit is still required.

### Phase 10 — Execute in visual passes

For nontrivial work, do not write one enormous unreviewed chain. Use controlled passes:

#### Pass A: construction and silhouette

Draw the background, silhouette, every required primary mass, and the structural attachments that determine proportion. Do not proceed while the manifest still has an unplanned visible component. Then read back and inspect visually.

#### Pass B: volume and materials

Add shadows, lights, face planes, openings/thickness, and at least one truthful cue for each important material. Reinspect value separation and form readability.

#### Pass C: functional, identity, and focal details

Complete face/expression, player state cues, weapon mechanics, tile transitions, object interaction parts, or item category cues as applicable. Add only then the lower-priority details that improve identity, scale, story, or focus. Clean the contour and pixel clusters.

#### Pass D: animation and consistency

Apply the planned motion to each frame, then compare silhouettes, volume, anchors, and loop timing.

#### Pass E: outline repair and closure

After every overwrite-capable pass, redraw the protected top/bottom extrema, slopes, corners, exterior sides, visible face seams, and contact edges. Audit both the object layer and final composite; repeat this pass independently for every animation frame.

After iteration, the validated final chain may combine the passes into one reproducible run. During development, phased verification is safer than repeatedly running a giant partially failing chain.

### Phase 11 — Verify structurally

Append read commands to every mutation pass:

```text
frame.read {"layer":0,"frame":0,"format":"sparse"}
document.state {"pixels":"none"}
document.colors
app.state
```

Verify:

- Expected dimensions, layers, frames, tiles, and FPS
- Expected current/target layer and frame
- Every required manifest component has pixel evidence at its planned bounds or a documented occlusion/exclusion state
- Key identity, attachment, contact, transition, opening, and material-cue pixels
- Key boundary pixels and palette colors
- Every topmost/bottommost/leftmost/rightmost silhouette boundary matches the declared outline palette or documented exception
- Top/front/side/bottom face seams connect without gaps or accidental double thickness
- Subject bounds do not touch unintended edges
- Transparent areas remain transparent
- No command unexpectedly altered another frame/layer
- File/document hash changed when a mutation was expected

A resolved command is not sufficient proof of a correct drawing.

### Phase 12 — Inspect visually and refine

Inspect the actual rendered art, not just JSON:

1. **1× view**: silhouette, value grouping, focal point, overall readability
2. **Zoomed view**: clusters, contour rhythm, single-pixel errors, tangents, banding
3. **Background check**: transparent and both light/dark backgrounds when relevant
4. **Class-specific review**: compare the render against every mandatory row in the applicable character/player/weapon/tilemap/object/item gate
5. **Animation preview**: timing, arcs, volume stability, contact points, loop seam

For browser automation, capture and inspect a screenshot after each major pass. Use the animated preview for multi-frame work. If the rendered image cannot be viewed, explicitly report that the visual gate is unverified instead of claiming polished completion.

Mandatory cleanup questions:

- Is the topmost visible cap/rim fully connected to both side contours?
- Is the bottommost visible rim/terminal run present and connected?
- Did any fill, highlight, shadow, foreground part, or higher layer overwrite a required outline pixel?
- Is each visible top/front/side/bottom face separated by exactly the intended seam?
- Can any isolated pixel be merged into a stronger cluster or removed?
- Are diagonal step lengths intentional and consistent?
- Are there accidental tangents where forms barely touch?
- Is shading describing form, or merely tracing the outline (“pillow shading”)?
- Do shadow and highlight edges create unwanted parallel banding?
- Is texture overpowering the subject or focal point?
- Is perfect symmetry making an organic subject lifeless?
- Are small features still legible at 1×?
- Does every accent color earn its place?

Make at least one targeted refinement pass for any nontrivial drawing. Do not declare completion immediately after the first successful render.

## Subject-specific completeness blueprints

Select every blueprint that applies. A player holding a sword uses the **character**, **player**, and **weapon** blueprints; an inventory chest icon may use both **object** and **item** blueprints. The union of their requirements is the quality floor.

The lists below distinguish universal requirements from conditional ones. “Conditional” does not mean optional when visible or requested; it means the design determines whether that part exists. Record `N/A BY DESIGN` rather than silently skipping it.

| Requested subject | Blueprint(s) that must run | Non-substitutable core proof |
| --- | --- | --- |
| Character/portrait/NPC | Character | Anatomy/body plan, pose, identity, costume/attachments, expression |
| Playable hero/avatar | Character + Player | Character proof plus origin, contacts, gameplay state/direction, equipment anchors |
| Weapon | Weapon; add Item for icon/pickup and Player/Character when held | Functional modules, grip, junctions, terminals, material, operation |
| Tile/tileset/tilemap | Tilemap and tileset; add Object/Item for placed props/pickups | Grid/projection, edge signatures, complete topology, repeat/adversarial map test |
| World object/prop | World object and prop | Volumes, supports, function, joints/openings, materials, world integration |
| Inventory item/pickup | Item; add Weapon/Object when category overlaps | Category silhouette, functional/state/material cues, padding or world anchor |

### Character blueprint

A character is complete when anatomy/species structure, pose, identity, costume, depth order, and expression all read at the target scale. Two eye pixels on a generic body are not sufficient character design.

#### Declare character scope before drawing

Record:

- Species/body plan, apparent age category, build, role/archetype, and personality adjective
- Crop: head icon, portrait, bust, half body, full body, turnaround, or animation
- View: front, profile, back, three-quarter, top-down, or isometric
- Pose/action, emotional state, gaze direction, and hand/foot intent
- Dominant line of action and support side
- Costume layers, carried gear, species features, and identity markers
- Which limbs/features are visible, partly occluded, fully occluded, or outside the crop
- Whether proportions are realistic, heroic, chibi, super-deformed, or custom

Do not call a bust a full character, a front view a turnaround, or one pose a character sheet.

#### Mandatory anatomical and identity inventory

Map these to geometry before detail:

| Region | Required construction when included in the crop | Common unacceptable shortcut |
| --- | --- | --- |
| Head | Cranial mass, face/jaw or muzzle wedge, center line, tilt, attachment to neck | Free-floating circle or square with features pasted symmetrically |
| Face | Brow/eye line, readable eye/gaze cluster, nose/muzzle plane when scale permits, mouth/expression cluster, jaw/chin termination | Two unrelated dots and a random line that do not express direction or emotion |
| Hair/head feature | Skull-following root mass, hairline/part or attachment point, primary silhouette clumps, overlap ownership | Uniform helmet blob, noisy single-pixel spikes, or hair detached from skull |
| Neck | Width, tilt, insertion behind jaw and between shoulders; visible front/back edge as view permits | One centered stick or no attachment between head and torso |
| Torso | Ribcage/chest mass, abdomen/waist transition, front/side plane or twist, taper appropriate to build | Featureless rectangle with highlights used as fake volume |
| Pelvis/hips | Separate pelvis mass or compressed hip cluster, leg sockets, tilt relative to ribcage | Legs emerging from arbitrary torso pixels with no hip structure |
| Arms | Shoulder origin, upper-arm direction/thickness, elbow change, forearm taper, wrist, hand endpoint | Same-width tubes; hands omitted at the end of visibly complete arms |
| Hands | Palm mass plus thumb/finger-direction cluster appropriate to scale; believable contact around held items | One floating pixel, mitten touching rather than gripping, or hand hidden only to avoid drawing it |
| Legs | Hip origin, thigh mass, knee direction/change, calf/shin taper, ankle, foot | Parallel sticks with no joint rhythm or weight support |
| Feet | Heel/arch/toe or shoe sole cluster, facing direction, overlap, and ground contact | Legs cut off above baseline or one-pixel feet with no directional read |
| Species features | Ear/horn/antenna/wing/tail attachment, root thickness, direction, overlap, terminal shape | Decorative appendage pasted onto contour with no socket or hidden-side logic |
| Identity markers | At least two mutually supporting cues such as silhouette, face/hair, costume shape, palette placement, emblem, or prop | Identity depends only on one tiny color dot or text explanation |

At micro scale, several landmarks may merge into one cluster, but their combined cluster must still communicate direction, taper, attachment, and separation. Do not outline every anatomical subdivision if that muddies the sprite; use value or overlap boundaries instead.

#### Pose and weight requirements

For every full or partial body pose:

1. Plot the head center, neck base, shoulder line, ribcage center, pelvis center, hip line, visible elbows, wrists, knees, ankles, and foot contacts.
2. Draw the line of action through the major masses before clothing.
3. Identify the support foot/seat/hanging point and place the center of mass plausibly relative to it.
4. Vary shoulder and pelvis tilt intentionally; perfectly parallel lines are valid only for a rigid pose.
5. Give bent limbs a clear convex/concave rhythm and enough room at the inside joint.
6. Shorten and overlap foreshortened segments rather than merely making them thinner.
7. Separate front and rear limbs by silhouette, value, or controlled outline color.
8. Keep hands and feet aimed consistently with the action and view.
9. Check negative spaces between arm/torso and between legs. Accidental one-pixel holes or merged limbs fail.
10. Verify no joint bends backward unless anatomy/design explicitly allows it.

A dynamic gesture with unstable anatomy must be repaired; “stylized” is not a justification for accidental dislocation.

#### Face and expression construction

- Establish head center line and eye/brow line from the head tilt before placing features.
- In three-quarter view, compress the far side; do not mirror both eyes at equal width and distance.
- In profile, show one primary eye cluster and a readable forehead–nose/muzzle–mouth–chin contour; do not paste a second eye onto the silhouette.
- Keep both pupils/gaze indicators aimed at the same target unless the expression intentionally diverges.
- Build expression with at least two coordinated systems: brow/eye shape, eyelid openness, mouth corners/opening, cheek/muzzle compression, or head angle.
- Preserve the face as the focal contrast area when identity depends on it; hair highlights and costume trim must not overpower it.
- For tiny faces, prefer one clear eye/brow cluster and a mouth/jaw cue over a noisy collection of literal isolated features.

#### Hair, clothing, and accessory construction

- Build hair as 2–5 primary masses following the skull and gravity/action, then add only a few secondary locks at silhouette changes.
- Place hair roots, parting, tied point, braids, horns, hats, and helmets on calculated attachment zones.
- Construct the unclothed body masses first conceptually so sleeves and trouser legs wrap plausible limbs.
- Give each garment an opening and termination where applicable: collar, cuff, hem, waistband, boot opening, glove edge, armor rim.
- Put folds at compression, tension, suspension, or directional change. Do not scatter equal-length fold marks across flat fabric.
- Show armor thickness with rim/overlap pixels and articulate plates at joints; do not paint armor as bright patches directly on skin/body fill.
- Belts, straps, bags, and scabbards must wrap, hang, attach, and occlude consistently. A strap cannot disappear and reappear without an explained hidden route.
- Accessories crossing the silhouette need their own front/back ownership and outline repair.

#### View and crop completeness

| Deliverable | Minimum complete coverage |
| --- | --- |
| Head icon | Full cranial/face silhouette, readable facing/gaze, expression, hair/headwear attachment, neck or intentional icon cutoff |
| Portrait/bust | Head plus neck/shoulder/chest construction, intentional lower crop, costume neckline, visible arm/prop fragments resolved at crop edge |
| Half body | Pelvis/waist cutoff planned; both visible arms/hands resolved unless logically occluded; torso twist and garment structure complete |
| Full body | Head through both foot contacts, every visible limb endpoint, support logic, ground/contact shadow if requested, no accidental canvas clipping |
| Turnaround | Same scale, head/body landmarks, palette, costume seams, and equipment placement across all promised views; front/side/back correspondence checked |
| Character animation | Anatomical volumes, identity features, costume attachments, contacts, and outline topology stable across every frame |

A crop edge must look intentional: avoid cutting exactly through eyes, joints, hands, focal props, or feet unless the requested composition demands it.

#### Character drawing order

1. Mark composition bounds, baseline, line of action, mass centers, and joint landmarks.
2. Block a one-color naked/body-plan silhouette including all visible limbs and species appendages.
3. Audit balance, limb count, negative spaces, hand/foot endpoints, and crop.
4. Separate head, ribcage, pelvis, front/rear limbs, and appendage overlaps.
5. Construct face direction and expression clusters.
6. Wrap hair, clothing, armor, and accessories around the established masses.
7. Add local colors and value-separated front/side/underside planes.
8. Render skin, hair, cloth, metal, leather, or other materials with distinct cluster behavior.
9. Restore facial focus and identity markers; remove details that compete with them.
10. Repair exterior outline, limb junctions, soles, hair tips, and costume overlap seams.
11. Inspect at 1×, mirrored if useful, and over light/dark backgrounds.
12. Compare every inventory row to the manifest and repair omissions.

#### Character rejection gate

Reject and continue drawing if any applicable answer is “no”:

- Can the species/archetype, facing direction, pose, and emotion be read without the text brief?
- Are head, neck, torso, pelvis, every visible limb segment, hand/foot endpoint, and species appendage accounted for?
- Do limbs attach at plausible sockets and change width/direction at joints?
- Is the pose balanced around an intentional support/contact point?
- Do front/rear overlaps remain readable at 1×?
- Are face features aligned to the head perspective and working together as one expression?
- Do hair, clothes, armor, and gear wrap the body and terminate at believable openings/attachments?
- Is each important material distinguishable without excessive texture?
- Are all visible top and bottom terminations—hair cap, chin, sleeves, hands, hems, soles, tail tips—closed or intentionally selective?
- Has at least one anatomy/pose correction and one pixel-cluster cleanup pass occurred after the first full render?

### Player-sprite blueprint

A player is a character plus a gameplay readability and animation contract. Apply the complete Character blueprint first, then every applicable rule below.

#### Declare gameplay contract

Record:

- Camera/projection and facing system: side view, top-down, isometric, 2-way, 4-way, 8-way, or free rotation
- Player role/class, team/faction markers, equipped state, and intended gameplay scale
- Exact promised states: idle, walk, run, jump, fall, land, crouch, attack, cast, interact, hurt, KO/death, swim, climb, etc.
- Frames and timing per state; whether directions are unique or mirrored
- Stable origin/pivot, foot baseline, collision footprint, head height, hand/equipment sockets, and muzzle/action origin
- Gameplay backgrounds on which readability must hold
- Whether deliverable is one sprite, one loop, a directional set, or a full agreed state sheet

If the request only asks for one player sprite, deliver one complete readable pose and name it honestly. If it asks for a “game-ready player,” do not assume one idle pose is enough: agree on and cover a state/direction matrix.

#### Stable player measurement sheet

Record canonical measurements in pixels and tolerances before cloning frames:

```text
Origin/pivot: <x,y and meaning>
Ground row: <y>
Standing bbox: <x0..x1,y0..y1>
Head: <width x height; center offset from origin>
Torso/pelvis: <boxes and overlap>
Upper/lower limbs: <nominal lengths and thickness>
Foot contacts: <left/right neutral coordinates>
Hand sockets: <left/right neutral coordinates>
Equipped-item socket/angle: <coordinate and direction>
Allowed squash/stretch: <pixels and states>
```

Volume may deliberately squash/stretch for animation, but unplanned one-pixel growth in head, torso, weapon, or limbs is a consistency defect.

#### State and direction coverage

Use a matrix; every promised cell must be `PLANNED`, `DRAWN`, `VERIFIED`, or explicitly `MIRRORED FROM <cell>`:

| State family | Required motion information when included |
| --- | --- |
| Idle | Stable contact, breathing/secondary motion, readable default facing, no accidental foot slide |
| Walk/run | Contact, down/recoil, passing, and up poses or another deliberately timed locomotion cycle; alternating limbs and stable travel distance |
| Jump/fall/land | Anticipation or takeoff, airborne silhouette, vertical direction cue, landing compression and recovered contact |
| Primary attack/use | Anticipation, readable action line, impact/release frame, follow-through/recovery, attached weapon/effect origin |
| Hurt/stun | Clear directional reaction and readable temporary state without losing character identity |
| KO/death | Intentional silhouette/state transition and final pose; not merely deleting pixels or rotating the idle sprite |
| Interact/cast | Hand/tool focus, target direction, effect/socket continuity, state-specific silhouette |

Only rows requested by the agreed scope are mandatory. However, a claimed full set cannot leave a promised cell blank or fill it with an unchanged duplicate unless that duplicate is a deliberate hold.

For directional sets:

- Front, back, and side views need corresponding head/face, torso, limb, and equipment overlap changes.
- Mirroring is acceptable only when handedness, asymmetrical costume, text/emblems, lighting, and weapon orientation remain valid.
- Diagonal views must not be a front sprite with one limb shifted; compress the far side and rotate the body/equipment axes.
- Keep apparent height, foot baseline, palette, and identity markers consistent across directions.

#### Gameplay readability rules

- Reserve the clearest silhouette and strongest identity contrast for the player relative to common environment tiles.
- Keep the head/face or class-defining equipment readable at actual gameplay zoom.
- Separate front/rear arms and legs enough to read motion; use value/outline shifts rather than adding noisy detail.
- Keep feet aligned to the ground/collision plane except during a planned airborne state.
- Place cast shadows consistently and do not use them to conceal sliding contacts.
- Keep team color, health-state, or interaction markers in stable, visible regions if requested.
- Ensure attack effects do not permanently overwrite body/weapon outlines; use semantic effect layers.
- Do not let hair, capes, backpacks, or weapons clip through the body without a planned overlap transition.

#### Held weapon and tool integration

- Plot hand sockets first, then place the grip through or between the hand clusters—not beside them.
- The nearer hand/body part owns the covering edge; erase hidden grip pixels and restore visible hand contour.
- Two-handed equipment must align both hands on one rigid axis unless the object bends by design.
- Weapon length, blade/barrel orientation, muzzle/tip position, and attachment angle must remain coherent across frames.
- During attacks, track hand, grip, tip/muzzle, and effect-origin coordinates in every frame.
- A weapon may leave the frame only as a planned action extreme, never because coordinates were not bounded.

#### Player animation process

1. Draw and verify one canonical neutral model with full anatomy, identity, equipment sockets, and origin.
2. Record measurements and duplicate only after the canonical frame passes.
3. Pose key extremes first; do not create all frames by tiny arbitrary pixel nudges.
4. Add breakdown/contact frames to clarify arcs and weight.
5. Compare onion-skin silhouettes, head position, torso volume, limb lengths, and equipment endpoints.
6. Render secondary motion after primary body timing is stable.
7. Repair outlines and occlusions independently in every frame.
8. Preview at actual FPS over representative game backgrounds.
9. Check first-to-last loop spacing and contact continuity.
10. Audit every promised state/direction matrix cell.

#### Player rejection gate

Reject and continue if any applicable answer is “no”:

- Is the player distinguishable from NPCs/environment at actual gameplay scale?
- Are origin, baseline, body measurements, hand sockets, and equipment anchors documented and consistent?
- Does every promised state/direction exist and have a purposeful silhouette/timing role?
- Do contacts stay planted when expected, with no accidental foot or shadow sliding?
- Do body and equipment volumes remain stable except for declared squash/stretch or perspective change?
- Are facing, handedness, equipment overlap, and effect origin correct in each direction/frame?
- Is the action readable from silhouette and timing before particles are added?
- Are all frame-specific outlines, limb endpoints, weapon tips/muzzles, and soles complete?
- Was the animation inspected at actual FPS and as a loop, not only as separate frames?

### Weapon blueprint

A weapon must communicate function, construction, grip, material, balance, and orientation. A tapered line with a bright streak is not automatically a finished sword; a rectangle with a barrel pixel is not automatically a finished firearm.

#### Declare weapon contract

Record:

- Weapon family, technology/magic level, use, scale, and condition
- Display context: inventory icon, world pickup, held player sprite, attack animation, projectile, turnaround, or equipment sheet
- View and action axis: horizontal, diagonal, vertical, foreshortened, top-down, side, or isometric
- Overall length/thickness, grip interval, center of mass, functional end, and rear/support end
- Exact parts present, moving parts, open/closed state, loaded/unloaded state, and intentional fantasy deviations
- Materials and which components use each material
- Hand socket(s), muzzle/tip/effect origin, layer ownership, and motion arc when held/animated

Do not invent modern firearm mechanics for a fantasy blaster or force every sword to have the same guard. Do identify the equivalent functional modules and explain unusual omissions through the design.

#### Universal weapon construction

Every weapon needs all applicable modules:

1. **Functional end** — blade edge/tip, striking head, muzzle, projectile point, emitter, explosive body, shield face, or another clearly usable end.
2. **Transmission/body** — blade body, barrel/receiver, shaft, limbs/string, housing, conduit, or structure carrying force/energy.
3. **Control/grip** — a region sized and oriented for the intended hand(s), including guard/trigger/control where relevant.
4. **Junction/socket** — pixels explaining how head, blade, barrel, stock, grip, string, or power source physically connect.
5. **Support/counterbalance** — pommel, stock, butt cap, rear housing, counterweight, strap point, or a documented intentionally front-heavy design.
6. **Thickness and plane change** — spine, bevel, side plane, rim, bore, socket, wrap, or another cue preventing a paper-flat read.
7. **State cue** — loaded, charged, open, broken, poisoned, enchanted, safety-on, folded, etc., only when requested or narratively important.
8. **Material response** — at least one controlled, directional cue for every important material.

At tiny scale these may compress into adjacent clusters, but the grip, functional end, and junction must remain distinguishable.

#### Family-specific required inventory

Mark each applicable part `VISIBLE`, `OCCLUDED`, or `N/A BY DESIGN`:

| Family | Required construction when present | Critical failure to avoid |
| --- | --- | --- |
| Sword/knife | Tip termination, cutting edge, spine/back, blade thickness or bevel, shoulder/ricasso or blade-to-hilt junction, guard if designed, grip wrap/body, pommel/end cap | Blade enters grip with no tang/socket logic; both edge and spine have identical random highlights |
| Axe/hammer/mace | Working face/edge, head mass and back/counterform, eye/socket around shaft, shaft taper, grip zone, butt end | Head appears glued to side of shaft; striking face has no thickness |
| Spear/polearm | Tip/head profile, head socket/lugs, continuous shaft axis, grip bands where useful, butt cap/counterweight | Tip floats one pixel away; shaft changes axis unintentionally |
| Bow | Upper/lower limb taper, riser/grip, continuous string attachment at both tips, believable bend symmetry/asymmetry under draw, nocking point; arrow if loaded | String stops in space, passes in front/behind inconsistently, or does not meet limb tips |
| Crossbow | Prod/limbs, string, central rail, stock/grip, trigger/control, bolt channel, front/rear support as designed | Bow and stock have incompatible axes; bolt does not sit on rail/string |
| Firearm/projector | Muzzle/bore, barrel or emitter axis, receiver/housing, grip, trigger/control area, feed/power source, rear support/stock if used, sights/aim cue if designed, major moving seam | Barrel/muzzle disconnected from receiver; grip cannot support center of mass; decorative pixels imply impossible feed path |
| Arrow/bolt/dart | Point/head, socket, straight shaft, fletching/stabilizer, nock/rear termination | Bent accidental shaft or head/fletching detached by one-pixel gaps |
| Staff/wand | Focus/emitter head, head-to-shaft mount, shaft taper/segments, hand zone, lower cap | Decorative orb floats above shaft; no grip or scale cue |
| Thrown/explosive | Functional body, grip/throw orientation, activation/safety mechanism if relevant, seams/fuse/pin, stable silhouette and state cue | Random hazard stripes/glow with no readable activation part |
| Shield/defensive weapon | Face plane, rim/thickness, center boss/emblem if designed, rear grip/strap implication, damaged or active edge state | Flat disk with no rim or believable holding orientation |
| Energy/magical weapon | Physical housing/grip, emitter or focus, energy source/path, contained core vs external glow, stable functional silhouette without effects | Glow replaces the weapon body or erases the emitter boundary |

Fantasy exaggeration is allowed, but weight distribution and attachment still need visual logic unless impossible construction is itself the explicit concept.

#### Weapon geometry requirements

- Plot one primary action axis from rear support through grip/body to tip, muzzle, or impact center.
- Plot secondary axes for guards, axe heads, bow limbs, magazines, stocks, sights, or crosspieces.
- Measure grip length against hand size; one-handed and two-handed grips need enough pixels for their use.
- Preserve straight segments with controlled step rhythms. A one-pixel wobble in a barrel, shaft, blade spine, or string is visible and usually wrong.
- Taper blade/shaft/limb widths intentionally toward their terminals; do not alternate widths randomly.
- Show a closed terminal at the top/tip and bottom/pommel/butt. The familiar missing-top/missing-bottom outline defect is especially damaging to weapons.
- Keep parallel edges parallel under the chosen projection, then converge/compress only according to planned perspective.
- For foreshortening, shorten the axis, widen near planes, overlap components, and emphasize terminal faces; do not merely shrink the whole weapon.
- Reserve silhouette notches for meaningful structure such as guard, sight, hammer, trigger guard, serration group, or attachment—not decorative noise.

#### Weapon material rendering

| Material | Required useful cues | Avoid |
| --- | --- | --- |
| Polished metal | Dark plane, midtone body, narrow directional highlight/specular break, crisp edge contrast | White line tracing every edge or random sparkle confetti |
| Rough/aged metal | Broader broken highlights, controlled chips at exposed edges, darker joints/recesses | Uniform noise over the entire blade/head |
| Wood | Grain/stripe clusters following shaft or stock direction, end/joint darkening, warm plane shifts | Crosswise random dots that flatten the form |
| Leather/cloth wrap | Repeating wrap direction with selective dark overlaps and a clear start/end | Perfect checker pattern or wrap lines ignoring grip perspective |
| Bone/stone | Chunked plane changes, nonmetallic highlight, controlled irregular contour | Metallic razor highlight unless polished by design |
| Glass/crystal | Strong outer/refraction edges, limited interior planes, bright focal facet, transparent/background distinction | Filling every facet with unrelated colors |
| Energy/magic | Solid readable housing/core, intensity hierarchy, compact hot center, separated halo/effect layer | Using glow to hide missing construction or outline |

Use damage and wear at plausible contact zones: blade edge, shield rim, pommel, grip, muzzle, corners, or moving seams. Do not distribute identical scratches evenly.

#### Held, pickup, and icon presentation

For a held weapon:

- Draw the gripping hand and weapon together; hide grip pixels behind fingers/palm where appropriate.
- Respect near/far hand and body layering throughout the pose.
- Align wrists and forearms with the force/action axis.
- Keep the weapon from tangentially merging with head, torso, ground, or canvas border.
- Track tip/muzzle and grip coordinates through animation; repair swept silhouettes frame by frame.

For a world pickup:

- Choose a stable resting, floating, or planted orientation and contact/shadow.
- Keep the silhouette readable against environment tiles and at game zoom.
- Use glow/outline as an interaction cue only after the physical item is complete.

For an inventory icon:

- Fit the full tip-to-end silhouette inside consistent padding.
- Use a diagonal when it improves occupancy, but keep grip/function orientation obvious.
- Exaggerate the category-defining head, blade, muzzle, or emitter before tiny fasteners.
- Do not clip terminal pixels to make the weapon appear larger.

#### Weapon drawing order

1. Plot action axis, total extent, grip interval, component junctions, and hand sockets.
2. Draw a flat complete silhouette including both terminal ends and all major projections.
3. Audit family-specific parts and correct balance/readability at 1×.
4. Separate functional end, body/transmission, grip/control, junction, and rear support with plane/value changes.
5. Establish thickness, bevel, bore, rim, socket, guard, string, or housing seams.
6. Apply each material's directional shadow/light behavior.
7. Add state cue, emblem, wear, or energy only after function is clear.
8. Integrate hands, ground contact, pickup shadow, or icon padding.
9. Redraw tip/muzzle, top/bottom terminals, grip edges, junctions, and occlusion boundaries.
10. Inspect silhouette without effects and verify every family-specific inventory item.

#### Weapon rejection gate

Reject and continue if any applicable answer is “no”:

- Is weapon family, functional direction, and held/use orientation readable from silhouette?
- Are functional end, body, grip/control, junction/socket, and support/end termination accounted for?
- Could the depicted hand(s) plausibly grip and operate it?
- Are blade, barrel, shaft, string, or rail axes controlled rather than accidentally wobbly?
- Does each attachment visibly connect, with no floating guard, head, orb, sight, magazine, or power source?
- Do thickness and material cues describe form instead of tracing the contour?
- Are both extreme terminals outlined/closed and inside the canvas?
- In animation, do grip and tip/muzzle follow intentional arcs without length changes?
- Does the physical weapon remain readable when glow, particles, and cast effects are hidden?

### Tilemap and tileset blueprint

Use these terms precisely:

- A **tile** is one grid-aligned reusable graphic.
- A **tileset/atlas** is a documented collection of tile cells and variants.
- An **autotile set** covers a declared neighbor-mask system.
- A **tilemap** is an arrangement of tile IDs/graphics forming a larger playable or illustrative map.

One attractive grass square is not a tileset. A tileset atlas with no arranged scene is not a tilemap. A painted scene that ignores a reusable grid is not automatically a tilemap.

#### Declare tile system before drawing

Record:

- Tile width/height, atlas width/height, rows/columns, gutter/spacing, and cell coordinate convention
- Projection: orthogonal top-down, side/platformer, isometric, hex-like, or custom
- Map dimensions in tiles and pixels when composing a map
- Terrain/material classes and every allowed adjacency pair
- Neighbor model: none, 4-neighbor cardinal, 8-neighbor/blob, Wang-edge/corner, handcrafted transition list, or custom
- Required centers, edges, convex corners, concave corners, junctions, endcaps, slopes, height faces, overlays, and variants
- Transparency/background contract and whether edges must meet exact transparent/color signatures
- Collision/navigation semantics when they affect visual edges, openings, cliffs, doors, or walkable width
- Light direction, texel density, outline policy, and world scale shared by all cells
- Atlas cell manifest and map-layer order

For a cardinal bitmask, cover all promised masks in the chosen convention; a full 4-neighbor system has 16 combinations. For an 8-neighbor blob system, explicitly define whether diagonals count only when adjacent cardinal neighbors exist and cover the resulting declared set. Do not claim “47-tile autotile” or any other standard while omitting cells.

#### Exact tile edge contract

For every tile meant to repeat or connect, define four edge signatures:

```text
N = ordered colors/transparency at y=0, x=0..tileWidth-1
E = ordered colors/transparency at x=tileWidth-1, y=0..tileHeight-1
S = ordered colors/transparency at y=tileHeight-1, x=0..tileWidth-1
W = ordered colors/transparency at x=0, y=0..tileHeight-1
Corners = NW, NE, SE, SW ownership and neighbor rule
```

Then enforce:

- A repeatable tile's `N` must meet its neighbor's `S` without a visible value/outline discontinuity; `E` must meet `W` equivalently.
- Pixel runs crossing a boundary must continue at the exact offset, thickness, color family, and step rhythm intended by the terrain.
- Boundary texture may vary only when the edge signature remains compatible.
- Corner pixels must satisfy both participating edges and the diagonal/inner-corner rule.
- An outline on both adjoining cells must not become an accidental two-pixel seam; assign boundary ownership.
- Transparent edge pixels must be deliberate. A single leaked transparent pixel can create a map seam.
- Variants sharing the same connectivity mask must preserve the same edge contract.

Read and compare full edge rows/columns; visual guessing at high zoom is insufficient.

#### Minimum topology inventory by tileset type

##### Seamless single-material surface

A complete reusable surface needs:

- At least one center/base tile whose opposite edges repeat exactly
- Controlled macro clusters crossing boundaries so the repeat does not look like four framed cells
- No unique high-contrast landmark repeated in an obvious grid
- Optional variants that preserve all four signatures
- A `3×3` repeat test using the same tile and a mixed-variant repeat test

Do not draw a dark outline around each tile cell unless visible grid lines are explicitly part of the style.

##### Top-down terrain transition set

Include every topology promised by the adjacency system, typically:

- Interior/center for each terrain
- North, east, south, and west boundary orientations
- Four convex/outer corners
- Four concave/inner corners
- Isolated island/patch and fully surrounded center where the chosen mask distinguishes them
- Narrow horizontal/vertical strips or opposite-edge channels when supported
- Endcaps, T-junctions, crosses, bends, and straight path pieces for paths/walls/rivers where applicable
- Shore/cliff/road transition thickness consistent across all orientations
- Transition variants that keep mask-compatible edge pixels

Inner corners are mandatory whenever the map can contain a one-cell notch. Do not substitute a rotated outer corner; concave ownership and shading are different.

##### Platformer terrain set

Include all surfaces the level grammar permits:

- Filled center/body tile
- Walkable top surface
- Left and right exposed wall faces
- Bottom/ceiling exposure when visible
- Top-left/top-right convex corners
- Bottom-left/bottom-right convex corners when visible
- Inner floor/wall and ceiling/wall corners
- One-cell platform, left/right platform endcaps, horizontal middle
- Narrow column top/body/bottom when narrow columns are allowed
- Slopes and matching slope-to-flat/slope-to-wall transitions when slopes are promised
- Background/decor variants that do not alter collision-reading edges

Top grass, snow, trim, or ledge thickness must continue across neighboring top tiles. Side-wall highlights/shadows must not jump at cell boundaries.

##### Isometric tileset

Define:

- Diamond top dimensions and left/right step sequence
- Tile center, top apex, side vertices, and bottom apex
- Height in pixels for vertical walls
- Top, left-wall, right-wall, and visible underside palettes
- Shared diamond-edge ownership so adjacent tops meet once
- Raised block, lowered block/hole, exposed left/right wall, convex/concave height corner, and slope/ramp cells as required
- Occlusion order for back-to-front rows and tall props

Every shared isometric slope must use the exact same stair rhythm. A one-pixel phase shift creates a conspicuous zipper seam.

#### Terrain and tile material rendering

- Establish large terrain value groups first: walkable plane, wall/cliff, water/depth, obstacle, overlay.
- Keep lighting direction identical across all rotations; do not rotate highlights mechanically if the world light remains fixed.
- Make texture clusters follow material: grass tufts in grouped blades, stone in planar cracks/blocks, dirt in low-contrast patches, water in directional bands, wood along grain.
- Keep boundary silhouettes cleaner and higher priority than center texture.
- Place cracks, flowers, pebbles, and sparkle variants away from navigation-critical edges unless designed to cross them.
- Use low-frequency variation in base values and sparse high-frequency accents; evenly distributed noise makes every cell look dirty.
- Preserve texel density and feature scale across tiles. A brick, leaf, or pebble must not double in size on a neighboring cell without reason.

#### Tilemap composition requirements

For an arranged map, add a macro plan beyond individual tile correctness:

1. Define playable/nonplayable zones, major masses, routes, choke points, rooms, platforms, shoreline, or elevation bands.
2. Establish entrance/exit and visual path hierarchy before decoration.
3. Place large landmarks and interaction objects on the grid with sufficient player clearance.
4. Use terrain transitions and height changes consistently; no impossible cliff, wall, water, or path adjacency.
5. Separate base terrain, transitions, shadows, props, foreground occluders, and effects into planned layers.
6. Keep foreground occlusion intentional and avoid hiding navigation-critical openings.
7. Break visible repetition with mask-compatible variants and larger cross-tile clusters, not random rotation that changes lighting or seams.
8. Maintain consistent world scale between player, doors, stairs, trees, furniture, pickups, and tile motifs.
9. Give the scene focal landmarks and quieter rest zones; uniform detail density is not finished composition.
10. Inspect the full map at 1× and gameplay zoom, then inspect seam hot spots at high zoom.

If collision/spawn/interaction metadata is outside Piskel's visual scope, list it as an external integration requirement rather than pretending the PNG contains it.

#### Atlas and map production order

1. Freeze grid, projection, palette, light, mask convention, and atlas cell manifest.
2. Draw a reference center tile and one boundary; establish material cluster language.
3. Build structural centers/edges/corners with no decorative variants.
4. Assemble a small adversarial test map containing every adjacency and inner corner.
5. Read exact N/E/S/W signatures and repair one-pixel seams, double outlines, and corner leaks.
6. Complete junctions, strips, endcaps, slopes, heights, and promised masks.
7. Add variants while locking connectivity edges.
8. Rebuild the test map with variants and inspect repetition.
9. Compose the full tilemap's macro layout and prop/overlay layers.
10. Run atlas bounds, cell-count, transparency, edge-signature, topology-coverage, repeat, and final-map visual audits.

#### Mandatory tile tests

- **Self-repeat**: render at least `3×3` copies of each seamless center tile.
- **Variant repeat**: mix every same-mask variant in a repeat patch.
- **Edge pair test**: place every allowed terrain pair in both relevant orientations.
- **Corner test**: place every convex and concave corner with all participating neighbors.
- **Junction test**: exercise every path/wall/river end, turn, T, cross, and narrow channel promised.
- **Projection test**: check isometric/height/slope step rhythms and occlusion order.
- **Atlas test**: verify each tile stays inside its exact cell; no one-pixel bleed into adjacent cells.
- **Map test**: inspect the composed map for navigation clarity, scale, repetition, tangent, and foreground occlusion.

#### Tilemap rejection gate

Reject and continue if any applicable answer is “no”:

- Are tile size, projection, mask convention, atlas layout, terrain classes, and map dimensions documented?
- Does the atlas contain every promised center/edge/corner/junction/endcap/slope/height mask exactly once or by documented variants?
- Do exact N/E/S/W signatures connect without gaps, phase shifts, transparent leaks, or double outlines?
- Are concave and convex corners both present where the level grammar can create them?
- Does a `3×3` repeat hide the cell grid rather than reveal framed squares or unique repeated landmarks?
- Do variants preserve connectivity, world lighting, scale, and material language?
- Does the full map have coherent routes, landmarks, depth layers, transitions, and gameplay-scale readability?
- Was every promised topology tested in an adversarial mini-map, not only viewed as isolated atlas cells?

### World-object and prop blueprint

A world object/prop must communicate what it is, how it is built, how it stands or attaches, which parts can be used, and how its material reacts to light. A decorated box is not automatically a finished chest, machine, altar, table, or building element.

#### Declare object contract

Record:

- Object category, function, owner/culture, age/condition, interactive state, and world scale
- View/projection shared with the scene and exact ground/wall/ceiling attachment
- Primary mass, secondary assemblies, supports, openings, controls, handles, hinges, fasteners, contents, and conditional parts
- Visible top/front/side/bottom/interior faces and their perspective axes
- Material assignment per component
- Closed/open, on/off, empty/full, intact/broken, locked/unlocked, or other state that changes geometry
- Character interaction point, collision footprint, contact shadow, and foreground/background ownership when applicable

Do not add handles, rivets, vents, or labels as generic “detail.” Every structural mark should correspond to a panel edge, joint, control, material boundary, wear zone, or readable function.

#### Universal object construction inventory

Every object requires all applicable levels:

| Level | Required evidence |
| --- | --- |
| Primary mass | One or more clear volumes with measured bounds and consistent perspective |
| Secondary assembly | Lid, back, leg set, drawer, wheel, pipe, arm, branch, housing, shelf, shade, etc., attached to the primary mass |
| Support/contact | Feet, base, bracket, roots, wheels, wall mount, hanging point, or deliberate floating mechanism |
| Functional interface | Handle, opening, latch, button, seat, screen, spout, blade, socket, light source, or another use cue |
| Construction joint | Rim, seam, hinge, mortise, weld, collar, axle, bolt group, binding, growth junction, or hidden-but-mapped attachment |
| Thickness/interior | Visible rim, side wall, recess, underside, back plane, cavity, glass thickness, or a justified solid silhouette |
| State cue | Geometry/value cue proving open/closed, active/inactive, damaged/repaired, full/empty, etc., when relevant |
| Material behavior | Plane values, edge wear, grain, reflection, texture direction, and highlight width appropriate to each material |
| Integration | Correct scale, baseline, cast/contact shadow, occlusion, and interaction clearance in its world context |

The object can be stylized, but its own parts must agree on the same perspective and light model.

#### Category-specific inventories

##### Container, chest, crate, cabinet, or vessel

Include as applicable:

- Body volume with top/front/side/bottom ownership
- Rim or wall thickness; visible interior/back wall when open
- Lid/door/drawer with hinge, slide, or attachment axis
- Latch/lock/handle located where it can operate
- Reinforcement bands/corners only where they wrap or join faces coherently
- Contents with depth order and contact inside the cavity when visible
- Open/closed state reflected in silhouette, not only a changed highlight
- Ground contact and weight appropriate to contents/material

A line across a box does not prove a lid; show the rim, seam, hinge side, thickness, or opening gap.

##### Furniture and architectural prop

Include as applicable:

- Load-bearing top/seat/shelf and its thickness
- Legs, supports, brackets, wall frame, or suspension points
- Parallel/receding axes shared across all surfaces
- Joinery/attachment where supports meet load-bearing planes
- Functional clearance: seat space, doorway opening, drawer path, stair tread, window opening
- Ground/wall contact for every visible support
- Fabric/cushion deformation only where weight or seams justify it

Do not let a table leg stop one pixel above ground, a door handle float off the panel, or rear supports appear in front.

##### Machine, device, console, or industrial prop

Include as applicable:

- Main housing and removable/access panels
- Input/control and output/result side
- Power source, cable/pipe path, vent, exhaust, emitter, screen, or port required by the concept
- Articulation axis for arms, wheels, gears, turrets, levers, or doors
- Recesses and overlapping panels with one seam owner
- Indicator lights subordinate to the functional silhouette
- Wear at handles, feet, moving joints, exhausts, and exposed corners
- Active state shown through controls, moving part position, output, or restrained glow—not random colored dots

Cable and pipe runs must start and end at real sockets; gears need plausible meshing/axles if exposed.

##### Vehicle or mobile prop

Include as applicable:

- Chassis/body volume and front/back direction
- Locomotion units: wheels, tracks, legs, skids, thrusters, wings, or equivalent, with aligned contact/attachment axes
- Cabin/seat/control region and scale cue
- Power/engine or fantasy-motion cue
- Cargo/weapon/accessory mounts and their support
- Ground/air/water contact state and cast shadow
- Near/far unit overlap consistent with projection

Repeated wheels/legs must share diameter, baseline, and axle rhythm unless suspension/terrain intentionally changes them.

##### Natural object: rock, plant, tree, fungus, crystal, organic prop

Include as applicable:

- Primary gesture/growth or fracture direction
- Trunk/stem/core/main rock mass
- Branch/root/leaf/cap/facet clusters attached with taper and overlap
- Ground insertion, roots, embedded base, broken face, or contact shadow
- Large plane/value groups before bark/leaf/mineral texture
- Controlled asymmetry and cluster families rather than mirrored noise
- Species/material cue through silhouette as well as color

A green circle on a brown rectangle fails as a finished tree unless the resolution is so small that those clusters are deliberately shaped, connected, lit, and identified.

##### Light source, sign, portal, altar, or focal world prop

Include as applicable:

- Physical fixture/frame/base before emitted light or text/symbol
- Emitter surface or focal symbol with clear containment
- Supports, wiring/fuel/magic source, and world attachment
- Local light effect consistent with nearby planes when requested
- Readable symbol/interaction face at gameplay scale
- Glow on a separate planned region/layer that does not erase the physical outline

#### Perspective, openings, and support rules

- Establish two or three shared pixel-step axes for all parallel object edges.
- Draw the far/top plane first conceptually, then front/side planes and foreground overlaps.
- Openings need an outer rim, wall thickness where visible, dark/interior plane, and back/contents only when visible.
- A hole is not just a black patch; its contour and depth direction must match the containing face.
- Supports must reach the ground/wall/base or disappear behind a mapped occluder.
- Repeated supports, windows, drawers, slats, teeth, or panels need measured spacing; vary only intentionally.
- Heavy objects need broad contact, compression, or a convincing suspension system. Delicate objects need correspondingly light support.
- Contact shadows follow the footprint and light, not a generic centered oval.
- If the bottom face is visible, draw and protect its rim/underside; if it is hidden by ground, state the contact-edge treatment.

#### Object material and wear rules

- Assign material at the component level and change cluster language at the boundary.
- Metal uses crisp plane/specular behavior; wood follows construction/grain direction; stone uses larger broken planes; cloth uses folds/soft terminations; glass shows rim/reflection/interior interaction.
- Put dirt in recesses and lower/contact zones; put polish on handles and exposed edges; put chips on impact corners.
- Scale texture to the object. Tiny dense noise makes a small prop look enormous or unreadable.
- Keep labels/emblems aligned to the face perspective and clipped inside that face.
- Do not use one universal highlight stripe across components that face different directions.

#### Object drawing order

1. Plot footprint, world scale, perspective axes, contact baseline, primary box/ellipsoid/polygon, and interaction point.
2. Block all primary and secondary masses as flat silhouettes.
3. Check supports, attachment points, open/closed state, and functional recognition at 1×.
4. Split visible top/front/side/bottom/interior planes with consistent edge ownership.
5. Add rims, thickness, joints, hinges, sockets, handles, controls, and other Priority B structures.
6. Apply material base/shadow/light per plane.
7. Add state indicators, contents, restrained wear, and narrative accents.
8. Integrate contact/cast shadow and surrounding occlusion.
9. Repair all extreme edges, support bottoms, top caps, opening rims, corners, and face seams.
10. Compare against the category inventory and inspect in scene context.

#### Object rejection gate

Reject and continue if any applicable answer is “no”:

- Is the object's function/state readable from silhouette and structural parts, not only from a label or color?
- Do all primary/secondary assemblies have believable attachment or mapped occlusion?
- Are supports, feet, brackets, roots, wheels, or suspension actually connected to the world/object?
- Are top/front/side/bottom/interior faces consistent in perspective and edge ownership?
- Do openings show rim/thickness/depth rather than a flat dark sticker?
- Can handles, doors, drawers, controls, seats, ports, or moving parts plausibly operate?
- Are material cues directional, scaled, and limited to their proper components?
- Does the contact shadow agree with footprint and lighting?
- Are the topmost cap and bottommost contact/underside complete after compositing?
- Was the object checked at world scale beside the player/tile system when that context exists?

### Item, pickup, and inventory-icon blueprint

An item is usually judged faster and at a smaller scale than a world object. It must communicate category, use, state, material, quantity/rarity when requested, and presentation consistency. A colored blob plus sparkle is not a finished item icon.

Apply the Weapon or Object blueprint too when the item depicts one of those subjects.

#### Declare item contract

Record:

- Item category, name/role, use, state, rarity/faction, quantity/stack state, and whether it is identified/unknown
- Output context: inventory icon, hotbar icon, shop image, world pickup, crafting ingredient, quest marker, or a matched set of these
- Slot/canvas size, safe padding, optical center, baseline, background/transparent policy, and UI border policy
- View and orientation shared with the icon set
- Category-defining feature, secondary identity feature, and material cue
- World-pickup scale/contact/glow if a pickup version is included
- Whether count, durability, enchantment, cooldown, selection, or rarity belong in the art or are separate UI overlays

Do not bake temporary UI information into the item pixels unless requested. Keep count text, cooldown masks, and selection borders separate when the game UI owns them.

#### Universal item-icon inventory

Every item needs:

1. **Category silhouette** — potion, key, ore, food, armor, scroll, ammo, tool, quest artifact, etc. must read before internal texture.
2. **Functional cue** — stopper/liquid, teeth, blade, buckle, page roll, fuse, handle, socket, ingredient cut, or another use-defining part.
3. **State cue** — full/empty, fresh/spoiled, raw/refined, locked/keyed, charged/depleted, intact/broken, bundled/single when relevant.
4. **Material cue** — glass rim, metal edge, cloth fold, wood grain, paper curl, crystal facet, organic irregularity, or equivalent.
5. **Complete terminal geometry** — top cap/rim and bottom/base/tip protected from fill/highlight overwrite.
6. **Presentation** — deliberate angle, optical centering, consistent padding, no accidental clipping, and separation from slot background.
7. **Set consistency** — shared scale, light, outline weight, palette behavior, and rarity treatment when part of a family.

At micro scale, the category cue must receive the strongest shape/contrast. Remove labels, scratches, sparkles, and garnish before reducing the category silhouette.

#### Category-specific item inventories

##### Potion, bottle, flask, vial, or filled container

Include as applicable:

- Mouth/lip or sealed top, neck, shoulder transition, body, and base
- Cork, cap, stopper, seal, straw, or open mouth state
- Glass/ceramic/metal wall or rim thickness cue
- Liquid level with a horizontal/perspective-consistent surface and color/value separated from container
- Empty air region or opaque-body explanation
- One restrained reflection/refraction cluster shaped by bottle curvature
- Label, band, poison symbol, bubbles, sediment, or glow only after vessel and contents read
- Closed bottom outline/base; liquid fill must not erase it

A colored rectangle inside an outlined bottle is not enough if the neck, rim, stopper, liquid surface, and base are unresolved.

##### Food, plant, ingredient, or consumable

Include as applicable:

- Species/type silhouette: leaf arrangement, fruit lobes, loaf crust, meat cut, fish profile, mushroom cap/stem, herb bundle
- Stem, cut face, wrapper, bone, rind, crust, plate/container, or tied point needed for identity
- Fresh/cooked/spoiled state through controlled shape and color changes
- Moist, dry, fibrous, leafy, baked, crystalline, or fleshy material cue
- Intentional irregularity without confetti texture
- Stack/bundle overlap and contact if quantity is shown

Do not rely on green for “herb” or red for “meat”; the shape and structural parts must support the category.

##### Key, lockpick, tool, or utility item

Include as applicable:

- Working end: key teeth/bit, pick tip, wrench jaw, hammer face, shovel blade, needle point, brush head, etc.
- Shaft/body with controlled axis and taper
- Handle/bow/grip sized for use
- Working-end-to-shaft socket or transition
- Rear termination/hanging hole/end cap
- Folded/open, damaged, magical, powered, or upgraded state cue if relevant

The working end must be distinguishable from the grip at 1×; decorative shine cannot substitute for it.

##### Armor, clothing, accessory, or wearable

Include as applicable:

- Wearable opening/neck/waist/arm/leg cavity that proves orientation
- Front/back or left/right orientation through overlap and perspective
- Thickness, rim, hem, cuff, sole, plate edge, or seam
- Closure/strap/buckle/lace/hinge and how it attaches
- Material-specific fold, plate, chain, leather, or gem treatment
- Pair state for gloves/boots/earrings only when quantity is represented in the icon
- Body-part scale reference or category-defining silhouette

Avoid drawing a torso-shaped flat badge with highlights; show where and how it is worn.

##### Book, scroll, card, map, or paper item

Include as applicable:

- Cover/page/block distinction, spine/binding/roll, corners, and thickness
- Open/closed/rolled/folded orientation
- Page edge or curled terminal where visible
- Strap, seal, clasp, bookmark, handle, or map fold when designed
- Symbol/text represented as a controlled readable glyph cluster, not noisy pseudo-writing
- Paper/parchment vs leather/metal cover material separation

Keep glyphs subordinate to the complete paper/book construction and never use actual tiny illegible paragraphs as texture.

##### Ore, currency, crafting resource, gem, or material stack

Include as applicable:

- Single-unit base form before stack duplication
- Facets, chunk breaks, ingot edges, coin rim, thread/fiber direction, wood cut end, or material-specific structure
- Controlled overlap and contact among stack units
- Quantity cue that does not create impossible merged silhouettes
- Refined/raw state and rarity/value cue if requested
- Shadow pockets at overlaps and complete outer cluster contour

Do not represent every resource as three generic colored rocks; vary silhouette, fracture/facet language, and processed form.

##### Quest, magic, relic, or key-story item

Include as applicable:

- Solid physical core/body with complete construction
- Unique emblem, silhouette, fracture, setting, seal, inscription, or energy path tied to its narrative role
- Housing, chain, pedestal fragment, grip, socket, or containment when required
- Clear inactive/active/charged/corrupted state
- Glow hierarchy: core first, near halo second, sparse particles last
- Recognition without glow and without explanatory text

Rarity is not “more sparkles.” Use silhouette distinction, material, palette placement, construction quality, and restrained effect intensity.

##### Ammo, projectile, bomb, or stackable combat item

Include as applicable:

- Projectile tip/muzzle-facing end, body/casing/shaft, rear/fletching/primer/end cap
- Fuse, pin, trigger, safety, bandolier, clip, quiver, or container needed by the category
- Orientation and loaded/empty/armed/safe state
- Stack count represented through controlled overlap, bundle, or container—not random duplicates
- Safe icon padding around sharp terminals and effects

Apply the Weapon blueprint to functional projectile construction.

#### Icon composition and set consistency

- Define a shared safe box inside every slot; normally no important outline pixel touches the outer canvas edge.
- Center by visual mass, not only numeric bounding-box center. A long handle may require optical offset toward the heavy head.
- Use a consistent tilt family, but rotate only when it improves recognition and does not contradict fixed world lighting.
- Keep apparent category scale coherent across the set while allowing long/thin items to use diagonals.
- Reserve strongest contrast for the item, not an optional rarity frame or sparkle.
- Keep background transparent unless a slot plate is part of the requested art system.
- Use the same outline policy, light direction, shadow depth, and material palette logic across related icons.
- Test every icon against light, dark, and representative UI backgrounds.
- At 1×, compare all icons in a contact sheet for size drift, padding drift, baseline drift, and inconsistent detail density.

#### World pickup requirements

A pickup version needs more than copying the UI icon:

- Establish world projection, scale relative to player/tile, ground/floating height, and stable anchor.
- Choose an orientation that reads from the camera, not necessarily the UI-icon tilt.
- Add contact/cast shadow or a deliberate levitation mechanism.
- Keep interaction outline/glow outside the physical silhouette when possible.
- Animate bob/rotate/pulse with stable volume and first-to-last loop continuity when requested.
- Ensure pickup effects do not conceal item category, bottom outline, or ground relationship.

#### Item drawing order

1. Freeze slot safe box, optical center, view, category cue, functional cue, and state.
2. Draw a complete category silhouette with top/bottom terminals and no garnish.
3. Add functional components and their junctions.
4. Add thickness/opening/content/stack overlap needed to prove state.
5. Separate materials with controlled base/shadow/light clusters.
6. Add one strong identity/rarity/story cue.
7. Add only the minimum useful label, wear, particle, or sparkle accents.
8. Repair cap/rim, corners, base/tip, stack contour, and functional seams.
9. Inspect at 1× on multiple backgrounds and beside the rest of the set.
10. Verify icon and pickup outputs independently when both were requested.

#### Item rejection gate

Reject and continue if any applicable answer is “no”:

- Can category, orientation, use, and requested state be identified at 1× without the item name?
- Does the category-defining functional part actually exist and connect to the body/grip/container?
- Are top cap/rim and bottom base/tip complete, with no liquid, glow, or highlight overwrite?
- Is each important material conveyed by a truthful shape/light cue?
- Are contents, opening, thickness, stack overlap, and quantity logically depicted where relevant?
- Is the icon optically centered with consistent safe padding and no clipped terminal?
- Does it remain readable on light, dark, and representative UI/world backgrounds?
- If part of a set, do scale, tilt, outline, lighting, palette behavior, and detail density match?
- If also a pickup, are world scale, projection, anchor, shadow/levitation, and animation independently correct?
- Does the item remain recognizable after optional glow, rarity frame, text, and sparkles are hidden?

## Pixel-art craft rules

### Silhouette first

A recognizable outer shape is more important than interior detail. If the subject does not read as a flat silhouette, revise proportions before shading.

### Close and protect the outline

For outlined styles, treat the final exterior contour as a protected mask. Reapply it after face fills, lighting, details, and overlaps. Audit the top and bottom independently; side contours alone do not prove a closed silhouette. A lit colored edge is valid only when it is intentional, connected, and listed in the outline palette.

### Build clusters, not noise

Prefer connected pixel groups with clear shape language. Avoid isolated “confetti” pixels, accidental checkerboards, and evenly distributed texture.

### Control curves and diagonals

Use deliberate stair-step progressions such as `1-1-2-2` or `1-2-2-3` where appropriate. Remove bumps that break the intended curvature. Adapt the rhythm rather than applying a formula blindly.

### Keep a consistent light model

Declare the light direction once. Highlights face it; form shadows turn away; cast shadows follow geometry. Avoid outlining every internal plane with both light and dark bands.

### Preserve focal hierarchy

Highest contrast and smallest sharp details belong near the focal point. Secondary areas should use quieter values and fewer details.

### Use controlled asymmetry

Symmetry is useful for construction, especially for front-facing objects. Introduce purposeful asymmetry in pose, wear, expression, highlights, or secondary shapes when it improves life and readability.

### Avoid premature anti-aliasing

For classic pixel art, prefer clean hard clusters. Add manual anti-aliasing only when the requested style and output scale justify it, and keep it controlled rather than blurring every contour.

## Professional chain coding standard

A final chain should read like maintained source code:

```text
# ART: 24x24 front-view crystal inventory item, transparent background
# CLASS/SCOPE: item + object; one inventory icon; production tier
# COVERAGE: crystal core, top point, side facets, lower socket/base, material cue, safe padding
# GEOMETRY: bbox=(4,2)..(19,20), center axis=11.5, light=top-left
# OUTLINE: full 1px colored outline; top=(11..12,2), bottom=(11..12,20); no open edges
# FACES: top/front/side row spans calculated separately; each shared seam has one owner
# PALETTE: outline=#1b1f3a shadow=#3b4f9f base=#5d7bd9 light=#8fb8ff highlight=#e8f7ff

# SETUP
document.new {"name":"Crystal","width":24,"height":24,"fps":8,"frameCount":1,"layerNames":["Crystal"]}

# OUTLINE UNDERPAINT / SILHOUETTE
# <complete calculated exterior mass, including top and bottom terminal runs>

# INSET FACE FILLS
# <fills stop inside protected scanline/column endpoints>

# VOLUME
# <shadow, base, and light commands>

# REQUIRED FUNCTION / MATERIAL / IDENTITY CUES
# <complete every Priority A/B manifest item before garnish>

# FOCAL DETAILS AND CLEANUP
# <small intentional clusters and planned occlusion>

# SUBJECT-CLASS REPAIR
# <repair any failed item/object blueprint requirement before final ink>

# FINAL OUTLINE REPAIR — MUST FOLLOW EVERY OVERWRITE-CAPABLE COMMAND
# <redraw top rim, both upper corners, side slopes, lower corners, bottom rim, and visible face seams>

# OUTLINE + STATE VERIFICATION
frame.read {"layer":0,"frame":0,"format":"rows"}
frame.read {"layer":0,"frame":0,"format":"sparse"}
document.colors
app.state
```

Replace every placeholder with calculated commands before running. Never submit the setup/skeleton itself as completed artwork.

Code requirements:

- Use descriptive section comments and document calculations.
- Encode subject class, deliverable scope, resolution tier, required component coverage, and intentional exclusions in comments.
- Keep command ordering deterministic and reproducible.
- Keep every command plus its complete compact JSON argument object, when present, on one physical line, including every `draw.pixels` array.
- Never pretty-print chain JSON, use line continuations, or place inline comments after an executable command.
- Split explicit pixels by semantic component/cluster, not at arbitrary points inside one JSON object.
- Specify `layer` and `frame` explicitly in reusable/final chains.
- Keep colors consistent and lowercase.
- Group commands by pass and visual purpose.
- Encode the outline policy, edge ownership, protected extrema, and face geometry in comments.
- Keep interior fills inset from full-outline boundaries.
- Place final outline repair after all face fills, shadows, highlights, details, and overlaps.
- Verify top and bottom contour runs explicitly in every relevant frame.
- Run and record the applicable character/player/weapon/tilemap/object/item rejection gate before completion.
- Avoid hidden dependence on the currently selected tool/layer/frame.
- Avoid redundant writes and accidental overwrite ordering.
- Use the smallest clear command set, not code golf and not command spam.
- End with machine-verifiable reads.

## Console UI operation

Open and run through the interface:

```ts
await page.getByTestId("console-settings-button").click();
await expect(page.getByTestId("console-panel")).toBeVisible();

const command = page.getByTestId("console-command-input");
const input = page.getByTestId("console-args-input");
const output = page.getByTestId("console-output");

await command.fill("chain");
await input.fill(chainSource);
await page.locator(".console-format").click();
await page.getByTestId("console-run").click();

const result = output.locator(".console-output-success").last();
await expect(result).toContainText('"count"');
```

Chain syntax:

```text
command.name {"optional":"JSON arguments"}
```

- One command per **physical editor line**; if JSON arguments are written, the complete object stays on that same line; omitted arguments become `{}`.
- `draw.pixels` is not an exception: its entire `pixels` array stays on that command's physical line.
- Visual soft wrapping is allowed; actual newlines inside an argument object are forbidden.
- Blank lines and full-line `#` comments are allowed; inline comments are not.
- A trailing semicolon is optional.
- **Format chain must pass before Run.** It does not join split JSON lines for you.
- Commands run top-to-bottom and stop on the first runtime error.
- Completed mutations are not rolled back automatically.
- Each mutation remains a separate undo operation.
- Maximum length is 1,000 commands.
- Chains cannot pipe one result into a later line.

Use a single normal command instead of `chain` for genuinely large multiline data such as a large `draw.pixels`, `document.write`, `frame.write`, `.piskel` import, or base64 image. After that one verified operation, restore `chain` as the default.

## Error prevention and recovery

Discover rather than guess:

```text
help {"filter":"draw"}
help {"filter":"document"}
capabilities
```

Diagnose by error class:

| Message form | Meaning | Mutation state | Required response |
| --- | --- | --- | --- |
| `Chain line N has invalid JSON` | Physical line `N` does not contain one complete valid JSON object; commonly a multiline `draw.pixels` | Zero commands from this Run executed because the whole source failed parsing | Inspect line `N` and the preceding line, compact the command onto one physical line, then run **Format chain** again |
| `Chain line N: unknown command ...` | A JSON fragment or misspelled/unregistered token appears where a command should begin | Zero commands executed | Repair the split line or discover the real command with `help` |
| `Chain line N arguments must be a JSON object` | Top-level arguments are an array/scalar/null rather than `{...}` | Zero commands executed | Wrap documented fields in one object; for `draw.pixels`, the array belongs under `"pixels"` |
| `Chain stopped at line N (...) after K completed command(s)` | Parsing passed, but command `N` failed runtime validation/execution | The `K` earlier mutation commands remain applied | Inspect state/history, then continue, undo exactly, or rebuild from clean setup |

For `Chain line 29 has invalid JSON`, never keep editing pixel coordinates first. Check whether line 29 looks like `draw.pixels {`, whether line 30 begins with `"layer"`/`"pixels"`, or whether a closing `]}` sits on a later line. If so, merge the complete command and pixel array onto line 29 or use the declared single-command exception.

Runtime recovery procedure:

1. Read the failing physical line, command, completed count, and original message.
2. Do not rerun the entire chain blindly.
3. Inspect `app.state`, the relevant frame pixels, and `history.state`.
4. Decide whether to continue from the partial result, undo the exact completed mutations, or rebuild deterministically from a clean setup.
5. Fix the smallest calculation/argument/target phase.
6. Run **Format chain**, rerun only that phase, read it back, and inspect visually.

Direct drawing and structured replacement commands validate before committing their own change, but earlier successful lines in a runtime-failed chain remain applied.

## Animation-specific gate

Before completion, confirm:

- Key poses are distinct and readable.
- Motion follows an intentional arc or displacement table.
- Body/object volume does not unintentionally grow or shrink.
- Exterior outline, top/bottom caps, corners, and visible face seams remain complete in every frame.
- Feet, contact points, or attachment anchors do not slide accidentally.
- Secondary motion follows primary motion with believable delay.
- Frame timing supports the action; holds are intentional.
- The final frame transitions cleanly back to the first.
- Hidden frames and preview visibility match the request.
- The animation is inspected at its actual FPS, not only frame-by-frame.

## Completion report

Report concise evidence, not a vague “done”:

```text
Completed: <subject and action>
Class/scope: <character/player/weapon/tilemap/object/item blueprints and exact deliverables>
Canvas: <W×H>, <layers>, <frames/tiles at FPS>
Coverage: <required manifest components and intentional occlusions/exclusions>
Class gate: <applicable rejection gate evidence and result>
Palette/materials: <count, key roles, and material cues>
Geometry: <subject/component bounds, anchors, attachments, face vertices/row spans>
Outline: <policy; top/bottom extrema; seam ownership; closure audit result>
Chain preflight: <chain default; Format chain passed; every command/JSON on one physical line>
Passes: silhouette, structure, face fills, volume, function/identity, outline repair, cleanup, animation (as applicable)
Verification: <state/pixel/boundary/component/tile-seam checks performed>
Visual review: <1×, zoom, backgrounds, repeat/map/loop checks as applicable>
Export/save: <performed or intentionally not performed>
Remaining limitation: <none or explicit issue>
```

Do not claim a quality gate passed if it was not actually inspected.

## Secondary programmatic interface

Use `window.piskelAPI` only when Console UI chains cannot express a required data dependency or large-data transformation:

```js
await page.waitForFunction(() => Boolean(window.piskelAPI));

const result = await page.evaluate(async () => {
  const api = window.piskelAPI;
  const document = await api.document.read({ format: "uint32" });
  document.name = "Calculated copy";
  await api.document.write({ document });
  return api.app.state();
});
```

Always `await` commands. Never mutate private `pskl.*` objects, use `eval`, or execute untrusted code.

## References

- Console UI and API reference: [`docs/console-api.md`](docs/console-api.md)
- Runtime command source of truth: panel command `help`
- Console UI controller: `src/js/controller/settings/ConsoleController.js`
- Public API implementation: `src/js/api/ConsoleAPI.js`
