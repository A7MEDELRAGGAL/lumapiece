import { test, expect } from '@playwright/test';

test('catalog exposes playable puzzles and the together flow', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'All puzzles' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Play now/ }).first()).toBeVisible();
  await page.getByRole('button', { name: /Play now/ }).first().click();
  await expect(page.getByRole('button', { name: 'Edges' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Fullscreen' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Hint' })).toBeVisible();
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible();
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  await page.getByRole('button', { name: /Exit game/ }).click();
  await page.getByRole('button', { name: 'Create a room' }).first().click();
  await expect(page.getByRole('heading', { name: 'Same puzzle, different places.' })).toBeVisible();
  await page.getByLabel('Nickname').fill('Amina');
  await page.locator('#room-difficulty').selectOption('hard');
  await page.locator('#room-piece-count').selectOption('25');
  await page.getByRole('button', { name: 'Create a room' }).last().click();
  await expect(page.locator('#room-badge')).toContainText('Room');
  await expect(page.locator('#piece-status')).toHaveText('0 / 25');
  await expect(page.locator('#player-category')).toContainText('Hard');
});

test('personalization and custom puzzle entry points work', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Add favorite' }).first().click();
  await expect(page.getByRole('button', { name: 'Remove favorite' }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Make a puzzle' }).first().click();
  await expect(page.getByRole('heading', { name: 'Make a LumaPiece.' })).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).first().click();
  await page.getByRole('button', { name: 'Toggle theme' }).click();
  await expect(page.locator('body')).toHaveClass(/night/);
  await page.getByRole('button', { name: 'عربي', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
});

test('modal escape and catalog modes remain usable', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.puzzle-card img').first()).toHaveAttribute('src', /^\/scenes\/[\w-]+\.jpg$/);
  await page.getByRole('button', { name: 'Make a puzzle' }).first().click();
  await expect(page.getByRole('heading', { name: 'Make a LumaPiece.' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Make a LumaPiece.' })).toBeHidden();
  await page.getByRole('button', { name: 'Challenging' }).click();
  await expect(page.locator('#puzzle-grid .puzzle-card')).toHaveCount(6);
});

test('settings open, persist toggles, and close with escape', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await page.locator('#setting-sound').uncheck();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeHidden();
  await page.reload();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.locator('#setting-sound')).not.toBeChecked();
});

test('onboarding shows once and the manifest is linked', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#onboarding')).toBeVisible();
  await page.getByRole('button', { name: 'Got it' }).click();
  await expect(page.locator('#onboarding')).toBeHidden();
  await page.reload();
  await expect(page.locator('#onboarding')).toBeHidden();
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
});

test('admin spa route loads and navigates back to home', async ({ page }) => {
  await page.goto('/#admin');
  await expect(page.getByRole('heading', { name: 'Room administration' })).toBeVisible();
  await expect(page.locator('#admin-token-input')).toBeVisible();
  await page.getByRole('link', { name: /Back to collection/ }).click();
  await expect(page.getByRole('heading', { name: 'All puzzles' })).toBeVisible();
});
