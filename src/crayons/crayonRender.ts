/**
 * What makes a crayon mark look like a crayon mark isn't the line — it's the
 * paper, and the fact that wax doesn't stack.
 *
 * Three ideas do the work here:
 *
 *  - Wax mostly lands *under* whatever is already down. Crayons barely layer:
 *    the first color you lay is largely the color you see, and a second crayon
 *    over it mostly reaches the paper still showing through, filling the gaps
 *    — down to the tiny ones. Only a little of it sits on top, and how much
 *    depends on the crayon: dark wax covers, pale wax hardly marks at all.
 *    A heavy `destination-over` and a light `source-over` buy the behaviour.
 *  - The sheet has tooth. A single grain mask, fixed in paper space, bites
 *    back out of every mark, so all the marks on one sheet break up in the
 *    same pits instead of each carrying its own noise.
 *  - Wax fills that tooth. A second "load" layer tracks how much wax is piled
 *    at each spot, color aside, and weakens the grain in proportion — so a
 *    worked-over patch goes solid and nothing is white forever. Keep scribbling
 *    and the pits fill in, which is what a crayon actually does.
 *
 * Everything random here is seeded, because the same drawing has to come back
 * identically when the paper is rebuilt after a resize or an undo.
 */

export type Point = { x: number; y: number };

export type Size = { width: number; height: number };

export type Stroke = {
    hex: string;
    name: string;
    /** Fixed per stroke, so a rebuild reproduces this stroke's grain exactly. */
    seed: number;
    /** Normalized 0–1, so a resize rescales the drawing instead of cropping it. */
    points: Point[];
    /**
     * The tip's width in CSS pixels at each of those points. The crayon wears
     * as you draw, so a single stroke starts fine and ends fat — and a rebuild
     * has to redraw it the way it was made, not the way the tip is now. One
     * width per point is what makes both true.
     */
    widths: number[];
};

export type Rect = { x: number; y: number; width: number; height: number };

/** The two offscreen layers a mark goes into: its color, and its thickness. */
export type Layers = {
    /** Colored wax, newest underneath. */
    ink: CanvasRenderingContext2D;
    /** Colorless build-up, used to wear the paper's tooth away. */
    load: CanvasRenderingContext2D;
};

const TAU = Math.PI * 2;

/** Pre-rendered dab, scaled down per stamp — 64px keeps it crisp on retina. */
const SPRITE = 64;
/** Grain tile edge, in CSS pixels. Small enough to stay cheap, big enough not to read as a repeat. */
const GRAIN = 128;
/** How many different dabs are in rotation, so no two stamps are the same. */
const VARIANTS = 6;
/** Wax piled per stamp. Low: one pass stays toothy, a few go nearly solid. */
const LOAD = 0.1;
/** Even a patch worked to death keeps this much of the paper's tooth. */
const FLOOR = 0.12;
/** How much of a stamp sits on top of wax already down, palest to darkest. */
const OVER = [0.008, 0.1];

/** Cheap seeded PRNG. Same seed, same drawing. */
const prng = (seed: number) => {
    let state = seed >>> 0;
    return () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 4294967296;
    };
};

/** Scrambles two numbers into one seed; nearby inputs must not correlate. */
const seedOf = (a: number, b: number) => {
    let h = (a ^ Math.imul(b, 0x9e3779b9)) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x21f0aaad) >>> 0;
    h = Math.imul(h ^ (h >>> 15), 0x735a2d97) >>> 0;
    return (h ^ (h >>> 15)) >>> 0;
};

const covering = new Map<string, number>();

/**
 * How much of this crayon sits on top of wax already on the paper, rather than
 * slipping into the gaps around it. A dark crayon lays over a color plainly; a
 * pale one over a dark color barely shows it was there — which is why coloring
 * yellow over black is a waste of a yellow crayon.
 */
export const coverage = (hex: string) => {
    const known = covering.get(hex);
    if (known !== undefined) return known;

    const packed = Number.parseInt(hex.replace("#", ""), 16);
    // A color we can't read gets treated as a middling one.
    const luma = Number.isNaN(packed)
        ? 0.5
        : (0.299 * ((packed >> 16) & 255) +
              0.587 * ((packed >> 8) & 255) +
              0.114 * (packed & 255)) /
          255;

    const value = OVER[0] + (OVER[1] - OVER[0]) * Math.pow(1 - luma, 1.6);
    covering.set(hex, value);
    return value;
};

/** Crayons are blunt; scale the tip to the paper but keep it chunky. */
export const tipWidth = (size: Size) =>
    Math.max(7, Math.min(16, Math.min(size.width, size.height) * 0.026));

const shapes: (HTMLCanvasElement | undefined)[] = [];

