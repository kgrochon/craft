/**
 * How many rows of crayons a box of a given size is packed in.
 *
 * What the sources actually establish is thinner than you'd hope. Crayola's
 * own FAQ says colors are not packed in a fixed order, so there is no canonical
 * sequence to reproduce. On arrangement: the 64 keeps "the colors on two
 * levels in the box" with a sharpener on the back and has been the same shape
 * since 1958 (jennyscrayoncollection.com, "64 count Crayola crayons: what's
 * inside"); a European 48 from about 1982–84 was packed as two rows of 24
 * (crayola.fandom.com, "Crayola No.48 box"); and the 120 ships as two inner
 * boxes of 48 plus one of 24. Nobody publishes a per-row count for the 8, 16,
 * 24 or 64.
 *
 * So the rule below is the physical module those boxes share rather than a
 * quoted spec: small boxes are one row wide, and bigger ones hold the row
 * width steady and add rows behind — which lands on 3 × 16 for a 48 and
 * 4 × 16 for a 64, the two levels of two rows each that the 64 is described
 * as having. The historical sets here (10, 12, 18, 22, 38, 66) were never
 * retail boxes, so they follow the same rule rather than a real package.
 *
 * Replace `columnsFor` if you find a better source — everything else, in the
 * picker and in the open box, is laid out from it.
 */

/** Crayons across one row, for a box of `count` crayons. */
const columnsFor = (count: number) => {
    if (count <= 12) return count; // an 8 or a 12 is a single row
    if (count <= 16) return 8; // the 16: two rows of 8
    if (count <= 24) return 12; // the 24: two rows of 12
    return 16; // 32, 48, 64, 96 — a 16-wide row, stacked
};

/**
 * Boxes that ship as several inner boxes rather than one tray, and so are laid
 * out as those boxes' rows rather than by the rule above. The 120 is two 48s
 * and a 24 (see the note at the top of this file), which is three rows of 16
 * twice over and then two rows of 12.
 */
const PACKED: Record<number, number[]> = {
    120: [16, 16, 16, 16, 16, 16, 12, 12],
};

/**
 * Deals the crayons into rows, back row first, as evenly as they go. Any
 * remainder lands in the back rows, leaving the front row short rather than
 * overfull.
 */
export const intoRows = <T>(items: T[]): T[][] => {
    if (items.length === 0) return [];

    const packed = PACKED[items.length];
    if (packed) {
        const dealt: T[][] = [];
        let from = 0;
        for (const take of packed) {
            dealt.push(items.slice(from, from + take));
            from += take;
        }
        return dealt;
    }

    const rows = Math.max(
        1,
        Math.ceil(items.length / columnsFor(items.length)),
    );
    const each = Math.floor(items.length / rows);
    const over = items.length % rows;

    const dealt: T[][] = [];
    let at = 0;
    for (let row = 0; row < rows; row += 1) {
        const take = each + (row < over ? 1 : 0);
        dealt.push(items.slice(at, at + take));
        at += take;
    }
    return dealt;
};

/**
 * The top edge of a box front: one dip per crayon, the cut that lets you pinch
 * a single crayon out of a full box.
 */
export const scallopEdge = (
    x: number,
    y: number,
    columns: number,
    step: number,
    depth: number,
) => {
    let path = `M${x},${y}`;
    for (let column = 0; column < columns; column += 1) {
        path += ` q${step / 2},${depth} ${step},0`;
    }
    return path;
};

/**
 * The smallest a crayon may be across, in CSS pixels. WCAG 2.2 (2.5.8, Target
 * Size) asks for 24 by 24; each crayon is its own click target, so this is a
 * floor the layout never goes under.
 */
export const MIN_CRAYON_WIDTH = 24;

/** What the layout aims for: comfortably over the floor. */
export const PREFERRED_CRAYON_WIDTH = 28;

/** The most tiers the tray will stack before it gives up and uses the floor. */
const MAX_TIERS = 12;

/** The gap between neighbouring crayons, which the stylesheet also uses. */
export const CRAYON_GAP = 2;

/** The bay's side padding, twice over (the stylesheet's --spacing-md). */
const BAY_PADDING = 32;

/**
 * How many tiers to deal a box into so its crayons come out at least
 * PREFERRED_CRAYON_WIDTH across in a bay `width` pixels wide. Fewest tiers
 * first, because every tier costs height; a box that cannot reach the
 * preferred width even at the most tiers is dealt as deep as it goes, and the
 * stylesheet holds each crayon to the floor.
 */
export const tiersFor = (count: number, width: number) => {
    const base = count <= 12 ? 1 : count <= 32 ? 2 : count <= 72 ? 3 : 4;
    const inner = width - BAY_PADDING;
    for (let tiers = base; tiers <= MAX_TIERS; tiers += 1) {
        const across = Math.ceil(count / tiers);
        const each = (inner - (across - 1) * CRAYON_GAP) / across;
        if (each >= PREFERRED_CRAYON_WIDTH) return tiers;
    }
    return Math.max(base, Math.min(MAX_TIERS, count));
};

/**
 * The same crayons dealt into tiers for the desk tray, which is a fixed depth
 * whether it is holding eight crayons or a hundred and twenty. This is a
 * display rule, not a claim about the real package: `intoRows` above is what
 * says how a box is actually packed. Pass `tiers` (see `tiersFor`) to deal a
 * different depth for the room there is.
 */
export const intoTiers = <T>(items: T[], tiers?: number): T[][] => {
    if (items.length === 0) return [];

    const n = items.length;
    const depth = Math.max(
        1,
        Math.min(tiers ?? (n <= 12 ? 1 : n <= 32 ? 2 : n <= 72 ? 3 : 4), n),
    );
    const each = Math.floor(n / depth);
    const over = n % depth;

    const dealt: T[][] = [];
    let at = 0;
    for (let tier = 0; tier < depth; tier += 1) {
        const take = each + (tier < over ? 1 : 0);
        dealt.push(items.slice(at, at + take));
        at += take;
    }
    return dealt;
};

/** How many crayons a palette holds. */
export const PALETTE_MAX = 10;
