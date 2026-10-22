# ADR-0013: The LOT kit code is verified, never extracted

- **Status:** Accepted
- **Date:** 2026-08-26
- **Proposed:** 2026-08-26 by Engineering, from analysis of 178 real lot records
- **Accepted:** 2026-08-26 by the project technical lead
- **Technical owner:** Engineering
- **Business owner:** Bioeksen product management
- **Amends:** ADR-0008, which recorded this rule as undetermined

## Context

ADR-0008 established that the letters trailing a LOT number identify the kit,
and left open how that relates to the catalog number — a formula or a registry.
178 real lot records answered it: **both**.

The trailing code is a product-specific base plus a letter determined by the
catalog number's format:

| Format | Letter |
|---|---|
| vCAP | `V` |
| Lyophilized | `L` |
| Liquid | none |

Across 53 lot records where the format is vCAP or lyophilized, the letter is
correct in all 53. `BS-HP` demonstrates it inside one product: the vCAP catalog
number yields `HPV` and the liquid ones yield `HP`.

The base is not derivable. Only 9 of 72 matched lots have a base equal to the
catalog number's product segment. `BUST` yields `BR`, `HAN` yields `HNT`, `LM`
yields `LMONO`, `SY-WCOR-306` yields `ENR`.

The same structure governs the animal and food health lines, where the prefix
carries the format: `VGHS` is vCAP (24 of 24 lots end in `V`) and `TGHS` is
liquid.

## Decision

**The kit code is never parsed out of a LOT number. It is verified against an
expected value.**

    expected = product.kit_code_base + letter_for(catalog_number.format)
    valid    = lot_number.endswith(expected)

`Product.kit_code_base` is administrator-maintained data supplied by Bioeksen,
because it cannot be derived. The format letter is derived, because it can be.

### Why verification rather than extraction

Extraction cannot be made correct, and this is not a matter of finding a better
rule.

`TGHS-PL21L` is a Newcastle Disease Virus assay with base `NDV`, in liquid
format, so its lot ends `NDV` with no format letter. `VGHS-PL20S` is an
MDV1/HVT/CVI988 assay with base `MDV`, in vCAP, so its lot ends `MDVV`.
**A base ending in `V` and a vCAP marker are indistinguishable from outside.**
No amount of pattern refinement resolves that; only knowing the base does.

Two extraction rules were tried against the data before this was clear:

- *Letters only, digits dropped.* Loses information in 31 of 178 lots. It reads
  both `KKEV1V` (cat blood panel 1) and `KKEV2V` (panel 2) as `KKEVV`, making
  two different products indistinguishable, and reduces `H5V` to `HV`, losing
  the influenza subtype.
- *First letter to last letter, digits between kept.* Better — it separates
  those panels and resolves three collisions — but still reads `B2603240309H5`
  as `H`, because the `5` follows the last letter.

A suffix match has neither problem. `endswith("H5")` is true regardless of
where the digits fall.

Trailing digits after the code are batch noise, which the data confirms: the
same product appears as `SYV49` and `SYV1`, and `KKEV1V49` alongside `KKEV1V`.
A suffix match ignores them without needing a rule about them.

### Where the check runs

**At the import boundary, and nowhere else.**

A mismatch flags the row `CONFLICT_REVIEW_REQUIRED` and writes nothing, exactly
as a date conflict does. Public resolution never consults it: refusing a
laboratory its instructions on the strength of an identifier inference is as
much a failure as handing over the wrong document.

### Not a unique identifier

The kit code does not identify a product. `LMONO` belongs to both
`BS-LM-T-100R` and `TGHS-PD03L`, in different product lines; `TV` belongs to
`BS-GE-MX5L-25` and `BS-GE-MX6L-25`. It is a cross-check on a pairing the
importer already has, never a lookup key — which is what the placement above
already implies.

## Consequences

### Positive

- A second, independent signal catches a LOT paired with the wrong catalog
  number at the boundary, where a person can act on it.
- No parsing code, so no parsing bugs and no rule to maintain as formats grow.
- Products without a recorded base are simply unchecked. The feature degrades
  to nothing rather than to false rejections.

### Negative / accepted costs

- 322 products need a base recorded; 57 can be inferred from existing lot data,
  265 must come from Bioeksen. Until they do, most lots go unchecked.
- A wrong base produces false conflicts on every lot for that product. The
  inferred ones should be confirmed rather than trusted.

### Follow-up required

- [ ] Base codes for all products, from the ERP.
- [ ] Four anomalies confirmed as data errors or real exceptions:
      `BS-SY-MX24T-25` yields `SYA`, `BS-HSV-25R` yields `HSVR`,
      `CCHFVD01100` yields `CCHFV` while `CCHFVD0125` yields `CCHFVV`, and
      `GHS-CF03S` yields both `KDHPV` and `KDHPVV`.
- [ ] Whether `GHS-CF03S`, `-CF04S`, `-CF06S` and `-CF07S` should be `VGHS-`.
      All four are "V-Panel" products whose lots end in `V`, which is vCAP
      behaviour under a prefix that should mean lyophilized.

## Alternatives considered

- **Derive the whole code from the catalog number.** Rejected: 9 of 72.
- **A registry of complete kit codes per catalog number.** Rejected: it would
  record 573 values where 322 bases plus one derivation rule suffice, and every
  new pack size would need another entry.
- **Extraction plus comparison.** Rejected: `NDV` versus `MDVV` shows the
  ambiguity is in the data, not in the rule.
