/**
 * The place where a success that stays on the page is announced
 * (`sds-nextjs-frontend` §7 Forms rule 10).
 *
 * The status region is always rendered and only its content changes, because
 * some screen readers announce a status region only when it exists before its
 * text does. HeroUI's `Alert` has no role of its own, so the region has it. A
 * composition of an `Alert` with text from the dictionary.
 */
import { Alert } from "@heroui/react";

interface DoneNoticeProps {
  /** The text of the success, or `null` while there is none. */
  readonly message: string | null;
}

export function DoneNotice({ message }: DoneNoticeProps) {
  return (
    <div role="status">
      {message === null ? null : (
        <Alert status="success">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>{message}</Alert.Title>
          </Alert.Content>
        </Alert>
      )}
    </div>
  );
}
