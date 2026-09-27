import { expect, test } from '@playwright/test';

test('restores an active practice session while offline after first synchronization', async ({
  context,
  page,
}) => {
  await page.goto('/practice');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);

  await page.getByRole('button', { name: 'Bắt đầu luyện' }).click();
  await expect(page.getByRole('heading', { name: 'Question 1' })).toBeVisible();
  const sessionUrl = page.url();

  await context.setOffline(true);
  await page.reload();
  await expect(page).toHaveURL(sessionUrl);
  await expect(page.getByRole('heading', { name: 'Question 1' })).toBeVisible();
  await page.goto('/certificates/toeic/practice');
  await expect(page.getByRole('heading', { name: 'Chưa có bộ đề TOEIC' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Bắt đầu luyện', exact: true })).toBeDisabled();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Chưa có bộ đề TOEIC' })).toBeVisible();
  await context.setOffline(false);
});
