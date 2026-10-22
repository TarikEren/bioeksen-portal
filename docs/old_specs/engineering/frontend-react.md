# React and TypeScript Rules

- Colours, type and spacing come from `design-system.md`. Components reference
  semantic tokens (`var(--color-action)`), never hex literals.
- Use TypeScript strict mode.
- Avoid `any` unless there is a documented reason.
- Keep user-facing strings behind localization keys.
- Separate API clients, server DTOs, domain/view models, UI state, and rendering/simulation code.
- Do not reproduce backend-authoritative business rules such as IFU applicability in React.
- Handle loading, empty, error, permission-denied, and stale-version states explicitly.
- Prefer accessible controls and keyboard alternatives for required drag-and-drop tasks.
- Training Studio should be a dedicated backoffice application/feature, not a collection of raw database forms.

Suggested feature structure:

```text
src/features/
  eifu/
  academy/
  products/
  organizations/
  training-studio/
  certificates/
  auth/
```
