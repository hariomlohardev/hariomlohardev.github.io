# DESIGN.md — Hariom Lohar · Lab Notebook №01

> The single source of truth for the visual & interaction design of
> `hariomlohardev.github.io` (index.html, blog.html, and any future page).
> **Any agent, model, or developer building for this site MUST follow this document exactly.**
> When in doubt: *minimal, editorial, print-inspired. Paper + ink + vermilion. Never loud, never glossy.*

---

## 0. Philosophy (read first)

The site is a **public lab notebook** — it should feel like a carefully printed
editorial journal / field notebook, not a SaaS landing page.

Core principles, in order of priority:

1. **Minimal & editorial.** Generous whitespace, hairline rules, sharp corners.
   Restraint is the aesthetic. Remove before you add.
2. **Print materials, not decoration.** Every color maps to a physical thing:
   warm *paper*, near-black *ink*, a *vermilion stamp*, a *green verified ink*.
3. **Typography does the design.** A characterful serif (Fraunces) for display,
   a clean sans (Archivo) for body, a typewriter mono (Space Mono) for labels.
   Contrast in type *size/weight/italics* replaces most ornament.
4. **One accent, used sparingly.** Vermilion `#B93A13` is the only loud color.
   It marks interactive/important things — never large surfaces.
5. **Honest & legible.** AA contrast everywhere, real content, no fake gloss,
   no gradient text, no glassmorphism, no emoji-as-UI.
6. **Motion is a whisper.** Small, eased, purposeful reveals. Always honor
   `prefers-reduced-motion`.

If a proposed design choice conflicts with any of the above, **reject it.**

---

## 1. Brand & voice

- **Name:** Hariom Lohar — handle `hariomlohardev`.
- **Site concept:** “Lab Notebook №01”.
- **Tagline spirit:** “One log at a time — rebuilding AGI from first principles, in public.”
- **Tone of copy:** first-person, humble-but-confident, concrete, short.
  Prefer “Learn with me as I rebuild AI & AGI from first principles.” over hype.
- **Vocabulary:** notebook, log, proof, commit, derive, first principles, ship, field notes.
- **Never:** buzzword soup, exclamation-heavy marketing, lorem ipsum.

---

## 2. Color tokens (exact)

Use ONLY these. Do not invent new hues.

```css
:root{
  /* surfaces — warm paper, never pure white */
  --paper:   #F6F4EE;   /* page background            */
  --paper-2: #EFECE2;   /* recessed / secondary paper  */
  --sheet:   #FBFAF6;   /* card surface (lighter)      */

  /* inks — warm near-black, never pure #000 */
  --ink:    #181611;    /* headings, strong borders    */
  --ink-2:  #37342B;    /* secondary headings          */
  --body:   #3B382E;    /* body copy                   */
  --muted:  #5F594A;    /* meta text  (AA on paper)    */
  --muted-2:#6E6858;    /* faint meta (AA on paper)    */

  /* lines */
  --line:   #DAD5C6;    /* hairline divider            */
  --line-2: #C4BEAC;    /* stronger hairline           */

  /* the ONE accent — vermilion stamp */
  --accent:      #B93A13;             /* 5.2:1 on paper — AA for text */
  --accent-soft: rgba(185,58,19,.12); /* tints / highlights           */

  /* semantic */
  --green:      #1E7A4E;              /* verified / available         */
  --green-soft: rgba(30,122,78,.10);
}
```

### Contrast guarantees (do not regress)
| Pair | Ratio | Use |
|---|---|---|
| `--ink` on `--paper` | ~15:1 | headings |
| `--body` on `--paper` | ~11:1 | body copy |
| `--muted` on `--paper` | 6.3:1 | meta/labels |
| `--muted-2` on `--paper` | ~4.9:1 | faint meta |
| `--accent` on `--paper` | 5.2:1 | links, small accent text |
| `--paper` on `--accent` | 5.2:1 | solid buttons |

**Rules:**
- Backgrounds are always warm paper tones. **Never `#fff` / `#000`.**
- Large surfaces stay paper/sheet. Vermilion only for: links, small text,
  borders/lines, bullets, solid buttons, the monogram crossbar/dot, progress.
