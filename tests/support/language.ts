/**
 * Drives the language switch of the entry page (FND-08, stage plan B0,
 * **UI**) by role and accessible name only.
 *
 * The contract names the switch's accessible name (`common.language.switch`)
 * and its two choices (`common.language.tr`, `common.language.en`), not the
 * HeroUI component behind it. So the helper accepts each accessible form of a
 * choice of two: the choices as radios, buttons, links or tabs; a native
 * select; or a button or combobox that opens a list of options or menu items.
 */
import { type Locator, type Page, expect } from "@playwright/test";

import { dictionaries } from "@/lib/i18n/dictionaries";

export type Language = keyof typeof dictionaries;

/** The language labels of a dictionary. */
export function languageLabels(language: Language): { readonly switch: string; readonly tr: string; readonly en: string } {
  return dictionaries[language].common.language;
}

/** The language switch, by its accessible name in the language of the page. */
export function languageSwitch(page: Page, pageLanguage: Language): Locator {
  const name = languageLabels(pageLanguage).switch;
  return page
    .getByRole("radiogroup", { name, exact: true })
    .or(page.getByRole("group", { name, exact: true }))
    .or(page.getByRole("combobox", { name, exact: true }))
    .or(page.getByRole("button", { name, exact: true }))
    .or(page.getByRole("navigation", { name, exact: true }))
    .or(page.getByRole("listbox", { name, exact: true }))
    .or(page.getByRole("tablist", { name, exact: true }))
    .first();
}

async function clickFirstVisible(locators: readonly Locator[]): Promise<boolean> {
  for (const locator of locators) {
    const count = await locator.count();
    for (let index = 0; index < count; index += 1) {
      const candidate = locator.nth(index);
      if (await candidate.isVisible()) {
        await candidate.click();
        return true;
      }
    }
  }
  return false;
}

/** Chooses a language with the switch, as a person does. */
export async function chooseLanguage(page: Page, pageLanguage: Language, target: Language): Promise<void> {
  const labels = languageLabels(pageLanguage);
  const choice = labels[target];
  await page.waitForLoadState("networkidle");
  const control = languageSwitch(page, pageLanguage);
  await expect(control, `the language switch "${labels.switch}" is on the page`).toBeVisible({ timeout: 10_000 });

  // The choices are on the page.
  const scope = control;
  const direct = (["radio", "button", "link", "tab", "menuitemradio", "option"] as const).map((role) =>
    scope.getByRole(role, { name: choice, exact: true }),
  );
  if (await clickFirstVisible(direct)) return;

  // A native select.
  if ((await control.evaluate((element) => element.tagName)) === "SELECT") {
    await control.selectOption({ label: choice });
    return;
  }

  // A control that opens a list.
  await control.click();
  const listed = (["option", "menuitemradio", "menuitem", "radio", "link", "button"] as const).map((role) =>
    page.getByRole(role, { name: choice, exact: true }),
  );
  await clickFirstVisible(listed);
}
