import { useEffect, useMemo, useRef, useState } from "react";
import { paintDrawing } from "./crayonRender";
import { loadSaved, type SavedDrawing } from "./drawingStore";

type GalleryProps = {
    open: boolean;
    /** Newest first. */
    drawings: SavedDrawing[];
    /** The saved drawing on the paper right now, if any. */
    currentId: string | null;
    /** The paper has marks that aren't saved, which opening another would lose. */
    unsaved: boolean;
    onClose: () => void;
    onOpenOnPaper: (drawing: SavedDrawing) => void;
    /** False if it couldn't be deleted. */
    onDelete: (drawing: SavedDrawing) => boolean;
};

const when = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
});

/** "12 marks in Red, Blue and Green", or "…Red, Blue, Green and 4 more". */
const summary = (drawing: SavedDrawing) => {
    const shown = drawing.colors.slice(0, 3);
    const more = drawing.colors.length - shown.length;
    const names =
        more > 0
            ? `${shown.join(", ")} and ${more} more`
            : shown.length > 1
              ? `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`
              : (shown[0] ?? "");
    return `${drawing.marks} ${drawing.marks === 1 ? "mark" : "marks"} in ${names}`;
};

/** The tag on the drawing that's on the paper now. The comma is for the ear. */
const OnThePaper = () => (
    <span className="gallery-tag">
        <span className="sr-only">, </span>On the paper
    </span>
);

type DetailProps = {
    drawing: SavedDrawing;
    current: boolean;
    unsaved: boolean;
    onBack: () => void;
    onOpenOnPaper: () => void;
    onDelete: () => boolean;
};

/** One drawing, big, repainted from its strokes so it's sharp at any size. */
const Detail = ({
    drawing,
    current,
    unsaved,
    onBack,
    onOpenOnPaper,
    onDelete,
}: DetailProps) => {
    const headingRef = useRef<HTMLHeadingElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const openRef = useRef<HTMLButtonElement>(null);
    const deleteRef = useRef<HTMLButtonElement>(null);
    const [confirming, setConfirming] = useState<"open" | "delete" | null>(
        null,
    );
    const [deleteFailed, setDeleteFailed] = useState(false);
    const strokes = useMemo(() => loadSaved(drawing.id), [drawing.id]);

    useEffect(() => {
        headingRef.current?.focus();
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !strokes) return;
        const painted = paintDrawing(
            strokes,
            drawing,
            window.devicePixelRatio || 1,
        );
        canvas.width = painted.width;
        canvas.height = painted.height;
        canvas.getContext("2d")?.drawImage(painted, 0, 0);
    }, [strokes, drawing]);

    // The question's buttons go away with it, so focus goes back by hand.
    const cancel = () => {
        const back = confirming === "open" ? openRef : deleteRef;
        setConfirming(null);
        back.current?.focus();
    };

    return (
        <div className="gallery-detail">
            <button type="button" className="gallery-back" onClick={onBack}>
                ← All saved
            </button>
            <h3 ref={headingRef} tabIndex={-1}>
                {when.format(drawing.savedAt)}
                {current ? <OnThePaper /> : null}
            </h3>

            {strokes ? (
                // The heading and the line below say what this is.
                <canvas
                    ref={canvasRef}
                    className="gallery-big"
                    aria-hidden="true"
                />
            ) : (
                <p className="gallery-note">
                    This drawing couldn&rsquo;t be read back.
                </p>
            )}
            <p className="gallery-meta">{summary(drawing)}</p>

            <div className="gallery-actions">
                <button
                    ref={openRef}
                    type="button"
                    disabled={!strokes}
                    onClick={() =>
                        unsaved ? setConfirming("open") : onOpenOnPaper()
                    }
                >
                    Open on paper
                </button>
                <button
                    ref={deleteRef}
                    type="button"
                    className="danger"
                    onClick={() => setConfirming("delete")}
                >
                    Delete
                </button>
            </div>

            {confirming ? (
                <div
                    className="gallery-confirm"
                    role="group"
                    aria-labelledby="gallery-question"
                >
                    <p id="gallery-question">
                        {confirming === "delete"
                            ? "Delete this drawing for good?"
                            : "The paper has changes you haven’t saved. Open this drawing in their place?"}
                    </p>
                    <button
                        type="button"
                        className="danger"
                        onClick={() => {
                            if (confirming === "open") onOpenOnPaper();
                            else if (!onDelete()) {
                                setDeleteFailed(true);
                                cancel();
                            }
                        }}
                    >
                        {confirming === "delete"
                            ? "Delete for good"
                            : "Replace the paper"}
                    </button>
                    <button type="button" autoFocus onClick={cancel}>
                        {confirming === "delete" ? "Keep it" : "Cancel"}
                    </button>
                </div>
            ) : null}
            {deleteFailed ? (
                <p className="gallery-note" role="alert">
                    Couldn&rsquo;t delete it &mdash; this browser&rsquo;s
                    storage refused.
                </p>
            ) : null}
        </div>
    );
};

