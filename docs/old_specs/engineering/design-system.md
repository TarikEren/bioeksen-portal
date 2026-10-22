# Design System

The visual system derives entirely from the Bioeksen logo. Both brand values
were sampled from the mark itself, not taken from the corporate website's theme
configuration — that palette turned out to be template defaults, not brand.

| | Value | Where it is in the mark |
|---|---|---|
| Brand green | `#479876` | The sphere. 88% of the logo's pixels. |
| Brand grey | `#5D6061` | The "bioeksen" wordmark and the orbital ring. |

Everything else in the palette is a tone of one of these two, or is reserved for
a state that needs a person to act.

The visual reference — palette, contrast findings and component examples — is
`docs/design/design-system.html`, published at
<https://claude.ai/code/artifact/eba825f8-1c59-4b62-b939-526d94c7e336>.

> That reference page loads IBM Plex from Google Fonts, because it is hosted
> outside our infrastructure and has no other option. **The product does not, and
> must not** — see *Typography* below. Do not copy its font loading.

## The constraint everything else follows from

**The brand green cannot carry a white label.**

At **3.49:1** against white it sits below the 4.5:1 that normal-size text
requires — in both directions. It is a graphic colour, not a text colour.

| Use | Ratio | Verdict |
|---|---|---|
| White label on `#479876` | 3.49:1 | **Fails AA** |
| `#479876` as body text on white | 3.49:1 | **Fails AA** |
| `#479876` as icon, border, or large text | 3.49:1 | Passes (3:1 threshold) |
| White label on `#387D60` (`--color-action`) | 4.92:1 | Passes AA |
| Brand grey `#5D6061` as body text on white | 6.34:1 | Passes AA |

So the brand green stays exactly as drawn wherever it behaves as a graphic — the
mark, the area rule, an icon, a border. Where it must hold a label it darkens by
8% lightness and keeps its hue, becoming `--color-action`. Nobody perceives two
greens; the contrast checker does, which is the entire point.

The brand grey needs no adjustment at all. It is already an excellent text
colour, which is fortunate, because it means the wordmark colour appears
throughout the product unmodified.

## Token architecture

Two layers, and the distinction is load-bearing:

| Layer | Example | Rule |
|---|---|---|
| **Primitive** | `--green-600`, `--grey-800` | Raw palette values. Defined in `tokens.css`. **Never referenced by a component.** |
| **Semantic** | `--color-action`, `--color-text` | What the colour is *for*. The only layer components may use. |

A component that references `--green-600` cannot be re-themed. One that
references `--color-action` can. This is the whole reason a dark theme will be a
token redefinition rather than a rewrite.

`scripts/check_design_tokens.py` reports a raw hex or `rgb()` value in any file
under `frontend/src` as a finding. `frontend/src/styles/tokens.css` is the one
place literals belong.

## Semantic tokens

| Token | Resolves to | For | On surface |
|---|---|---|---|
| `--color-text` | `--grey-800` | Body text | 11.9:1 |
| `--color-text-secondary` | `--grey-600` | Labels, metadata — the wordmark grey | 6.3:1 |
| `--color-text-muted` | `--grey-500` | The lightest text permitted anywhere | 4.9:1 |
| `--color-text-link` | `--green-700` | Link text | 6.9:1 |
| `--color-brand` | `--green-500` | Logo, area accent, decorative marks | 3.5:1 |
| `--color-action` | `--green-600` | Primary button, focus ring | 4.9:1 |
| `--color-action-hover` | `--green-700` | Hover and active states | 6.9:1 |
| `--color-positive` | `--green-700` | Academy progress, completion, valid certificate | 6.9:1 |
| `--color-danger` | `--red-600` | Lookup failure, revocation, destructive confirm | 7.7:1 |
| `--color-warning` | `--amber-600` | A conflict awaiting a human decision | 5.0:1 |
| `--color-info` | `--blue-600` | Neutral notice. Never an action | 6.0:1 |
| `--color-border-strong` | `--grey-400` | Input outlines, meaningful boundaries | 3.2:1 |
| `--color-border` | `--grey-200` | Decorative separation only | — |

Surfaces: `--color-surface` (white), `--color-surface-subtle`,
`--color-surface-sunken`, `--color-surface-inverse`.

