import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, PointerEvent } from "react";
import { SHELF, DEFAULT_BOX_ID, boxById } from "./boxes";
import type { Crayon, CrayonBox } from "./boxes";
import {
    crayonCursor,
    paintDrawing,
    type Point,
    type Size,
    type Stroke,
} from "./crayonRender";
import {
    adoptLegacy,
    deleteSaved,
    keepDrawing,
    listSaved,
    loadSaved,
    markCurrent,
    sameDrawing,
    type SavedDrawing,
} from "./drawingStore";
import {
    download,
    drawingPng,
    drawingSvg,
    paperColor,
    thumbnailOf,
} from "./exportDrawing";
import { Gallery } from "./Gallery";
import { InHand } from "./InHand";
import { SavedStack } from "./SavedStack";
import { PALETTE_MAX } from "./layout";
import { OpenBox } from "./OpenBox";
import { Palette } from "./Palette";
import {
    emptySlots,
    loadPalettes,
    placeCrayon,
    randomSlots,
    removeAt,
    storePalettes,
    type Slots,
} from "./paletteSlots";
import { Shelf } from "./Shelf";
import {
    afterSharpening,
    afterTravel,
    lineWidth,
    NEW_CRAYON,
    pressureScale,
    tipWord,
    whileGrinding,
    worthSharpening,
    type Nub,
} from "./tip";
import { Sharpener } from "./Sharpener";
import { useCrayonSurface } from "./useCrayonSurface";
import { useDeskLayout } from "./useDeskLayout";
import { paletteFromStrokes, slotsFromRanked } from "./drawingPalette";
import "@fontsource/chewy/400.css";
import "@fontsource/gochi-hand/400.css";
import "./crayons.css";

/** Keyboard cursor steps, as a fraction of the paper. */
const STEP = 0.015;
const BIG_STEP = 0.08;

/**
 * How often the worn tip is handed to React while you are drawing. The stroke
 * itself uses the exact live value every segment; this only paces how often
 * the tray redraws, because that tray can hold a hundred and twenty crayons.
 */
const TRAY_REFRESH_MS = 90;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** The sheet, at its own shape, and whether it lies turned a quarter-turn. */
type Sheet = Size & { turned: boolean };

/** How much more room turning the sheet has to win before it turns, so a
    nearly square drawing doesn't flip over at every small resize. */
const TURN_GAIN = 1.1;

/**
 * The sheet inside the room the desk has for it. A blank sheet fills the
 * room. A drawing keeps the shape it was started on, scaled to fit, so
 * turning a phone or opening a desktop drawing on one never stretches it.
 * Where the screen can be turned too (`canTurn`), a drawing the other way
 * round to the room lies sideways on it, so it fills the screen rather than
 * sitting small in the middle of it.
 */
const fitSheet = (room: Size, shape: Size | null, canTurn: boolean): Sheet => {
    if (!shape || shape.width <= 0 || shape.height <= 0)
        return { ...room, turned: false };
    const upright = Math.min(
        room.width / shape.width,
        room.height / shape.height,
    );
    const sideways = Math.min(
        room.width / shape.height,
        room.height / shape.width,
    );
    const turned = canTurn && sideways > upright * TURN_GAIN;
    const scale = turned ? sideways : upright;
    return {
        width: Math.floor(shape.width * scale),
        height: Math.floor(shape.height * scale),
        turned,
    };
};

/**
 * From the screen to the sheet. A turned sheet lies a quarter-turn
 * clockwise: its top edge runs down the right of the screen.
 */
const toSheet = (screen: Point, turned: boolean): Point =>
    turned ? { x: screen.y, y: 1 - screen.x } : screen;

/** From the sheet back to the screen. */
const toScreen = (at: Point, turned: boolean): Point =>
    turned ? { x: 1 - at.y, y: at.x } : at;

/**
 * What the page opens with: the saved drawings, and the one that was last on
 * the paper. The first visit after the gallery arrived also moves the single
 * drawing the page used to keep into it.
 */
const startingPoint = () => {
    if (typeof window !== "undefined") {
        const size = { width: window.innerWidth, height: window.innerHeight };
        adoptLegacy(size, (strokes) =>
            thumbnailOf(paintDrawing(strokes, size), paperColor()),
        );
    }
    // Every visit starts on a fresh sheet; saved drawings wait in the stack.
    return {
        drawings: listSaved(),
        id: null,
        strokes: [] as Stroke[],
    };
};

/**
 * The palette to start with: the one kept from your last visit, or on a
 * first visit a random set from the box the page opens on.
 */