/**
 * One dab of wax, in white so it can be tinted: a soft-edged oval with
 * hundreds of little holes punched out of it. Each variant is a differently
 * broken-up blob, so a stroke isn't one sprite rubber-stamped down a line.
 */
const waxDab = (variant: number) => {
    const made = shapes[variant];
    if (made) return made;

    const canvas = document.createElement("canvas");
    canvas.width = SPRITE;
    canvas.height = SPRITE;
    shapes[variant] = canvas;

    const ctx = canvas.getContext("2d");
    if (!ctx) return canvas;

    const random = prng(seedOf(0x57ee9, variant));
    const middle = SPRITE / 2;
    const radius = SPRITE * (0.43 + random() * 0.06);
    // Stamped along the stroke, a slightly flattened oval covers it without
    // looking beaded; how flat varies per variant.
    const squash = 0.72 + random() * 0.18;

    // The body: dense at the core, falling away to nothing at the rim.
    const falloff = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
    falloff.addColorStop(0, "rgba(255, 255, 255, 0.98)");
    falloff.addColorStop(0.58 + random() * 0.12, "rgba(255, 255, 255, 0.93)");
    falloff.addColorStop(0.86 + random() * 0.06, "rgba(255, 255, 255, 0.55)");
    falloff.addColorStop(1, "rgba(255, 255, 255, 0)");

    ctx.save();
    ctx.translate(middle, middle);
    ctx.scale(1, squash);
    ctx.fillStyle = falloff;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, TAU);
    ctx.fill();
    ctx.restore();

    // The holes: paper this dab skipped over. They're drawn out along the
    // sprite's x axis, which is turned to face the way the stroke is going, so
    // a mark gets the streaks a crayon leaves rather than even stippling.
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = "#fff";
    for (let i = 0; i < 1400; i += 1) {
        const long = 0.5 + random() * 2.6;
        ctx.globalAlpha = 0.08 + random() * 0.62;
        ctx.beginPath();
        ctx.ellipse(
            random() * SPRITE,
            random() * SPRITE,
            long,
            long * (0.22 + random() * 0.3),
            (random() - 0.5) * 0.5,
            0,
            TAU,
        );
        ctx.fill();
    }

    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    return canvas;
};

/** One tinted dab per color per variant, built on demand and kept. */
const dabs = new Map<string, HTMLCanvasElement>();

const dabIn = (hex: string, variant: number) => {
    const key = `${hex}|${variant}`;
    const cached = dabs.get(key);
    if (cached) return cached;

    const canvas = document.createElement("canvas");
    canvas.width = SPRITE;
    canvas.height = SPRITE;
    const ctx = canvas.getContext("2d");
    if (ctx) {
        ctx.drawImage(waxDab(variant), 0, 0);
        ctx.globalCompositeOperation = "source-in";
        ctx.fillStyle = hex;
        ctx.fillRect(0, 0, SPRITE, SPRITE);
    }
    dabs.set(key, canvas);
    return canvas;
};

let pile: HTMLCanvasElement | undefined;

/**
 * The same dab with no holes in it: wax piling up. The holes are where this
 * dab missed, but the next one over won't miss the same spots, so build-up is
 * smooth even though each mark is ragged.
 */
const waxPile = () => {
    if (pile) return pile;

    const canvas = document.createElement("canvas");
    canvas.width = SPRITE;
    canvas.height = SPRITE;
    pile = canvas;

    const ctx = canvas.getContext("2d");
    if (!ctx) return canvas;

    const middle = SPRITE / 2;
    const radius = SPRITE * 0.45;
    const falloff = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
    falloff.addColorStop(0, "rgba(255, 255, 255, 1)");
    falloff.addColorStop(0.6, "rgba(255, 255, 255, 0.72)");
    falloff.addColorStop(1, "rgba(255, 255, 255, 0)");

    ctx.translate(middle, middle);
    ctx.scale(1, 0.82);
    ctx.fillStyle = falloff;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, TAU);
    ctx.fill();
    return canvas;
};

let grainTile: HTMLCanvasElement | undefined;

