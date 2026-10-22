# Learning Engine

## Principle

Courses are data-driven. Do not hard-code course-specific React screens.

Hierarchy:

`Course -> CourseVersion -> Module -> Lesson -> ContentBlock`

## Content blocks

Use a registry-based/extensible content model. Planned block types include:

- text
- image
- video (self-hosted, caption tracks required) — **planned, not implemented**;
  Bioeksen settled on embedding on 2026-09-14, so this sits in
  `PLANNED_BLOCK_TYPES` and the server refuses to create one
- video_embed (YouTube or Vimeo, behind a cover — ADR-0019)
- document/IFU reference
- quiz
- drag-drop
- hotspot
- branching scenario
- interactive video
- PCR curve
- plate setup
- run review (the plate, the curves, a call per well and a call on the run)
- pipetting
- image-state simulation
- Three.js simulation

### What an author can say and ask

The palette had one way to say anything — a paragraph — and one way to ask
anything — a multiple-choice question. A laboratory instruction is mostly
lists, tables and labelled pictures, so an author with only paragraphs wrote a
numbered procedure as "1. … 2. …" inside one: a list to a person reading it and
a wall of text to a screen reader.

| Type | Scored | What it is for |
|---|:--:|---|
| `list` | | Bullets, or the numbered steps of a procedure. The variant chooses `<ul>` or `<ol>`, so "the order matters" is said rather than drawn. |
| `table` | | A caption and real `<th scope="col">` headings. Cells are keyed by column id, so inserting a column shifts nothing. |
| `image_labels` | | A picture with the author's labels on it — the teaching counterpart of `hotspot`, which asks and is scored. |
| `label_match` | ✓ | Numbered points on a picture, and the names that belong to them. |
| `ordering` | ✓ | Put the items in the right order. All-or-nothing: a protocol with two steps swapped is a protocol that does not work. |
| `fill_blank` | ✓ | A sentence with `{{gaps}}` the learner types into. |
| `plate_setup` | ✓ | Lay out controls and samples on a plate. Wells cycle on click. |
| `pcr_curve` | ✓ | Call each curve against a threshold the learner moves. Curves are **generated** from a Ct, a baseline and a plateau — see below. |

### A curve is described, not typed

`pcr_curve` asked its author for the fluorescence at every cycle — forty numbers
per curve, four curves, and none of them the thing being taught. It now takes
what somebody teaching this would say: the run's length, a starting threshold,
and per curve a dye, a **target**, a Ct, a baseline and a plateau.
`lib/amplification.ts` fits the four-parameter logistic every instrument's own
software fits.

`dye` says which channel was read and `target` says what it detects — `FAM` and
`HPV16`. The pair is what a multiplex reaction is, and reading the wrong channel
is one of the mistakes worth teaching; with only the dye, a learner is asked to
call a curve without being told what the curve is of. Both are free text: an
author writes what the assay calls it, and a registry of targets would be a
second thing to maintain for a teaching example. A curve may also carry a
`well` — a LABEL, since this block draws no plate and nothing can check that
`A1` exists. The block that *does* link a well to its curve is `result_review`.

`scale` chooses linear or logarithmic fluorescence, and it is authored rather
than a viewing preference: a threshold has to sit in the exponential phase, and
on a linear plot that phase is a corner nobody can judge.

**`ct` is where the curve crosses the AUTHORED threshold**, not the curve's
midpoint, and the midpoint is solved from it. That is the definition a
laboratory uses, and it is what makes the block teach anything: the learner
moves the threshold, the crossing moves with it, and a Ct stops looking like a
property of the curve alone.

Which makes the **two thresholds a separate contract**, and getting it wrong is
silent. `curvePoints(model, cycleCount, authoredThreshold)` takes the threshold
the curve was DESCRIBED against and solves the shape from it; `crossingAt` then
reads that shape against whatever line is drawn now. The player was passing the
learner's moved threshold as both, so every drag re-solved the curve to cross at
`ct` again — the line moved, the shape moved with it, and the crossing sat
still. The block looked like it worked and taught the opposite of its own point.
`CurvePlot` takes the two separately for that reason; they coincide only in the
authoring form, where the author setting the threshold *is* saying where `ct`
falls. A `ct` of `null` is a curve that never rises — a
true negative, the commonest thing on a plate and the one shape a cycle number
cannot express.

