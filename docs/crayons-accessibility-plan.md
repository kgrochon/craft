# Crayons page: screen reader accessibility plan

This plan covers the crayons page (`src/crayons`). It has three parts:

1. Fixes from the screen reader review.
2. A spoken description of the drawing, from local stroke data and optionally from Claude.
3. A "sound map" that tells a blind user where the crayon is on the paper.

## Where things stand

The page already has a good base:

- **Status region:** One polite live region announces changes, and repeated messages are still spoken.
- **Paper:** It is a named drawing surface with help text. You can draw with the keyboard, and positions are spoken as percentages.
- **Shelf:** The boxes are a labelled radio group.
- **Box:** Crayons are checkboxes with their names and slot numbers. Only one crayon is a Tab stop at a time, and arrow keys move between them.
- **Palette:** Slots have names and a pressed state, and the remove button is labelled. Delete removes a slot, and focus follows the selection after a removal.
- **Gallery:** It is a native modal dialog with focus handled correctly.

The gaps are reading order, orientation, controls that don't behave as their roles promise, and the drawing itself, which a blind user can't perceive.

## Phase 1: Structure and reading order

**Goal:** A screen reader user can tell what is on the page and move between regions quickly.

| #   | Change                                                                                                                                                                        | Where         |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| 1.1 | Reorder the markup: header (back link and tools), shelf, tray (palette and hand), then paper. The visual layout stays the same because every region is absolutely positioned. | `Crayons.tsx` |
| 1.2 | Wrap the page in `<main>` and add hidden `h2` headings for "Boxes", "Palette" and "Paper". Keep the existing hidden `h1`.                                                     | `Crayons.tsx` |
| 1.3 | Rename the back link so it reads "Back to Kaffinated". Hide the arrow character from screen readers.                                                                          | `Crayons.tsx` |

## Phase 2: Controls that behave as announced

**Goal:** Every control does what its role tells the user to expect.

| #   | Change                                                                                                                                                                                                                                          | Where                                                              |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 2.1 | Turn the lid into a plain expandable panel instead of a non-modal dialog. Remove the dialog role. Keep the expanded state and the reference to the panel on the Open box button. Esc still closes it.                                           | `Crayons.tsx`                                                      |
| 2.2 | When the lid closes from a press outside it while focus is inside, move focus to the Open box button so it doesn't drop to the top of the page.                                                                                                 | `Crayons.tsx` (the effect that closes the lid on an outside press) |
| 2.3 | Drawing tools: add arrow-key movement with one Tab stop, the standard toolbar pattern. The alternative is to drop the toolbar role. Recommended: add the arrow keys.                                                                            | `Crayons.tsx`                                                      |
| 2.4 | Sharpener: replace `disabled` with `aria-disabled` so it stays focusable and can say "already sharp", like the other tools. Done for the standing sharpener on the desk (`Sharpener.tsx`); the small button on phones still uses `disabled`.    | `InHand.tsx`                                                       |
| 2.5 | Shelf: arrow keys in the radio group switch boxes on every press. Announce the box only, since its palette is already remembered. Or move selection to Space and Enter. Recommended: keep the native behaviour and make the announcement short. | `Shelf.tsx`, `chooseBox` in `Crayons.tsx`                          |

## Phase 3: Instructions and feedback

**Goal:** Users learn the keys without guessing, and hear each change once.

| #   | Change                                                                                                                                                                                | Where                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| 3.1 | Add short hidden instructions linked to the box ("Arrow keys move. Space adds or removes.") and the palette ("Arrow keys move. Enter picks. Delete removes.").                        | `OpenBox.tsx`, `Palette.tsx`                       |
| 3.2 | Give the remaining-amount meter readable text, such as "85 percent left" or "worn to a nub", matching the tip meter.                                                                  | `InHand.tsx`                                       |
| 3.3 | Trim the status messages. When a checkbox already says "checked", only add the slot ("in slot 3"). Randomize says "10 random crayons, holding Red" and lists the names only if asked. | `toggleInPalette` and `randomize` in `Crayons.tsx` |
| 3.4 | Add a "Where am I" key on the paper that speaks the position and what is under the crayon. This uses data from Phase 5.                                                               | `onKeyDown` in `Crayons.tsx`                       |

## Phase 4: Describing the drawing

**Goal:** A blind user can find out what is on the paper in plain language, on demand.

### 4.1 Local summary, always available

Build a summary from the strokes with no network call. Each stroke already records its crayon's name, colour, points and widths.