- Green only for “verified / available / success”. Never decorative.

---

## 3. Typography

Self-hosted from `assets/fonts/` (@fontsource woff2 files, latin subsets) — one
same-origin stylesheet instead of nine render-blocking jsdelivr round trips, with
the two faces the first screen needs preloaded:

```html
<link rel="preload" href="/assets/fonts/archivo-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/assets/fonts/fraunces-latin-600-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/fonts.css?v=1">
```

`assets/fonts.css` declares the nine faces (Fraunces 400/600 roman + italic,
Archivo 400/500/600, Space Mono 400 roman + italic), all `font-display:swap`.
Refresh a file from `https://cdn.jsdelivr.net/npm/@fontsource/<family>/files/`
and bump the `?v=` on every page — `/assets/*` is served immutable for a year.

```css
--serif:'Fraunces',Georgia,serif;      /* display + italics */
--sans:'Archivo',system-ui,sans-serif; /* body */
--mono:'Space Mono',ui-monospace,monospace; /* labels/meta/buttons */
```

### Roles & scale
| Element | Family | Weight | Size | Tracking / leading | Notes |
|---|---|---|---|---|---|
| Base body | Archivo | 400 | 16px | lh 1.6 | |
| Body copy | Archivo | 400 | 14.5–15.5px | lh 1.65–1.75 | max-width ~62ch |
| Hero `h1` | Fraunces | 600 | `clamp(3rem,9.5vw,7.6rem)` | ls -.035em, lh .92 | mixed roman + italic lines |
| Section `h2` | Fraunces | 600 | `clamp(2rem,4.6vw,3.4rem)` | ls -.03em, lh .95 | italic `<em>` accent word in `--muted` |
| Card `h3` | Fraunces | 600 | ~1.45rem | ls -.02em, lh 1.1 | |
| Lead / pull-quote | Fraunces | 400/600 | `clamp(1.3rem,2.3vw,1.75rem)` | lh 1.35–1.45 | italic `<em>` with soft-accent underline |
| Kicker / label | Space Mono | 400 | 10–11.5px | ls .16–.22em, UPPERCASE | `--muted` |
| Button / tag | Space Mono | 400 | 10.5–11.5px | ls .1–.15em, UPPERCASE | |

**Typographic signatures:**
- Headings pair a **roman word + italic word**: `Field <em>notes</em>`,
  `Proof <em>over claims</em>`. The `<em>` is Fraunces italic, muted color.
- Big numbers (stats, day counter) are Fraunces 600 with tight tracking;
  unit suffixes are **italic vermilion `<sup>`**.
- Mono is used for *all* chrome: kickers, tags, buttons, meta, timestamps.

---

## 4. Layout & spacing

```css
--max:1200px;                      /* content width */
--pad:clamp(18px,4.2vw,56px);      /* horizontal gutter */
```

- `.wrap{max-width:var(--max);margin:0 auto;padding-inline:var(--pad)}`
- Sections: vertical padding `clamp(44px,6vw,76px)`; separated by
  `border-top:1px solid var(--line)` between siblings.
- Hero gets a heavier `border-bottom:1px solid var(--ink)`.
- Grids are 2-column on desktop, collapse to 1 column ≤1020px.
- **Sharp corners.** `border-radius` is 0 by default; only 1–3px on tiny
  cells / `.kbd`. No rounded-2xl cards.

### Section header pattern (always)
```
[kicker]  NN — Title            (mono, muted, with a 28px ink dash before)
[h2]      Roman <em>italic</em>  (Fraunces)
[sec-tag] right-aligned mono chip (hairline border, sheet bg)
```
Numbering convention: `01 About · 02 Work · 03 Open Source · 04 Credentials ·
05 Mission · 05b Blog · 05c Newsletter · 06 Contact · 07 FAQ`.
Sub-sections use letter suffixes (`05b`), never renumber the locked ones.

---

## 5. Borders, shadows, surfaces

