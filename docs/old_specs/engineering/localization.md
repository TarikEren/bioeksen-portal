# Localization

## Languages

Initial UI locales:

- Turkish (`tr`)
- English (`en`)

## Engineering language

Use English for:

- Python/TypeScript identifiers
- class/function/variable names
- database technical names
- API paths/fields/codes
- comments/docstrings
- logs
- developer documentation
- tests
- commit/PR technical text

Turkish labels run 15-30% longer than their English equivalents. Test layouts
at the Turkish string. See `design-system.md`.

## Static UI

Do not hard-code user-facing Turkish or English strings in components. Use translation keys.

## Academy content

Course titles, descriptions, instructions, feedback, questions, answer text, and other authored content are localized business data and should be authorable in Turkish and English in Training Studio.

## e-IFU languages

Each available IFU language is a controlled file. Present all available language files for the resolved version. Do not silently substitute a regulatory document language.

## Data representation

Store canonical dates/times and format them for locale in the UI. Do not store localized date strings as source data.

Authored content is stored as localized JSONB keyed by locale; see `data-model-fields.md` and **ADR-0009**. Static UI strings use translation keys and are checked by `scripts/validate_translations.py`.
