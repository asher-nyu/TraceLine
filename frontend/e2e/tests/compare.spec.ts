import { expect, type Page, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';

const resultFixture = {
  mode: 'line',
  leftText: 'TraceLine shows every meaningful edit.',
  rightText: 'TraceLine shows every meaningful change.',
  operations: [
    {
      type: 'changed',
      left: 'TraceLine shows every meaningful edit.',
      right: 'TraceLine shows every meaningful change.',
      leftSegments: [
        { type: 'equal', text: 'TraceLine shows every meaningful ' },
        { type: 'removed', text: 'edit' },
        { type: 'equal', text: '.' },
      ],
      rightSegments: [
        { type: 'equal', text: 'TraceLine shows every meaningful ' },
        { type: 'added', text: 'change' },
        { type: 'equal', text: '.' },
      ],
    },
    { type: 'equal', left: 'Compare text quickly.', right: 'Compare text quickly.' },
    { type: 'added', right: 'Ship with confidence every time.' },
  ],
  summary: {
    similarityScore: 82.5,
    addedCount: 1,
    removedCount: 0,
    changedCount: 1,
    totalLines: 3,
    addedLines: 1,
    removedLines: 0,
    changedLines: 1,
    totalWords: 13,
    changedWords: 2,
    totalCharacters: 120,
    changedCharacters: 44,
    processingTimeMillis: 4,
  },
};

test.beforeEach(async ({ page }) => {
  await page.route('**/api/compare', async (route) => {
    await route.fulfill({ json: resultFixture });
  });
  await page.route('**/api/export', async (route) => {
    await route.fulfill({
      json: {
        fileName: 'traceline-comparison.html',
        content: '<h1>TraceLine comparison</h1>',
        contentType: 'text/html',
      },
    });
  });
  await page.goto('/');
});

test('compares sample text and renders the side-by-side comparison', async ({ page }) => {
  await fillEditor(page, 'Version A text input', resultFixture.leftText);
  await fillEditor(page, 'Version B text input', resultFixture.rightText);
  await page.getByRole('button', { name: 'Compare', exact: true }).click();

  const table = page.getByRole('table', { name: 'Side-by-side comparison' });
  await expect(table).toBeVisible();
  await expect(
    table.getByRole('cell', { name: 'TraceLine shows every meaningful change.' }),
  ).toBeVisible();
  await expect(table.locator('span.added', { hasText: 'change' })).toBeVisible();
  await expect(table.locator('span.removed', { hasText: 'edit' })).toBeVisible();
  const lineNumbers = await table
    .locator('.result-line-number')
    .evaluateAll((numbers) => numbers.map((number) => number.textContent?.trim() ?? ''));
  expect(lineNumbers).toEqual(['1', '1', '2', '2', '', '3']);
  const lineNumberBoxes = await table.locator('.result-line-number').evaluateAll((numbers) =>
    numbers.map((number) => {
      const rect = number.getBoundingClientRect();
      return {
        text: number.textContent?.trim() ?? '',
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    }),
  );
  const blankLineNumbers = lineNumberBoxes.filter((box) => box.text === '');
  expect(blankLineNumbers.length).toBeGreaterThan(0);
  expect(blankLineNumbers.every((box) => box.height >= box.width)).toBe(true);
  expect(
    lineNumberBoxes.filter((box) => box.text !== '').every((box) => box.height >= box.width),
  ).toBe(true);
  await expect(table.locator('span.added', { hasText: 'change.' })).toHaveCount(0);
});

test('lets numbered line rails grow on wrapped result rows', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 760 });
  await fillEditor(page, 'Version A text input', 'Long Version A text');
  await fillEditor(page, 'Version B text input', 'Long Version B text');
  await page.route('**/api/compare', async (route) => {
    await route.fulfill({
      json: {
        ...resultFixture,
        operations: [
          {
            type: 'changed',
            left: 'This is a deliberately long line that should wrap inside the result table so the visible line number rail has to grow with the row height instead of staying square.',
            right:
              'This is a deliberately long line that should wrap inside the result table so the visible line number rail grows with the content height.',
          },
          {
            type: 'added',
            right:
              'This right-only line is intentionally long enough to wrap while the missing left-side line-number rail grows to the same row height.',
          },
        ],
      },
    });
  });

  await page.getByRole('button', { name: 'Compare', exact: true }).click();
  const boxes = await page.locator('.result-line-number').evaluateAll((numbers) =>
    numbers.map((number) => {
      const rect = number.getBoundingClientRect();
      return {
        text: number.textContent?.trim() ?? '',
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    }),
  );

  const numbered = boxes.filter((box) => box.text !== '');
  const blank = boxes.find((box) => box.text === '');
  expect(numbered.some((box) => box.height > box.width + 10)).toBe(true);
  expect(blank).toBeTruthy();
  expect(blank?.height ?? 0).toBeGreaterThan((blank?.width ?? 0) + 10);
  await expect(page.locator('.result-line-number').first()).toHaveCSS('align-items', 'center');
});