/** Smoothed value noise, tiling seamlessly: the tooth of the sheet. */
const paperGrain = () => {
    if (grainTile) return grainTile;

    const canvas = document.createElement("canvas");
    canvas.width = GRAIN;
    canvas.height = GRAIN;
    grainTile = canvas;

    const ctx = canvas.getContext("2d");
    if (!ctx) return canvas;

    const octaves = [
        { cells: 24, weight: 0.45 },
        { cells: 48, weight: 0.33 },
        { cells: 96, weight: 0.22 },
    ];
    const grids = octaves.map(({ cells }) => {
        const random = prng(seedOf(0x9a71, cells));
        const values = new Float32Array(cells * cells);
        for (let i = 0; i < values.length; i += 1) values[i] = random();
        return values;
    });

    const sample = (
        values: Float32Array,
        cells: number,
        x: number,
        y: number,
    ) => {
        const fx = (x / GRAIN) * cells;
        const fy = (y / GRAIN) * cells;
        const x0 = Math.floor(fx);
        const y0 = Math.floor(fy);
        const tx = fx - x0;
        const ty = fy - y0;
        // Smoothstep, so the noise reads as fibre rather than as pixels.
        const sx = tx * tx * (3 - 2 * tx);
        const sy = ty * ty * (3 - 2 * ty);
        // Wrapped lookups keep the tile seamless.
        const at = (ix: number, iy: number) =>
            values[
                (((iy % cells) + cells) % cells) * cells +
                    (((ix % cells) + cells) % cells)
            ];
        const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
        const bottom =
            at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
        return top + (bottom - top) * sy;
    };

    const image = ctx.createImageData(GRAIN, GRAIN);
    for (let y = 0; y < GRAIN; y += 1) {
        for (let x = 0; x < GRAIN; x += 1) {
            let height = 0;
            octaves.forEach(({ cells, weight }, index) => {
                height += sample(grids[index], cells, x, y) * weight;
            });
            // The low ground between fibres is where the crayon doesn't reach.
            // Capped short of opaque: the deepest pit still takes a little
            // color on the first pass, and wax build-up fills it from there.
            const bite = Math.min(0.9, Math.max(0, 0.66 - height) * 1.95);
            const at = (y * GRAIN + x) * 4;
            image.data[at] = 255;
            image.data[at + 1] = 255;
            image.data[at + 2] = 255;
            image.data[at + 3] = Math.round(bite * 255);
        }
    }
    ctx.putImageData(image, 0, 0);
    return canvas;
};

const patterns = new WeakMap<CanvasRenderingContext2D, CanvasPattern>();

/** The grain as a repeating fill, cached per context. */
export const grainFill = (ctx: CanvasRenderingContext2D) => {
    const cached = patterns.get(ctx);
    if (cached) return cached;
    const pattern = ctx.createPattern(paperGrain(), "repeat");
    if (pattern) patterns.set(ctx, pattern);
    return pattern;
};

/**
 * Stamps wax for the points from `from` onward — `from` lets a stroke in
 * progress cost only its newest segment. Returns the area touched, in CSS
 * pixels, or null if nothing was drawn.
 */
export const stampStroke = (
    layers: Layers,
    stroke: Stroke,
    size: Size,
    from = 0,
): Rect | null => {
    const points = stroke.points;
    if (points.length === 0) return null;

    const { ink, load } = layers;
    const over = coverage(stroke.hex);

    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;

    const place = (
        x: number,
        y: number,
        angle: number,
        alpha: number,
        scale: number,
        variant: number,
        span: number,
    ) => {
        const wax = dabIn(stroke.hex, variant);

        ink.save();
        ink.translate(x, y);
        ink.rotate(angle);
        ink.scale(scale, scale);
        // Most of it goes under: the color already on the paper stays, and
        // this crayon takes the gaps around it.
        ink.globalCompositeOperation = "destination-over";
        ink.globalAlpha = alpha;
        ink.drawImage(wax, -span / 2, -span / 2, span, span);
        // The rest lies on top — a trace of a pale crayon, plainly for a dark
        // one.
        ink.globalCompositeOperation = "source-over";
        ink.globalAlpha = alpha * over;
        ink.drawImage(wax, -span / 2, -span / 2, span, span);
        ink.restore();

        // Thickness does stack, whatever the color, and that's what fills the
        // tooth of the paper.
        load.save();
        load.globalAlpha = alpha * LOAD * (1 - FLOOR);
        load.translate(x, y);
        load.rotate(angle);
        load.scale(scale, scale);
        load.drawImage(waxPile(), -span / 2, -span / 2, span, span);
        load.restore();

        // Generous: wax left outside the repainted area would be invisible.
        const reach = span * scale;
        if (x - reach < left) left = x - reach;
        if (y - reach < top) top = y - reach;
        if (x + reach > right) right = x + reach;
        if (y + reach > bottom) bottom = y + reach;
    };

    const at = (point: Point) => ({
        x: point.x * size.width,
        y: point.y * size.height,
    });

    // The first touch of the crayon, before any travel.
    if (from === 0) {
        const random = prng(seedOf(stroke.seed, 0));
        const start = at(points[0]);
        place(
            start.x,
            start.y,
            random() * TAU,
            0.78 + random() * 0.2,
            0.9 + random() * 0.2,
            Math.floor(random() * VARIANTS),
            stroke.widths[0] * 1.75,
        );
    }

    for (let i = Math.max(1, from); i < points.length; i += 1) {
        const a = at(points[i - 1]);
        const b = at(points[i]);
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const length = Math.hypot(dx, dy);
        const angle = Math.atan2(dy, dx);

        // The tip this segment was drawn with. It widens as the crayon wears,
        // so one stroke can start fine and finish fat.
        const width =
            stroke.widths[i] ?? stroke.widths[stroke.widths.length - 1];
        const span = width * 1.75;
        const spacing = Math.max(0.5, width * 0.15);

        // A fast hand leaves less wax than a slow one.
        const haste = Math.min(1, length / (width * 3.5));
        const pressure = 0.86 - 0.48 * haste;

        const steps = Math.max(1, Math.round(length / spacing));
        const random = prng(seedOf(stroke.seed, i));

        // From 1: step 0 is the previous segment's last stamp.
        for (let step = 1; step <= steps; step += 1) {
            // Every draw happens before the skip, so the sequence a stamp sees
            // doesn't depend on whether the ones before it landed — which is
            // what keeps a rebuild identical to the live stroke.
            const miss = random();
            const offX = random();
            const offY = random();
            const turn = random();
            const weight = random();
            const squash = random();
            const variant = random();
            const catches = random();

            // A crayon skips. Some of the time the tip simply misses.
            if (miss < 0.07) continue;

            // And now and then it catches and dumps a blot of wax.
            const grab = catches < 0.06;

            const along = step / steps;
            place(
                a.x + dx * along + (offX - 0.5) * width * 0.55,
                a.y + dy * along + (offY - 0.5) * width * 0.55,
                angle + (turn - 0.5) * 0.9,
                Math.min(
                    1,
                    pressure * (0.45 + weight * 0.55) * (grab ? 1.5 : 1),
                ),
                (0.78 + squash * 0.44) * (grab ? 1.25 : 1),
                Math.floor(variant * VARIANTS),
                span,
            );
        }
    }

    if (left === Infinity) return null;
    return {
        x: left,
        y: top,
        width: right - left,
        height: bottom - top,
    };
};

