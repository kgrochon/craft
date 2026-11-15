import { coverage, type Size, type Stroke } from "./crayonRender";

/**
 * Getting a drawing off the page: as a PNG, the pixels you see, or as an SVG,
 * the strokes themselves.
 *
 * The SVG is redrawn from the strokes, not traced from the pixels. Each mark
 * is a path in its own colour that scales to any size and opens as shapes you
 * can edit. The wax is approximated rather than copied: a filter roughens
 * every mark and breaks it up with its own grain, and the layering follows the
 * page's rule that a later crayon goes mostly underneath. An app that ignores
 * SVG filters shows the same marks as clean lines.
 */

/** Measured against the canvas: a mark comes out about 1.3× the tip that cut it. */
const MARK = 1.3;
/**
 * Measured too: stamp piled on stamp, a crayon ends up showing on top of the
 * wax under it at about this many times its per-stamp coverage.
 */
const ON_TOP = 1.8;
/** A worn tip widens gradually; under a quarter pixel, it stays one path. */
const RUN_STEP = 0.25;

/** Tenths of a pixel are plenty, and keep the file small. */
const short = (value: number) => +value.toFixed(1);

const escape = (text: string) =>
    text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** "Red", "Red and Blue", "Red, Blue and Green". */
const listed = (names: string[]) =>
    names.length < 2
        ? (names[0] ?? "")
        : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

/** One mark's grain, and the mark itself, for the SVG's defs. */
const markDefs = (stroke: Stroke, id: string, size: Size) => {
    const xy = stroke.points.map((p) => ({
        x: p.x * size.width,
        y: p.y * size.height,
    }));
    const at = (i: number) => `${short(xy[i].x)} ${short(xy[i].y)}`;

    // A path per run of one width: the tip wears as it goes, so the line
    // fattens along the stroke. Round caps make the joins disappear.
    const paths: string[] = [];
    let run = { width: 0, d: "" };
    const flush = () => {
        if (run.d)
            paths.push(`<path stroke-width="${run.width}" d="${run.d}"/>`);
    };
    for (let i = 1; i < xy.length; i += 1) {
        const width =
            Math.round((stroke.widths[i] * MARK) / RUN_STEP) * RUN_STEP;
        if (width === run.width) {
            run.d += ` ${at(i)}`;
            continue;
        }
        flush();
        run = { width, d: `M${at(i - 1)}L${at(i)}` };
    }
    flush();

    // The filter has to be told where the mark is: measured from the shape,
    // a straight line has no height and the filter would show nothing.
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    let widest = 0;
    xy.forEach((p, i) => {
        left = Math.min(left, p.x);
        top = Math.min(top, p.y);
        right = Math.max(right, p.x);
        bottom = Math.max(bottom, p.y);
        widest = Math.max(widest, stroke.widths[i]);
    });
    // Tuned by eye against the canvas, and to the same density of wax.
    const rough = short(Math.max(1.5, widest * 0.35));
    const soft = short(Math.max(0.6, widest * 0.08));
    const reach = widest * MARK + rough;

    // feTurbulence clamps seeds past 2^31, so fold ours down first.
    const seed = (stroke.seed % 100_000) + 1;
    const first = stroke.widths[0] * 0.5;

    return (
        `<filter id="${id}-wax" filterUnits="userSpaceOnUse" ` +
        `x="${short(left - reach)}" y="${short(top - reach)}" ` +
        `width="${short(right - left + reach * 2)}" height="${short(bottom - top + reach * 2)}" ` +
        `color-interpolation-filters="sRGB">` +
        // Noise for this mark alone, so a later crayon underneath shows
        // through its gaps — the same reason the canvas seeds every stroke.
        `<feTurbulence type="fractalNoise" baseFrequency="0.2" numOctaves="2" seed="${seed}" result="grain"/>` +
        // Soften the edge, then rough it up.
        `<feGaussianBlur in="SourceGraphic" stdDeviation="${soft}" result="soft"/>` +
        `<feDisplacementMap in="soft" in2="grain" scale="${rough}" xChannelSelector="R" yChannelSelector="G" result="ragged"/>` +
        // The grain as coverage: holes where it's low, wax where it's high,
        // about seven tenths on average, as the canvas lays a single pass.
        `<feColorMatrix in="grain" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 3 0 -0.85" result="tooth"/>` +
        `<feComposite in="ragged" in2="tooth" operator="in"/>` +
        `</filter>` +
        `<g id="${id}" filter="url(#${id}-wax)" fill="none" stroke="${stroke.hex}" stroke-linecap="round" stroke-linejoin="round">` +
        // The first touch, before any travel, as the canvas lays it.
        `<circle cx="${short(xy[0].x)}" cy="${short(xy[0].y)}" r="${short(first)}" fill="${stroke.hex}" stroke="none"/>` +
        paths.join("") +
        `</g>`
    );
};

