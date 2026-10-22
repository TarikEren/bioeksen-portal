import { useLocale } from "@heroui/react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LANGUAGES } from "./languages";
import { LocaleProvider, useLanguage } from "./locale-provider";

function Probe() {
  const language = useLanguage();
  const { locale } = useLocale();
  return <p data-testid="probe">{`${language}|${locale}`}</p>;
}

// Source: R-023; sds-nextjs-frontend §5 (one provider at the root, the same locale for HeroUI).
describe("LocaleProvider", () => {
  afterEach(cleanup);

  it.each(LANGUAGES)("gives the language %s to the components and the same locale to HeroUI", (language) => {
    render(
      <LocaleProvider language={language}>
        <Probe />
      </LocaleProvider>,
    );

    expect(screen.getByTestId("probe").textContent).toBe(`${language}|${language}`);
  });

  it("throws when useLanguage runs without a provider", () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      expect(() => render(<Probe />)).toThrow(/LocaleProvider/);
    } finally {
      quiet.mockRestore();
    }
  });
});
