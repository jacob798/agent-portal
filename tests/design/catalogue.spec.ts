import { test, expect } from '@playwright/test';

test('Travel uses fictional data and never calls a backend', async ({ page }) => {
  const apiRequests: string[] = [];
  page.on('request', request => { if (request.url().includes('/api/')) apiRequests.push(request.url()); });
  await page.clock.install({ time: new Date('2030-10-15T12:00:00Z') });
  await page.goto('/iframe.html?id=travel-existing-portal--example&viewMode=story');
  await expect(page.getByRole('heading', { name: 'Travel', exact: true })).toBeVisible();
  await expect(page.getByText('Seattle · Design review', { exact: true })).toBeVisible();
  await page.getByText('Seattle · Design review', { exact: true }).click();
  await expect(page.getByText('Fictional planning workshop', { exact: true })).toBeVisible();
  const status = await page.evaluate(async () => (await fetch('/api/travel/create-trip', { method: 'POST' })).status);
  expect(status).toBe(403);
  expect(apiRequests).toEqual([]);
});

test('empty Travel and disabled component render without services', async ({ page }) => {
  await page.goto('/iframe.html?id=travel-existing-portal--empty&viewMode=story');
  await expect(page.getByRole('heading', { name: 'Travel', exact: true })).toBeVisible();
  await expect(page.getByText('Seattle · Design review', { exact: true })).toHaveCount(0);
  await page.goto('/iframe.html?id=components-button--disabled&viewMode=story');
  await expect(page.getByRole('button', { name: 'Review trip' })).toBeDisabled();
});
