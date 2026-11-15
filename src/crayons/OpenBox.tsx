import {
    useLayoutEffect,
    useRef,
    useState,
    type CSSProperties,
    type KeyboardEvent,
    type RefObject,
} from "react";
import type { Crayon, CrayonBox } from "./boxes";
import { BoxFront } from "./BoxFront";
import { intoTiers, tiersFor } from "./layout";
import { NEW_CRAYON, type Nub } from "./tip";

type OpenBoxProps = {
    box: CrayonBox;
    /** The crayon in hand, if any. */
    selectedId: string | null;
    /** How worn each crayon is, by id. Anything missing is brand new. */
    nubs: Record<string, Nub>;
    /** Crayons in the palette, by id, to the slot (0-based) each sits in.
      They are drawn as taken out of the box: a dashed ghost and a number. */
    marked?: ReadonlyMap<string, number>;
    /** Each crayon is a checkbox that puts it in the palette or takes it
      out; arrow keys move focus without changing anything. */
    onToggle: (crayon: Crayon) => void;
    /** What the box is sized against. The box itself only grows as wide as
      its crayons need, so it can't measure its own room: it measures this
      instead, less whatever borders and padding lie between. Without it,
      the bay measures itself. */
    frameRef?: RefObject<HTMLElement | null>;
};

/** The borders, padding and scrollbar between `inner` and `outer`, across. */
const chromeBetween = (inner: HTMLElement, outer: HTMLElement) => {
    let sum = 0;
    for (
        let el = inner.parentElement;
        el && el !== outer;
        el = el.parentElement
    ) {
        const style = getComputedStyle(el);
        sum +=
            el.offsetWidth -
            el.clientWidth +
            parseFloat(style.paddingLeft) +
            parseFloat(style.paddingRight);
    }
    return sum;
};

/**
 * One crayon drawn after the 1991 Collector's Tin: a flat colour with a thin
 * black outline, a rounded cone for a tip, a narrow collar, and the wrapper.
 * It is three stretchy pieces rather than one picture so that wear still
 * shows: the cone shortens as the point goes, the wrapper as the wax does,
 * and the collar keeps its size. The outlines stay one pixel wide however the
 * pieces stretch (vector-effect in the stylesheet).
 */
const TinCrayon = () => (
    <>
        <svg
            className="crayon-tip"
            viewBox="0 0 38 48"
            preserveAspectRatio="none"
            aria-hidden="true"
            focusable="false"
        >
            <path
                className="wax"
                d="M3.5 48 L11.5 3 Q14 0.5 19 0.5 Q24 0.5 26.5 3 L34.5 48 Z"
            />
            <path
                className="ink"
                d="M3.5 48 L11.5 3 Q14 0.5 19 0.5 Q24 0.5 26.5 3 L34.5 48"
            />
        </svg>
        <svg
            className="crayon-collar"
            viewBox="0 0 38 20"
            preserveAspectRatio="none"
            aria-hidden="true"
            focusable="false"
        >
            <path className="wax" d="M2 0.5 H36 V19.5 H2 Z" />
            <path className="ink" d="M2 0.5 H36 V19.5 H2 Z" />
        </svg>
        <svg
            className="crayon-body"
            viewBox="0 0 38 100"
            preserveAspectRatio="none"
            aria-hidden="true"
            focusable="false"
        >
            <path className="wax" d="M0.75 0 H37.25 V99.5 H0.75 Z" />
            <path className="ink" d="M0.75 0 V99.5 H37.25 V0" />
        </svg>
    </>
);

/**
 * The open box, every crayon in it and each one choosable where it stands.
 * Each crayon shows its own wear: a sharp one is a point, a flat one a stub.
 *
 * It is a checklist for the palette: a click, Space or Enter puts a crayon
 * in or takes it out, while the arrow keys only move focus, as in a
 * multi-select list. One crayon at a time is in the Tab order.
 */
