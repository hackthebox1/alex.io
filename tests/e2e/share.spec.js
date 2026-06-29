import { expect, test } from "@playwright/test";

test("creates, copies, saves, and debugs encrypted share links", async ({ page, context, browserName }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => {});
  await page.goto("/");

  await page.getByLabel("Shared password").fill("test-password");
  await page.getByRole("button", { name: "Unlock" }).click();
  await page.getByLabel("Date Alex wants to climb with Dan").fill("2026-07-12");
  await page.getByLabel("Note").fill(`${browserName} gym session`);
  await page.getByRole("button", { name: "Add date" }).click();

  await page.getByRole("button", { name: "Save locally" }).click();
  await expect(page.getByRole("status").last()).toContainText("Saved encrypted calendar");

  await page.getByRole("button", { name: "Create encrypted link" }).click();
  await expect(page.getByLabel("Encrypted share URL")).toHaveValue(/#data=.+/);
  await expect(page.getByRole("status").last()).not.toContainText("Could not create");

  const shareUrl = await page.getByLabel("Encrypted share URL").inputValue();
  expect(shareUrl).toContain("#data=");

  const debugText = await page.locator("#debug-log").innerText();
  expect(debugText).toContain("capabilities");
  expect(debugText).toContain("copy start");
});
