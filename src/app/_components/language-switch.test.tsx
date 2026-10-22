import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { setLanguage as setLanguageAction } from "@/app/_actions/language";
import { dictionaries, fmt } from "@/lib/i18n";

const refresh = vi.fn();
// Typed to the action: a change of its result or its argument breaks this build (`sds-testing`, Type safety).
const setLanguage = vi.fn<typeof setLanguageAction>();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/app/_actions/language", () => ({
  setLanguage: (...args: Parameters<typeof setLanguageAction>): ReturnType<typeof setLanguageAction> =>
    setLanguage(...args),
}));

const { LanguageSwitch } = await import("./language-switch");

const text = dictionaries.tr;
const labels = {
  switch: text.common.language.switch,
  tr: text.common.language.tr,
  en: text.common.language.en,
  failure: text.common.language.failure,
  errorCode: text.common.errorCode,
  errors: text.common.errors,
  callFailed: text.common.callFailed,
};

// Source: FND-08 AC3, AC4; DEC-122 (a failure shows the localized text and the code, never the message).
describe("LanguageSwitch", () => {
  afterEach(() => {
    cleanup();
    refresh.mockReset();
    setLanguage.mockReset();
  });

  it("names the group common.language.switch and marks the active language", () => {
    render(<LanguageSwitch current="tr" labels={labels} />);

    const group = screen.getByRole("radiogroup", { name: labels.switch });
    expect(group).not.toBeNull();
    expect(screen.getByRole("radio", { name: labels.tr }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radio", { name: labels.en }).getAttribute("aria-checked")).toBe("false");
  });

  it("calls setLanguage with the chosen language and refreshes the route", async () => {
    setLanguage.mockResolvedValue({ status: "ok" });
    render(<LanguageSwitch current="tr" labels={labels} />);

    await userEvent.click(screen.getByRole("radio", { name: labels.en }));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(setLanguage).toHaveBeenCalledExactlyOnceWith("en");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  // Source: R-016 (aria-busy must reach the DOM; React Aria drops it from the group).
  it("sets aria-busy on the wrapper while the action runs, and clears it after", async () => {
    let finish: (result: Awaited<ReturnType<typeof setLanguageAction>>) => void = () => undefined;
    setLanguage.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    render(<LanguageSwitch current="tr" labels={labels} />);
    const wrapper = screen.getByRole("radiogroup", { name: labels.switch }).parentElement;
    expect(wrapper?.getAttribute("aria-busy")).toBe("false");

    await userEvent.click(screen.getByRole("radio", { name: labels.en }));

    await waitFor(() => expect(wrapper?.getAttribute("aria-busy")).toBe("true"));
    finish({ status: "ok" });
    await waitFor(() => expect(wrapper?.getAttribute("aria-busy")).toBe("false"));
  });

  // Source: R-018, DEC-018 (WCAG 3.1.2): the name of a language is in that language.
  it("marks the name of each language with its own lang", () => {
    render(<LanguageSwitch current="tr" labels={labels} />);

    expect(screen.getByText(labels.tr).getAttribute("lang")).toBe("tr");
    expect(screen.getByText(labels.en).getAttribute("lang")).toBe("en");
  });

  it("does not call the action when the active language is chosen again", async () => {
    render(<LanguageSwitch current="tr" labels={labels} />);

    await userEvent.click(screen.getByRole("radio", { name: labels.tr }));

    expect(setLanguage).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  // Source: R-017, R-024: the sentence is by code, in the title; the code is in the description.
  it("shows the sentence for the code in the title and the code in the description, not the message", async () => {
    setLanguage.mockResolvedValue({
      status: "fail",
      code: "VAL-4002",
      message: "internal detail",
      details: {},
    });
    render(<LanguageSwitch current="tr" labels={labels} />);

    await userEvent.click(screen.getByRole("radio", { name: labels.en }));

    const alert = await screen.findByRole("alert");
    const sentence = within(alert).getByText(text.common.errors["VAL-4002"]);
    const codePart = within(alert).getByText(fmt(labels.errorCode, { code: "VAL-4002" }));
    expect(sentence.className).toContain("alert__title");
    expect(codePart.className).toContain("alert__description");
    expect(alert.textContent).not.toContain("internal detail");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("shows a different sentence for each code of the map", async () => {
    const sentences = new Set<string>();
    for (const code of ["VAL-4001", "VAL-4002", "SYS-5000"] as const) {
      setLanguage.mockResolvedValueOnce({ status: "fail", code, message: "m", details: {} });
      const view = render(<LanguageSwitch current="tr" labels={labels} />);
      await userEvent.click(screen.getByRole("radio", { name: labels.en }));
      const alert = await screen.findByRole("alert");
      expect(within(alert).getByText(text.common.errors[code])).not.toBeNull();
      sentences.add(text.common.errors[code]);
      view.unmount();
    }
    expect(sentences.size).toBe(3);
  });

  it("falls back to the sentence of the action for a code with no entry in the map", async () => {
    setLanguage.mockResolvedValue({ status: "fail", code: "DB-5000", message: "m", details: {} });
    render(<LanguageSwitch current="tr" labels={labels} />);

    await userEvent.click(screen.getByRole("radio", { name: labels.en }));

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText(labels.failure)).not.toBeNull();
    expect(within(alert).getByText(fmt(labels.errorCode, { code: "DB-5000" }))).not.toBeNull();
  });

  // Source: DEC-122 (a call that gets no envelope shows the localized text of a failed call, with no code); R-002.
  it("shows the localized text of a failed call, with no code and no message, when the action rejects", async () => {
    setLanguage.mockRejectedValue(new Error("fetch failed: socket hang up"));
    render(<LanguageSwitch current="tr" labels={labels} />);

    await userEvent.click(screen.getByRole("radio", { name: labels.en }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(labels.callFailed);
    expect(alert.textContent).not.toContain("socket hang up");
    expect(alert.textContent).not.toMatch(/[A-Z]+-\d{4}/);
    expect(refresh).not.toHaveBeenCalled();
    // The page stays: the rejection did not reach an error boundary.
    expect(screen.getByRole("radiogroup", { name: labels.switch })).not.toBeNull();
  });

  it("clears the failure after a later change succeeds", async () => {
    setLanguage.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ status: "ok" });
    render(<LanguageSwitch current="tr" labels={labels} />);

    await userEvent.click(screen.getByRole("radio", { name: labels.en }));
    await screen.findByRole("alert");
    await userEvent.click(screen.getByRole("radio", { name: labels.en }));

    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
