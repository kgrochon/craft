/**
 * What a crayon's tip is doing, and what that costs.
 *
 * A fresh crayon draws a fine line. Drawing wears the point flat, so the line
 * gets fatter the longer you go without sharpening — and sharpening buys the
 * point back out of the crayon's own length. That trade is the whole mechanic:
 * a sharp line is never free.
 *
 * Both numbers are percentages, kept per crayon by whoever is holding them.
 */

/** A brand new point. */
export const SHARP = 100;
/** A whole crayon. */
export const WHOLE = 100;
/** Worn to a nub, but never gone: the box should not run out. */
const STUB = 15;

/** The finest line a sharp crayon draws, in CSS pixels. */
const FINEST = 6;
/** The broadest line a flat one draws. */
const BROADEST = 32;

/** How wide a line this tip lays down. */
export const lineWidth = (sharpness: number) =>
    FINEST + (BROADEST - FINEST) * (1 - clamp(sharpness, 0, SHARP) / SHARP);

/**
 * How much a pencil's pressure widens or narrows the line: half as wide at
 * the lightest touch, half as wide again pressed hard, and the tip's own
 * width at an ordinary press (0.5, which is also what a pen reports when it
 * can't tell). The widest this makes is 48px, inside what a saved drawing
 * keeps.
 */
export const pressureScale = (pressure: number) =>
    0.5 + clamp(pressure > 0 ? pressure : 0.5, 0, 1);

/** Sharp, Rounded, Dull, Flat — the word for a tip in this state. */
export const tipWord = (sharpness: number) =>
    sharpness >= 75
        ? "sharp"
        : sharpness >= 40
          ? "rounded"
          : sharpness > 5
            ? "dull"
            : "flat";

export type Nub = { sharpness: number; length: number };

export const NEW_CRAYON: Nub = { sharpness: SHARP, length: WHOLE };

const clamp = (n: number, low: number, high: number) =>
    Math.min(high, Math.max(low, n));

/**
 * Sharpness lost over one full diagonal of the paper. Blunting is the fast
 * number — you should feel the line widen within a good scribble — but not so
 * fast that a single sweep flattens the crayon.
 */
const DULLING = 11;
/** Length lost over that same diagonal. A crayon should outlast many tips. */
const SHORTENING = 1.4;

/**
 * The wear from travelling `distance`, as a fraction of the paper's diagonal.
 * Called for each segment as the stroke is drawn, so the tip blunts and the
 * line widens while your hand is still moving.
 */
export const afterTravel = (nub: Nub, distance: number): Nub => ({
    sharpness: clamp(nub.sharpness - distance * DULLING, 0, SHARP),
    length: clamp(nub.length - distance * SHORTENING, STUB, WHOLE),
});

/**
 * Sharpening. The point comes back whole; the length pays for it. A tip that
 * is barely blunted costs barely anything, so there is no reason not to.
 */
export const afterSharpening = (nub: Nub): Nub => {
    const missing = (SHARP - nub.sharpness) / SHARP;
    return {
        sharpness: SHARP,
        length: clamp(nub.length - 1.5 - missing * 6, STUB, WHOLE),
    };
};

/** How long a flat crayon is held in the standing sharpener before it is
    sharp again, in seconds. */
const GRIND_SECONDS = 1.2;
/** What that whole grind costs in length: the same as `afterSharpening`
    charges a flat crayon, spread over the hold. */
const GRIND_COST = 7.5;

/**
 * Sharpening by holding the crayon in the sharpener for `seconds` more. The
 * point comes back a little at a time and the length pays as it goes, so
 * letting go early keeps whatever was bought. Once the point is back, or the
 * crayon is down to its stub, holding on does nothing more.
 */
export const whileGrinding = (nub: Nub, seconds: number): Nub => {
    if (!worthSharpening(nub)) return nub;
    const gained = Math.min(
        SHARP - nub.sharpness,
        seconds * (SHARP / GRIND_SECONDS),
    );
    return {
        sharpness: nub.sharpness + gained,
        length: clamp(nub.length - (gained / SHARP) * GRIND_COST, STUB, WHOLE),
    };
};

/** True once sharpening would actually change anything. */
export const worthSharpening = (nub: Nub) =>
    nub.sharpness < SHARP - 1 && nub.length > STUB;

/** Worn down to the nub: still draws, but there is nothing left to sharpen. */
export const isStub = (nub: Nub) => nub.length <= STUB;
