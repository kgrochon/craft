type CrayonStickProps = {
    /** Hex color of the crayon's wax. */
    color: string;
};

/**
 * A crayon drawn to something near life's proportions — 16 by 104, about 1:6.5.
 * A real crayon is 5/16 by 3 1/2 inches, nearer 1:11, but that is too thin to
 * pick out with a mouse; this is as slim as it goes while a box of sixteen
 * across still looks like a box rather than a letterbox.
 *
 * The chunky 1:3 crayon in components/icons is still what the home page wants,
 * so the two stay separate.
 */
export const CrayonStick = ({ color }: CrayonStickProps) => (
    <svg
        className="crayon-stick"
        viewBox="0 0 16 104"
        aria-hidden="true"
        focusable="false"
    >
        {/* wax tip */}
        <path
            d="M8 1.5 L14.2 23 H1.8 Z"
            fill={color}
            stroke="#183246"
            strokeWidth="1.3"
            strokeLinejoin="round"
        />
        {/* barrel */}
        <rect
            x="1.8"
            y="22"
            width="12.4"
            height="81"
            rx="1.4"
            fill={color}
            stroke="#183246"
            strokeWidth="1.3"
        />
        {/* paper wrapper, a touch wider than the barrel */}
        <rect
            x="0.9"
            y="33"
            width="14.2"
            height="54"
            fill={color}
            stroke="#183246"
            strokeWidth="1.3"
        />
        <rect
            x="0.9"
            y="33"
            width="14.2"
            height="54"
            fill="#ffffff"
            fillOpacity="0.34"
        />
        {/* the bands printed top and bottom of the wrapper */}
        <path
            d="M0.9 38.5 H15.1 M0.9 81.5 H15.1"
            stroke="#183246"
            strokeWidth="1.1"
        />
    </svg>
);
