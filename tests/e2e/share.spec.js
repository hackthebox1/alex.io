import { expect, test } from "@playwright/test";

test("creates proposals, accepts incoming dates, saves, shares, and debugs encrypted links", async ({ page, context, browserName }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => {});
  await page.goto("/");

  await page.getByLabel("Shared password").fill("test-password");
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page.getByAltText("Goose climbing mascot for Alex")).toBeVisible();
  await page.getByLabel("Date you want to climb").fill("2026-07-12");
  await page.getByLabel("Note").fill(`${browserName} gym session`);
  await page.getByRole("button", { name: "Add date" }).click();
  await expect(page.getByText("proposed by Alex", { exact: true })).toBeVisible();
  for (let tap = 0; tap < 10; tap += 1) {
    await page.getByRole("button", { name: "Goose mascot surprise" }).click();
  }
  await expect(page.getByAltText("Goose climbing mascot for Alex")).toHaveAttribute("src", /goose-motion\.webp/);
  await expect(page.getByLabel("Debug log output")).toHaveValue(/goose tapped count=10/);
  await expect(page.getByAltText("Goose climbing mascot for Alex")).toHaveAttribute("src", /goose-512\.webp/, { timeout: 6000 });

  await page.getByRole("button", { name: "Save locally" }).click();
  await expect(page.getByRole("status").last()).toContainText("Saved encrypted calendar");

  await page.getByRole("button", { name: "Create encrypted link" }).click();
  await expect(page.getByLabel("Encrypted share URL")).toHaveValue(/#data=.+/);
  await expect(page.getByRole("status").last()).not.toContainText("Could not create");

  const shareUrl = await page.getByLabel("Encrypted share URL").inputValue();
  expect(shareUrl).toContain("#data=");

  await page.goto(shareUrl);
  await page.reload();
  await page.getByLabel("Dan", { exact: true }).check();
  await page.getByLabel("Shared password").fill("test-password");
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page.getByAltText("Rat climbing mascot for Dan")).toBeVisible();
  await expect(page.locator("#goose-received-card")).toBeVisible();
  await expect(page.locator("#goose-received-card")).toContainText("Alex sent Dan a goose");
  await expect(page.getByText("Proposals from Alex")).toBeVisible();
  await page.getByRole("button", { name: "Acceptable", exact: true }).click();
  await expect(page.getByText("Accepted").first()).toBeVisible();
  await expect(page.locator("#accepted-list").getByText("accepted by Dan")).toBeVisible();
  await page.locator("#accepted-list").getByRole("button", { name: "Cancel" }).click();
  await expect(page.locator("#status-changes-list").getByText("canceled by Dan")).toBeVisible();
  await expect(page.getByLabel("Debug log output")).toHaveValue(/local autosave complete/);

  const previousShareUrl = await page.getByLabel("Encrypted share URL").inputValue();
  await page.getByRole("button", { name: "Create encrypted link" }).click();
  await expect(page.getByLabel("Encrypted share URL")).not.toHaveValue(previousShareUrl);
  const canceledShareUrl = await page.getByLabel("Encrypted share URL").inputValue();
  await page.goto(canceledShareUrl);
  await page.reload();
  await page.getByLabel("Alex", { exact: true }).check();
  await page.getByLabel("Shared password").fill("test-password");
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page.locator("#status-changes-list").getByText("canceled by Dan")).toBeVisible();

  const debugText = await page.getByLabel("Debug log output").inputValue();
  expect(debugText).toContain("capabilities");
  expect(debugText).toContain("entries merged");
  await expect(page.getByText("Report a Problem")).toBeVisible();
  await page.getByText("Report a Problem").click();
  await expect(page.getByRole("button", { name: "Copy debug log" })).toBeVisible();
});
