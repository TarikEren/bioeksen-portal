# ADR-0010: Design tokens derived from the brand mark

- **Status:** Accepted
- **Date:** 2026-08-23
- **Proposed:** 2026-08-23 by Engineering
- **Accepted:** 2026-08-23 by the project technical lead
- **Technical owner:** Engineering

## Approval provenance

The palette, the typography pairing and the four colour decisions below were put
to the project technical lead as explicit choices with alternatives, alongside a
visual reference, and approved on 2026-08-23.

## Context

The portal had no visual system. Bioeksen's corporate site is built on Wix, whose
theme configuration exposed a red / blue / yellow palette in the conventional
brand slots. Those turned out to be template defaults: nothing in the site
actually used them as brand, and the site's own icons and imagery did not match
them.

Sampling the logo mark directly gave a different and much narrower answer. The
brand is two colours:

- `#479876` — the sphere, 88% of the mark's pixels
- `#5D6061` — the wordmark and the orbital ring

The decisive technical fact emerged immediately: `#479876` measures **3.49:1**
against white. It cannot carry a white label and cannot be body text. A visual
system that assumed otherwise would have failed WCAG AA on its most prominent
element — the primary button — everywhere in the product.

## Decision

### Palette

Two brand values, sampled and pinned. Green and grey ramps are generated from
them, with the sampled values fixed at `--green-500` and `--grey-600` rather than
approximated by the generator. Red, amber and blue ramps exist only for states
requiring a person to act.

### Two-layer tokens

Primitives (`--green-600`) are defined once and referenced only by semantic
tokens (`--color-action`). Components reference semantic tokens exclusively.

### The brand green is a graphic colour

`--color-brand` is `#479876` exactly, used for the mark, the area rule, icons and
borders. `--color-action` is 8% darker at `#387D60`, reaching 4.92:1 with a white
label. The hue is unchanged, so the two are not perceived as different greens.

### Success is not coloured

e-IFU does not colour its success case. Finding the document is the ordinary
outcome; a banner announcing it trains people to ignore the colour that failure
needs. Strong colour is reserved for problems.

Consequently there is **no separate success hue**. The brand green covers
identity, primary action and Academy's positive states. The closest reasonable
candidate for a distinct success green measured 1.55:1 against the brand — not a
distinction anyone could make.

### Typography: self-hosted IBM Plex

IBM Plex Sans and IBM Plex Mono, self-hosted via `@fontsource`, `latin` and
`latin-ext` subsets only.

Self-hosting is not a performance choice. A webfont CDN receives the IP address
of every visitor, including every unauthenticated e-IFU user, which is a transfer
of personal data abroad and would require the approval ADR-0006 describes.

### The contract is enforced, not documented

`scripts/check_design_tokens.py` verifies every required token pair against its
WCAG threshold and fails `make check` on a regression. It also refuses to let
`--color-action` equal `--color-brand`.

## Consequences

### Positive

- The system is unmistakably Bioeksen's, because it is derived from the mark
  rather than chosen alongside it.
- The palette is narrow — two brand hues plus three state hues — which is what
  makes a state colour mean something when it appears.
- WCAG AA is a build failure rather than a review item.
- A dark theme is a token redefinition, not a rewrite.
- No third-party request is made for a font, so there is no residency question
  to answer later.

### Negative / accepted costs

- The brand green cannot be used as a button ground. Anyone reading the logo and
  reaching for `#479876` will be corrected by the checker rather than by review;
  the reasoning is recorded so the correction does not read as arbitrary.
- Self-hosted fonts add ~430 KB of build output and two dependencies.
- Generated ramps are algorithmic. Individual steps may need hand-tuning as real
  screens are built; the sampled brand values are the only fixed points.

## Alternatives considered

- **Use the Wix theme's red / blue / yellow as brand.** Rejected once the logo
  was sampled: they are template defaults, not Bioeksen's colours.
- **Use `#479876` as the action colour and accept 3.49:1.** Rejected. AA on the
  primary action is not negotiable in a product used in a laboratory.
- **Lighten the surface behind buttons instead of darkening the green.**
  Rejected: it inverts the visual hierarchy to protect a hex value.
- **A distinct success green.** Rejected — indistinguishable from the brand at
  1.55:1, and unnecessary once e-IFU stopped colouring success.
- **Google Fonts CDN.** Rejected under ADR-0006.
- **Inter, or a general-purpose UI face.** Rejected: no monospace companion of
  matching design, and identifier legibility is a functional requirement here.
