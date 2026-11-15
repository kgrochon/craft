import type { CrayonBox } from "./boxes";
import { BoxArt } from "./BoxArt";
import collectorsTin from "../assets/collectors-tin.svg";

/**
 * Boxes we have real art for. Anything not listed here is drawn from its own
 * colours by BoxArt, which is the stand-in until a picture exists for it.
 */
const PORTRAITS: Record<string, string> = {
    "collector-s-colors-1991-the-eight-retired-colors": collectorsTin,
};

type ShelfProps = {
    boxes: CrayonBox[];
    openId: string;
    onOpen: (box: CrayonBox) => void;
};

/**
 * The rail down the left of the desk: the boxes stacked in their bins. (The cat
 * that used to sit under them is parked in Cat.tsx.)
 *
 * Each box is drawn with its own colours in its own packing, so the shelf
 * reads as three different boxes rather than three labels.
 */
export const Shelf = ({ boxes, openId, onOpen }: ShelfProps) => (
    <div className="shelf">
        <fieldset className="shelf-boxes">
            <legend className="sr-only">Boxes on the shelf</legend>
            {boxes.map((box) => (
                <label
                    key={box.id}
                    className={
                        box.id === openId ? "shelf-box open" : "shelf-box"
                    }
                    title={`${box.label} · ${box.crayons.length} crayons`}
                >
                    <input
                        type="radio"
                        name="crayon-box"
                        className="sr-only"
                        value={box.id}
                        checked={box.id === openId}
                        onChange={() => onOpen(box)}
                    />
                    {PORTRAITS[box.id] ? (
                        <img
                            className="shelf-portrait"
                            src={PORTRAITS[box.id]}
                            alt=""
                        />
                    ) : (
                        <BoxArt
                            colors={box.crayons.map((crayon) => crayon.hex)}
                            open={box.id === openId}
                        />
                    )}
                    <span className="shelf-text" aria-hidden="true">
                        <span className="shelf-name">{box.label}</span>
                        <span className="shelf-count">
                            {box.crayons.length} crayons
                        </span>
                    </span>
                    <span className="sr-only">
                        {`${box.label}, ${box.crayons.length} crayons`}
                    </span>
                </label>
            ))}
        </fieldset>
    </div>
);
