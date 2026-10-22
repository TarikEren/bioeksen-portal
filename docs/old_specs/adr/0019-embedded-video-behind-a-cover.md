# ADR-0019: Course video is embedded from YouTube or Vimeo, behind a cover

- **Status:** Accepted for implementation
- **Date:** 2026-09-07
- **Relates to:** ADR-0006 (data residency, Türkiye) — this decision creates a
  bounded exception to it and says exactly how far it reaches.
- **Business owner:** Bioeksen project ownership — decided the position
- **Technical owner:** Engineering

## Context

The Academy needs video. Two ways to deliver it were open.

**Self-hosting.** The `video` block type was built for this: a storage key for
the file, a required set of caption tracks, an optional poster. It keeps
everything inside ADR-0006 — the bytes sit in the Türkiye-hosted bucket and the
learner's player talks to nothing else.

It also costs what video costs. A one-hour training video is gigabytes, not
megabytes; it needs transcoding to several renditions, adaptive streaming so a
laboratory on a slow line can watch it at all, and egress bandwidth every time
somebody presses play. `MAX_DOCUMENT_BYTES` is 20 MB because the process holds
the bytes to hash them, and that shape does not extend to video at all.

**Embedding.** Bioeksen already publishes training video on YouTube. Embedding
costs nothing to build, nothing to run, and gives adaptive streaming, captions
and a player people already know.

The cost is elsewhere: the learner's browser fetches the player from Google, and
that request carries their IP address and the fact that they are watching this
particular video, to a company outside Türkiye. **Our data does not leave.
Something about the learner does.**

Project ownership chose embedding on 2026-09-06, with the conflict stated.

## Decision

**Embedding is permitted for course video, through a `video_embed` block type,
under three conditions.**

**1. The provider and the identifier, never a URL.**

The configuration holds `provider` (`youtube` or `vimeo`) and `videoId`
(`[A-Za-z0-9_-]{6,64}`). The renderer composes the embed URL from those two
fields.

A pasted URL would carry a playlist, an autoplay flag, a start offset, sometimes
a tracking parameter — and nothing in the system could tell which of those an
author meant to include. Two narrow fields are auditable. An interpolated string
is not, and it is also how an author points a lesson at any host at all.

**2. Nothing is requested until the learner asks for it.**

The block renders as a cover: the title, the summary, and a play control. No
iframe, no script, no image from the provider's servers. The iframe is created
only when the learner activates the control.

This is the condition that does the work. A learner who reads a lesson and does
not watch the video is never visible to Google — not their IP, not the page,
not the fact that they were there. Embedding without a cover would report every
learner who scrolled past.

**3. `youtube-nocookie.com`, and `dnt=1` for Vimeo.**

The provider's own reduced-tracking endpoints. They are worth using and they are
not the point: condition 2 is what protects the learner who does not watch, and
this only narrows what is collected about the one who does.

## Consequences

**Accepted.** A learner who plays an embedded video is disclosed to a processor
outside Türkiye — their IP address, their user agent, and which video they
played. That is a real exception to ADR-0006 and this ADR is where it is
recorded, so that a later reader does not find the embed and conclude the
residency rule was forgotten.

**The self-hosted `video` type stays.** It is not deprecated and it is the
better answer wherever the content cannot be published publicly. `video_embed`
is a second type rather than a loosening of the first: adding a URL mode to
`video` would have weakened a block whose whole design is that it hosts what it
plays.

**Captions cannot be enforced.** `video` requires caption tracks because it
holds the files. Nothing here can require captions of a file on somebody else's
server, so the accessibility requirement lands where it can be enforced instead:
`video_embed` requires a localized `summary`, which stands in for the learner
who cannot watch — no sound, no bandwidth, a screen reader
(`accessibility.md`). Authors are expected to caption on the provider as well;
that expectation is not a technical control and is not claimed as one.

**The consent text must say this.** The e-IFU consent text covers the e-IFU
flow. The Academy needs its own statement that playing a video contacts the
provider. Listed in `deferred-work.md`; it is a text, not a build.

## Alternatives rejected

**Self-host after all.** Rejected on cost and on time-to-usefulness, not on
principle. If Bioeksen later runs a Türkiye-hosted streaming service, the
`video` type is already there and `video_embed` becomes the legacy path.

**Proxy the provider through our backend.** It would hide the learner's IP, and
it would also mean serving Google's player from our origin, breaking their terms
and taking on the bandwidth we were avoiding. It trades a disclosed IP for a
worse security posture and the cost we rejected.

**Allow any embed URL.** Rejected outright — see decision 1. It is the
difference between a reviewed integration with two providers and an open
redirect inside controlled training content.