`--color-scrim` (`rgb(20 30 25 / 45%)`) is the dim behind a modal. It is the one
semantic colour that does not reference a primitive, because it is
semi-transparent — and it is still a token, because a dark theme inverts it and
a component may not. The tint is toward the brand green: a pure black scrim over
a white surface reads as a screenshot artefact rather than a dimmed page.

`--color-region-wash` (`rgb(255 255 255 / 25%)`) and its hover form
(`40%`) are the fill of a marked-out region drawn **on top of a**
**photograph** — a hotspot rectangle over a plate, in the Studio and in the
player. Semi-transparent for the same reason as the scrim and for the
opposite purpose: what the learner is being asked to read is the picture
underneath, so the wash may only lift the region enough to be seen. White
rather than tinted, because it sits over an author's own photograph whose
colours nothing here knows. The border identifies the region; the wash is
only contrast, because a region distinguished by its fill alone would be
carrying meaning in colour.

Each state colour also has `-surface`, `-text` and `-border` variants for tinted
callouts, all contrast-verified against each other.

## Fluorescence channels

| Token | Primitive | Channel |
|---|---|---|
| `--color-channel-fam` | `--blue-600` | FAM |
| `--color-channel-hex` | `--green-600` | HEX |
| `--color-channel-rox` | `--amber-500` | ROX |
| `--color-channel-cy5` | `--red-600` | Cy5 |

The one set here where colour identifies a **thing** rather than a state. These
are the colours a qPCR channel has on every instrument, so an amplification
curve drawn in them is read the way it is read at the bench. They are line
colours on a plot: never a fill behind text, and never used for a status. A dye
outside this set falls back to the neutral series in `curve-plot.css`.

There is no `--font-weight-*` or `--border-width` token, and the type scale has
no `md` step: weights are written as numbers (`600` for emphasis, `700` for a
heading), a hairline border is `1px`, and the scale runs `xs sm base lg xl 2xl
3xl`. This is worth stating because a plausible-looking
`font-weight: var(--font-weight-bold)` resolves to nothing and CSS drops the
declaration in silence — the heading is simply not bold, and no test can see
it. `check_design_tokens.py` now fails on a `var()` that nothing defines.

## Contrast contract

These pairs are enforced by `scripts/check_design_tokens.py`, which runs in
`make check` and fails the build on a regression. A contrast regression is
invisible in review — nobody eyeballs 4.6:1 against 4.4:1 — so it is checked
rather than remembered.

- Body and normal-size text: **4.5:1** minimum.
- Large text (≥18.66px bold or ≥24px), icons and meaningful UI boundaries: **3:1**.
- `--color-text-muted` at 4.9:1 is the lightest text permitted. There is no
  lighter tier, and adding one requires changing the contract.

The checker also refuses to let `--color-action` equal `--color-brand`. That
substitution looks harmless and silently drops every primary button to 3.49:1.

## Colour decisions

### Success is not a colour

In e-IFU, finding the document is the ordinary outcome — it happens thousands of
times for every failure. A green banner announcing it trains people to ignore
green, which is the colour the failure state needs them not to ignore.

Success is presented as content: the document appears, with its catalog number,
LOT, revision and effective period. No banner, no tick, no green wash. Strong
colour is spent only on problems.

### One green family, no separate success hue

Because e-IFU does not colour its success case, nothing competes with the brand
green. It serves as identity, primary action, and Academy's positive state at
once — progress, completed lessons, a valid certificate.

A separate success green would have produced two greens nobody could tell apart:
the closest reasonable candidate sat at 1.55:1 against the brand, which is not a
distinction a user can make.

### Colour never carries meaning alone

Every state pairs colour with **an icon and a text label**, and every error
carries its registered code from `error-codes.md`. This is an accessibility
requirement (`accessibility.md`) and it is also what makes the states legible in
a lab, on a poor screen, at speed.

### The two areas differ by one token

e-IFU and Academy share every component, type scale and spacing step. The only
difference is `--color-area-accent`, the rule under the header: green for e-IFU,
grey for Academy. Set by `[data-area="academy"]`.

Enough to know where you are. Not enough to be two products.

## Typography

| Role | Face | Weights |
|---|---|---|
| Interface, body, headings | **IBM Plex Sans** | 400, 500, 600 |
| Identifiers and data | **IBM Plex Mono** | 400, 500, 600 |

