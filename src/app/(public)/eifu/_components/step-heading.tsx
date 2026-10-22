"use client";

/**
 * The heading of a step of the lookup page (IFU-70.AC10, FND-09.AC4).
 *
 * Each step replaces the one before it, so focus would fall to the page when the
 * old form leaves. After a step, focus goes to the heading of the new step, and a
 * screen reader reads it. The heading takes focus only when `focusOnMount` is
 * true: the first step must not take focus when the page opens. The heading is
 * HeroUI's `Typography.Heading` with `tabIndex={-1}`, so a script can focus it and
 * the Tab key does not stop on it.
 */
import { Typography } from "@heroui/react";
import { type ReactNode, useEffect, useRef } from "react";

interface StepHeadingProps {
  readonly children: ReactNode;
  readonly focusOnMount: boolean;
}

export function StepHeading({ children, focusOnMount }: StepHeadingProps) {
  const heading = useRef<HTMLElement>(null);

  useEffect(() => {
    if (focusOnMount) {
      heading.current?.focus();
    }
  }, [focusOnMount]);

  return (
    <Typography.Heading ref={heading} level={2} weight="semibold" tabIndex={-1} className="min-w-0">
      {children}
    </Typography.Heading>
  );
}