/**
 * A whole drawing painted from scratch onto a canvas of its own, composited
 * the way the paper composites it: for pictures of a drawing that isn't on
 * the paper. `size` is in CSS pixels, the size the drawing was made at.
 */
export const paintDrawing = (strokes: Stroke[], size: Size, ratio = 1) => {
    const sheet = () => {
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(size.width * ratio);
        canvas.height = Math.round(size.height * ratio);
        const ctx = canvas.getContext("2d");
        ctx?.setTransform(ratio, 0, 0, ratio, 0, 0);
        return { canvas, ctx };
    };
    const out = sheet();
    const ink = sheet();
    const load = sheet();
    const grain = sheet();
    const mask = sheet();
    if (!out.ctx || !ink.ctx || !load.ctx || !grain.ctx || !mask.ctx)
        return out.canvas;

    const tooth = grainFill(grain.ctx);
    if (tooth) {
        grain.ctx.fillStyle = tooth;
        grain.ctx.fillRect(0, 0, size.width + 1, size.height + 1);
    }
    for (const stroke of strokes)
        stampStroke({ ink: ink.ctx, load: load.ctx }, stroke, size);

    // Layer onto layer, 1:1 in device pixels.
    mask.ctx.setTransform(1, 0, 0, 1, 0, 0);
    mask.ctx.drawImage(grain.canvas, 0, 0);
    mask.ctx.globalCompositeOperation = "destination-out";
    mask.ctx.drawImage(load.canvas, 0, 0);

    out.ctx.setTransform(1, 0, 0, 1, 0, 0);
    out.ctx.drawImage(ink.canvas, 0, 0);
    out.ctx.globalCompositeOperation = "destination-out";
    out.ctx.drawImage(mask.canvas, 0, 0);
    return out.canvas;
};

/**
 * A crayon-tip cursor in the crayon's own color, as wide as the line the tip
 * lays down, so the cursor grows as the point wears. A ring rather than a
 * disc: a flat crayon's cursor would otherwise hide what it is drawing over.
 * The hotspot is the centre, which is where the wax lands.
 */
export const crayonCursor = (hex: string, width: number) => {
    const EDGE = 1.5;
    const ring = Math.max(1.5, Math.min(3, width * 0.12));
    // Room for the ring and its edge on both sides, then a whole pixel so the
    // hotspot lands exactly in the middle.
    const size = Math.ceil(width + 2 * (ring + EDGE)) | 1;
    const mid = size / 2;
    const r = width / 2;
    const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
        `<circle cx="${mid}" cy="${mid}" r="${r + ring / 2 + EDGE / 2}" fill="none" stroke="#183246" stroke-opacity="0.85" stroke-width="${EDGE}"/>` +
        `<circle cx="${mid}" cy="${mid}" r="${r}" fill="${hex}" fill-opacity="0.3" stroke="${hex}" stroke-width="${ring}"/>` +
        `</svg>`;
    const hot = Math.floor(mid);
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${hot} ${hot}, crosshair`;
};
