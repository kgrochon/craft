import type { SavedDrawing } from "./drawingStore";

type SavedStackProps = {
    /** Newest first; the top two are the papers on the pile. */
    drawings: SavedDrawing[];
    onOpen: () => void;
};

/** One paper on the pile: the drawing's thumbnail, or blank paper. */
const Sheet = ({ drawing, at }: { drawing?: SavedDrawing; at: string }) => (
    <span className={`saved-paper ${at}`}>
        {drawing?.thumb ? <img src={drawing.thumb} alt="" /> : null}
    </span>
);

/** The pile of saved drawings in the corner. It opens the gallery. */
export const SavedStack = ({ drawings, onOpen }: SavedStackProps) => (
    <button
        type="button"
        className="saved-stack"
        onClick={onOpen}
        aria-haspopup="dialog"
    >
        <span className="saved-papers" aria-hidden="true">
            <Sheet drawing={drawings[1]} at="under" />
            <Sheet drawing={drawings[0]} at="top" />
        </span>
        <span className="saved-label">View Saved</span>
        <span className="sr-only">
            {drawings.length === 0
                ? ", nothing saved yet"
                : `, ${drawings.length} ${drawings.length === 1 ? "drawing" : "drawings"}`}
        </span>
    </button>
);