The reported crossing is read back off the drawn curve rather than from the
configuration, in the authoring form and in the player, so what either shows is
what is actually there. `schemaVersion` went to 2; a block written against the
old array is refused with `CONTENT_BLOCK_SCHEMA_VERSION_UNSUPPORTED` rather than
drawn as nothing.

Two rules run through them. **Case-folding is Turkish** — `'I'.toLowerCase()`
is `'i'` in English and `'ı'` in Turkish and they are different letters, so
`fill_blank` folds with `toLocaleLowerCase('tr')` and a learner typing `IŞIK`
against an author's `ışık` is right. And **every ordering has a non-drag path**:
`ordering` is arranged with move buttons and `label_match` asks with a select
per point, because in both the arrangement IS the answer and a drag-only
control would make the question unanswerable rather than merely awkward.

`backend/src/training/block-registry.ts` is the registry itself, and
`GET /api/v1/authoring/block-types` serves it — the Studio's palette is built
from that response rather than from a second list, so it cannot offer a type
this deployment does not validate. Types on the list above that the registry
does not carry are served as `planned` and named, so an author who read this
document gets a refusal rather than a block that stores and renders as nothing.

### What a new block starts as

`EMPTY_CONFIGS` in `block-registry.ts`, one entry per type, served on
`GET /api/v1/authoring/block-types` as `default_config`.

It is in the registry rather than in the Studio because it is the one thing
about a block type that a **schema can judge**, and it was in the Studio, and
it drifted three ways at once without anybody noticing: `pcr_curve` kept
sending the shape it had before schema version 2, `list` sent `text` where the
schema wants `label`, `table` sent `header`. All three types were offered by
the palette and none of them could be added — the author picked one and got
validation errors naming fields no form shows.

Two checks run **at module load**, next to the scoreable/activity one and for
the same reason — both directions of the failure are silent:

- every type in `BLOCK_REGISTRY` has a starting configuration, and
- every starting configuration is one the type's **draft** schema accepts.

A registry that fails either does not load, so the shape the palette offers
cannot disagree with the schema that judges it. `content-tree.spec.ts` then
adds every type in the registry through `ContentService`, which is the palette
being exercised on all of them at once.

### Blocks that refer to stored media

`image` and `hotspot` hold **storage keys**, never URLs. Each type declares
where in its configuration those keys live (`assets` on the registry entry,
e.g. `['asset']`), and every read path uses that declaration to return an
`asset_urls` map beside the blocks.

The declaration language takes a dotted path and `*` for every value of a
record — written for `video`'s `['asset', 'poster', 'captions.*']`, one caption
file per locale. With that type planned rather than implemented, every
declaration in the registry is a single field; the resolver keeps the rest of
the language, and `block-registry.ts` says so where it is defined. See
`object-storage.md`; the key stays in the configuration, and only the map
carries URLs.

## A page is a break, not a container

A lesson is read a page at a time, and a page ends where the author put a
`page_break` block. There is no `page` column and no page entity.

The alternative — a page number on every block — is worse for a reason this
codebase has met before: it is a **second ordering invariant beside
`display_order`**, and the two interact. A block whose page is 3 when there is
no page 2 is the same class of defect as a gap in `display_order`: invisible,
and discovered by a learner who cannot reach a page.

As a break it is correct by construction. The ordering that already exists
decides where a page ends, moving a block to another page is moving it past the
break, a lesson with no break is one page — so every lesson written before this
existed is one — and there was no migration.

The player drops empty pages: two breaks in a row, or one at the very start,
are an author mid-edit rather than an instruction to show a blank screen. The
completion button and the lesson's assessments wait for the last page, because
finishing a lesson is finishing the lesson — offering "mark complete" on page
one of three is offering to finish something nobody has read.

### The page owns the break that ends it

The rule for leaving a page — nothing, `attempted`, `correct` — is stored on the
break, so the break belongs to the page **before** it. That is what
`frontend/src/features/training-studio/pages.ts` derives, and it has one
consequence worth stating: **the last page carries a gate by having a trailing
break of its own.** The break is appended after the page's blocks, the empty
page it creates is dropped by the player, and `pageGates.ts` still enforces the
rule on completion. Without it a lesson ending in a question is a lesson
somebody completes without answering it, and completion is what issues a
certificate.

