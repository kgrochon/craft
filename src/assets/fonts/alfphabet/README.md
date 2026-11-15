# Alfphabet

Based on the Belgian road signage lettering called "Alphabet" (fr) /
"Alfabet" (nl), introduced in 1945 and redrawn by Hammerfonts and OSP.

- Copyright 1992–2014 Hammerfonts and OSP (Karl Bassil, Nadim Zablit,
  Pierre Huyghebaert, Ludivine Loiseau)
- Licensed under the SIL Open Font License 1.1 — see `LICENSE.txt`
- History and contributor list: `FONTLOG.txt`
- Upstream: http://osp.kitchen/foundry/alfphabet

## Cuts

All three cuts ship as `.woff2` / `.woff` / `.otf`. Upstream names them by
number; the CSS families in `src/index.css` spell out what each one is.

| File           | CSS family             | Width of "KAFFINATED" |
| -------------- | ---------------------- | --------------------- |
| Alfphabet-I    | `Alfphabet`            | 5.662em               |
| Alfphabet-III  | `Alfphabet Condensed`  | 3.710em               |
| Alfphabet-IV   | `Alfphabet Extended`   | 7.548em               |

Cut I is uppercase Type I with Type V lowercase; cut III merges condensed
caps with semi-condensed lowercase, so its case contrast is uneven and its
diacritics are rough. Cut IV (2007) is the extended display cut.

The widths above are measured advances at 1000 upem, and are what
`--wordmark-advance` in `src/pages/home.css` is set from — the home wordmark
divides the viewport width by that number to fill the screen. Swap cuts there
and update the number to match.

Only the files in this folder are used by the app. The full upstream package,
including UFO/SFD sources and specimens, is in
`~/Downloads/foundry.alfphabet-master.tar.gz`.
