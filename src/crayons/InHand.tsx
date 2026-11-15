import type { CSSProperties } from "react";
import type { Crayon } from "./boxes";
import { retiredYear } from "./boxes";
import { isStub, lineWidth, tipWord, worthSharpening, type Nub } from "./tip";

type InHandProps = {
    /** Null when nothing is in hand: an empty palette slot is chosen. */
    crayon: Crayon | null;
    nub: Nub;
    onSharpen: () => void;
    /** False on the desk, where the sharpener stands beside the tray. */
    withSharpener: boolean;
};

/**
 * The crayon in hand drawn like the ones in the box (after the 1991 tin):
 * flat wax, a thin ink outline, wrapper, collar and a rounded cone, lying on
 * its side. The wrapper is as long as what is left of the crayon and the
 * cone as long as the point is sharp, so wear shows here as it does there.
 */
/** Longest the wrapper and the cone get, so the picture's frame never
    changes size: a crayon wearing down mid-stroke must not nudge the strip. */
const MAX_BODY = 80;
const MAX_TIP = 22;
const COLLAR_W = 10;
const HAND_W = 1 + MAX_BODY + COLLAR_W + MAX_TIP + 2;

const HandCrayon = ({
    hex,
    point,
    stub,
}: {
    hex: string;
    point: number;
    stub: number;
}) => {
    // The collar stays put; the wrapper shortens back towards it from the
    // left and the cone shortens towards it from the right.
    const body = 1 + MAX_BODY;
    const collar = body + COLLAR_W;
    const end = body - (6 + (MAX_BODY - 6) * stub);
    const nose = collar + 6 + (MAX_TIP - 6) * point;
    const width = HAND_W;
    return (
        <svg
            className="hand-crayon"
            width={width}
            height={24}
            viewBox={`0 0 ${width} 24`}
            aria-hidden="true"
            focusable="false"
            style={{ "--wax": hex } as CSSProperties}
        >
            <path
                className="wax"
                d={`M${collar} 3 L${nose - 3} 8.5 Q${nose} 9.5 ${nose} 12 Q${nose} 14.5 ${nose - 3} 15.5 L${collar} 21 Z`}
            />
            <path
                className="ink"
                d={`M${collar} 3 L${nose - 3} 8.5 Q${nose} 9.5 ${nose} 12 Q${nose} 14.5 ${nose - 3} 15.5 L${collar} 21`}
            />
            <path
                className="wax"
                d={`M${body} 1.5 H${collar} V22.5 H${body} Z`}
            />
            <path
                className="ink"
                d={`M${body} 1.5 H${collar} V22.5 H${body} Z`}
            />
            <path className="wax" d={`M${end} 3 H${body} V21 H${end} Z`} />
            <path className="ink" d={`M${end} 3 H${body} V21 H${end} Z`} />
        </svg>
    );
};

/** A pencil sharpener: a box with a hole and a blade. */
const SharpenerIcon = () => (
    <svg viewBox="0 0 56 40" aria-hidden="true" focusable="false">
        <rect
            x="4"
            y="6"
            width="48"
            height="28"
            rx="4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
        />
        <circle
            cx="18"
            cy="20"
            r="8"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
        />
        <circle cx="18" cy="20" r="2.5" fill="currentColor" />
        <path
            d="M30 13 H48 M30 20 H48 M30 27 H44"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
        />
    </svg>
);

/**
 * The crayon you are holding, in the tray strip: drawn lying on its side,
 * with its name, what is known about it and how worn it is, and the
 * sharpener it can be put through. With nothing in hand, a dashed ghost.
 *
 * The drawing is the same two numbers the renderer uses — how sharp the tip
 * is and how much crayon is left — so what you see here is what the line will
 * do, not a decoration of it.
 */
export const InHand = ({
    crayon,
    nub,
    onSharpen,
    withSharpener,
}: InHandProps) => {
    if (crayon === null) {
        return (
            <div className="in-hand in-hand-strip">
                {withSharpener && (
                    <div className="sharpener-slot">
                        <button type="button" className="sharpener" disabled>
                            <span className="sr-only">
                                No crayon to sharpen
                            </span>
                            <SharpenerIcon />
                        </button>
                    </div>
                )}
                {/* A dashed outline where the crayon would lie: the hand is
                    empty, and it shows rather than says so. */}
                <div className="hand-chip">
                    <svg
                        className="ghost-hand"
                        viewBox="0 0 92 32"
                        role="img"
                        aria-label="No crayon in hand"
                    >
                        <path d="M2 6 H62 V26 H2 Z" />
                        <path d="M62 4 H70 V28 H62 Z" />
                        <path d="M70 7 L87 14 Q90 16 87 18 L70 25" />
                    </svg>
                </div>
            </div>
        );
    }

    const retired = retiredYear(crayon);
    const blunt = !worthSharpening(nub);
    const stub = isStub(nub);

    const sharpenerSlot = (
        <div className="sharpener-slot">
            <button
                type="button"
                className="sharpener"
                onClick={onSharpen}
                disabled={blunt}
                title={`Sharpen ${crayon.name}`}
            >
                <span className="sr-only">
                    {blunt
                        ? `${crayon.name} is already sharp`
                        : `Sharpen ${crayon.name}. The tip is ${tipWord(nub.sharpness)}; sharpening it costs some of the crayon.`}
                </span>
                <SharpenerIcon />
            </button>
            <span className="sharpener-label">Sharpener</span>
        </div>
    );

    const status =
        retired === null ? "In the box" : `Retired${retired && ` ${retired}`}`;

    const tipMeter = (
        <>
            <span className="meter-word">
                {tipWord(nub.sharpness)} ·{" "}
                {Math.round(lineWidth(nub.sharpness))}
                px line
            </span>
            <span
                className="meter"
                role="meter"
                aria-label="Tip sharpness"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(nub.sharpness)}
                aria-valuetext={`${tipWord(nub.sharpness)}, drawing a ${Math.round(lineWidth(nub.sharpness))} pixel line`}
            >
                <span
                    className="meter-fill wax"
                    style={
                        {
                            "--wax": crayon.hex,
                            "--at": `${nub.sharpness}%`,
                        } as CSSProperties
                    }
                />
            </span>
        </>
    );

    const leftMeter = (
        <>
            <span className="meter-word">
                {stub ? "worn to a nub" : `${Math.round(nub.length)}% left`}
            </span>
            <span
                className="meter"
                role="meter"
                aria-label="Crayon remaining"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(nub.length)}
            >
                <span
                    className="meter-fill"
                    style={{ "--at": `${nub.length}%` } as CSSProperties}
                />
            </span>
        </>
    );

    return (
        <div className="in-hand in-hand-strip">
            {withSharpener && sharpenerSlot}
            <div className="hand-chip">
                <HandCrayon
                    hex={crayon.hex}
                    point={nub.sharpness / 100}
                    stub={nub.length / 100}
                />
                <div className="chip-text">
                    <span className="chip-name">{crayon.name}</span>
                    <span className="chip-meta">
                        Introduced {crayon.year} · {status}
                    </span>
                    <div className="chip-meters">
                        <div className="chip-meter">{tipMeter}</div>
                        <div className="chip-meter">{leftMeter}</div>
                    </div>
                </div>
            </div>
        </div>
    );
};
