import { useId } from "react";
import { scallopEdge } from "./layout";

type BoxFrontProps = {
    /** Crayons across the widest row; the panel scallops once per crayon. */
    columns: number;
    /** Printed along the front of the box. */
    label: string;
};

/**
 * The front of an open box: the cardboard panel the crayons stand behind, cut
 * with one dip per crayon so you can pinch a single one out of a full box.
 *
 * It stretches to whatever width the box is, so the cut edge is drawn with a
 * non-scaling stroke to keep an even weight.
 */
export const BoxFront = ({ columns, label }: BoxFrontProps) => {
    const uid = useId().replace(/:/g, "");
    const card = `front-${uid}`;
    const cut = scallopEdge(0, 7, columns, 18, 7);
    const width = columns * 18;

    return (
        <>
            <svg
                className="box-front"
                viewBox={`0 0 ${width} 60`}
                preserveAspectRatio="none"
                aria-hidden="true"
                focusable="false"
            >
                <defs>
                    <linearGradient id={card} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stopColor="var(--box-card)" />
                        <stop offset="1" stopColor="var(--box-card-dark)" />
                    </linearGradient>
                </defs>
                <path
                    d={`${cut} L${width},60 L0,60 Z`}
                    fill={`url(#${card})`}
                />
                {/* the shadow the front edge casts back into the box */}
                <path
                    d={`${cut} L${width},15 L0,15 Z`}
                    fill="rgba(24, 50, 70, 0.13)"
                />
                {/* the cut edge itself, kept an even weight while the panel
                    stretches to the box's width */}
                <path
                    d={cut}
                    fill="none"
                    stroke="var(--color-border)"
                    strokeWidth="2"
                    vectorEffect="non-scaling-stroke"
                />
            </svg>

            <p className="box-front-label" aria-hidden="true">
                {label}
            </p>
        </>
    );
};
