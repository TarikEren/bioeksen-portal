/**
 * FND-08 Languages and formats: AC2, AC3, AC4, on the entry page (DEC-017).
 *
 * Labels come from the dictionaries. The choice is kept in the cookie
 * `bp_lang` for 365 days (stage plan B0, **Contract**, server action
 * `setLanguage`).
 */
import { dictionaries } from "@/lib/i18n/dictionaries";

import { chooseLanguage, languageSwitch } from "../support/language";
import { expect, test } from "./fixtures";

const DAY_SECONDS = 24 * 60 * 60;

test.describe("FND-08 language of the page", () => {
  /** A person without a language cookie gets the page in Turkish, with html lang="tr". */
  test("FND-08.AC2: without a language cookie the page is in Turkish", async ({ page, configuredApp }) => {
    await page.goto(`${configuredApp.baseUrl}/`);

    await expect(page.locator("html")).toHaveAttribute("lang", "tr");
    await expect(page.getByRole("heading", { name: dictionaries.tr.home.title, exact: true })).toBeVisible();
    await expect(languageSwitch(page, "tr")).toBeVisible();
  });

  /** When the person chooses English, the page shows in English, with html lang="en". */
  test("FND-08.AC3: when the person chooses English the page shows in English", async ({ page, configuredApp }) => {
    await page.goto(`${configuredApp.baseUrl}/`);
    await chooseLanguage(page, "tr", "en");

    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { name: dictionaries.en.home.title, exact: true })).toBeVisible();
    await expect(languageSwitch(page, "en")).toBeVisible();
  });

  /** A person who chose English returns and gets the page in English. */
  test("FND-08.AC4: a person who chose English gets English when they return", async ({ page, configuredApp }) => {
    await page.goto(`${configuredApp.baseUrl}/`);
    await chooseLanguage(page, "tr", "en");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");

    const returning = await page.context().newPage();
    await returning.goto(`${configuredApp.baseUrl}/`);

    await expect(returning.locator("html")).toHaveAttribute("lang", "en");
    await expect(returning.getByRole("heading", { name: dictionaries.en.home.title, exact: true })).toBeVisible();
  });

  /** The choice of English is kept in the cookie bp_lang for 365 days. */
  test("FND-08.AC4: the language cookie keeps the choice", async ({ page, configuredApp }) => {
    await page.goto(`${configuredApp.baseUrl}/`);
    const chosenAt = Date.now() / 1000;
    await chooseLanguage(page, "tr", "en");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");

    const cookie = (await page.context().cookies(configuredApp.baseUrl)).find((entry) => entry.name === "bp_lang");
    expect(cookie, "the cookie bp_lang is set").toBeDefined();
    expect(cookie?.value).toBe("en");
    const days = ((cookie?.expires ?? -1) - chosenAt) / DAY_SECONDS;
    expect(days, "the cookie lives for 365 days").toBeGreaterThan(364);
    expect(days, "the cookie lives for 365 days").toBeLessThan(366);
  });

  /** A returning person whose cookie bp_lang says English gets the page in English. */
  test("FND-08.AC4: a returning person gets the language of the language cookie", async ({ browser, configuredApp }) => {
    const context = await browser.newContext();
    await context.addCookies([{ name: "bp_lang", value: "en", url: configuredApp.baseUrl }]);
    const page = await context.newPage();
    await page.goto(`${configuredApp.baseUrl}/`);

    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { name: dictionaries.en.home.title, exact: true })).toBeVisible();
    await context.close();
  });
});
