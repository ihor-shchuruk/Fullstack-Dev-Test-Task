import { expect, test } from "@playwright/test"
import { logInUser } from "./utils/user"

test.describe("RBAC matrix", () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test("admin sees Metrics in sidebar and can access the page", async ({
    page,
  }) => {
    await logInUser(page, "admin@example.com", "changethis")
    await expect(page.getByRole("link", { name: /metrics/i })).toBeVisible()
    await page.getByRole("link", { name: /metrics/i }).click()
    await expect(page).toHaveURL(/\/metrics$/)
    await expect(page.getByRole("heading", { name: /metrics/i })).toBeVisible()
  })

  test("manager sees Metrics in sidebar and can access the page", async ({
    page,
  }) => {
    await logInUser(page, "manager@example.com", "changethis")
    await expect(page.getByRole("link", { name: /metrics/i })).toBeVisible()
    await page.goto("/metrics")
    await expect(page.getByRole("heading", { name: /metrics/i })).toBeVisible()
  })

  test("member: no Metrics in sidebar; direct nav shows Access denied", async ({
    page,
  }) => {
    await logInUser(page, "member@example.com", "changethis")
    await expect(page.getByRole("link", { name: /metrics/i })).toHaveCount(0)
    await page.goto("/metrics")
    await expect(page).toHaveURL(/\/metrics$/)
    // AccessDenied component contains "Access Denied" text and a 403 prominent display
    await expect(page.getByText(/access denied/i)).toBeVisible()
  })
})
