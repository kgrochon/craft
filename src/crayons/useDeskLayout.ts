import { useSyncExternalStore } from "react";

/**
 * How the desk is laid out for the screen it is on.
 *
 * - `desk`: the shelf down the left, the paper, the tray along the bottom.
 * - `drawer`: narrower screens held upright. The tray is a drawer under the
 *   paper, and the shelf moves inside the box when it opens.
 * - `rail`: a phone on its side. The palette stands in a rail down the right
 *   and the tools down the left, so the paper keeps the full height.
 *
 * `compact` is set where the tools don't fit on one line, or the crayon in
 * hand has no room for all its details: some tools go under More.
 */
export type DeskLayout = "desk" | "drawer" | "rail";

/** A phone on its side: too short for a drawer under the paper. */
const SIDEWAYS = "(orientation: landscape) and (max-height: 500px)";
/** Too narrow for the shelf, the paper and the tray side by side. */
const NARROW = "(max-width: 1099px)";
/** Too narrow for every tool on one line. */
const COMPACT = "(max-width: 739px)";

const QUERIES = [SIDEWAYS, NARROW, COMPACT];

const canMatch = () =>
    typeof window !== "undefined" && typeof window.matchMedia === "function";

/** One string, so React can tell the snapshot hasn't changed. */
const snapshot = () => {
    if (!canMatch()) return "desk:0";
    const [sideways, narrow, compact] = QUERIES.map(
        (query) => window.matchMedia(query).matches,
    );
    const layout: DeskLayout = sideways ? "rail" : narrow ? "drawer" : "desk";
    return `${layout}:${layout === "rail" || compact ? 1 : 0}`;
};

const subscribe = (changed: () => void) => {
    if (!canMatch()) return () => {};
    const lists = QUERIES.map((query) => window.matchMedia(query));
    lists.forEach((list) => list.addEventListener("change", changed));
    return () =>
        lists.forEach((list) => list.removeEventListener("change", changed));
};

export const useDeskLayout = () => {
    const [layout, compact] = useSyncExternalStore(
        subscribe,
        snapshot,
        () => "desk:0",
    ).split(":");
    return { layout: layout as DeskLayout, compact: compact === "1" };
};
