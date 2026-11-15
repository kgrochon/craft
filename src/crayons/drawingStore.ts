import type { Point, Size, Stroke } from "./crayonRender";

/**
 * Keeping drawings in this browser.
 *
 * What's kept is the strokes, not the picture: the colour, the seed, where the
 * crayon went and how wide it was cutting at each point. The renderer is
 * seeded, so that is enough to lay the same wax down again — at a fraction of
 * the size of the pixels, and at whatever size the window is when it comes
 * back.
 */

/** Bump this if the stroke shape below changes; an older sheet is then left alone. */
const VERSION = 1;

/** Points are kept to a ten-thousandth of the paper: a fraction of a pixel on any screen. */
const PLACES = 10_000;
/** Widths are kept to a hundredth of a pixel. */
const WIDTH_PLACES = 100;

/**
 * Rounds a point to what can be kept. The surface does this as you draw, so
 * the drawing on screen is already exactly the drawing that gets saved — a
 * restored sheet is the same wax, not a near miss.
 */
export const snapPoint = (point: Point): Point => ({
    x: Math.round(point.x * PLACES) / PLACES,
    y: Math.round(point.y * PLACES) / PLACES,
});

export const snapWidth = (width: number) =>
    Math.round(width * WIDTH_PLACES) / WIDTH_PLACES;

/** A stroke as it is stored: whole numbers, and the points as one flat list. */
type Kept = {
    hex: string;
    name: string;
    seed: number;
    /** x, y, x, y… in ten-thousandths of the paper. */
    xy: number[];
    /** In hundredths of a pixel, one per point. */
    widths: number[];
};

const toKept = (stroke: Stroke): Kept => ({
    hex: stroke.hex,
    name: stroke.name,
    seed: stroke.seed,
    xy: stroke.points.flatMap((p) => [
        Math.round(p.x * PLACES),
        Math.round(p.y * PLACES),
    ]),
    widths: stroke.widths.map((w) => Math.round(w * WIDTH_PLACES)),
});

const HEX = /^#[0-9a-f]{6}$/i;

const wholeNumbers = (list: unknown, low: number, high: number) =>
    Array.isArray(list) &&
    list.every((n) => Number.isInteger(n) && n >= low && n <= high);

/** Reads one stored stroke back, or null if it isn't one. */
const fromKept = (kept: unknown): Stroke | null => {
    if (typeof kept !== "object" || kept === null) return null;
    const { hex, name, seed, xy, widths } = kept as Record<string, unknown>;
    if (typeof hex !== "string" || !HEX.test(hex)) return null;
    if (typeof name !== "string") return null;
    if (typeof seed !== "number" || !Number.isInteger(seed)) return null;
    if (!wholeNumbers(xy, 0, PLACES)) return null;
    const flat = xy as number[];
    if (flat.length === 0 || flat.length % 2 !== 0) return null;
    if (!wholeNumbers(widths, 1, 100 * WIDTH_PLACES)) return null;
    const cut = widths as number[];
    if (cut.length !== flat.length / 2) return null;

    const points: Point[] = [];
    for (let i = 0; i < flat.length; i += 2)
        points.push({ x: flat[i] / PLACES, y: flat[i + 1] / PLACES });
    return {
        hex,
        name,
        seed: seed >>> 0,
        points,
        widths: cut.map((w) => w / WIDTH_PLACES),
    };
};

/** The single drawing the page kept before there was a gallery. */
const LEGACY_KEY = "kaffinated:crayons:drawing";
/** The list of saved drawings: everything the stack and the grid show. */
const INDEX_KEY = "kaffinated:crayons:saved";
/** Which saved drawing was last on the paper, to put it back on a reload. */
const CURRENT_KEY = "kaffinated:crayons:current";
/** Each drawing's strokes live on their own, so saving one rewrites only it. */
const strokesKey = (id: string) => `kaffinated:crayons:saved:${id}`;

export type SavedDrawing = {
    id: string;
    /** Milliseconds since 1970: when it was last saved. */
    savedAt: number;
    /**
     * The paper's size in CSS pixels when it was saved. Widths are in those
     * pixels, so this is the size the drawing paints true at.
     */
    width: number;
    height: number;
    marks: number;
    /** Crayon names, in the order they were first used. */
    colors: string[];
    /** A small JPEG of the drawing, as a data URL; empty if none could be made. */
    thumb: string;
};

const isSaved = (entry: unknown): entry is SavedDrawing => {
    if (typeof entry !== "object" || entry === null) return false;
    const e = entry as Record<string, unknown>;
    return (
        typeof e.id === "string" &&
        /^[a-z0-9]+$/.test(e.id) &&
        typeof e.savedAt === "number" &&
        typeof e.width === "number" &&
        e.width > 0 &&
        typeof e.height === "number" &&
        e.height > 0 &&
        typeof e.marks === "number" &&
        Array.isArray(e.colors) &&
        e.colors.every((c) => typeof c === "string") &&
        typeof e.thumb === "string" &&
        (e.thumb === "" || e.thumb.startsWith("data:image/"))
    );
};