IBM Plex was drawn for technical and engineering contexts and has a true
monospace companion. That companion is not a stylistic preference:

> **Business identifiers are always monospace.** Catalog numbers, LOT numbers,
> revisions, dates, hashes and percentages are read and compared character by
> character. `BS-GHPV-L-100` and `B2603091224GHPVV` never appear in the sans face.

The reverse holds too, and it was being broken: **nothing that is not an
identifier is monospace.** Column headings were mono, uppercase and
letter-spaced on every table in the product, which spends the mono face's
meaning on the word "Durum" and leaves nothing to distinguish a LOT number
from the label above it.

**Uppercase is not a text transform here.** In Turkish `i` uppercases to `İ`
and `ı` to `I`; `text-transform: uppercase` does not know that, so it produces
the wrong letters in one of the product's two languages and an author cannot
correct it from the translation file. Where a label should read as capitals,
they are written that way in the translation. The device is kept for the brand
mark and the landing page's eyebrows — a few rare places — and is off in
working screens.

Fonts are **self-hosted** via `@fontsource`, never loaded from Google Fonts. A
webfont CDN receives the IP address of every visitor, including every
unauthenticated e-IFU user, and that is a transfer of personal data abroad —
what ADR-0006 requires approval for. Self-hosting removes the question instead of
answering it.

Only `latin` and `latin-ext` subsets are imported. Turkish needs `latin-ext` for
`ğ ş ı İ`; Cyrillic, Greek and Vietnamese are excluded.

Type scale: 12 / 14 / 16 / 18 / 22 / 28 / 36 px. Line height 1.25 for headings,
1.55 for body. Running text stays near 65 characters.

## The rhythm of a page

Every page is a column with **one interval between its parts** — the heading,
the filters, the content. `--space-5`, set once in `components.css` on the list
of names the screens already use.

It was seven near-identical rules, one per feature, and they had drifted:
`--space-6` in the academy against `--space-5` everywhere else, `display: grid`
in two and `flex` in five. Nobody could see it, because no two of those screens
are ever on top of each other — and the result was a product whose spacing
changed as you walked through it.

The content column is capped at **1440px**. A table stretched across a 2560px
monitor is a table whose first and last columns are a head-turn apart, and the
row is the unit somebody reads. The Studio is the exception and takes the
window: it is a workspace rather than a document, with three panes that each
want room and a plate whose width is the author's decision.

## Type size, and who decides it

The scale is in **`rem`**, not `px`. That is not a unit preference: a `px`
scale ignores the default font size somebody set in their browser or on their
phone, which is the mechanism an operating system offers for exactly this
problem and the one people who need larger text have usually already found.

    --text-xs .. --text-3xl  =  0.75 / 0.875 / 1 / 1.125 / 1.375 / 1.75 / 2.25 rem

At the default 16px root those are the same sizes as before — 12 / 14 / 16 /
18 / 22 / 28 / 36 — so nothing looks different until somebody asks it to.

On top of that, `preferred_text_scale` on the User sets a **percentage on the
root element**: 75 / 87.5 / 100 / 112.5 / 125 / 150, named `smaller` … `largest`.
A percentage rather than a `px` value, because `font-size: 18px` on the root
would discard whatever the browser said and hand a person who needs 24px a
smaller number than they had.

It was four steps, 87.5 to 125, and that was not a range: **150% is the tier
WCAG's resize criterion is written around**, so the control ran out before the
people it exists for did. `smaller` is at the other end for somebody who would
rather fit a whole table on a small screen than read it in comfort — a trade
they are entitled to make. The settings screen offers it as a **slider** whose
value is announced as a word, because "5 of 6" tells somebody who cannot see the
result nothing.

**Only text scales.** The spacing tokens stay in `px`. Scaling everything
together is zoom, which the browser already does better; what a text-size
control is for is the case where the layout is fine and the words are too
small, so the words move and the frame does not. A component with a fixed
height that holds text would break that, which is why there are none.

## Shape and space

Clinical and precise: small radii (2 / 4 / 6 px), hairline borders rather than
shadows, generous white space. One elevation exists, `--shadow-overlay`, for
overlays only.

Spacing scale: 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 px. Sibling groups are laid
out with flex or grid and `gap`, never per-element margins.

