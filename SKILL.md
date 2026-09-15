---
name: piskel-console-ui
description: Use when creating or editing Piskel pixel art; enforces an art brief, measured geometry, palette planning, safe Console UI command chains, visual QA, and refinement.
---

# Professional Piskel Drawing with Console UI

Use the in-app **`>_ API`** panel as the primary interface. The goal is not merely to produce valid pixels: deliver deliberate, readable, polished pixel art backed by measured geometry, a controlled palette, deterministic commands, and visual review.

Do not start drawing immediately after reading the request. Do not submit a rough block-in, random pixel scatter, or a minimally recognizable icon as finished work.

## Non-negotiable quality contract

For every nontrivial drawing, the agent MUST:

1. Understand the subject, purpose, style, dimensions, background, and animation requirements.
2. Inspect the current editor state before changing it.
3. Produce a compact art brief and declare any assumptions.
4. Calculate the composition, subject bounds, anchors, symmetry, proportions, and frame plan.
5. Define a small palette by visual role before assigning colors to pixels.
6. Build from silhouette to volume to details, not details first.
7. Use deterministic, organized Console UI command chains with explicit targets.
8. Validate command names, JSON, indexes, dimensions, and coordinate bounds.
9. Read back the resulting state/pixels and inspect the rendered image visually.
10. Perform at least one deliberate cleanup/refinement pass after the first render.
11. Verify animation timing and loop continuity when multiple frames are requested.
12. Save or export only after all applicable quality gates pass.

Reason as deeply as needed, but record concise decisions, measurements, and checks rather than a stream-of-consciousness transcript.

## Definition of done

A drawing is complete only when both categories pass.

### Technical correctness

- Canvas, layer count, frame count, FPS, and background match the request.
- Every command succeeded; no chain error is ignored.
- Every coordinate is an integer inside the intended frame.
- Shape extents and pixel arrays are within bounds.
- Commands target explicit layers/frames where ambiguity is possible.
- Readback confirms expected dimensions, metadata, colors, and key pixels.
- No accidental palette, setting, selection, or current-frame state remains.

### Visual quality

- The silhouette reads at 1× scale.
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
| Brief | Subject, style, canvas, background, focal point, and assumptions recorded | Clarify or revise the brief |
| Geometry | Bounds, centers, anchors, proportions, and all extents calculated | Recalculate before drawing |
| Palette | Every color has a role and useful value separation | Remove/replace colors |
| Silhouette | Subject reads at 1× without interior detail | Redesign major masses |
| Form/light | Shading follows one declared light model | Rebuild shadow/light planes |
| Pixel craft | Clusters and contour steps are intentional; no obvious noise | Perform cluster cleanup |
| Technical | Commands succeed and readback matches dimensions/pixels | Fix smallest failing phase |
| Visual review | Actual render inspected at 1× and zoom | Capture and inspect it |
| Animation | Poses, anchors, timing, volume, and loop inspected | Revise frames/timing |

Any applicable gate without evidence is not a pass. `N/A` is acceptable only with a clear reason.

Complexity must be proportional to the request. More commands do not automatically mean better art; every command must have a visual purpose.

## Mandatory workflow

### Phase 1 — Interpret the request

Extract or decide:

- **Subject and action**: what is depicted and what it is doing
- **Use case**: icon, game sprite, portrait, tile, item, animation, concept
- **Style**: cute, realistic, retro, limited-palette, outlined, isometric, etc.
- **View**: front, side, top-down, three-quarter, isometric
- **Canvas**: width and height
- **Background**: transparent, flat color, scene, or tileable
- **Animation**: frame count, FPS, loop behavior, key action
- **Constraints**: required colors, palette limit, symmetry, existing content to preserve

