import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { toeicFixture } from '../src/app/core/testing/toeic-fixture';

test('catalog and empty TOEIC flows are distinct from CTFL, including deep links', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Bạn muốn luyện chứng chỉ nào?' })).toBeVisible();
  await page.getByRole('link', { name: 'Mở TOEIC', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Chưa có bộ đề TOEIC' })).toBeVisible();
  await page.getByRole('link', { name: 'Luyện tập TOEIC', exact: true }).click();
  await expect(page.locator('#part option')).toHaveCount(8);
  await expect(page.locator('#chapter')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Bắt đầu luyện', exact: true })).toBeDisabled();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Chưa có bộ đề TOEIC' })).toBeVisible();
  await page.goto('/certificates/toeic/mock-exam');
  await expect(page.getByRole('button', { name: 'Bắt đầu thi thử' })).toBeDisabled();
  await expect(page.getByText('26 / 40', { exact: true })).toHaveCount(0);
  await expect(page.getByText('45 phút', { exact: true })).toBeVisible();
  await page.goto('/certificates/toeic/methodology');
  await expect(
    page.getByRole('heading', { name: 'Luyện tập theo cấu trúc TOEIC Listening & Reading' }),
  ).toBeVisible();
});

test('certificate switching and TOEIC reset preserve an existing CTFL session and bookmark', async ({
  page,
}) => {
  await page.goto('/practice');
  await expect(page).toHaveURL(/\/certificates\/ctfl\/practice$/);
  await page.getByRole('button', { name: 'Bắt đầu luyện', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Question 1', exact: true })).toBeVisible();
  const sessionUrl = page.url();
  await page.getByRole('button', { name: 'Đánh dấu', exact: true }).click();
  await page.getByRole('button', { name: 'Câu tiếp', exact: true }).click();
  await page.getByRole('combobox', { name: 'Chọn chứng chỉ' }).selectOption('toeic');
  await page
    .locator('#primary-navigation')
    .getByRole('link', { name: 'Tiến độ', exact: true })
    .click();
  await expect(page.getByText('Chưa có phiên hoàn thành.', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Tiếp tục', exact: true })).toHaveCount(0);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Reset dữ liệu' }).click();
  await page.getByRole('combobox', { name: 'Chọn chứng chỉ' }).selectOption('ctfl');
  await page.getByRole('link', { name: 'Tiếp tục', exact: true }).click();
  await expect(page).toHaveURL(sessionUrl);
  await expect(page.getByRole('heading', { name: 'Question 2', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Câu trước', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Đã đánh dấu', exact: true })).toBeVisible();
  const id = sessionUrl.split('/').at(-1);
  await page.goto(`/practice/${id}`);
  await expect(page.getByRole('heading', { name: 'Question 1', exact: true })).toBeVisible();
});

test('TOEIC fixture exercises practice, grouped audio, section timers and raw results', async ({
  page,
}) => {
  const bank = toeicFixture();
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  await page.route('**/data/toeic/*.json', async (route) => {
    const url = route.request().url();
    const body = url.endsWith('manifest.json')
      ? bank.manifest
      : url.endsWith('questions.json')
        ? {
            schemaVersion: '1.0.0',
            bankVersion: bank.manifest.bankVersion,
            questions: bank.questions,
          }
        : {
            schemaVersion: '1.0.0',
            bankVersion: bank.manifest.bankVersion,
            solutions: bank.solutions,
          };
    await route.fulfill({ json: body });
  });
  await page.goto('/certificates/toeic/practice');
  await page.locator('#part').selectOption('part-3');
  await page.getByRole('button', { name: 'Bắt đầu luyện', exact: true }).click();
  await expect(page.locator('audio')).toHaveCount(1);
  await expect(page.getByText('Synthetic explanation for testing.', { exact: true })).toHaveCount(
    0,
  );
  await page.locator('.options input').first().check();
  await page.getByRole('button', { name: 'Kiểm tra', exact: true }).click();
  await expect(page.getByText('Synthetic explanation for testing.', { exact: true })).toBeVisible();
  await page.clock.install();
  await page.goto('/certificates/toeic/mock-exam');
  await page.getByRole('button', { name: 'Bắt đầu thi thử', exact: true }).click();
  await expect(page.locator('.navigator-button')).toHaveCount(200);
  await expect(page.locator('.navigator-button').nth(100)).toBeDisabled();
  await page.locator('.options input').first().check();
  await page.getByRole('button', { name: 'Xem lại sau', exact: true }).click();
  await page.clock.fastForward(45 * 60_000);
  await expect(page.getByRole('heading', { name: 'Question 101', exact: true })).toBeVisible();
  await expect(page.locator('.navigator-button').first()).toBeDisabled();
  await page.clock.fastForward(75 * 60_000);
  await expect(page).toHaveURL(/\/certificates\/toeic\/results\//, { timeout: 15000 });
  await expect(page.getByRole('heading', { name: 'Kết quả luyện thi', exact: true })).toBeVisible();
  await expect(
    page.getByText('Số câu đúng · không quy đổi điểm chứng chỉ', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Kết quả theo Part' })).toBeVisible();
  await expect(page.getByText(/Mốc đạt:/)).toHaveCount(0);
  expect(browserErrors).toEqual([]);
});

test('reset closes the current CTFL exam so Back cannot restore deleted progress', async ({
  page,
}) => {
  await page.goto('/mock-exam');
  await page.getByRole('button', { name: 'Bắt đầu thi thử' }).click();
  await expect(page.locator('.navigator-button')).toHaveCount(40);
  const sessionUrl = page.url();
  await page
    .locator('#primary-navigation')
    .getByRole('link', { name: 'Tiến độ', exact: true })
    .click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Reset dữ liệu' }).click();
  await page.goBack();
  await expect(page).toHaveURL(sessionUrl);
  await expect(page.getByRole('heading', { name: 'Bài thi không khả dụng' })).toBeVisible();
});

test('TOEIC setup has no serious accessibility issues and reflows on mobile', async ({ page }) => {
  await page.goto('/certificates/toeic/practice');
  await expect(page.getByRole('heading', { name: 'Chưa có bộ đề TOEIC' })).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter((item) => item.impact === 'serious' || item.impact === 'critical'),
  ).toEqual([]);
  await page.setViewportSize({ width: 320, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