- **Hairline:** `1px solid var(--line)` — dividers, table rows, tags.
- **Ink border:** `1px solid var(--ink)` — cards, buttons, framed boxes.
- **Card:** `background:var(--sheet); border:1px solid var(--ink)`.
- **Shadow (rest):** none or `0 1px 0 rgba(24,22,17,.05)`.
- **Shadow (hover):** `0 10–16px 24–40px rgba(24,22,17,.08–.12)`.
- **Film grain:** fixed full-page SVG-noise overlay, `opacity:.05`,
  `mix-blend-mode:multiply`, `pointer-events:none` (see §9 snippet).

---

## 6. Signature motifs (the recognizable bits)

1. **HL monogram (logo + favicon).** Two stems form an H; the left stem +
   vermilion crossbar = H; the right stem + bottom bar = L; a vermilion dot
   top-right acts as a stamp/period.
   ```html
   <svg viewBox="0 0 44 44" fill="none">
     <path d="M7 6 V38"  stroke="#181611" stroke-width="5"/>
     <path d="M23 6 V38" stroke="#181611" stroke-width="5"/>
     <path d="M7 22 H23" stroke="#B93A13" stroke-width="5"/>
     <path d="M23 38 H38" stroke="#181611" stroke-width="5"/>
     <circle cx="37" cy="7" r="3.4" fill="#B93A13"/>
   </svg>
   ```
2. **Rotated vermilion diamond** as eyebrow/bullet:
   `width:9px;height:9px;background:var(--accent);transform:rotate(45deg)`.
3. **Left accent line on hover** — a 2–3px vermilion bar that scales in from
   the left edge of rows / stat cells (`transform:scaleY(0→1)`).
4. **Rotated stamp badges** — mono uppercase, 1.6px colored border, rotated
   ~7°, offset shadow (e.g. “Open to work”, “✓ Verified”).
5. **Underline highlight** on key italic words:
   `background:linear-gradient(transparent 62%, var(--accent-soft) 62%)`.
6. **Terminal prompt line** `~/hariom $ …` with a blinking caret (hero only).
7. **Top reading-progress bar** — fixed, 2px, vermilion.

---

## 7. Component library

### Buttons
```css
.btn{font-family:var(--mono);font-size:11.5px;letter-spacing:.15em;text-transform:uppercase;
  padding:14px 20px;border:1px solid var(--ink);color:var(--ink);min-height:46px;
  display:inline-flex;align-items:center;gap:10px;transition:.2s}
.btn:hover{background:var(--ink);color:var(--paper)}
.btn.solid{background:var(--ink);color:var(--paper)}
.btn.solid:hover{background:var(--accent);border-color:var(--accent)}
```
Arrows are text glyphs: `→ ↗ ↓ ↑`. No icon fonts.

### Cards (work / oss / latest / contact)
`sheet` bg + `ink` border; hover `translateY(-3px)` + soft shadow;
corner arrow chip `↗` that inverts to ink on hover.

### Stats ledger strip
4 columns; `border-top/bottom:1px solid var(--ink)`; hairline dividers;
Fraunces number + italic vermilion `<sup>`; mono label with diamond bullet;
hover draws left accent line + tints number vermilion. Collapses to 2×2 ≤860px.

### Tags / pills / status
Mono uppercase 10–11px; hairline border; `--paper`/`--sheet` bg.
Active/inverted = ink bg, paper text. Statuses: `in progress`(accent),
`shipped`/`open source`(green).

### Forms
- **Newsletter:** underline-only input (`border-bottom:1px solid var(--ink)`),
  focus → accent. Solid ink submit.
- **Contact:** bordered inputs on `--paper`, focus → accent border.
- Mobile: input `font-size:16px` (prevents iOS zoom).

### FAQ
`<details>/<summary>`; hidden marker; mono `›` chevron right that rotates 90°
and turns accent when open.

### Modal + lightbox (certificates)
Flat trigger button → centered modal (paper card, ink border, blurred dark
backdrop) listing certs; each has `View` (opens image lightbox) + `Verify ↗`.
Close via ✕, backdrop, or `Esc`.

