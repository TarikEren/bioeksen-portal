# Interactive Content

Prefer the simplest interaction that achieves the learning goal.

## 2D/image-state simulation

Use reusable image-state activities for devices when 3D adds little learning value.

Example sequence:

1. device closed image
2. hotspot on lid
3. next state: lid open
4. hotspot on rotor
5. next state: rotor highlighted

Admin configures states, hotspots, instructions, transitions, success criteria, and localized feedback.

## PCR curve

Use a reusable curve interpretation block with configured data/visual state and deterministic scoring rules.

## Branching

Use declarative branch definitions and outcome conditions. Do not encode course-specific branches as custom component logic.

## Activity attempts

Track relevant score, duration, errors, and completion through common attempt infrastructure.
