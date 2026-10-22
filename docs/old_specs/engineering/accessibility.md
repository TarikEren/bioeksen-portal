# Accessibility

Accessibility appears in `definition-of-done.md` as a check item. This file says
what passing that check means.

## Target

WCAG 2.2 Level AA for learner-facing surfaces (e-IFU lookup, course player,
certificates) and for Training Studio's primary authoring flows.

Turkish and English are both in scope: `lang` must reflect the active locale, and
translated strings must not break layout or truncate.

Colour values, contrast ratios and the enforced contract live in
`design-system.md`. This file covers everything else.

## Non-negotiable rules

1. **Keyboard.** Every interactive control is reachable and operable by keyboard.
   Focus order follows visual order. Focus is never trapped except in a modal,
   which must return focus to its trigger on close.
2. **Visible focus.** Never remove a focus indicator without replacing it with
   one that meets 3:1 contrast against its background.
3. **Contrast.** 4.5:1 for body text, 3:1 for large text and meaningful UI
   boundaries.
4. **Semantics before ARIA.** Use `<button>`, `<a>`, `<label>`, `<table>`. Reach
   for ARIA only when no native element expresses the pattern.
5. **Forms.** Every input has a programmatically associated label. Errors are
   announced, associated with their field, and never conveyed by colour alone.
6. **Motion.** Honour `prefers-reduced-motion`. No content flashes more than
   three times per second.
7. **Images.** Meaningful images carry alt text; decorative images carry `alt=""`.
   In courses, alt text is **localized authored content** — the author supplies
   it per locale, alongside the image.
8. **Video.** Captions are required for course video. The Training Studio video
   block must expose a caption-track upload per locale.

## Drag-and-drop

`learning-engine.md` and `training-studio.md` both require a non-drag
alternative. Concretely:

| Surface | Required alternative |
|---|---|
| Training Studio ordering (modules, lessons, blocks) | "Move up" / "Move down" buttons, or a numeric position field. |
| Learner drag-and-drop activity | Keyboard selection: focus the item, activate to pick up, move focus to a target, activate to drop. Announce each step via a live region. |
| Image hotspot activity | Hotspots are focusable buttons with accessible names, not bare coordinates. |

An activity whose learning objective *is* the physical manipulation may keep drag
as the primary interaction, but must still be completable by keyboard.

## Simulations and 3D

Three.js content is not accessible by default and must not be the only path to a
required learning objective:

- Provide a text or 2D alternative that carries the same assessed content.
- Never gate course completion behind a 3D activity alone.
- Canvas content requires a text description of what it depicts.
- Respect `prefers-reduced-motion` in camera transitions.

See `threejs-simulations.md` for the fallback requirement.

## e-IFU specifics

The e-IFU lookup form is the most accessibility-critical surface in the product:
it is public, it is used under time pressure, and its users may be in a lab.

- Fully operable by keyboard and screen reader.
- Errors map from `code` to a localized, specific message — never a bare
  "invalid input" (`error-codes.md`).
- Document download links state format and language in their accessible name,
  e.g. "Instructions for Use, Turkish, PDF".

## Verification

- Automated: `axe-core` runs in the component test suite. Violations fail CI.
- Manual: keyboard-only walkthrough of the changed flow before marking a
  change done.
- Automated checks catch roughly a third of real issues. Passing `axe` is
  necessary, not sufficient.