/** The saved drawings, newest first. Anything that doesn't read is skipped. */
export const listSaved = (): SavedDrawing[] => {
    try {
        const list: unknown = JSON.parse(
            localStorage.getItem(INDEX_KEY) ?? "[]",
        );
        if (!Array.isArray(list)) return [];
        return list.filter(isSaved).sort((a, b) => b.savedAt - a.savedAt);
    } catch {
        return [];
    }
};

/** Reads a stored sheet of strokes, or null if it isn't one. */
const readStrokes = (raw: string | null): Stroke[] | null => {
    if (!raw) return null;
    try {
        const sheet: unknown = JSON.parse(raw);
        if (typeof sheet !== "object" || sheet === null) return null;
        const { version, strokes } = sheet as Record<string, unknown>;
        if (version !== VERSION || !Array.isArray(strokes)) return null;
        // A stroke that doesn't read is dropped; the rest of the drawing stays.
        return strokes.flatMap((kept) => fromKept(kept) ?? []);
    } catch {
        return null;
    }
};

/** One saved drawing's strokes, or null if it's gone or unreadable. */
export const loadSaved = (id: string): Stroke[] | null => {
    try {
        return readStrokes(localStorage.getItem(strokesKey(id)));
    } catch {
        return null;
    }
};

/** The saved drawing that was last on the paper, if it is still saved. */
export const currentSaved = (): string | null => {
    try {
        const id = localStorage.getItem(CURRENT_KEY);
        return id && listSaved().some((entry) => entry.id === id) ? id : null;
    } catch {
        return null;
    }
};

/** Remembers which drawing is on the paper. Best effort: it only steers a reload. */
export const markCurrent = (id: string | null) => {
    try {
        if (id) localStorage.setItem(CURRENT_KEY, id);
        else localStorage.removeItem(CURRENT_KEY);
    } catch {
        // Nothing lost but where the next visit opens.
    }
};

const newId = () =>
    Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/**
 * Saves a drawing: over the saved drawing `id` if there is one, as a new
 * drawing if not. It moves to the front either way. Returns what was saved,
 * or null if the browser wouldn't — storage full, or switched off — in which
 * case nothing that was saved before has changed.
 */
export const keepDrawing = (drawing: {
    id: string | null;
    strokes: Stroke[];
    size: Size;
    thumb: string;
}): SavedDrawing | null => {
    const entry: SavedDrawing = {
        id: drawing.id ?? newId(),
        savedAt: Date.now(),
        width: drawing.size.width,
        height: drawing.size.height,
        marks: drawing.strokes.length,
        colors: [...new Set(drawing.strokes.map((stroke) => stroke.name))],
        thumb: drawing.thumb,
    };
    const key = strokesKey(entry.id);
    let before: string | null = null;
    try {
        before = localStorage.getItem(key);
        localStorage.setItem(
            key,
            JSON.stringify({
                version: VERSION,
                strokes: drawing.strokes.map(toKept),
            }),
        );
        localStorage.setItem(
            INDEX_KEY,
            JSON.stringify([
                entry,
                ...listSaved().filter((saved) => saved.id !== entry.id),
            ]),
        );
    } catch {
        // Put the strokes back as they were, so the list and the strokes it
        // points at still agree.
        try {
            if (before === null) localStorage.removeItem(key);
            else localStorage.setItem(key, before);
        } catch {
            // Storage that refuses everything has nothing to put back.
        }
        return null;
    }
    markCurrent(entry.id);
    return entry;
};

/** Deletes a saved drawing for good. False if the browser wouldn't. */
export const deleteSaved = (id: string): boolean => {
    try {
        localStorage.setItem(
            INDEX_KEY,
            JSON.stringify(listSaved().filter((saved) => saved.id !== id)),
        );
        localStorage.removeItem(strokesKey(id));
        if (localStorage.getItem(CURRENT_KEY) === id)
            localStorage.removeItem(CURRENT_KEY);
        return true;
    } catch {
        return false;
    }
};

/**
 * Moves the one drawing the page used to keep into the saved drawings, the
 * first time the gallery loads. It needs a thumbnail, which needs a canvas, so
 * the caller makes it. Left where it was if the move doesn't fit.
 */
export const adoptLegacy = (
    size: Size,
    thumbnail: (strokes: Stroke[]) => string,
) => {
    try {
        const strokes = readStrokes(localStorage.getItem(LEGACY_KEY));
        if (strokes === null) return;
        if (
            strokes.length === 0 ||
            keepDrawing({ id: null, strokes, size, thumb: thumbnail(strokes) })
        )
            localStorage.removeItem(LEGACY_KEY);
    } catch {
        // No storage, or no canvas: there is nothing to move, or no way to.
    }
};

/**
 * A stroke never changes once it's down, so the same strokes in the same
 * order are the same drawing — no need to compare a single point.
 */
export const sameDrawing = (a: Stroke[], b: Stroke[]) =>
    a.length === b.length && a.every((stroke, i) => stroke === b[i]);