### Header / nav
Sticky, `rgba(246,244,238,.94)` + `backdrop-filter:blur(10px)`; hairline bottom;
shadow on scroll. Desktop mono nav with underline-grow on hover/active.
Mobile: hamburger (2 bars → X) opening a full-width dropdown panel;
panel links are 48px rows with mono index numbers.

### Footer
Ink top border; 4-col grid (brand quote + 3 link columns); mono base bar with
`G` kbd hint, IST clock, and full-width “Back to top ↑” on mobile.

---

## 8. Motion & easing

```css
--ease:cubic-bezier(.22,1,.36,1);   /* the ONLY easing curve */
```

- **Scroll reveal:** `.rv{opacity:0;transform:translateY(16px)} .rv.in{…none}`
  via IntersectionObserver, stagger ≤60ms.
- **Line-mask reveal** on hero `h1` (each line rises from an overflow-hidden mask).
- **Scramble-decode** on the hero eyebrow text.
- **Count-up** numbers; **progress-bar fill**; **typing** terminal line.
- **Pulse/blink** for live dots and caret.
- **`prefers-reduced-motion: reduce`** → disable ALL animation/transition,
  show reveals instantly, stop marquees/typing. **Mandatory.**

---

## 9. Required global snippets

```css
/* film grain */
body::after{content:"";position:fixed;inset:0;z-index:120;pointer-events:none;
  opacity:.05;mix-blend-mode:multiply;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E");}

/* progress bar */
#prog{position:fixed;top:0;left:0;height:2px;width:0;background:var(--accent);z-index:140}

/* focus */
a:focus-visible,button:focus-visible,input:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
::selection{background:var(--accent);color:var(--paper)}
```

---

## 10. Responsive breakpoints

| Width | Behavior |
|---|---|
| ≤1020px | 2-col grids → 1 col; mission side-by-side → stacked |
| ≤860px  | stats 2×2; footer 2-col; contact links 2-col |
| ≤760px  | desktop nav → hamburger; repo/oss/latest → 1 col |
| ≤640px  | gutters 18px; stats edge-to-edge 2×2; forms full-width; footer 1-col; inputs 16px |

Touch targets ≥44–46px always. No horizontal scroll at any width.

---

## 11. Accessibility (non-negotiable)

- Skip link; semantic landmarks (`header/main/section/footer/nav`).
- One `h1`; logical heading order; `aria-current`, `aria-expanded`, `aria-label`.
- All text meets the contrast table in §2.
- Visible `:focus-visible` (accent outline).
- Every animation honors `prefers-reduced-motion`.
- Images have meaningful `alt`; decorative SVGs `aria-hidden`.

---

## 12. DO / DON’T

**DO**
- Use the exact tokens in §2 and fonts in §3.
- Keep corners sharp, borders hairline-or-ink, shadows soft.
- Use mono for chrome, serif for display, sans for body.
- Use vermilion only as an accent; green only for success.
- Pair roman + italic in headings; use diamond bullets and left accent lines.
- Collapse gracefully and keep tap targets large.

**DON’T**
- No pure `#fff`/`#000`; no cool grays/blues in the palette.
- No gradient text, glassmorphism, neon, or glossy “web3” looks.
- No rounded-2xl cards, no heavy drop shadows, no 3-D tilts.
- No emoji as UI icons; use mono glyphs (`→ ↗ ◆ ✓`) or inline SVG.
- No new accent colors; no second loud hue.
- No marketing hype copy; no lorem ipsum.
- Don’t rename/renumber locked sections (06 Contact, 07 FAQ, 05b/05c).

---

## 13. New-page checklist

- [ ] Links `/assets/fonts.css` + the two preloads, and sets `:root` tokens (§2/§3).
- [ ] Has grain overlay, progress bar, skip link, sticky blurred header + monogram.
- [ ] Uses `.wrap`, section borders, and the kicker/h2/sec-tag header pattern.
- [ ] Buttons/cards/tags match §7; motion matches §8 with reduced-motion fallback.
- [ ] Passes §2 contrast and §11 a11y; responsive per §10 with no overflow.
- [ ] Copy follows §1 voice; nothing from the DON’T list appears.

*End of DESIGN.md — when building, if it doesn’t feel like a printed lab notebook, it’s wrong.*