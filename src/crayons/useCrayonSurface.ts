import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { Crayon } from "./boxes";
import {
    grainFill,
    stampStroke,
    type Point,
    type Rect,
    type Size,
    type Stroke,
} from "./crayonRender";
import { snapPoint, snapWidth } from "./drawingStore";

/**
 * A sheet of paper you can draw on, without any opinion about what it looks
 * like or how the marks get there. It owns the canvases, the strokes and the
 * compositing; the component around it decides whether that sheet is a panel
 * on a page or the whole window, and where the points come from.
 *
 * Points are normalized 0–1, so a resize rescales the drawing rather than
 * cropping it.
 */
export type CrayonSurface = {
    /** Put this on the element whose size the paper should match. */
    wrapRef: RefObject<HTMLDivElement | null>;
    canvasRef: RefObject<HTMLCanvasElement | null>;
    size: Size;
    /** Finished strokes, for a tally or a count. */
    marks: Stroke[];
    /** Whether a stroke is being drawn right now. */
    drawing: boolean;
    /**
     * Puts the crayon down and leaves its first mark. `width` is the line the
     * tip cuts right now; it is kept with the stroke, so later rebuilds draw
     * it at the width it was made, not the width the crayon has worn to.
     */
    begin: (at: Point, width: number) => void;
    /**
     * Drags it on, at whatever width the tip is cutting now. Moves of under a
     * pixel are dropped as overlapping wax.
     */
    extend: (at: Point, width: number) => void;
    /** Lifts it. Returns the finished stroke, or null if none was going. */
    finish: () => Stroke | null;
    /** Throws the stroke in progress away, wax and all, without keeping it. */
    discard: () => void;
    /** Takes back the last mark. Returns it, or null if there was none. */
    undo: () => Stroke | null;
    /** Wipes the sheet. Returns false if it was already blank. */
    clear: () => boolean;
    /** Puts a whole other drawing on the sheet in place of this one. */
    replace: (strokes: Stroke[]) => void;
};

/**
 * `initial` is the drawing the sheet starts with — a saved one, say. It is
 * read once, when the sheet is first laid out.
 */