test('exports a HTML report without a format menu', async ({ page }) => {
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles({
      name: 'left-export.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('TraceLine export source'),
    });
  await expect(
    page.getByLabel('Version A file information').getByText('left-export.txt', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Compare', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export' }).click();
  const download = await downloadPromise;
  const path = await download.path();

  expect(download.suggestedFilename()).toBe('traceline-comparison.html');
  expect(path).toBeTruthy();
  const html = readFileSync(path as string, 'utf8');
  expect(html).toContain('Comparison View');
  expect(html).toContain('app-code-editor');
  expect(html).toContain('grid-template-rows: minmax(0, 1fr) !important');
  expect(html).not.toContain('snapshot-editor');
  expect(html).not.toContain('<button');
  expect(html).not.toContain('<input');
  expect(html).not.toContain('class="file-slot"');
  expect(html).not.toContain('left-export.txt');
  expect(html).not.toContain('Upload file');
  expect(html).not.toContain('Swap');
  expect(html).not.toContain('Clear');
  await expect(page.locator('mat-menu')).toHaveCount(0);
});

test('shows an identical message for matching text', async ({ page }) => {
  await page.route('**/api/compare', async (route) => {
    await route.fulfill({
      json: {
        mode: 'line',
        leftText: 'same',
        rightText: 'same',
        operations: [{ type: 'equal', left: 'same', right: 'same' }],
        summary: {
          similarityScore: 100,
          addedCount: 0,
          removedCount: 0,
          changedCount: 0,
          totalLines: 1,
          addedLines: 0,
          removedLines: 0,
          changedLines: 0,
          totalWords: 1,
          changedWords: 0,
          totalCharacters: 4,
          changedCharacters: 0,
          processingTimeMillis: 1,
        },
      },
    });
  });

  await fillEditor(page, 'Version A text input', 'same');
  await fillEditor(page, 'Version B text input', 'same');
  await page.getByRole('button', { name: 'Compare', exact: true }).click();

  await expect(page.getByLabel('Comparison View')).toContainText('Texts are identical.');
  await expect(page.getByRole('table', { name: 'Side-by-side comparison' })).toHaveCount(0);
});

test('keeps the workspace text-only', async ({ page }) => {
  await expect(page.locator('mat-button-toggle[value="json"]')).toHaveCount(0);
  await expect(page.locator('mat-button-toggle[value="markdown"]')).toHaveCount(0);
  await expect(page.getByText('Normalize')).toHaveCount(0);
  await expect(page.getByText('Contrast')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Copy' })).toHaveCount(0);
  await expect(page.locator('mat-button-toggle[value="word"]')).toHaveCount(0);
  await expect(page.locator('mat-button-toggle[value="character"]')).toHaveCount(0);
  await expect(page.locator('mat-button-toggle[value="inline"]')).toHaveCount(0);
});

test('gives clear result guidance before comparison', async ({ page }) => {
  await expect(
    page.getByText('Place one text block on each side to review the differences.'),
  ).toBeVisible();
});

test('shows the copyright footer', async ({ page }) => {
  await expect(
    page.getByText(`Copyright © ${new Date().getFullYear()} Asher Bloom. All rights reserved.`),
  ).toBeVisible();
});

test('does not expose normalization settings', async ({ page }) => {
  await expect(page.getByText('Compare Settings')).toHaveCount(0);
  await expect(page.getByText('Ignore whitespace')).toHaveCount(0);
});

test('mobile layout keeps both editors usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('heading', { name: 'TraceLine' })).toBeVisible();
  await expect(page.getByLabel('Version A text input')).toBeVisible();
  await expect(page.getByLabel('Version B text input')).toBeVisible();
  await expect(page.getByText('Add the text you want to compare')).toBeVisible();
  await expect(page.getByText('Add another text block to compare against')).toBeVisible();
  await expect(page.getByText('Upload file')).toHaveCount(2);
  await expect(page.locator('.file-hint')).toHaveCount(0);

  const leftUpload = page.getByRole('button', { name: 'Upload Version A text-compatible file' });
  await expect(leftUpload).toHaveCount(1);
  await expect(leftUpload).toHaveAttribute('title', /\.json/);
  await expect(leftUpload).toHaveAttribute('title', /25 MB/);
});

