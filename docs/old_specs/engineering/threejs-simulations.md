# Three.js Simulations

Three.js is optional and second-stage. Most device training should prefer 2D/image-state interactions unless 3D materially improves learning.

## Standard templates

Examples:

- Explore Object
- Identify Component
- Open/Close Instrument
- Insert Object
- Remove Object
- Follow Procedure
- Instrument Operation

A PCR instrument model may open/close, expose internal components, and allow permitted objects to be inserted/removed.

## Authoring

Developers build reusable interaction templates. Training Studio authors select models, targets, steps, allowed actions, localized instructions, and success criteria.

Authors do not write Three.js code.

## Assets

Prefer optimized `.glb`/`.gltf` models. Lazy-load 3D content. Dispose render resources when leaving the activity. Avoid perpetual render loops when not needed. Provide fallbacks or alternative learning paths for devices/browsers that cannot comfortably run the 3D activity.
