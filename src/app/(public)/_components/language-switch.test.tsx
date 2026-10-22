import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { setLanguage as setLanguageAction } from "@/app/_actions/language";
import { dictionaries } from "@/lib/i18n";

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

  it("does not call the action when the active language is chosen again", async () => {
    render(<LanguageSwitch current="tr" labels={labels} />);

    await userEvent.click(screen.getByRole("radio", { name: labels.tr }));

    expect(setLanguage).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("shows the localized sentence and the code of a failure, not the message", async () => {
    setLanguage.mockResolvedValue({
      status: "fail",
      code: "SYS-5000",
      message: "internal detail",
      details: {},
    });
    render(<LanguageSwitch current="tr" labels={labels} />);

    await userEvent.click(screen.getByRole("radio", { name: labels.en }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(labels.failure);
    expect(alert.textContent).toContain(`${labels.errorCode}: SYS-5000`);
    expect(alert.textContent).not.toContain("internal detail");
    expect(refresh).not.toHaveBeenCalled();
  });

  // Source: DEC-122 (a call that gets no envelope shows the localized text of a failed call, with no code); R-002.
  it("shows the localized text of a failed call, with no code and no message, when the action rejects", async () => {
    setLanguage.mockRejectedValue(new Error("fetch failed: socket hang up"));
    render(<LanguageSwitch current="tr" labels={labels} />);

    await userEvent.click(screen.getByRole("radio", { name: labels.en }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(labels.callFailed);
    expect(alert.textContent).not.toContain("socket hang up");
    expect(alert.textContent).not.toContain(labels.errorCode);
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
