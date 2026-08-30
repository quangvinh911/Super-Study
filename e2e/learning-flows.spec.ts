import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('starts a practice session and reveals feedback only after checking', async ({ page }) => {
  await page.goto('/practice');
  await expect(page.getByRole('heading', { name: 'Tạo phiên luyện tập' })).toBeVisible();
  await page.getByRole('button', { name: 'Bắt đầu luyện' }).click();

  await expect(page.getByRole('heading', { name: 'Question 1' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Chính xác|Chưa chính xác/ })).toHaveCount(0);
  const practiceOptions = page.locator('.options input');
  await practiceOptions.first().check();
  if ((await practiceOptions.first().getAttribute('type')) === 'checkbox') {
    await practiceOptions.nth(1).check();
  }
  await page.getByRole('button', { name: 'Kiểm tra' }).click();
  await expect(page.getByRole('heading', { name: /Chính xác|Chưa chính xác/ })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Question 1' })).toBeVisible();
});

test('creates a 40-question mock exam and restores it after refresh', async ({ page }) => {
  await page.goto('/mock-exam');
  await page.getByRole('button', { name: 'Bắt đầu thi thử' }).click();

  await expect(page.locator('.navigator-button')).toHaveCount(40);
  await expect(page.getByRole('timer')).toContainText(/\d{2}:\d{2}/);
  await page.locator('.options input').first().check();
  await page.getByRole('button', { name: 'Câu tiếp' }).click();
  await expect(page.getByRole('heading', { name: 'Question 2', exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Question 2', exact: true })).toBeVisible();
});

test('submits a practice session and manages its local progress data', async ({ page }) => {
  await page.goto('/practice');
  await page.getByRole('button', { name: 'Bắt đầu luyện' }).click();
  for (let index = 1; index < 10; index += 1) {
    await page.getByRole('button', { name: 'Câu tiếp' }).click();
  }

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Hoàn thành' }).click();
  await expect(page).toHaveURL(/\/results\//);
  await expect(page.getByRole('heading', { name: /Đã đạt mục tiêu|Chưa đạt mốc 65%/ })).toBeVisible();

  await page.getByRole('link', { name: 'Xem toàn bộ tiến độ' }).click();
  await expect(page.getByRole('heading', { name: 'Các phiên đã hoàn thành' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Xem lại' })).toBeVisible();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export JSON' }).click();
  await download;

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Reset dữ liệu' }).click();
  await expect(page.getByText('Đã xoá toàn bộ dữ liệu học tập trên thiết bị này.')).toBeVisible();
  await expect(page.getByText('Chưa có phiên hoàn thành.')).toBeVisible();
});

for (const [name, route] of [
  ['home', '/'],
  ['practice setup', '/practice'],
  ['mock exam setup', '/mock-exam'],
  ['progress', '/progress'],
  ['methodology', '/methodology'],
] as const) {
  test(`${name} has no serious or critical axe violations`, async ({ page }) => {
    await page.goto(route);
    const results = await new AxeBuilder({ page }).analyze();
    const material = results.violations.filter((violation) =>
      violation.impact === 'serious' || violation.impact === 'critical',
    );
    expect(material).toEqual([]);
  });
}
