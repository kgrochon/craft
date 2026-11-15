import type { CSSProperties, KeyboardEvent, PointerEvent } from "react";
import type { Crayon } from "./boxes";
import {
    ART_H,
    ART_W,
    CRAYON_OUTLINE,
    CRAYON_TOP,
    CRAYON_WAX,
    SHARPENER_BODY,
    SHARPENER_INK,
    SHARPENER_RIM,
} from "./sharpenerArt";
import { isStub, tipWord, worthSharpening, type Nub } from "./tip";

type SharpenerProps = {
    /** Null when nothing is in hand: the sharpener stands empty. */
    crayon: Crayon | null;
    nub: Nub;
    /** True while the crayon is being ground. */
    grinding: boolean;
    onStart: () => void;
    onStop: () => void;
};

/** The crayon stands in the hole; this much of it shows when it is whole. */
const STEM = SHARPENER_RIM - CRAYON_TOP;

const isHoldKey = (key: string) => key === " " || key === "Enter";

/**
 * The sharpener standing on the desk beside the tray. Hold it (pointer or
 * Space/Enter) and the crayon in hand goes into its hole and grinds down:
 * the point comes back, the crayon gets shorter, and what is left of it is
 * what shows above the rim. Let go and the crayon is back in your hand.
 */
export const Sharpener = ({
    crayon,
    nub,
    grinding,
    onStart,
    onStop,
}: SharpenerProps) => {
    const idle = crayon === null || !worthSharpening(nub);
    /* How far the crayon has sunk: what shows above the rim is the crayon's
       length, whole at the top position. */
    const drop = STEM * (1 - nub.length / 100);

    const start = () => {
        if (idle) return;
        onStart();
    };

    const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        start();
    };

    const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
        if (!isHoldKey(event.key)) return;
        event.preventDefault();
        if (!event.repeat) start();
    };

    const onKeyUp = (event: KeyboardEvent<HTMLButtonElement>) => {
        if (!isHoldKey(event.key)) return;
        event.preventDefault();
        onStop();
    };

    const label =
        crayon === null
            ? "No crayon to sharpen"
            : isStub(nub)
              ? `${crayon.name} is worn to a nub; there is nothing left to sharpen`
              : idle
                ? `${crayon.name} is already sharp`
                : `Sharpen ${crayon.name}. Hold to grind: the tip is ${tipWord(nub.sharpness)}, and sharpening costs some of the crayon.`;

    return (
        <div className="sharpener-stand" data-grinding={grinding || undefined}>
            <button
                type="button"
                className="grinder"
                aria-disabled={idle}
                title={crayon ? `Sharpen ${crayon.name}` : undefined}
                onPointerDown={onPointerDown}
                onPointerUp={onStop}
                onPointerCancel={onStop}
                onLostPointerCapture={onStop}
                onKeyDown={onKeyDown}
                onKeyUp={onKeyUp}
                onBlur={onStop}
                onContextMenu={(event) => event.preventDefault()}
            >
                <span className="sr-only">{label}</span>
                <svg
                    className="stand-art"
                    viewBox={`0 0 ${ART_W} ${ART_H}`}
                    aria-hidden="true"
                    focusable="false"
                >
                    {/* The crayon is only in the hole while it is being
                        ground; the rest of the time it is in your hand. */}
                    {crayon && (
                        <g
                            className="stand-crayon"
                            style={
                                {
                                    "--wax": crayon.hex,
                                    "--drop": `${drop}px`,
                                } as CSSProperties
                            }
                        >
                            <g className="stand-twist">
                                <path className="wax" d={CRAYON_WAX} />
                                <path className="ink" d={CRAYON_OUTLINE} />
                            </g>
                        </g>
                    )}
                    <path fill="#ff5a4a" d={SHARPENER_BODY} />
                    <path
                        d={SHARPENER_INK}
                        fill="none"
                        stroke="var(--desk-ink)"
                        strokeWidth="4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                </svg>
            </button>
        </div>
    );
};