test('wraps long editor lines instead of forcing horizontal lines', async ({ page }) => {
  await page.setViewportSize({ width: 760, height: 760 });
  const longText = 'TraceLine-'.repeat(80);
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles({
      name: 'long-line.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(longText),
    });
  await expect(
    page.getByLabel('Version A file information').getByText('long-line.txt', { exact: true }),
  ).toBeVisible();

  const editorMetrics = await page
    .locator('app-code-editor')
    .first()
    .evaluate((editor) => {
      const line = editor.querySelector('.cm-line');
      const scroller = editor.querySelector('.cm-scroller');
      const lineRect = line?.getBoundingClientRect();
      return {
        contentHasWrapClass: Boolean(editor.querySelector('.cm-content.cm-lineWrapping')),
        lineHeight: Math.round(lineRect?.height ?? 0),
        scrollerClientWidth: Math.round(scroller?.clientWidth ?? 0),
        scrollerScrollWidth: Math.round(scroller?.scrollWidth ?? 0),
      };
    });

  expect(editorMetrics.contentHasWrapClass).toBe(true);
  expect(editorMetrics.lineHeight).toBeGreaterThan(40);
  expect(editorMetrics.scrollerScrollWidth).toBeLessThanOrEqual(
    editorMetrics.scrollerClientWidth + 2,
  );
});

test('does not show the logo ideas section', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Logo ideas' })).toHaveCount(0);
  await expect(page.locator('app-logo-gallery')).toHaveCount(0);
});

test('keeps editor fields aligned when only one side has a large uploaded file', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1200, height: 900 });
  const initialSlotHeights = await page
    .locator('.file-slot')
    .evaluateAll((slots) => slots.map((slot) => Math.round(slot.getBoundingClientRect().height)));
  expect(initialSlotHeights).toEqual([0, 0]);

  const largeText = Array.from(
    { length: 520 },
    (_, index) =>
      `line ${index + 1} with enough text to prove the editor scrolls instead of stretching`,
  ).join('\n');
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles({
      name: 'left.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(largeText),
    });
  await expect(
    page.getByLabel('Version A file information').getByText('left.txt', { exact: true }),
  ).toBeVisible();

  const boxes = await page.locator('.drop-zone, app-code-editor').evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        className: element.className,
        tagName: element.tagName.toLowerCase(),
        top: Math.round(rect.top),
        height: Math.round(rect.height),
      };
    }),
  );
  expect(boxes).toHaveLength(4);
  const slotHeights = await page
    .locator('.file-slot')
    .evaluateAll((slots) => slots.map((slot) => Math.round(slot.getBoundingClientRect().height)));
  expect(slotHeights).toEqual([36, 36]);
  const editors = boxes.filter((box) => box.tagName === 'app-code-editor');
  const zones = boxes.filter((box) => String(box.className).includes('drop-zone'));
  expect(editors[0].top).toBe(editors[1].top);
  expect(editors[0].height).toBe(editors[1].height);
  expect(zones[0].height).toBe(zones[1].height);
});

test('aligns the top bar and keeps the active editor unpainted', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  const topbarBox = await page.locator('.topbar-inner').boundingBox();
  const contentBox = await page.locator('.content').boundingBox();

  expect(topbarBox).not.toBeNull();
  expect(contentBox).not.toBeNull();
  expect(Math.abs((topbarBox?.x ?? 0) - (contentBox?.x ?? 0))).toBeLessThanOrEqual(1);
  expect(Math.abs((topbarBox?.width ?? 0) - (contentBox?.width ?? 0))).toBeLessThanOrEqual(1);

  await page.getByLabel('Version A text input').click();
  await expect(page.locator('.cm-activeLine').first()).toHaveCSS(
    'background-color',
    'rgba(0, 0, 0, 0)',
  );
  await expect(page.locator('.cm-focused').first()).toHaveCSS('outline-style', 'none');
  await expect(page.getByText(/\bchars\b/i)).toHaveCount(0);
});

test('has no critical accessibility violations on the main workspace', async ({ page }) => {
  const scan = await new AxeBuilder({ page }).analyze();
  const critical = scan.violations.filter((violation) => violation.impact === 'critical');

  expect(critical).toEqual([]);
});

async function fillEditor(page: Page, label: string, text: string): Promise<void> {
  await page.getByLabel(label).click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
  await page.keyboard.insertText(text);
}