Ask a concise clarification only when an unresolved choice would materially change the result. Otherwise state reasonable assumptions in the art brief.

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
Subject/action: <clear one-sentence description>
Canvas/background: <W×H, transparent or color>
View/style: <viewpoint and pixel-art treatment>
Focal point: <highest-priority feature>
Light: <direction, softness, material response>
Subject bounds: <x0..x1, y0..y1>
Major proportions: <head/body/item ratios or shape hierarchy>
Palette roles: <outline, shadow, base, light, highlight, accents>
Layers: <ordered bottom to top>
Frames/FPS: <count, timing, loop plan>
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
- Character line of action/joint landmarks or object perspective axes when applicable
- Ground/contact line or motion anchor
- Symmetry axis and any intentional asymmetry
- Outline thickness and diagonal step rhythm
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
```

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

### Phase 7 — Build a professional command plan

Organize commands broad-to-fine:

1. Create or inspect the document.
2. Create/select semantic layers and frames.
3. Clear or establish the background.
4. Draw the outer silhouette and largest masses.
5. Add interior base-color planes.
6. Add cast/form shadows according to the declared light.
7. Add highlights and material cues.
8. Add facial/focal details and controlled accents.
9. Clean contours and isolated pixels.
10. Append verification reads.

Prefer primitives for coherent large forms:

- `draw.clear` for full-frame fills
- `draw.rect` for block masses and architecture
- `draw.line` for deliberate edges and row spans
- `draw.ellipse` for circular/organic foundations
- `draw.fill` for enclosed regions
- `draw.pixels` for hand-authored clusters, contour corrections, and small details
- `draw.replaceColor` for deliberate palette revisions

Do not emulate a large rectangle with hundreds of individual pixels. Do not use a primitive when its geometry produces a visibly crude result that needs hand-tuned clusters.

### Phase 8 — Preflight the code

Before selecting **Run**, verify every chain line:

- Command exists in `help` and uses the documented argument names.
- JSON is valid and remains on one physical line.
- All numeric drawing values are integers.
- Every `layer` and `frame` index exists at that point in the sequence.
- Every rectangle/ellipse fits: `x + width <= W`, `y + height <= H`.
- Every line endpoint and every explicit pixel is inside the frame.
- `draw.pixels` has no accidental duplicate coordinates; later duplicates would silently overwrite earlier intent.
- Colors are valid full hex values or `transparent`.
- Creation commands precede commands that depend on their layers/frames.
- Destructive commands are intentional and preceded by preservation when needed.
- Final read commands target the same layers/frames that were drawn.

Use **Format chain** as a syntax/registry preflight. Formatting does not validate each command's semantic bounds, so the coordinate audit is still required.

### Phase 9 — Execute in visual passes

For nontrivial work, do not write one enormous unreviewed chain. Use controlled passes:

#### Pass A: construction and silhouette

Draw only the background, silhouette, and largest internal masses. Then read back and inspect visually.

#### Pass B: volume and materials

Add shadows, lights, planes, and material cues. Reinspect value separation and form readability.

#### Pass C: focal details and polish

Add only details that improve identity, scale, expression, or focus. Clean the contour and pixel clusters.

#### Pass D: animation and consistency

Apply the planned motion to each frame, then compare silhouettes, volume, anchors, and loop timing.

After iteration, the validated final chain may combine the passes into one reproducible run. During development, phased verification is safer than repeatedly running a giant partially failing chain.

### Phase 10 — Verify structurally

Append read commands to every mutation pass:

```text
frame.read {"layer":0,"frame":0,"format":"sparse"}
document.state {"pixels":"none"}
document.colors
app.state
```

Verify:

- Expected dimensions, layers, frames, and FPS
- Expected current/target layer and frame
- Key boundary pixels and palette colors
- Subject bounds do not touch unintended edges
- Transparent areas remain transparent
- No command unexpectedly altered another frame/layer
- File/document hash changed when a mutation was expected

A resolved command is not sufficient proof of a correct drawing.

### Phase 11 — Inspect visually and refine

Inspect the actual rendered art, not just JSON:

1. **1× view**: silhouette, value grouping, focal point, overall readability
2. **Zoomed view**: clusters, contour rhythm, single-pixel errors, tangents, banding
3. **Background check**: transparent and both light/dark backgrounds when relevant
4. **Animation preview**: timing, arcs, volume stability, contact points, loop seam

For browser automation, capture and inspect a screenshot after each major pass. Use the animated preview for multi-frame work. If the rendered image cannot be viewed, explicitly report that the visual gate is unverified instead of claiming polished completion.

Mandatory cleanup questions:

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

## Pixel-art craft rules

### Silhouette first

A recognizable outer shape is more important than interior detail. If the subject does not read as a flat silhouette, revise proportions before shading.

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
# ART: 24x24 front-view crystal icon, transparent background
# GEOMETRY: bbox=(4,2)..(19,20), center axis=11.5, light=top-left
# PALETTE: outline=#1b1f3a shadow=#3b4f9f base=#5d7bd9 light=#8fb8ff highlight=#e8f7ff

# SETUP
document.new {"name":"Crystal","width":24,"height":24,"fps":8,"frameCount":1,"layerNames":["Crystal"]}

# SILHOUETTE
# <calculated shape commands>

# VOLUME
# <shadow, base, and light commands>

# FOCAL DETAILS AND CLEANUP
# <small intentional clusters and contour corrections>

# VERIFICATION
frame.read {"layer":0,"frame":0,"format":"sparse"}
document.colors
app.state
```

Replace every placeholder with calculated commands before running. Never submit the setup/skeleton itself as completed artwork.

Code requirements:

- Use descriptive section comments and document calculations.
- Keep command ordering deterministic and reproducible.
- Specify `layer` and `frame` explicitly in reusable/final chains.
- Keep colors consistent and lowercase.
- Group commands by pass and visual purpose.
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

- One command per line; omitted arguments become `{}`.
- Blank lines and full-line `#` comments are allowed.
- A trailing semicolon is optional.
- Commands run top-to-bottom and stop on the first runtime error.
- Completed mutations are not rolled back automatically.
- Each mutation remains a separate undo operation.
- Maximum length is 1,000 commands.
- Chains cannot pipe one result into a later line.

Use a single normal command instead of `chain` for large multiline data such as `document.write`, `frame.write`, `.piskel` import, or base64 images.

## Error prevention and recovery

Discover rather than guess:

```text
help {"filter":"draw"}
help {"filter":"document"}
capabilities
```

When a chain fails:

1. Read the `ChainError` line, command, completed count, and original message.
2. Do not rerun the entire chain blindly.
3. Inspect `app.state`, the relevant frame pixels, and history state.
4. Decide whether to continue from the partial result, undo the exact completed mutations, or rebuild deterministically from a clean setup.
5. Fix the calculation or arguments, rerun the smallest affected phase, and verify again.

Direct drawing and structured replacement commands validate before committing their own change, but earlier successful lines in a chain remain applied.

## Animation-specific gate

Before completion, confirm:

- Key poses are distinct and readable.
- Motion follows an intentional arc or displacement table.
- Body/object volume does not unintentionally grow or shrink.
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
Canvas: <W×H>, <layers>, <frames at FPS>
Palette: <count and key roles>
Geometry: <subject bounds and anchors>
Passes: silhouette, volume, details, cleanup, animation (as applicable)
Verification: <state/pixel checks performed>
Visual review: <1×, zoom, backgrounds, loop checks>
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
