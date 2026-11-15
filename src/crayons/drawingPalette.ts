import type { CrayonBox } from "./boxes";
import type { Stroke } from "./crayonRender";
import { PALETTE_MAX } from "./layout";

/** How much line a stroke laid down, in paper widths (points are 0–1). */
const lengthOf = (stroke: Stroke) => {
    let total = 0;
    for (let i = 1; i < stroke.points.length; i++) {
        const a = stroke.points[i - 1];
        const b = stroke.points[i];
        total += Math.hypot(b.x - a.x, b.y - a.y);
    }
    // A dot still counts for something.
    return Math.max(total, 0.001);
};

const keyOf = (name: string, hex: string) => `${name}|${hex.toLowerCase()}`;

/**
 * The crayons a drawing was made with, most used first, and the box that
 * holds most of them. Strokes record a crayon's name and colour, not its box,
 * so they are matched by both, then by colour alone. "Most used" is by length
 * of line drawn, so one long sweep outweighs a few dots.
 *
 * Returns null for a drawing with no marks. `ids` holds every match in the
 * chosen box, most used first; callers keep as many as a palette fits.
 */
export const paletteFromStrokes = (
    strokes: Stroke[],
    boxes: CrayonBox[],
    preferBoxId: string,
): { boxId: string; ids: string[]; colours: number } | null => {
    if (strokes.length === 0) return null;

    const usage = new Map<
        string,
        { name: string; hex: string; amount: number }
    >();
    for (const stroke of strokes) {
        const key = keyOf(stroke.name, stroke.hex);
        const was = usage.get(key);
        const amount = lengthOf(stroke);
        if (was) was.amount += amount;
        else usage.set(key, { name: stroke.name, hex: stroke.hex, amount });
    }
    const ranked = [...usage.values()].sort((a, b) => b.amount - a.amount);

    const matchIn = (box: CrayonBox) => {
        const ids: string[] = [];
        let covered = 0;
        for (const colour of ranked) {
            const found =
                box.crayons.find(
                    (c) =>
                        keyOf(c.name, c.hex) === keyOf(colour.name, colour.hex),
                ) ??
                box.crayons.find(
                    (c) => c.hex.toLowerCase() === colour.hex.toLowerCase(),
                );
            if (found && !ids.includes(found.id)) {
                ids.push(found.id);
                covered += colour.amount;
            }
        }
        return { ids, covered };
    };

    // The box that can redraw most of the line wins; the open box on a tie.
    let best: { boxId: string; ids: string[]; covered: number } | null = null;
    for (const box of boxes) {
        const match = matchIn(box);
        if (match.ids.length === 0) continue;
        const better =
            !best ||
            match.covered > best.covered ||
            (match.covered === best.covered && box.id === preferBoxId);
        if (better) best = { boxId: box.id, ...match };
    }
    if (!best) return null;
    return { boxId: best.boxId, ids: best.ids, colours: ranked.length };
};

/** A palette's slots from a ranked list: the most used, the rest empty. */
export const slotsFromRanked = (ids: string[]) =>
    Array.from({ length: PALETTE_MAX }, (_, index) => ids[index] ?? null);