export const OpenBox = ({
    box,
    selectedId,
    nubs,
    marked,
    onToggle,
    frameRef,
}: OpenBoxProps) => {
    // The bay takes whatever room the tray has, so how deep to stack the
    // crayons depends on how wide that turns out to be.
    const bayRef = useRef<HTMLDivElement>(null);
    const [bayWidth, setBayWidth] = useState(520);
    // A layout effect, so the real width is known before the first paint.
    // With a plain effect the box is drawn once at the guess below, in the
    // wrong number of rows, and then jumps to the right height.
    useLayoutEffect(() => {
        const bay = bayRef.current;
        if (!bay) return;
        const frame = frameRef?.current ?? bay;
        const measure = () => {
            const room =
                frame === bay
                    ? bay.getBoundingClientRect().width
                    : frame.clientWidth - chromeBetween(bay, frame);
            if (room > 0) setBayWidth(Math.round(room));
        };
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(frame);
        return () => observer.disconnect();
    }, [frameRef]);

    const tiers = intoTiers(
        box.crayons,
        tiersFor(box.crayons.length, bayWidth),
    );
    const widest = Math.max(...tiers.map((tier) => tier.length), 1);

    // Focus is kept apart from what is in the palette.
    const inputs = useRef(new Map<string, HTMLInputElement>());
    const [focusId, setFocusId] = useState<string | null>(null);
    const startId =
        box.crayons.find((c) => c.id === selectedId)?.id ?? box.crayons[0]?.id;
    const tabStop =
        focusId !== null && box.crayons.some((c) => c.id === focusId)
            ? focusId
            : startId;

    const focusOn = (crayon: Crayon | undefined) => {
        if (!crayon) return;
        setFocusId(crayon.id);
        inputs.current.get(crayon.id)?.focus();
    };

    const onKeyDown = (
        event: KeyboardEvent<HTMLInputElement>,
        crayon: Crayon,
    ) => {
        const row = tiers.findIndex((tier) => tier.includes(crayon));
        const col = tiers[row].indexOf(crayon);
        const flat = tiers.flat();
        const at = flat.indexOf(crayon);
        const across = (to: number) => {
            const tier = tiers[to];
            if (tier) focusOn(tier[Math.min(col, tier.length - 1)]);
        };
        switch (event.key) {
            case "ArrowRight":
                focusOn(flat[at + 1]);
                break;
            case "ArrowLeft":
                focusOn(flat[at - 1]);
                break;
            case "ArrowDown":
                across(row + 1);
                break;
            case "ArrowUp":
                across(row - 1);
                break;
            case "Home":
                focusOn(flat[0]);
                break;
            case "End":
                focusOn(flat[flat.length - 1]);
                break;
            case "Enter":
                // A checkbox only toggles on Space; Enter does here too.
                onToggle(crayon);
                break;
            default:
                return;
        }
        event.preventDefault();
    };

    return (
        <div
            className="open-box-bay"
            ref={bayRef}
            style={
                {
                    "--cols": widest,
                    "--tiers": tiers.length,
                } as CSSProperties
            }
        >
            <fieldset className="open-box">
                <legend className="sr-only">
                    {`${box.label}: ${box.crayons.length} crayons. Check a crayon to put it in your palette.`}
                </legend>

                <div className="box-tiers">
                    {tiers.map((tier, depth) => (
                        <div
                            className="box-tier"
                            key={`tier-${depth}`}
                            style={
                                {
                                    "--depth": tiers.length - 1 - depth,
                                } as CSSProperties
                            }
                        >
                            {tier.map((crayon) => {
                                const nub = nubs[crayon.id] ?? NEW_CRAYON;
                                const inHand = crayon.id === selectedId;
                                const slot = marked?.get(crayon.id);
                                const pinned = slot !== undefined;
                                return (
                                    <label
                                        key={crayon.id}
                                        className={
                                            "box-crayon" +
                                            (inHand ? " in-hand" : "") +
                                            (pinned ? " in-palette" : "")
                                        }
                                        title={
                                            pinned
                                                ? `${crayon.name} · in palette slot ${slot + 1} · click to put back`
                                                : `${crayon.name} · ${crayon.hex}`
                                        }
                                        style={
                                            {
                                                "--wax": crayon.hex,
                                                /* 0–1, so the stylesheet can size the point and the
                           stub off them: a sharp tip is a tall spike, a worn
                           crayon a short body. */
                                                "--point": nub.sharpness / 100,
                                                "--stub": nub.length / 100,
                                            } as CSSProperties
                                        }
                                    >
                                        <input
                                            type="checkbox"
                                            className="sr-only"
                                            ref={(node) => {
                                                if (node)
                                                    inputs.current.set(
                                                        crayon.id,
                                                        node,
                                                    );
                                                else
                                                    inputs.current.delete(
                                                        crayon.id,
                                                    );
                                            }}
                                            tabIndex={
                                                crayon.id === tabStop ? 0 : -1
                                            }
                                            checked={pinned}
                                            onChange={() => onToggle(crayon)}
                                            onFocus={() =>
                                                setFocusId(crayon.id)
                                            }
                                            onKeyDown={(event) =>
                                                onKeyDown(event, crayon)
                                            }
                                        />
                                        <TinCrayon />
                                        {pinned && (
                                            <span
                                                className="ghost-slot"
                                                aria-hidden="true"
                                            >
                                                {slot + 1}
                                            </span>
                                        )}
                                        {/* The crayon is a picture, so the input's name has to
                        come from here. */}
                                        <span className="sr-only">
                                            {crayon.name}
                                            {pinned &&
                                                `, in palette slot ${slot + 1}`}
                                            {inHand && ", in hand"}
                                        </span>
                                    </label>
                                );
                            })}
                        </div>
                    ))}
                </div>

                <BoxFront
                    columns={Math.min(widest, 20)}
                    label={`${box.label} · ${box.crayons.length}`}
                />
            </fieldset>
        </div>
    );
};
