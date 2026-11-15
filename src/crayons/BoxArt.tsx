import { useId } from "react";
import type { CSSProperties } from "react";
import { intoRows, scallopEdge } from "./layout";

type BoxArtProps = {
    /** Every crayon in the box, in order. All of them are drawn. */
    colors: string[];
    /** The box in use: it stands open with its crayons up. */
    open: boolean;
};

/* Drawing units, in the same proportions as the open box: a crayon 6 wide in
   a 6.5-wide slot and 40 tall, rows stepping 18% of that, and a front panel
   covering all but the top third. */
const WIDTH = 6;
const STEP = 6.5;
const HEIGHT = 40;
const TIP = 8.5;
const ROW_STEP = 7.2;
const MARGIN = 3.5;
const SKIRT = 7;

/**
 * A box of crayons with all its colors in it, packed in the rows the real box
 * uses — so a 64 is four rows deep and a 12 is a single flat row, and the
 * boxes differ in shape the way they do on a shelf. Decorative; the label
 * beside it carries the name.
 */
export const BoxArt = ({ colors, open }: BoxArtProps) => {
    const uid = useId().replace(/:/g, "");
    const card = `card-${uid}`;

    const rows = intoRows(colors);
    const columns = Math.max(...rows.map((row) => row.length), 1);
    const depth = rows.length;

    const width = columns * STEP + MARGIN * 2;
    const frontTop = 4 + (depth - 1) * ROW_STEP + HEIGHT * 0.36;
    const height = 4 + (depth - 1) * ROW_STEP + HEIGHT + SKIRT;
    const cut = scallopEdge(MARGIN, frontTop, columns, STEP, 1.8);

    const front = `${cut} L${width - MARGIN},${height - 6} q0,2.5 -2.5,2.5 L${MARGIN + 2.5},${height - 3.5} q-2.5,0 -2.5,-2.5 Z`;

    return (
        <svg
            className="box-art"
            viewBox={`0 0 ${width} ${height}`}
            style={{ "--art-w": width } as CSSProperties}
            aria-hidden="true"
            focusable="false"
        >
            <defs>
                <linearGradient id={card} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="var(--box-card)" />
                    <stop offset="1" stopColor="var(--box-card-dark)" />
                </linearGradient>
            </defs>

            <ellipse
                cx={width / 2}
                cy={height - 2}
                rx={width / 2 - 2}
                ry="2"
                fill="rgba(24, 50, 70, 0.2)"
            />

            <g transform={open ? "translate(0, -3)" : undefined}>
                {rows.map((row, index) => (
                    <g key={`row-${index}`}>
                        {row.map((hex, column) => {
                            // Short rows sit centered, as they do in the tray.
                            const inset = ((columns - row.length) * STEP) / 2;
                            const x = MARGIN + inset + column * STEP + 0.5;
                            const y = 4 + index * ROW_STEP;
                            return (
                                <g
                                    key={`${hex}-${column}`}
                                    transform={`translate(${x}, ${y})`}
                                >
                                    <path
                                        d={`M${WIDTH / 2},0 L${WIDTH},${TIP} L0,${TIP} Z`}
                                        fill={hex}
                                        stroke="var(--color-border)"
                                        strokeWidth="0.6"
                                        strokeLinejoin="round"
                                    />
                                    <rect
                                        x="0"
                                        y={TIP - 0.4}
                                        width={WIDTH}
                                        height={HEIGHT - TIP}
                                        fill={hex}
                                        stroke="var(--color-border)"
                                        strokeWidth="0.6"
                                    />
                                </g>
                            );
                        })}
                    </g>
                ))}
            </g>

            <path
                d={front}
                fill={`url(#${card})`}
                stroke="var(--color-border)"
                strokeWidth="1.1"
                strokeLinejoin="round"
            />
            {/* the shadow the front edge casts back into the box */}
            <path
                d={`${cut} L${width - MARGIN},${frontTop + 4} L${MARGIN},${frontTop + 4} Z`}
                fill="rgba(24, 50, 70, 0.14)"
            />
            {/* the blank label strip every box carries */}
            <rect
                x={MARGIN + 4}
                y={height - 11}
                width={width - MARGIN * 2 - 8}
                height="3.5"
                rx="1.75"
                fill="var(--paper)"
                fillOpacity="0.8"
            />
        </svg>
    );
};