/** The drawing as an SVG document, on a sheet of `paper`. */
export const drawingSvg = (strokes: Stroke[], size: Size, paper: string) => {
    const { width, height } = size;
    const ids = strokes.map((_, i) => `mark-${i + 1}`);

    // Newest underneath: a later crayon mostly fills the gaps around the wax
    // already down.
    const under = ids
        .map((id) => `<use xlink:href="#${id}"/>`)
        .reverse()
        .join("");
    // And a little of each lies on top of what came before it — plainly, for
    // a dark crayon. The first has nothing under it to lie on.
    const over = strokes
        .slice(1)
        .map(
            (stroke, i) =>
                `<use xlink:href="#${ids[i + 1]}" opacity="${+(coverage(stroke.hex) * ON_TOP).toFixed(3)}"/>`,
        )
        .join("");

    const names = [...new Set(strokes.map((stroke) => stroke.name))];

    return [
        `<?xml version="1.0" encoding="UTF-8"?>`,
        `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
        `<title>A crayon drawing from Kaff’s Crayon Shelf</title>`,
        `<desc>${strokes.length} ${strokes.length === 1 ? "mark" : "marks"} in ${escape(listed(names))}.</desc>`,
        `<defs>${strokes.map((stroke, i) => markDefs(stroke, ids[i], size)).join("")}</defs>`,
        `<rect width="${width}" height="${height}" fill="${paper}"/>`,
        `<g>${under}</g>`,
        `<g>${over}</g>`,
        `</svg>`,
        "",
    ].join("\n");
};

/** The drawing as you see it, at the screen's own resolution, on `paper`. */
export const drawingPng = (canvas: HTMLCanvasElement, paper: string) =>
    new Promise<Blob | null>((resolve) => {
        // The wax canvas is see-through where there's no wax; the paper is a
        // page background behind it, so it has to be put back.
        const sheet = document.createElement("canvas");
        sheet.width = canvas.width;
        sheet.height = canvas.height;
        const ctx = sheet.getContext("2d");
        if (!ctx) {
            resolve(null);
            return;
        }
        ctx.fillStyle = paper;
        ctx.fillRect(0, 0, sheet.width, sheet.height);
        ctx.drawImage(canvas, 0, 0);
        sheet.toBlob(resolve, "image/png");
    });

/** Thumbnails are this wide: sharp in the gallery grid, small in storage. */
const THUMB_WIDTH = 320;

/**
 * A small JPEG of a drawing, for the saved stack and the gallery. Taken from
 * a canvas already showing it, so it costs a copy, not a repaint.
 */
export const thumbnailOf = (canvas: HTMLCanvasElement, paper: string) => {
    if (canvas.width === 0 || canvas.height === 0) return "";
    const thumb = document.createElement("canvas");
    thumb.width = THUMB_WIDTH;
    thumb.height = Math.max(
        1,
        Math.round((THUMB_WIDTH * canvas.height) / canvas.width),
    );
    const ctx = thumb.getContext("2d");
    if (!ctx) return "";
    ctx.fillStyle = paper;
    ctx.fillRect(0, 0, thumb.width, thumb.height);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(canvas, 0, 0, thumb.width, thumb.height);
    return thumb.toDataURL("image/jpeg", 0.8);
};

/** The page's paper colour, so an export looks like the sheet it came off. */
export const paperColor = () =>
    getComputedStyle(document.documentElement)
        .getPropertyValue("--sheet-paper")
        .trim() || "#ffffff";

export const download = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    // Some browsers are still reading the file when click() returns.
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};