- **Contents:** Colours used, by crayon name and share of line drawn, using the same measure the palette uses in `drawingPalette.ts`.
- **Where each colour sits:** Given as a 3×3 grid position, such as "Blue mostly across the top" or "Red in the lower left".
- **Size and density:** The number of marks, how much of the paper is covered, and whether marks are clustered or spread out.
- **Example:** "14 marks in 4 colours. Mostly Cerulean across the top third. A small cluster of Red in the lower left. About a fifth of the paper is covered."
- **Code:** A new pure module, `describeStrokes.ts`, that can be checked by hand like `paletteSlots.ts`.
- **Uses:** It is spoken by a "Describe drawing" button and a key on the paper. It is the fallback whenever the AI description isn't available. It is also sent to Claude as context.

### 4.2 AI description through Claude, opt-in

This adds a short, hedged sense of what the drawing might be, such as "It might be a sun over a house".

**Architecture.** The site is static and deploys on Vercel, so the API key can't live in the page.

- **Proxy:** Add a Vercel Function at `api/describe.ts` using `@anthropic-ai/sdk`. The key is read from the `ANTHROPIC_API_KEY` environment variable in Vercel.
- **Routing:** `vercel.json` currently sends every path to `/`. Change the rewrite so `/api/*` is left alone, for example `"source": "/((?!api/).*)"`.
- **Request:** The client sends a PNG of the drawing on the sheet colour plus the local summary from 4.1. Build the PNG with the existing export helpers in `exportDrawing.ts`, scaled to at most 1024px on the long edge.

**Model call.**

- **Model:** `claude-opus-5-5`, the current default. Set `output_config.effort` to `"low"`, because this is a short describing task and faster responses matter.
- **Input:** One user message with a base64 PNG image block, followed by a text block containing the local summary.
- **Output:** Use structured output (`output_config.format`) to return two fields. `short` is one sentence for the paper's accessible name and the saved drawing's alt text. `long` is two to four sentences, spoken on request.
- **System prompt rules:**
    - Describe literally first: shapes, crayon colour names and positions.
    - Only then offer a hedged guess at the subject ("might be", "looks like").
    - Never judge quality, and never invent writing that isn't there.
    - Say plainly if the paper is blank or nearly blank.
    - Use the local summary's colour names, so the description matches the crayons the user knows.
- **Refusals:** Check `stop_reason` before reading the content. Include the server-side `fallbacks: "default"` parameter with the `server-side-fallback-2026-07-01` beta header, as current guidance recommends for this model. If the response is still a refusal, return the local summary.
- **Cost:** A drawing image of about 1024px plus a short prompt is roughly 1,500 input tokens and up to 300 output tokens. At $4 / $20 per million tokens, that is about one to two cents per description. Using Claude Haiku 5.5 instead would cut that sharply. That is a product decision, listed in Open decisions.

**Privacy and abuse.**

- **Opt-in:** Nothing is sent automatically. The first time someone presses "Describe drawing", one line explains that the drawing will be sent to Anthropic to describe it, with a "Describe" button to continue. The answer is remembered in local storage.
- **Proxy limits:** The proxy rejects bodies over about 2 MB and requests from other origins. It applies a per-IP rate limit through Vercel's firewall or a small KV counter. It never logs image data.
- **Errors:** On any failure, such as being offline, a missing key, a 429 or a 5xx, the page speaks the local summary and says the full description isn't available right now.

**Where descriptions go.**

- **Speech:** The short description is spoken through the status region.
- **Paper:** It becomes part of the paper's accessible description until the drawing changes.
- **Cache:** Results are cached against the stroke list using the existing `sameDrawing` check, so asking twice doesn't call the API twice.
- **Saved drawings:**
    - The `short` text is saved with the drawing and used as the gallery thumbnail's alt text. Today that alt text is empty.
    - An SVG export carries the long description in `<title>` and `<desc>`.
    - This needs a `description` field added in `drawingStore.ts`.

## Phase 5: Sound map, hearing where you are on the paper

**Goal:** A blind user always has a sense of where the crayon is, and where existing marks are, without waiting for speech.

Similar ideas are established elsewhere, such as Apple's Audio Graphs and Highcharts sonification. Both map position to stereo pan and pitch, and both play a sweep that reveals where the data is.

### The mapping

