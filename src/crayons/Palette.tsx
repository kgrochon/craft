import {
    useEffect,
    useRef,
    useState,
    type CSSProperties,
    type KeyboardEvent,
} from "react";
import type { Crayon } from "./boxes";

type PaletteProps = {
    /** One entry per slot; null is an empty slot. */
    slots: (Crayon | null)[];
    selected: number;
    onSelect: (index: number) => void;
    onRemove: (index: number) => void;
    /** False when every crayon in the box is already in the palette: the
        empty slots then have nothing to hold, so they lose their plus and
        can't be chosen. */
    canFill: boolean;
};

/**
 * The palette in the tray strip: every slot shown, empty ones too, so
 * crayons never appear and vanish out of place.
 *
 * Arrow keys move focus along the row without choosing anything; Space,
 * Enter or a click chooses the slot (holding its crayon, or nothing if it is
 * empty). The chosen slot carries a × to take its crayon out, and Delete or
 * Backspace does the same from the keyboard. After a removal, focus follows
 * the selection to wherever it moved.
 */
export const Palette = ({
    slots,
    selected,
    onSelect,
    onRemove,
    canFill,
}: PaletteProps) => {
    const buttons = useRef<(HTMLButtonElement | null)[]>([]);
    /** Where the arrow keys have got to; null means "on the selected slot". */
    const [focusAt, setFocusAt] = useState<number | null>(null);
    const refocus = useRef(false);
    const tabStop = focusAt ?? selected;

    useEffect(() => {
        if (!refocus.current) return;
        refocus.current = false;
        buttons.current[selected]?.focus();
    }, [selected, slots]);

    // On a phone the palette is a row that scrolls sideways. The chip in
    // hand is always scrolled into sight, by hand rather than with
    // scrollIntoView, which would also scroll the desk around it.
    useEffect(() => {
        const chip = buttons.current[selected];
        const row = chip?.closest<HTMLElement>(".palette-row");
        if (!chip || !row || row.scrollWidth <= row.clientWidth) return;
        const at = chip.getBoundingClientRect();
        const view = row.getBoundingClientRect();
        const margin = 20;
        if (at.left < view.left + margin) {
            row.scrollLeft -= view.left + margin - at.left;
        } else if (at.right > view.right - margin) {
            row.scrollLeft += at.right - (view.right - margin);
        }
    }, [selected]);

    const move = (to: number) => {
        const at = (to + slots.length) % slots.length;
        setFocusAt(at);
        buttons.current[at]?.focus();
    };

    const remove = (index: number) => {
        refocus.current = true;
        setFocusAt(null);
        onRemove(index);
    };

    const onKeyDown = (
        event: KeyboardEvent<HTMLButtonElement>,
        index: number,
    ) => {
        switch (event.key) {
            case "ArrowRight":
            case "ArrowDown":
                move(index + 1);
                break;
            case "ArrowLeft":
            case "ArrowUp":
                move(index - 1);
                break;
            case "Home":
                move(0);
                break;
            case "End":
                move(slots.length - 1);
                break;
            case "Delete":
            case "Backspace":
                if (slots[index]) remove(index);
                break;
            default:
                return;
        }
        event.preventDefault();
    };

    return (
        <div className="palette" role="group" aria-label="Palette">
            {slots.map((crayon, index) => {
                const chosen = index === selected;
                const spare = crayon === null && !canFill;
                return (
                    <div className="palette-slot" key={index}>
                        <button
                            type="button"
                            ref={(node) => {
                                buttons.current[index] = node;
                            }}
                            className="palette-chip"
                            data-empty={crayon === null}
                            data-spare={spare}
                            aria-disabled={spare || undefined}
                            aria-pressed={chosen}
                            aria-label={
                                crayon
                                    ? `Slot ${index + 1}: ${crayon.name}`
                                    : spare
                                      ? `Empty slot ${index + 1}, every crayon in the box is in the palette`
                                      : `Empty slot ${index + 1}`
                            }
                            title={crayon ? crayon.name : "Empty slot"}
                            tabIndex={index === tabStop ? 0 : -1}
                            style={
                                crayon
                                    ? ({ "--wax": crayon.hex } as CSSProperties)
                                    : undefined
                            }
                            onClick={() => {
                                if (spare) return;
                                setFocusAt(null);
                                onSelect(index);
                            }}
                            onKeyDown={(event) => onKeyDown(event, index)}
                        >
                            {crayon === null && !spare && (
                                <span aria-hidden="true">+</span>
                            )}
                        </button>
                        {chosen && crayon && (
                            <button
                                type="button"
                                className="palette-remove"
                                aria-label={`Remove ${crayon.name} from palette`}
                                title="Remove from palette"
                                onClick={() => remove(index)}
                            >
                                <svg
                                    viewBox="0 0 12 12"
                                    aria-hidden="true"
                                    focusable="false"
                                >
                                    <path d="M3 3 L9 9 M9 3 L3 9" />
                                </svg>
                            </button>
                        )}
                    </div>
                );
            })}
        </div>
    );
};
