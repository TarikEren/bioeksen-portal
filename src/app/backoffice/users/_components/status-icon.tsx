/**
 * The icon of the status of a user: a check for an active account, a minus in a
 * circle for an inactive one (DEC-019, `sds-nextjs-frontend` §5 Icons).
 *
 * Inline SVG with `currentColor`, so the token of the chip decides the color and
 * the icon follows the theme. It is `aria-hidden`: the text label beside it names
 * the state, so the state is never shown by color or by icon alone. The list and
 * the detail page both use it.
 */
interface StatusIconProps {
  readonly isActive: boolean;
}

export function StatusIcon({ isActive }: StatusIconProps) {
  return (
    <svg aria-hidden="true" fill="none" width="14" height="14" viewBox="0 0 24 24">
      {isActive ? (
        <path d="m5 12.5 4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <>
          <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="2" />
          <path d="M8 12h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}