const startingPalette = () => {
    const stored = loadPalettes() ?? { palettes: {}, slot: 0 };
    const opening = boxById(DEFAULT_BOX_ID);
    // Only crayons still in the box count; a palette left empty (or never
    // made) starts as a random set, so there is always a crayon in hand.
    let slots = (stored.palettes[opening.id] ?? []).map((id) =>
        id !== null && opening.crayons.some((c) => c.id === id) ? id : null,
    );
    if (!slots.some((id) => id !== null)) {
        slots = randomSlots(opening.crayons.map((c) => c.id));
    }
    // Start holding something: the kept slot if it has a crayon, else the
    // first that does.
    const slot =
        slots[stored.slot] != null
            ? stored.slot
            : Math.max(
                  0,
                  slots.findIndex((id) => id !== null),
              );
    return {
        palettes: { ...stored.palettes, [opening.id]: slots },
        slot,
    };
};

/** Percentages read better than pixels when a position is spoken aloud. */
const spokenPosition = (p: Point) =>
    `${Math.round(p.x * 100)} percent across, ${Math.round(p.y * 100)} percent down`;

export const Crayons = () => {
    const [boxId, setBoxId] = useState(DEFAULT_BOX_ID);
    /** How worn each crayon is, kept across box changes. */
    const [nubs, setNubs] = useState<Record<string, Nub>>({});
    /** The box sits under a lid: it opens over the paper to choose. It
        starts closed; the palette already holds colours to draw with. */
    const [lidOpen, setLidOpen] = useState(false);
    /** Each box's palette: a fixed row of slots, crayon ids or gaps. */
    const [firstPalette] = useState(startingPalette);
    const [palettes, setPalettes] = useState<Record<string, Slots>>(
        firstPalette.palettes,
    );
    /** The chosen palette slot. Its crayon is the one in hand; an empty
        slot means nothing is. */
    const [slotIndex, setSlotIndex] = useState(firstPalette.slot);
    /** The strip's height, so the paper can stop above it however it wraps. */
    const [stripH, setStripH] = useState(84);
    const [focused, setFocused] = useState(false);
    /** `tick` makes a repeated message a new string, so it gets spoken again. */
    const [announcement, setAnnouncement] = useState({ text: "", tick: 0 });
    const [start] = useState(startingPoint);
    /** Every saved drawing, newest first. */
    const [drawings, setDrawings] = useState<SavedDrawing[]>(start.drawings);
    /** The saved drawing on the paper; null for a fresh sheet. */
    const [currentId, setCurrentId] = useState<string | null>(start.id);
    /** The paper's strokes as of its last save or opening; the paper starts from them. */
    const [saved, setSaved] = useState<Stroke[]>(start.strokes);
    const [galleryOpen, setGalleryOpen] = useState(false);
    /** The drawing a save last failed on, so the warning goes once it changes. */
    const [failedOn, setFailedOn] = useState<Stroke[] | null>(null);
    const { layout, compact } = useDeskLayout();
    /** The room the desk leaves for the sheet. */
    const [room, setRoom] = useState<Size | null>(null);
    /** The shape the drawing on the paper was started on; null for a
        blank sheet, which fills whatever room there is. */
    const [shape, setShape] = useState<Size | null>(null);
    /** On narrow screens Clear, Save and Export fold away under More. */
    const [moreOpen, setMoreOpen] = useState(false);
    const onDesk = layout === "desk";
    // A phone or tablet can be turned to meet a sideways sheet; a desk
    // screen can't, so there a drawing only ever scales.
    const sheet = room ? fitSheet(room, shape, !onDesk) : null;
    const turned = sheet?.turned ?? false;

    /* Where the crayon is resting. A ref, not state: nothing renders from it,
       and a render per pointer move would redraw the whole tray. */
    const cursorRef = useRef<Point>({ x: 0.5, y: 0.5 });
    /* The tip as it is wearing, updated every segment. The stroke reads this;
       React only hears about it a few times a second. */
    const liveRef = useRef<Nub>(NEW_CRAYON);
    const lastPointRef = useRef<Point | null>(null);
    const pushedAtRef = useRef(0);
    /* The pointer drawing the stroke now, so a second finger or a palm
       can't join in. */
    const pointerRef = useRef<{ id: number; type: string } | null>(null);
    /* Set once a pencil has drawn. From then on a hand on the paper is a
       palm resting on it, not a finger drawing. */
    const penSeenRef = useRef(false);
    /* The grind in progress at the standing sharpener: its next frame and
       the tip as it is wearing. Null when nothing is being sharpened. */
    const grindRef = useRef<{
        frame: number;
        worn: { nub: Nub; at: number; pushedAt: number };
    } | null>(null);
    const [grinding, setGrinding] = useState(false);
    // A grind must not outlive the desk.
    useEffect(
        () => () => {
            if (grindRef.current) cancelAnimationFrame(grindRef.current.frame);
        },
        [],
    );

    const announce = (text: string) =>
        setAnnouncement((previous) => ({ text, tick: previous.tick + 1 }));

    const box = boxById(boxId);
    const slots = palettes[box.id] ?? emptySlots();
    const slotCrayons = slots.map((id) =>
        id === null ? null : (box.crayons.find((c) => c.id === id) ?? null),
    );
    /** What is in hand: whatever the chosen slot holds, which may be
        nothing. */
    const held: Crayon | null = slotCrayons[slotIndex] ?? null;
    const canDraw = held !== null;
    /** The paper's hooks need a crayon even with nothing in hand; this one
        is never drawn with, because no stroke starts without `held`. */
    const crayon = held ?? box.crayons[0];
    const nub = nubs[crayon.id] ?? NEW_CRAYON;
    const paper = useCrayonSurface(crayon, saved);

    const trayRef = useRef<HTMLElement>(null);
    const lidRef = useRef<HTMLDivElement>(null);
    const toggleRef = useRef<HTMLButtonElement>(null);
    /** Set when the person opens the lid, so focus goes into the box. It is
        not set for the lid that starts open, which would steal focus on load. */
    const focusLidRef = useRef(false);
    const stripRef = useRef<HTMLDivElement>(null);
    const roomRef = useRef<HTMLDivElement>(null);
    const toolsRef = useRef<HTMLDivElement>(null);
    const moreRef = useRef<HTMLButtonElement>(null);
    /** Each palette crayon's slot, for numbering its ghost in the box. */
    const inPalette = new Map(
        slots.flatMap((id, index) =>
            id === null ? [] : [[id, index] as const],
        ),
    );

    useLayoutEffect(() => {
        const strip = stripRef.current;
        if (!strip) return;
        const measure = () =>
            setStripH(Math.round(strip.getBoundingClientRect().height));
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(strip);
        return () => observer.disconnect();
    }, []);

    // The room for the sheet, without its padding.
    useLayoutEffect(() => {
        const element = roomRef.current;
        if (!element) return;
        const observer = new ResizeObserver((entries) => {
            const box = entries[0]?.contentRect;
            if (!box) return;
            setRoom({
                width: Math.floor(box.width),
                height: Math.floor(box.height),
            });
        });
        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    // On a phone the desk runs up to the screen's rounded corners, notch and
    // home bar, and pads itself clear of them. That needs viewport-fit=cover,
    // which only this page asks for: the rest of the site doesn't pad for it.
    useEffect(() => {
        const meta = document.querySelector<HTMLMetaElement>(
            'meta[name="viewport"]',
        );
        if (!meta) return;
        const was = meta.content;
        if (!/viewport-fit/.test(was))
            meta.content = `${was}, viewport-fit=cover`;
        return () => {
            meta.content = was;
        };
    }, []);

    // More folds back away on a press anywhere else.
    useEffect(() => {
        if (!moreOpen) return;
        const away = (event: Event) => {
            if (toolsRef.current?.contains(event.target as Node)) return;
            setMoreOpen(false);
        };
        document.addEventListener("pointerdown", away);
        return () => document.removeEventListener("pointerdown", away);
    }, [moreOpen]);

    // A blank sheet fills the room again: with nothing on it, it has no
    // shape to keep. A saved drawing undone to nothing keeps its shape.
    useEffect(() => {
        if (paper.marks.length === 0 && !paper.drawing && currentId === null)
            setShape(null);
    }, [paper.marks.length, paper.drawing, currentId]);

    useEffect(() => {
        if (!lidOpen || !focusLidRef.current) return;
        focusLidRef.current = false;
        lidRef.current
            ?.querySelector<HTMLInputElement>('input[tabindex="0"]')
            ?.focus();
    }, [lidOpen]);

    // The palette is remembered between visits.
    useEffect(() => {
        storePalettes({ palettes, slot: slotIndex });
    }, [palettes, slotIndex]);

    // Touching anything outside the tray, the paper above all, puts the lid
    // down so drawing is never blocked by a box left open.
    useEffect(() => {
        // With nothing in hand the box stays up: there is nothing to draw with.
        if (!lidOpen || !canDraw) return;
        const away = (event: Event) => {
            if (trayRef.current?.contains(event.target as Node)) return;
            setLidOpen(false);
        };
        document.addEventListener("pointerdown", away);
        return () => document.removeEventListener("pointerdown", away);
    }, [lidOpen, canDraw]);

    const keepNub = (worn: Nub) =>
        setNubs((was) => ({ ...was, [crayon.id]: worn }));

    /**
     * Starts a stroke from the wear this crayon already has. `pressure`
     * scales the line for a pencil; everything else draws at 1. The first
     * mark on a blank sheet fixes the drawing's shape.
     */
    const startStroke = (at: Point, pressure = 1) => {
        if (!shape && paper.size.width > 0) setShape(paper.size);
        liveRef.current = nub;
        lastPointRef.current = at;
        cursorRef.current = at;
        paper.begin(at, lineWidth(nub.sharpness) * pressure);
    };

    /**
     * Carries a stroke on. The tip blunts by the distance just travelled, so
     * the line widens under your hand rather than at the end of the stroke.
     */
    const carryStroke = (at: Point, pressure = 1) => {
        const previous = lastPointRef.current;
        if (previous) {
            const travelled = Math.hypot(at.x - previous.x, at.y - previous.y);
            liveRef.current = afterTravel(liveRef.current, travelled);
        }
        lastPointRef.current = at;
        cursorRef.current = at;
        paper.extend(at, lineWidth(liveRef.current.sharpness) * pressure);

        const now =
            typeof performance === "undefined" ? Date.now() : performance.now();
        if (now - pushedAtRef.current > TRAY_REFRESH_MS) {
            pushedAtRef.current = now;
            keepNub(liveRef.current);
        }
    };

    const endStroke = () => {
        const stroke = paper.finish();
        lastPointRef.current = null;
        pointerRef.current = null;
        if (stroke) keepNub(liveRef.current);
        return stroke;
    };

    const pointFrom = (event: PointerEvent<HTMLCanvasElement>): Point => {
        const rect = event.currentTarget.getBoundingClientRect();
        return toSheet(
            {
                x: clamp01((event.clientX - rect.left) / rect.width),
                y: clamp01((event.clientY - rect.top) / rect.height),
            },
            turned,
        );
    };

    /** A pencil's pressure; a mouse or finger draws the tip's own width. */
    const pressureOf = (event: PointerEvent<HTMLCanvasElement>) =>
        event.pointerType === "pen" ? pressureScale(event.pressure) : 1;

    const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
        if (event.button !== 0) return;
        const pen = event.pointerType === "pen";
        const going = pointerRef.current;
        if (pen) penSeenRef.current = true;
        // Once a pencil has drawn, a hand on the paper is a palm. And one
        // stroke at a time: a second finger joins nothing.
        if (event.pointerType === "touch" && (penSeenRef.current || going))
            return;
        if (going && !(pen && going.type === "touch")) return;
        if (!canDraw) {
            setLidOpen(true);
            announce("No crayon in hand. Pick one from your palette.");
            return;
        }
        // The palm landed before the pencil did: its smudge goes, and the
        // pencil draws.
        if (going) {
            paper.discard();
            lastPointRef.current = null;
        }
        event.currentTarget.setPointerCapture(event.pointerId);
        pointerRef.current = { id: event.pointerId, type: event.pointerType };
        startStroke(pointFrom(event), pressureOf(event));
    };

    const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
        if (pointerRef.current?.id !== event.pointerId) return;
        // `buttons` rather than the drawing flag: it is right on this very
        // event, where React state is a render behind. No buttons means the
        // lift was missed, so the stroke ends here.
        if (event.buttons === 0) {
            endStroke();
            return;
        }
        carryStroke(pointFrom(event), pressureOf(event));
    };

    const onPointerEnd = (event: PointerEvent<HTMLCanvasElement>) => {
        if (pointerRef.current?.id !== event.pointerId) return;
        endStroke();
    };

    /** Arrow keys move the crayon across the screen, however the sheet lies. */
    const movePen = (sx: number, sy: number) => {
        const dx = turned ? sy : sx;
        const dy = turned ? -sx : sy;
        const here = cursorRef.current;
        const next = { x: clamp01(here.x + dx), y: clamp01(here.y + dy) };
        if (paper.drawing) carryStroke(next);
        else cursorRef.current = next;
    };

    const togglePen = () => {
        if (paper.drawing) {
            const stroke = endStroke();
            announce(`Crayon up. ${stroke?.points.length ?? 0} points drawn.`);
            return;
        }
        startStroke(cursorRef.current);
        announce(
            `Crayon down at ${spokenPosition(toScreen(cursorRef.current, turned))} with ${crayon.name}. Arrow keys to draw, space to lift.`,
        );
    };

    const undo = () => {
        const taken = paper.undo();
        announce(
            taken
                ? `Took back the last mark in ${taken.name}.`
                : "Nothing left to undo.",
        );
    };

    /** Wipes the paper, and the next save starts a new drawing. */
    const clear = () => {
        const cleared = paper.clear();
        setCurrentId(null);
        setSaved([]);
        announce(
            cleared
                ? "Paper cleared. Saving now starts a new drawing."
                : "The paper is already blank.",
        );
    };

    const onKeyDown = (event: KeyboardEvent<HTMLCanvasElement>) => {
        const step = event.shiftKey ? BIG_STEP : STEP;
        switch (event.key) {
            case "ArrowUp":
                movePen(0, -step);
                break;
            case "ArrowDown":
                movePen(0, step);
                break;
            case "ArrowLeft":
                movePen(-step, 0);
                break;
            case "ArrowRight":
                movePen(step, 0);
                break;
            case " ":
            case "Enter":
                if (canDraw) togglePen();
                else announce("No crayon in hand. Pick one from your palette.");
                break;
            case "Home":
                endStroke();
                cursorRef.current = { x: 0.5, y: 0.5 };
                announce("Crayon up, back at the middle of the paper.");
                break;
            case "Backspace":
            case "Delete":
                undo();
                break;
            default:
                return; // Let every other key through (Tab, shortcuts, …).
        }
        // Arrows would scroll the page, space would too, Backspace would go back.
        event.preventDefault();
    };

    const chooseBox = (next: CrayonBox) => {
        setBoxId(next.id);
        // Off the desk the shelf is inside the open box, and you choose a
        // box to choose crayons from it: the box stays open.
        if (layout === "desk") setLidOpen(false);
        // A box opened for the first time comes with a random palette, the
        // same welcome the page gives, rather than ten empty slots.
        let nextSlots = palettes[next.id];
        if (!nextSlots) {
            nextSlots = randomSlots(next.crayons.map((c) => c.id));
            const dealt = nextSlots;
            setPalettes((was) => ({ ...was, [next.id]: dealt }));
        }
        const at = Math.max(
            0,
            nextSlots.findIndex((id) => id !== null),
        );
        setSlotIndex(at);
        const first = next.crayons.find((c) => c.id === nextSlots[at]);
        announce(
            first
                ? `${next.label} open, ${next.crayons.length} crayons. Holding ${first.name}.`
                : `${next.label} open, ${next.crayons.length} crayons. No crayon in hand.`,
        );
    };

    const openLid = () => {
        focusLidRef.current = true;
        setLidOpen(true);
    };

    const closeLid = (refocus: boolean) => {
        setLidOpen(false);
        if (refocus) toggleRef.current?.focus();
    };

    const setSlots = (next: Slots) =>
        setPalettes((was) => ({ ...was, [box.id]: next }));

    /** Takes a slot's crayon out. If it was in hand, the next crayon along
        is picked up instead, or nothing if the palette is now empty. */
    const removeSlot = (index: number) => {
        const gone = slotCrayons[index];
        if (!gone) return;
        const result = removeAt(slots, index, slotIndex);
        setSlots(result.slots);
        setSlotIndex(result.selected);
        const nowId = result.slots[result.selected];
        const now = nowId ? box.crayons.find((c) => c.id === nowId) : null;
        announce(
            index !== slotIndex
                ? `${gone.name} removed from your palette.`
                : now
                  ? `${gone.name} removed from your palette. Holding ${now.name}.`
                  : `${gone.name} removed from your palette. No crayon in hand.`,
        );
    };

    /** A crayon checked or unchecked in the box. */
    const toggleInPalette = (next: Crayon) => {
        const index = slots.indexOf(next.id);
        if (index >= 0) {
            removeSlot(index);
            return;
        }
        const placed = placeCrayon(slots, slotIndex, next.id);
        const replaced = placed.replaced
            ? box.crayons.find((c) => c.id === placed.replaced)
            : undefined;
        setSlots(placed.slots);
        setSlotIndex(placed.at);
        announce(
            replaced
                ? `${next.name} in slot ${placed.at + 1}, replacing ${replaced.name}. Holding ${next.name}.`
                : `${next.name} in slot ${placed.at + 1}. Holding ${next.name}.`,
        );
    };

    /** Choosing a slot in the strip. An empty one opens the box to fill it. */
    const chooseSlot = (index: number) => {
        setSlotIndex(index);
        const there = slotCrayons[index];
        if (there) {
            announce(`Holding ${there.name}.`);
        } else {
            announce(
                `Empty slot ${index + 1}. No crayon in hand. Pick from the box to fill it.`,
            );
            if (!lidOpen) openLid();
        }
    };

    const clearPalette = () => {
        setSlots(emptySlots());
        setSlotIndex(0);
        announce("Palette reset. No crayon in hand.");
    };

    /** Deals a fresh palette at random from the box and holds the first. */
    const randomize = () => {
        const dealt = randomSlots(box.crayons.map((c) => c.id));
        setSlots(dealt);
        setSlotIndex(0);
        const names = dealt
            .map((id) => box.crayons.find((c) => c.id === id)?.name)
            .filter(Boolean);
        announce(`Random palette: ${names.join(", ")}. Holding ${names[0]}.`);
    };

    /** Escape closes the lid. */
    const onTrayKeyDown = (event: KeyboardEvent<HTMLElement>) => {
        if (!lidOpen) return;
        if (event.key === "Escape") {
            event.preventDefault();
            closeLid(true);
        }
    };

    /** The small button on phones: one press sharpens all at once. */
    const sharpen = () => {
        if (!canDraw || !worthSharpening(nub)) return;
        const sharpened = afterSharpening(nub);
        liveRef.current = sharpened;
        keepNub(sharpened);
        announce(`${crayon.name} sharpened to a point.`);
    };

    /**
     * The standing sharpener on the desk: hold it and the crayon grinds
     * down frame by frame. Like a stroke, the wear lives in a ref while it
     * is happening and React hears about it a few times a second.
     */
    const startGrinding = () => {
        if (!canDraw || !worthSharpening(nub)) return;
        if (grindRef.current !== null || pointerRef.current !== null) return;
        const worn = { nub, at: performance.now(), pushedAt: 0 };
        setGrinding(true);
        const step = (now: number) => {
            worn.nub = whileGrinding(worn.nub, (now - worn.at) / 1000);
            worn.at = now;
            if (now - worn.pushedAt > TRAY_REFRESH_MS) {
                worn.pushedAt = now;
                keepNub(worn.nub);
            }
            if (!worthSharpening(worn.nub)) {
                stopGrinding();
                return;
            }
            grindRef.current = { frame: requestAnimationFrame(step), worn };
        };
        grindRef.current = { frame: requestAnimationFrame(step), worn };
    };

    const stopGrinding = () => {
        const going = grindRef.current;
        if (going === null) return;
        cancelAnimationFrame(going.frame);
        grindRef.current = null;
        setGrinding(false);
        const done = going.worn.nub;
        liveRef.current = done;
        keepNub(done);
        announce(
            worthSharpening(done)
                ? `${crayon.name} sharpened a little; the tip is ${tipWord(done.sharpness)}.`
                : `${crayon.name} sharpened to a point.`,
        );
    };

    const marks = paper.marks.length;
    const unchanged = sameDrawing(paper.marks, saved);
    const isSaved = unchanged && currentId !== null;
    const saveFailed = failedOn === paper.marks;

    /**
     * Saves the paper: over the drawing it came from, or as a new one in the
     * gallery if it's a fresh sheet.
     */
    const save = () => {
        if (marks === 0) {
            announce("Nothing to save yet, the paper is blank.");
            return;
        }
        if (isSaved) {
            announce("Already saved.");
            return;
        }
        const drawing = paper.marks;
        const canvas = paper.canvasRef.current;
        const kept = keepDrawing({
            id: currentId,
            strokes: drawing,
            size: paper.size,
            thumb: canvas ? thumbnailOf(canvas, paperColor()) : "",
        });
        if (!kept) {
            setFailedOn(drawing);
            announce(
                "Couldn't save. This browser's storage is full or switched off. Export a copy instead.",
            );
            return;
        }
        const all = listSaved();
        setDrawings(all);
        setSaved(drawing);
        setCurrentId(kept.id);
        setFailedOn(null);
        announce(
            currentId
                ? "Saved your changes."
                : `Saved as a new drawing. ${all.length} saved in all.`,
        );
    };

    /** Puts a saved drawing on the paper, in place of whatever is there. */
    const openOnPaper = (drawing: SavedDrawing) => {
        const strokes = loadSaved(drawing.id);
        if (!strokes) {
            announce("Couldn't open that drawing.");
            return;
        }
        paper.replace(strokes);
        setShape({ width: drawing.width, height: drawing.height });
        setSaved(strokes);
        setCurrentId(drawing.id);
        markCurrent(drawing.id);
        setFailedOn(null);
        setGalleryOpen(false);

        // The palette becomes the colours the drawing was made with, so you
        // can carry on with them; past ten, the ten used most.
        const found = paletteFromStrokes(strokes, SHELF, box.id);
        let colours = "";
        if (found) {
            const target = boxById(found.boxId);
            const kept = found.ids.slice(0, PALETTE_MAX);
            setBoxId(target.id);
            setPalettes((was) => ({
                ...was,
                [target.id]: slotsFromRanked(kept),
            }));
            setSlotIndex(0);
            setLidOpen(false);
            const first = target.crayons.find((c) => c.id === kept[0]);
            colours =
                found.colours > kept.length
                    ? ` Palette set to its ${kept.length} most used colours of ${found.colours}.`
                    : ` Palette set to its ${kept.length} ${kept.length === 1 ? "colour" : "colours"}.`;
            if (first) colours += ` Holding ${first.name}.`;
        }
        announce(
            `Opened on the paper: ${drawing.marks} ${drawing.marks === 1 ? "mark" : "marks"}. Saving now saves over it.${colours}`,
        );
    };

    const deleteDrawing = (drawing: SavedDrawing) => {
        if (!deleteSaved(drawing.id)) return false;
        setDrawings(listSaved());
        // The marks stay on the paper; they're just not saved anywhere now.
        if (drawing.id === currentId) {
            setCurrentId(null);
            setSaved([]);
        }
        announce("Deleted.");
        return true;
    };

    const exportAs = async (kind: "png" | "svg") => {
        const canvas = paper.canvasRef.current;
        if (marks === 0 || !canvas) {
            announce("Nothing to export yet, the paper is blank.");
            return;
        }
        const sheet = paperColor();
        const file =
            kind === "svg"
                ? new Blob([drawingSvg(paper.marks, paper.size, sheet)], {
                      type: "image/svg+xml",
                  })
                : await drawingPng(canvas, sheet);
        if (!file) {
            announce("Couldn't make the picture. Try the other format.");
            return;
        }
        download(file, `kaffinated-drawing.${kind}`);
        announce(`Exported as ${kind.toUpperCase()}.`);
    };

    const px = Math.round(lineWidth(nub.sharpness));

    /* The cursor is the line: as wide as the tip draws, in the crayon's own
       color. `nub` is refreshed a few times a second while a stroke is going,
       so the cursor swells under your hand as the point wears. */
    const style = useMemo(
        () =>
            ({
                cursor: canDraw ? crayonCursor(crayon.hex, px) : "default",
                "--wax": crayon.hex,
            }) as CSSProperties,
        [crayon.hex, canDraw, px],
    );

    /** Runs a tool from under More, then folds More away. */
    const fromMore = (run: () => void) => () => {
        run();
        setMoreOpen(false);
        moreRef.current?.focus();
    };

    const onMoreKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        setMoreOpen(false);
        moreRef.current?.focus();
    };

    const saveLabel = saveFailed ? "Couldn’t save" : isSaved ? "Saved" : "Save";

    const shelf = <Shelf boxes={SHELF} openId={box.id} onOpen={chooseBox} />;

    // aria-disabled, not disabled, so focus stays put when it empties the
    // palette.
    const paletteTools = (
        <>
            <button
                type="button"
                className="lid-btn palette-random"
                aria-label="Randomize palette"
                onClick={randomize}
            >
                Randomize
            </button>
            <button
                type="button"
                className="lid-btn palette-reset"
                aria-label="Reset palette"
                aria-disabled={inPalette.size === 0}
                onClick={() => {
                    if (inPalette.size > 0) clearPalette();
                }}
            >
                Reset
            </button>
        </>
    );

    return (
        <div
            className="desk"
            data-layout={layout}
            data-compact={compact || undefined}
            style={{ ...style, "--strip-h": `${stripH}px` } as CSSProperties}
        >
            <div className="paper-room" ref={roomRef}>
                <div
                    className="paper-sheet"
                    ref={paper.wrapRef}
                    data-turned={turned || undefined}
                    style={
                        sheet
                            ? { width: sheet.width, height: sheet.height }
                            : undefined
                    }
                >
                    <canvas
                        ref={paper.canvasRef}
                        className={
                            focused ? "paper-canvas focused" : "paper-canvas"
                        }
                        /* The canvas handles arrow keys itself, so screen
                           readers need to pass them through rather than
                           browse with them. */
                        role="application"
                        tabIndex={0}
                        aria-label={
                            held
                                ? `Drawing paper${turned ? ", turned sideways to fit" : ""}, drawing with ${held.name}`
                                : `Drawing paper${turned ? ", turned sideways to fit" : ""}, no crayon in hand`
                        }
                        aria-describedby="desk-help"
                        onPointerDown={onPointerDown}
                        onPointerMove={onPointerMove}
                        onPointerUp={onPointerEnd}
                        onPointerCancel={onPointerEnd}
                        onKeyDown={onKeyDown}
                        onFocus={() => setFocused(true)}
                        onBlur={() => {
                            setFocused(false);
                            endStroke();
                        }}
                    />
                </div>
            </div>

            <header className="desk-bar">
                {/* The page still needs its heading, just not on the table. */}
                <h1 className="sr-only">Kaff&rsquo;s Crayon Shelf</h1>

                <div
                    ref={toolsRef}
                    className="bar-pill bar-tools"
                    role="toolbar"
                    aria-label="Drawing tools"
                >
                    {/* aria-disabled rather than disabled: a button that
                        disables itself when pressed throws focus away, and
                        each of these says why when there's nothing to do. */}
                    <button
                        type="button"
                        onClick={undo}
                        aria-disabled={marks === 0}
                    >
                        Undo
                    </button>
                    {compact ? (
                        <>
                            <button
                                type="button"
                                ref={moreRef}
                                aria-expanded={moreOpen}
                                aria-controls="desk-more"
                                onClick={() => setMoreOpen((open) => !open)}
                            >
                                More
                            </button>
                            <div
                                className="bar-more"
                                id="desk-more"
                                hidden={!moreOpen}
                                onKeyDown={onMoreKeyDown}
                            >
                                <button
                                    type="button"
                                    data-tone="yellow"
                                    onClick={fromMore(clear)}
                                    aria-disabled={marks === 0}
                                >
                                    Clear
                                </button>
                                <button
                                    type="button"
                                    data-tone="blue"
                                    onClick={fromMore(save)}
                                    aria-disabled={marks === 0 || isSaved}
                                >
                                    {saveLabel}
                                </button>
                                <button
                                    type="button"
                                    data-tone="green"
                                    onClick={fromMore(
                                        () => void exportAs("png"),
                                    )}
                                    aria-disabled={marks === 0}
                                >
                                    Export PNG
                                </button>
                                <button
                                    type="button"
                                    data-tone="pink"
                                    onClick={fromMore(
                                        () => void exportAs("svg"),
                                    )}
                                    aria-disabled={marks === 0}
                                >
                                    Export SVG
                                </button>
                            </div>
                        </>
                    ) : (
                        <>
                            <button
                                type="button"
                                onClick={clear}
                                aria-disabled={marks === 0}
                            >
                                Clear
                            </button>
                            <button
                                type="button"
                                onClick={save}
                                aria-disabled={marks === 0 || isSaved}
                            >
                                {saveLabel}
                            </button>
                            <span className="bar-rule" aria-hidden="true" />
                            <span className="bar-label" aria-hidden="true">
                                Export
                            </span>
                            <button
                                type="button"
                                onClick={() => void exportAs("png")}
                                aria-disabled={marks === 0}
                                aria-label="Export as PNG"
                            >
                                PNG
                            </button>
                            <button
                                type="button"
                                onClick={() => void exportAs("svg")}
                                aria-disabled={marks === 0}
                                aria-label="Export as SVG"
                            >
                                SVG
                            </button>
                        </>
                    )}
                </div>

                <SavedStack
                    drawings={drawings}
                    onOpen={() => setGalleryOpen(true)}
                />
            </header>

            {onDesk && (
                <aside className="shelf-rail" aria-label="Crayon boxes">
                    {shelf}
                </aside>
            )}

            {/* On the desk the sharpener stands beside the tray; on phones
                it is a small button in the strip instead. */}
            {onDesk && (
                <Sharpener
                    crayon={held}
                    nub={nub}
                    grinding={grinding}
                    onStart={startGrinding}
                    onStop={stopGrinding}
                />
            )}

            <Gallery
                open={galleryOpen}
                drawings={drawings}
                currentId={currentId}
                unsaved={marks > 0 && !unchanged}
                onClose={() => setGalleryOpen(false)}
                onOpenOnPaper={openOnPaper}
                onDelete={deleteDrawing}
            />

            <p className="sr-only" id="desk-help">
                {!held &&
                    "No crayon in hand: choose one from your palette, or open the box to fill it. "}
                The whole page is the paper. Drag to draw with {crayon.name} —
                the tip is {tipWord(nub.sharpness)}, laying a {px} pixel line.
                The point wears down as you draw and the line, and the cursor,
                widen with it; sharpening puts the point back and costs some of
                the crayon. Or use the arrow keys to move the crayon, space to
                put it down and lift it again, shift for bigger steps, Home to
                go back to the middle, and Backspace to take back your last
                mark.
            </p>

            <section
                ref={trayRef}
                className="tray"
                aria-label="Crayon tray"
                onKeyDown={onTrayKeyDown}
            >
                {/* The lid is the room the box may take; the panel in it is
                    only as wide as the crayons need. */}
                {lidOpen && (
                    <div className="lid" ref={lidRef}>
                        <div
                            className="lid-panel"
                            id="crayon-lid"
                            role="dialog"
                            aria-label={`${box.label}: choose crayons for your palette`}
                        >
                            {!onDesk && (
                                <div className="lid-shelf">{shelf}</div>
                            )}
                            <div className="lid-head">
                                {!onDesk && paletteTools}
                                <button
                                    type="button"
                                    className="lid-btn lid-done"
                                    onClick={() => closeLid(true)}
                                >
                                    Done
                                </button>
                            </div>
                            <OpenBox
                                box={box}
                                selectedId={held?.id ?? null}
                                onToggle={toggleInPalette}
                                marked={inPalette}
                                nubs={nubs}
                                frameRef={lidRef}
                            />
                        </div>
                    </div>
                )}

                <div className="tray-strip" ref={stripRef}>
                    <button
                        type="button"
                        ref={toggleRef}
                        className="lid-btn lid-toggle"
                        aria-expanded={lidOpen}
                        aria-controls="crayon-lid"
                        onClick={() => (lidOpen ? closeLid(false) : openLid())}
                    >
                        <span>{lidOpen ? "Close box" : "Open box"}</span>
                        <small>
                            {box.label} · {box.crayons.length}
                        </small>
                    </button>

                    <div className="palette-row">
                        <Palette
                            slots={slotCrayons}
                            selected={slotIndex}
                            onSelect={chooseSlot}
                            onRemove={removeSlot}
                            canFill={inPalette.size < box.crayons.length}
                        />
                        {onDesk && paletteTools}
                    </div>

                    <InHand
                        crayon={held}
                        nub={nub}
                        onSharpen={sharpen}
                        withSharpener={!onDesk}
                    />
                </div>
            </section>

            <p role="status" aria-live="polite" className="sr-only">
                {announcement.text}
                {announcement.tick % 2 === 0 ? "" : " "}
            </p>
        </div>
    );
};