export const useCrayonSurface = (
    crayon: Crayon,
    initial: Stroke[] = [],
): CrayonSurface => {
    const wrapRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    /** Wax goes here; the visible canvas is this layer minus the paper's tooth. */
    const inkRef = useRef<HTMLCanvasElement | null>(null);
    /** How thick the wax is piled, color aside. Thick wax fills the tooth. */
    const loadRef = useRef<HTMLCanvasElement | null>(null);
    /** The tooth of this sheet, laid down once and copied from thereafter. */
    const grainRef = useRef<HTMLCanvasElement | null>(null);
    /** Scratch: the grain, worn away by the load layer. Rebuilt per repaint. */
    const maskRef = useRef<HTMLCanvasElement | null>(null);
    /** Device pixels per CSS pixel, as the canvases were last built for. */
    const ratioRef = useRef(1);
    /** The drawing itself. A ref, so a rebuild can run the moment it changes. */
    const strokesRef = useRef<Stroke[]>(initial);
    /** The stroke in progress, kept out of state to avoid a render per move. */
    const drawingRef = useRef<Stroke | null>(null);

    /** Mirrors strokesRef for whatever the caller shows about the drawing. */
    const [marks, setMarks] = useState<Stroke[]>(initial);
    const [size, setSize] = useState<Size>({ width: 0, height: 0 });
    const [drawing, setDrawing] = useState(false);

    /**
     * Draws the ink layer onto the paper, eaten away by the paper's tooth —
     * and the tooth itself is worn down wherever the wax is piled thick, so a
     * worked-over patch fills in instead of staying speckled with white.
     */
    const composite = useCallback(
        (area?: Rect) => {
            const ctx = canvasRef.current?.getContext("2d");
            const ink = inkRef.current;
            const load = loadRef.current;
            const grain = grainRef.current;
            const mask = maskRef.current;
            const maskCtx = mask?.getContext("2d");
            if (!ctx || !ink || !load || !grain || !mask || !maskCtx) return;
            if (size.width === 0) return;

            // Whole device pixels, worked out in integers and painted with
            // the transform off. On a fractional edge the clip antialiases
            // while clearRect wipes the whole pixel, and the part that isn't
            // repainted is left showing bare paper — a faint box drawn around
            // the crayon wherever it has just been. Every copy below is 1:1,
            // so nothing is resampled either.
            const ratio = ratioRef.current;
            const loose = area ?? { x: 0, y: 0, ...size };
            const x = Math.max(0, Math.floor(loose.x * ratio));
            const y = Math.max(0, Math.floor(loose.y * ratio));
            const width =
                Math.min(
                    ink.width,
                    Math.ceil((loose.x + loose.width) * ratio),
                ) - x;
            const height =
                Math.min(
                    ink.height,
                    Math.ceil((loose.y + loose.height) * ratio),
                ) - y;
            if (width <= 0 || height <= 0) return;

            const clipTo = (to: CanvasRenderingContext2D) => {
                to.save();
                to.setTransform(1, 0, 0, 1, 0, 0);
                to.beginPath();
                to.rect(x, y, width, height);
                to.clip();
                to.clearRect(x, y, width, height);
            };

            // The tooth, minus the wax that has filled it.
            clipTo(maskCtx);
            maskCtx.drawImage(grain, 0, 0);
            maskCtx.globalCompositeOperation = "destination-out";
            maskCtx.drawImage(load, 0, 0);
            maskCtx.restore();

            clipTo(ctx);
            ctx.drawImage(ink, 0, 0);
            ctx.globalCompositeOperation = "destination-out";
            ctx.drawImage(mask, 0, 0);
            ctx.restore();
        },
        [size],
    );

    /** Re-stamps every stroke from scratch: after a resize, an undo, a clear. */
    const rebuild = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas || size.width === 0 || size.height === 0) return;

        const ratio = window.devicePixelRatio || 1;
        ratioRef.current = ratio;
        const pixels = {
            width: Math.round(size.width * ratio),
            height: Math.round(size.height * ratio),
        };

        // Assigning width/height also clears the canvas and drops the transform.
        canvas.width = pixels.width;
        canvas.height = pixels.height;
        canvas.getContext("2d")?.setTransform(ratio, 0, 0, ratio, 0, 0);

        /** Sizes an offscreen layer to the paper, blank, and hands back its context. */
        const layer = (ref: RefObject<HTMLCanvasElement | null>) => {
            const offscreen = ref.current ?? document.createElement("canvas");
            ref.current = offscreen;
            offscreen.width = pixels.width;
            offscreen.height = pixels.height;
            const context = offscreen.getContext("2d");
            context?.setTransform(ratio, 0, 0, ratio, 0, 0);
            return context;
        };

        const ink = layer(inkRef);
        const load = layer(loadRef);
        const grain = layer(grainRef);
        layer(maskRef);
        if (!ink || !load || !grain) return;

        // The sheet's tooth, rasterized once: the repaints just copy it. A
        // pattern re-tiled per repaint doesn't land identically into a small
        // rect and a large one when the device ratio is fractional, which
        // leaves specks along the edges of whatever was last painted.
        const tooth = grainFill(grain);
        if (tooth) {
            grain.fillStyle = tooth;
            grain.fillRect(0, 0, size.width + 1, size.height + 1);
        }

        const layers = { ink, load };
        for (const stroke of strokesRef.current)
            stampStroke(layers, stroke, size);
        if (drawingRef.current) stampStroke(layers, drawingRef.current, size);

        composite();
    }, [size, composite]);

    // Track the paper's CSS size; the canvases and the drawing follow it.
    useEffect(() => {
        const wrap = wrapRef.current;
        if (!wrap) return;

        const observer = new ResizeObserver((entries) => {
            const box = entries[0]?.contentRect;
            if (!box) return;
            setSize({
                width: Math.round(box.width),
                height: Math.round(box.height),
            });
        });
        observer.observe(wrap);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        rebuild();
    }, [rebuild]);

    /** Stamps just the newest segment and repaints only what it touched. */
    const inkFrom = (stroke: Stroke, from: number) => {
        const ink = inkRef.current?.getContext("2d");
        const load = loadRef.current?.getContext("2d");
        if (!ink || !load) return;
        const dirty = stampStroke({ ink, load }, stroke, size, from);
        if (dirty) composite(dirty);
    };

    /** Hands the finished stroke to the drawing. The wax is already laid down. */
    const commit = () => {
        const stroke = drawingRef.current;
        drawingRef.current = null;
        if (!stroke) return null;
        strokesRef.current = [...strokesRef.current, stroke];
        setMarks(strokesRef.current);
        return stroke;
    };

    // Points and widths are rounded to what a saved drawing keeps, as they
    // come in: the wax on screen is then exactly the wax that comes back.
    const begin = (at: Point, width: number) => {
        // A stroke someone left in progress keeps what it has.
        if (drawingRef.current) commit();
        drawingRef.current = {
            hex: crayon.hex,
            name: crayon.name,
            seed: (Math.random() * 0xffffffff) >>> 0,
            points: [snapPoint(at)],
            widths: [snapWidth(width)],
        };
        setDrawing(true);
        inkFrom(drawingRef.current, 0);
    };

    const extend = (point: Point, width: number) => {
        const stroke = drawingRef.current;
        if (!stroke) return;
        const at = snapPoint(point);

        const last = stroke.points[stroke.points.length - 1];
        // Below a pixel there is nothing to add but overlapping wax.
        if (
            Math.abs(at.x - last.x) * size.width < 1 &&
            Math.abs(at.y - last.y) * size.height < 1
        )
            return;

        stroke.points.push(at);
        stroke.widths.push(snapWidth(width));
        inkFrom(stroke, stroke.points.length - 1);
    };

    const finish = () => {
        if (!drawingRef.current) return null;
        const stroke = commit();
        setDrawing(false);
        return stroke;
    };

    const discard = () => {
        if (!drawingRef.current) return;
        drawingRef.current = null;
        setDrawing(false);
        rebuild();
    };

    const undo = () => {
        if (drawingRef.current) {
            drawingRef.current = null;
            setDrawing(false);
        }

        const strokes = strokesRef.current;
        if (strokes.length === 0) return null;

        const last = strokes[strokes.length - 1];
        strokesRef.current = strokes.slice(0, -1);
        setMarks(strokesRef.current);
        rebuild();
        return last;
    };

    const clear = () => {
        drawingRef.current = null;
        setDrawing(false);
        if (strokesRef.current.length === 0) return false;

        strokesRef.current = [];
        setMarks(strokesRef.current);
        rebuild();
        return true;
    };

    const replace = (strokes: Stroke[]) => {
        drawingRef.current = null;
        setDrawing(false);
        strokesRef.current = strokes;
        setMarks(strokes);
        rebuild();
    };

    return {
        wrapRef,
        canvasRef,
        size,
        marks,
        drawing,
        begin,
        extend,
        finish,
        discard,
        undo,
        clear,
        replace,
    };
};