The player disables the completion button when the last page still owes an
answer, and says why. The server refuses it either way
(`LESSON_PAGE_NOT_ANSWERED`); the button is disabled so that a learner is not
taught that pressing it is how you find out.

### The Studio is three steps

`StudioPage.tsx` is **plan → pages → preview**, and each step gets the screen it
needs:

1. **Plan** (`CoursePlan.tsx`) — modules and lessons, full width. Opening a
   lesson *is* the move to step two, so selecting one is never a click that
   changes nothing visible. Adding asks for the title in a drawer, like every
   other create in the backoffice: it used to be an always-open two-field
   fieldset under **every** module, so a course with four of them opened with
   ten text inputs in a sidebar.
2. **Pages** (`LessonPages.tsx`) — a slim lesson rail for context, the pages,
   and the selected block's fields. Everything that changes the *plan* stays in
   step one, so each of those actions has one home.
3. **Preview** — the lesson as a learner meets it, page by page, and nothing
   else on the screen.

Steps two and three are disabled while no lesson is selected: they are about a
lesson, and offering them with none is offering to write pages of nothing.

### The Studio authors pages, not a list with breaks in it

`LessonPages.tsx` draws a lesson as its pages: each one a card carrying its
number, its gate, its blocks and the palette that adds to it. The palette opens
**inside** a page rather than at the foot of the lesson, so "add a widget"
points at where the widget lands.

Adding a page asks what it is first — teaching, question, question on an image,
video, empty (`PAGE_KINDS`). The kind is **stored nowhere**. It decides which
blocks are laid down and what the page's gate starts as, and after that the page
is an ordinary page. It is worth asking anyway: it is the one moment the author
knows the answer, and a question page that arrives with its question and its
"must be answered" already set is most of the work of making one.

`page_break` is deliberately absent from the palette. A page is added as a page;
a lone break dropped between two blocks is the same act with none of it said.

The blocks sit on a **sheet** — a bounded surface at reading width, the way a
report designer shows a page rather than a list. An author was arranging widgets
in a column as wide as the window, which is not the shape anybody reads them in:
a line of text 1400px wide in the Studio is 65 characters in the player.

Widgets can be **dragged** into place on that sheet, within one page. Crossing a
break would move a widget to another page, which is a different act with a
different meaning. The arrow buttons in each card do the same move and are not a
fallback: `accessibility.md` requires a non-drag path to every ordering action,
and a drag a pointer can do and a keyboard cannot is a control half the people
using the screen do not have. Both gestures end in one `reorderBlocks` call
carrying the whole lesson, which is the only shape the endpoint takes.

## A draft block may be unfinished

Block configuration is read at **two strictnesses**, from one set of schemas
(`block-registry.ts`, `Strictness`).

The Studio creates a block the moment somebody clicks a widget — that is what
clicking a widget means — and every schema requires its localized text to be
non-blank (ADR-0009). Read at one strictness those two facts cannot both hold,
and they did not: the palette could add no block of any type at all.

- **`draft`** is what may be stored while a version is being written. Blank
  localized text, a blank asset key, an empty region list, no answer marked.
- **`complete`** is the published contract, and is what `submitForReview`
  checks every block against. A version holding an unfinished block is refused
  with `COURSE_HAS_INCOMPLETE_BLOCKS`, naming one field per unfinished value.

The difference is only ever "not filled in yet". **The shape is identical** —
one literal evaluated twice — so a draft cannot hold a field no renderer knows,
a missing key is still the wrong shape rather than an unfinished one, and a
type that gains a field gains it in both.

## Configuration

Every complex block configuration should include a schema version, for example:

```json
{
  "type": "pcr_curve",
  "schemaVersion": 1,
  "config": {}
}
```

Validate configuration on backend and frontend.

Never execute administrator-authored JavaScript, HTML, or arbitrary code.

## Attempts

Use a common `ActivityAttempt` concept for scoreable/trackable interactive blocks where practical:

- user
- content_block
- started_at
- completed_at
- score
- max_score
- passed
- attempt_data

Avoid creating incompatible progress models for every activity type.

Accessibility requirements for interactive and drag-and-drop blocks are in `accessibility.md`. Block configuration validation failures use the `CONTENT_BLOCK_*` codes in `error-codes.md`.
