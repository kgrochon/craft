/**
 * The cat, parked. It is not on the desk for now; to bring it back, render
 * <Cat> at the foot of the shelf rail in Shelf.tsx and give Crayons.tsx the
 * walk below, which stamps three paw prints in the crayon in hand:
 *
 *     const catWalk = () => {
 *         const width = lineWidth(nub.sharpness);
 *         const y = 0.3 + Math.random() * 0.3;
 *         for (let paw = 0; paw < 3; paw += 1) {
 *             paper.begin(
 *                 {
 *                     x: clamp01(0.2 + Math.random() * 0.6),
 *                     y: clamp01(y + (paw % 2 ? 0.05 : -0.05)),
 *                 },
 *                 width,
 *             );
 *             paper.finish();
 *         }
 *         announce(`The cat left paw prints in ${crayon.name}.`);
 *     };
 *
 * `mood` was "asleep" for people who asked for reduced motion, "cat"
 * otherwise (a matchMedia check on prefers-reduced-motion: reduce). The
 * styles (.cat, .cat-face and friends) are still in crayons.css.
 */
type CatProps = {
    onCat: () => void;
    mood: string;
};

export const Cat = ({ onCat, mood }: CatProps) => (
    <button type="button" className="cat" onClick={onCat}>
        <span className="cat-face" aria-hidden="true">
            <span className="cat-ear left" />
            <span className="cat-ear right" />
            <span className="cat-eye left" />
            <span className="cat-eye right" />
            <span className="cat-nose" />
        </span>
        <span className="cat-mood" aria-hidden="true">
            {mood}
        </span>
        <span className="sr-only">
            Let the cat walk across the paper, leaving paw prints in the colour
            you are holding
        </span>
    </button>
);