## Where the components live

`frontend/src/styles/components.css` holds everything more than one feature
renders: buttons, panels, form controls, tables, notices, pills, the empty
state. A feature stylesheet holds only what that feature renders — a shell, a
canvas, a region editor.

**The `bo-` prefix is historical and does not mean "backoffice".** These rules
lived in `features/backoffice/backoffice.css` while fifty-four files outside
that feature used them: the Academy player, the e-IFU screens, the Studio, the
identity forms. A prefix that names one feature while four others depend on it
is a prefix that lies. The rules moved and the names did not — renaming a class
used in fifty-four files is churn with real risk and no visible benefit, and
what a developer consults is where the rule lives. Listed in
`deferred-work.md`.

There was one definition of a form control per stylesheet before this — five of
them, differing by a token each — so the same field looked slightly different
depending on which screen it was on, and "how an input looks" was a change in
five places. Controls are now styled **by element** inside `.bo-form` and
`.bo-field`: a form has inputs, and asking every one of them to carry a class
is a rule that gets forgotten on the sixth field.

## Backoffice components

Four rules the shared `bo-` classes encode, each of them a defect that was
there first.

**A table carries its own card.** The surface, border and radius are on
`.bo-table`, not on the `.bo-table-wrap` around it. Half the backoffice tables
were wrapped and half were not, so half sat in a card and half floated on the
page background — the same screen, two treatments. The wrapper draws nothing
and exists only to scroll: a `<table>` cannot scroll itself, and wide content
must scroll inside its own box rather than push the page sideways.

**An error is drawn as one.** `.bo-notice` carries both a neutral aside and a
refusal the server just returned, and they looked identical — a grey card
either way, so a failed save read as a piece of advice. `.bo-notice[role=alert]`
takes the danger tokens and a 4px leading edge. The selector is `role="alert"`
rather than a modifier class because that attribute is already on every error
notice and on no neutral one — the message has to be announced — so the two
cannot drift apart. The leading edge is what carries it, not the fill: colour
never carries meaning alone.

**An empty list is dashed.** `.bo-empty` is bordered so that "there is nothing
here" reads as a state rather than as a screen that failed to render.

**A state pill carries a mark, and is not monospace.** `.bo-pill` is the
element this product repeats most — forty-three times across twenty-eight
screens — and it broke two of the rules above it. It was set in the mono face
with `letter-spacing`, which spends the mono face's meaning on the word
"Durum"; and its state was carried by hue alone, which is the one distinction
roughly 8% of men cannot make. Each variant now draws a mark through
`::before` — `✓` released or passed, `×` stopped or failed, `●` in flight and
waiting on somebody, `○` open with nobody waiting, `»` moved past, `–` not
attempted — using the `content: "✓" / ""` alternative-text form so the mark has
an empty accessible name and a screen reader announces the label alone. In CSS
rather than at the call sites, because a mark that had to be passed in is one
somebody forgets on the next pill.

`.bo-pill--note` is the variant for a label that is **not** a state: a course's
audience, a role name, a question count, a catalog format. Those borrowed
`--draft`, which would now put "not started yet" beside the words "Bioeksen
only". It is quiet and deliberately unmarked — there is no state to read at a
glance, only a word.

## Focus

The focus ring is `2px solid var(--color-focus-ring)` at `2px` offset, applied
via `:focus-visible`. It is **never removed**. A design that needs a different
one replaces it with a ring meeting 3:1 against its background
(`accessibility.md`).

## Dark theme

Not in scope. The hook exists and is deliberately empty:

```css
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { /* empty */ } }
:root[data-theme="dark"] { /* empty */ }
```

Enabling it means redefining **semantic tokens only** — no primitive changes, no
component changes. `:root:not([data-theme="light"])` guards the media query so an
explicit light choice still wins over a dark OS setting.

Adding it requires re-running the contrast contract against the dark surfaces and
extending `REQUIRED_PAIRS` in the checker.

## Turkish

Every string in the visual reference is illustrative. Real UI text comes from
translation keys in both `tr` and `en` (`localization.md`).

Turkish runs longer than English — often 15–30% for the same label — so layouts
are tested at the longer string, not the shorter one. A button that fits
"Search" and breaks on "Kullanım talimatını bul" is a defect.
