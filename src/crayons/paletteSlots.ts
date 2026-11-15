import { PALETTE_MAX } from "./layout";

/**
 * A palette is a fixed row of slots, each a crayon id or empty. Slots never
 * close up: taking a crayon out leaves a gap where it was, so nothing shifts
 * under your hand. These are pure so the rules stay in one readable place.
 */
export type Slots = (string | null)[];

export const emptySlots = (): Slots =>
    Array<string | null>(PALETTE_MAX).fill(null);

/** The next filled slot after `from`, wrapping round, or null if none. */
export const nextFilled = (slots: Slots, from: number): number | null => {
    for (let step = 1; step <= slots.length; step++) {
        const at = (from + step) % slots.length;
        if (slots[at] !== null) return at;
    }
    return null;
};

/**
 * A full palette of different crayons drawn at random from `ids`. A box
 * smaller than the palette fills what it can and leaves the rest empty.
 */
export const randomSlots = (ids: string[], random = Math.random): Slots => {
    const pool = [...ids];
    // Fisher–Yates, stopped once the palette is full.
    const picked: string[] = [];
    while (picked.length < PALETTE_MAX && pool.length > 0) {
        const at = Math.floor(random() * pool.length);
        picked.push(pool[at]);
        pool[at] = pool[pool.length - 1];
        pool.pop();
    }
    return emptySlots().map((_, index) => picked[index] ?? null);
};

/**
 * Where a newly picked crayon goes: the selected slot if it is empty, else
 * the first empty slot, else (a full palette) over the selected slot.
 */
export const placeCrayon = (slots: Slots, selected: number, id: string) => {
    const firstEmpty = slots.indexOf(null);
    const at =
        slots[selected] === null
            ? selected
            : firstEmpty >= 0
              ? firstEmpty
              : selected;
    const next = [...slots];
    const replaced = next[at];
    next[at] = id;
    return { slots: next, at, replaced };
};

/**
 * Empties one slot. If it was the selected one, the selection moves on to
 * the next filled slot, or stays on the gap when the palette is now empty.
 */
export const removeAt = (slots: Slots, index: number, selected: number) => {
    const next = [...slots];
    next[index] = null;
    const moved =
        index === selected ? (nextFilled(next, index) ?? index) : selected;
    return { slots: next, selected: moved };
};

const STORE_KEY = "kaffinated:crayons:palettes";

export type StoredPalettes = { palettes: Record<string, Slots>; slot: number };

/** The palettes from the last visit, or null on a first visit (or if the
    browser keeps nothing). Slot rows are padded or cut to the palette size. */
export const loadPalettes = (): StoredPalettes | null => {
    try {
        const raw: unknown = JSON.parse(
            localStorage.getItem(STORE_KEY) ?? "null",
        );
        if (!raw || typeof raw !== "object") return null;
        const { palettes, slot } = raw as Partial<StoredPalettes>;
        if (!palettes || typeof palettes !== "object") return null;
        const clean: Record<string, Slots> = {};
        for (const [boxId, row] of Object.entries(palettes)) {
            if (!Array.isArray(row)) continue;
            clean[boxId] = emptySlots().map((_, index) =>
                typeof row[index] === "string" ? (row[index] as string) : null,
            );
        }
        const at =
            typeof slot === "number" && slot >= 0 && slot < PALETTE_MAX
                ? slot
                : 0;
        return { palettes: clean, slot: at };
    } catch {
        return null;
    }
};

export const storePalettes = (stored: StoredPalettes) => {
    try {
        localStorage.setItem(STORE_KEY, JSON.stringify(stored));
    } catch {
        // Private mode or a full store: the palette just won't be remembered.
    }
};