/** The saved drawings: a grid of thumbnails, and one at a time, big. */
export const Gallery = ({
    open,
    drawings,
    currentId,
    unsaved,
    onClose,
    onOpenOnPaper,
    onDelete,
}: GalleryProps) => {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const titleRef = useRef<HTMLHeadingElement>(null);
    const [viewingId, setViewingId] = useState<string | null>(null);
    /** The tile to land back on when leaving the big view. */
    const returnToRef = useRef<string | null>(null);

    // A native modal: it keeps focus inside, closes on Escape, and hands
    // focus back to whatever opened it.
    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;
        if (open && !dialog.open) dialog.showModal();
        if (!open && dialog.open) dialog.close();
    }, [open]);

    useEffect(() => {
        if (viewingId !== null || !open || !returnToRef.current) return;
        const tile = dialogRef.current?.querySelector<HTMLElement>(
            `[data-id="${returnToRef.current}"]`,
        );
        returnToRef.current = null;
        // Deleted, it has no tile to go back to.
        (tile ?? titleRef.current)?.focus();
    }, [viewingId, open]);

    const viewing = drawings.find((d) => d.id === viewingId);

    const leave = () => {
        setViewingId(null);
        returnToRef.current = null;
        onClose();
    };

    return (
        <dialog
            ref={dialogRef}
            className="gallery"
            aria-labelledby="gallery-title"
            onClose={leave}
            // A click on the dimmed page around it, not inside it.
            onClick={(event) => {
                if (event.target === event.currentTarget)
                    dialogRef.current?.close();
            }}
        >
            <div className="gallery-inner">
                <header className="gallery-head">
                    <h2 id="gallery-title" ref={titleRef} tabIndex={-1}>
                        Saved drawings
                    </h2>
                    <button
                        type="button"
                        onClick={() => dialogRef.current?.close()}
                    >
                        Close
                    </button>
                </header>

                {viewing ? (
                    <Detail
                        key={viewing.id}
                        drawing={viewing}
                        current={viewing.id === currentId}
                        unsaved={unsaved}
                        onBack={() => setViewingId(null)}
                        onOpenOnPaper={() => onOpenOnPaper(viewing)}
                        onDelete={() => {
                            if (!onDelete(viewing)) return false;
                            setViewingId(null);
                            return true;
                        }}
                    />
                ) : drawings.length === 0 ? (
                    <p className="gallery-note">
                        Nothing saved yet. Draw something and press Save &mdash;
                        it&rsquo;ll land here.
                    </p>
                ) : (
                    <ul className="gallery-grid">
                        {drawings.map((drawing) => (
                            <li key={drawing.id}>
                                <button
                                    type="button"
                                    className="gallery-tile"
                                    data-id={drawing.id}
                                    onClick={() => {
                                        returnToRef.current = drawing.id;
                                        setViewingId(drawing.id);
                                    }}
                                >
                                    <span className="gallery-thumb">
                                        {drawing.thumb ? (
                                            <img src={drawing.thumb} alt="" />
                                        ) : null}
                                    </span>
                                    <span className="gallery-date">
                                        {when.format(drawing.savedAt)}
                                    </span>
                                    {drawing.id === currentId ? (
                                        <OnThePaper />
                                    ) : null}
                                    <span className="sr-only">
                                        , {summary(drawing)}
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </dialog>
    );
};
