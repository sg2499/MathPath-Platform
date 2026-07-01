import { test, expect } from '@playwright/test';

test.describe('Leaderboard & Achievements Visual Regression', () => {
  // Use a fixed viewport for consistent visual snapshots
  test.use({ viewport: { width: 1280, height: 720 } });

  test.beforeEach(async ({ page }) => {
    // Navigate and authenticate as a test student
    // (Assuming a test login endpoint or cookie injection exists in this project)
    await page.goto('/login');
    // Using a mocked/test user account that has unlocked badges and leaderboard stats
    await page.fill('input[type="email"]', 'test_student@mathpath.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForURL('/student/dashboard');
  });

  test('Trophy Room - Badges should not be purged by Tailwind CSS', async ({ page }) => {
    await page.goto('/student/achievements');
    
    // Wait for the badges grid to render
    const badgeGrid = page.locator('.math-card').first();
    await expect(badgeGrid).toBeVisible();

    // Mask out dynamic elements (like timestamps) before snapshotting to prevent flaky tests
    await expect(page).toHaveScreenshot('trophy-room-badges.png', {
      mask: [page.locator('.timestamp'), page.locator('img.avatar')],
      fullPage: true,
    });
  });

  test('Cumulative Leaderboard - Should display standardized scores (out of 100)', async ({ page }) => {
    await page.goto('/student/competition/leaderboard');
    
    // Wait for the leaderboard table to populate
    const leaderboardTable = page.locator('table');
    await expect(leaderboardTable).toBeVisible();

    // Assert that the Avg Score column headers are rendering correctly
    await expect(page.getByText('Avg Score')).toBeVisible();

    // Take a visual snapshot of the podium and the table
    await expect(page).toHaveScreenshot('cumulative-leaderboard-podium.png', {
      mask: [page.locator('img.avatar')],
      fullPage: true,
    });
  });
});