| Signal                                     | Sound                                                                                                               | Why                                                      |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Horizontal position                        | Stereo pan from left to right                                                                                       | Pan is the most natural way to hear left and right.      |
| Vertical position                          | Pitch, higher at the top and lower at the bottom, on an exponential scale of about 220 to 880 Hz                    | "High means up" is near universal.                       |
| Drawing (crayon down and moving)           | Filtered noise, a soft crayon-on-paper scratch, with loudness following speed and filter frequency following height | The user hears that wax is going down and where.         |
| Moving with the crayon up (keyboard steps) | A short soft blip per step, at the pitch and pan of the new position                                                | Gives position without speech.                           |
| Crossing quarter lines                     | A faint tick at 25%, 50% and 75%, with a double tick at the centre                                                  | A coarse grid you can count.                             |
| Hitting the paper's edge                   | A low wooden knock, distinct at the corners                                                                         | Explains why the crayon stopped moving.                  |
| Passing over existing marks                | A change in texture, a waxier and brighter scratch, or a soft chime when the crayon is up                           | The key to drawing in relation to what is already there. |

### On-demand sounds

These are keys handled by the paper. The paper's application role already passes keys through, so screen reader shortcuts aren't needed.

- **Row scan:** One key plays a one-second sweep from left to right across the crayon's current row, with a blip wherever there is ink. A second key does the same for the column.
- **Where am I:** Speaks the position and the colour under the crayon. This is item 3.4.

### Detecting ink under the crayon

Keep a small grid of cells, say 64×64, recording which colours touch each cell. Update it as strokes are added, and rebuild it on undo, clear or open. A lookup is then constant time, with no pixel reads from the canvas.

### Implementation

- **New module, `soundMap.ts`:** Creates its Web Audio objects lazily on the first user action, because browsers block audio before that. It exposes `setEnabled`, `move(point, { down, speed })`, `edge(side)`, `tick(line)`, `overInk(colours)`, `scanRow(y)` and `scanColumn(x)`.
- **Hook points:** Wire it into `startStroke`, `carryStroke`, `endStroke` and the keyboard pen moves in `Crayons.tsx`. Pointer moves with the crayon up can also play position, which helps touch exploration with VoiceOver on a tablet.
- **On/off:** A "Sound map" toggle button in the tools, using the pressed state. The setting is remembered in local storage.
- **Default:** Off, with a mention in the paper's help text. Turning it on is announced with a short demonstration sweep.
- **Coexisting with speech:** Keep levels low, around −18 dB under full scale. Duck the sound map for about one second after each status announcement so it doesn't mask the screen reader. Stop all sound when the tab is hidden.
- **Tuning:** Pitch range, pan curve and tick density live in one settings object, so they can be adjusted after testing.

## Phase 6: Beyond screen readers, optional

- **Reflow:** The desk is fixed to the window with overflow hidden. At 400% zoom the content is clipped. Add a layout that scrolls at narrow widths. This is WCAG 2.2 success criterion 1.4.10.

## Order of work

1. Phase 1, because it is small, low risk and has the biggest effect on navigation.
2. Phase 2.
3. Phase 3, items 3.1 to 3.3.
4. Phase 4.1, the local summary, which needs no backend.
5. Phase 5, the sound map, then item 3.4, which depends on its ink grid.
6. Phase 4.2, the AI description, once the proxy, key and limits are in place.
7. Phase 6.

## Verification

- **Each phase:** `npx tsc -b`, `npx eslint src/crayons` and `npx vite build` must pass.
- **Automated:** An axe scan of `/crayons` with the lid open and closed.
- **Screen readers:**
    - VoiceOver with Safari on macOS, and VoiceOver on iPad with touch.
    - NVDA with Firefox, and NVDA with Chrome.
- **Script to run with each screen reader:**
    1. Land on the page and list the landmarks and headings.
    2. Change box, open the box and add two crayons.
    3. Pick a palette slot and draw with the keyboard.
    4. Ask "Where am I", then describe the drawing.
    5. Save, open the gallery and reopen the drawing.
- **Pure modules:** Check `describeStrokes.ts` and the ink grid by hand with small made-up drawings, as was done for `paletteSlots.ts`.
- **People:** Test the sound map and the descriptions with at least two blind users before settling the defaults. The mappings above are informed guesses until then.

## Open decisions

- **Sound map default:** Off with opt-in is recommended. On by default is the alternative.
- **AI model:** `claude-opus-5-5` gives the best descriptions at about one to two cents each. Claude Haiku 5.5 is much cheaper and may be good enough for crayon drawings. Compare on 20 to 30 real drawings before deciding.
- **Rate limit:** The per-person limit for descriptions, for example 20 per hour.
- **Saving descriptions:** Whether AI descriptions are saved with drawings and used as alt text, or only spoken.
