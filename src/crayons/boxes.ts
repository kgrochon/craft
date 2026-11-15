import crayonData from "./crayons.json";

export type Crayon = {
    /** Stable across renders; names repeat between boxes, so the box is in it. */
    id: string;
    name: string;
    hex: string;
    rgb: string;
    year: number;
    notes: string;
};

export type CrayonBox = {
    id: string;
    /** Short label for the picker. */
    label: string;
    /** The `section` string from the data, shown as the box's subtitle. */
    section: string;
    crayons: Crayon[];
};

/**
 * Short labels for the picker, and the order boxes appear in. Every section in
 * crayons.json is one box; a section without an entry here still shows up,
 * labelled with its raw section string, at the end.
 */
const BOX_LABELS: [section: string, label: string][] = [
    ["1903: the original Crayola colors", "1903 Originals"],
    ["1926: 10 colors", "1926 · No. 10"],
    ["Munsell Crayola, 1926–1944", "Munsell Crayola"],
    ["1930: 12 colors", "1930 · No. 12"],
    ["Adjustments in 1935 and 1949", "1935 & 1949 Tweaks"],
    ["Changes through 1949", "1949 Box"],
    ["1958: 18 colors", "1958 · No. 18"],
    ["Crayola No. 64", "Crayola No. 64"],
    ["Changes 1958–1990", "Fluorescents"],
    ["1990 – present", "1990 – Present"],
    [
        "Collector's Colors, 1991 — the tin's 64, reconstructed",
        "1991 Collector's Tin",
    ],
    [
        "Collector's Colors, 1991 — the eight retired colors",
        "1991 Retired Eight",
    ],
    ["Metallic, 2001 and 2019", "Metallic"],
    ["Crayons with Glitter, 2019", "Glitter"],
    ["Colors of the World, 2020", "Colors of the World"],
    ["Crayola No. 120", "Crayola No. 120"],
];

/**
 * The boxes actually on the shelf. Every box above still exists and keeps its
 * data; these are the ones the page offers to draw with. Add a section string
 * here and it appears in the picker.
 */
const ON_THE_SHELF = [
    "Collector's Colors, 1991 — the tin's 64, reconstructed",
    "Collector's Colors, 1991 — the eight retired colors",
    "Crayola No. 120",
];

/** `1903: the original Crayola colors` → `1903-the-original-crayola-colors` */
const slugify = (section: string) =>
    section
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

const toBoxes = (): CrayonBox[] => {
    const bySection = new Map<string, Crayon[]>();

    for (const entry of crayonData) {
        const crayons = bySection.get(entry.section) ?? [];
        crayons.push({
            id: `${slugify(entry.section)}--${slugify(entry.name)}--${crayons.length}`,
            name: entry.name,
            hex: entry.crayon_hex,
            rgb: entry.crayon_color,
            year: entry.year,
            notes: entry.crayon_notes,
        });
        bySection.set(entry.section, crayons);
    }

    const labelled = BOX_LABELS.filter(([section]) => bySection.has(section));
    const unlabelled = [...bySection.keys()]
        .filter((section) => !BOX_LABELS.some(([known]) => known === section))
        .map((section): [string, string] => [section, section]);

    return [...labelled, ...unlabelled].map(([section, label]) => ({
        id: slugify(section),
        label,
        section,
        crayons: bySection.get(section) ?? [],
    }));
};

/** Every box in the data, whether or not it is on the shelf. */
export const BOXES = toBoxes();

/** The boxes the page shows, in the order the data has them. */
export const SHELF = BOXES.filter((box) => ON_THE_SHELF.includes(box.section));

/** The biggest box on the shelf, so the page opens on plenty of color. */
export const DEFAULT_BOX_ID =
    SHELF.find((box) => box.section === "Crayola No. 120")?.id ?? SHELF[0].id;

export const boxById = (id: string): CrayonBox =>
    SHELF.find((box) => box.id === id) ?? SHELF[0];

/**
 * The year a color was retired, read off its note, or null if it is still in
 * the box. The dataset records this in prose rather than a field, so this is
 * the one place that prose is interpreted.
 */
export const retiredYear = (crayon: Crayon): string | null => {
    if (!/retired/i.test(crayon.notes)) return null;
    return crayon.notes.match(/retired[^0-9]{0,12}(\d{4})/i)?.[1] ?? "";
};
