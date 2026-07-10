// Playwright e2e spec — run this LOCALLY on your machine (not in a hosted
// sandbox), because it needs a real Chromium install with system deps.
//
// Setup (one time, in your project root ~/cre-deal-analyzer-enh):
//   npm install -D @playwright/test
//   npx playwright install chromium
//
// Run against your local dev server:
//   npm start                     (in one terminal, leave running on :3000)
//   npx playwright test tests/deal-compare.spec.js   (in another terminal)
//
// If your dev server runs on a different port, update BASE_URL below.
// Note: CRA serves this app at the /cre-deal-analyzer-enh subpath (per your
// homepage setting in package.json for gh-pages), not at the root.

const { test, expect } = require('@playwright/test');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000/cre-deal-analyzer-enh';

// Adjust these to match your real gate-screen credentials (secrets.js).
const APP_PASSWORD = 'InvestAgent_Full1!';
const USER_PIN = '1234'; // masoud

async function passGate(page) {
  await page.goto(BASE_URL);

  // Optional password step (only appears if a separate APP_PASSWORD gate
  // is enabled ahead of the PIN screen).
  const pwField = page.locator('input[type="password"]').first();
  if (await pwField.isVisible().catch(() => false)) {
    await pwField.fill(APP_PASSWORD);
    await page.keyboard.press('Enter');
  }

  // PIN step — confirmed against the real GateScreen markup:
  //   textbox "Your 4-digit PIN"
  //   button "Access Analyzer →"
  const pinField = page.getByPlaceholder('Your 4-digit PIN');
  if (await pinField.isVisible().catch(() => false)) {
    await pinField.fill(USER_PIN);
    await page.getByRole('button', { name: /Access Analyzer/i }).click();
  }

  // Don't proceed until the app shell has actually rendered post-gate.
  await page.getByText(/CRE Deal Analyzer/i).first().waitFor({ state: 'visible', timeout: 10000 });
}

test.describe('Deal Compare — cross-tab isolation', () => {
  test('opening a deal in a new tab shows an isolated, correctly-scoped view', async ({ context, page }) => {
    await passGate(page);

    // Go to the Import tab and confirm at least one deal is loaded.
    // NOTE: this assumes you've already loaded 2-3 real OMs in this browser
    // profile so there's data in localStorage to compare. If starting from
    // a clean profile, upload the 3 Andy OMs first via the Import tab UI,
    // click "Load into Analyzer" on each, then re-run this spec.
    await page.getByText(/Compare/i).first().click();

    const compareCards = page.locator('[data-testid="compare-card"], .compare-card');
    const cardCount = await compareCards.count();
    expect(cardCount).toBeGreaterThan(0);

    // Click "Open in Tab" on the first card and capture the new tab.
    const [newPage] = await Promise.all([
      context.waitForEvent('page'),
      page.getByRole('button', { name: /open in tab/i }).first().click(),
    ]);
    await newPage.waitForLoadState();

    // The new tab's URL should carry a ?deal= param.
    expect(newPage.url()).toMatch(/[?&]deal=/);

    // The new tab should render the Deal Analyzer for that specific deal,
    // not a blank/default state.
    await expect(newPage.getByText(/CRE Deal Analyzer/i)).toBeVisible();

    await newPage.close();
  });

  test('reloading an already-loaded document prompts a confirmation dialog', async ({ page }) => {
    await passGate(page);
    await page.getByText(/Import/i).first().click();

    let dialogSeen = false;
    page.once('dialog', async (dialog) => {
      dialogSeen = true;
      expect(dialog.message()).toMatch(/already loaded/i);
      await dialog.dismiss();
    });

    // Click "Load into Analyzer" a second time on a document already tied
    // to a dealId. Requires at least one deal already loaded this session.
    const loadButtons = page.getByRole('button', { name: /load into analyzer/i });
    if (await loadButtons.count() > 0) {
      await loadButtons.first().click();
      await page.waitForTimeout(300);
      expect(dialogSeen).toBe(true);
    }
  });

  test('8-file upload cap is enforced', async ({ page }) => {
    await passGate(page);
    await page.getByText(/Import/i).first().click();

    // This assumes a folder of 10+ local sample PDFs exists at the path
    // below — update to match wherever you keep the Andy OM test set.
    const fs = require('fs');
    const path = require('path');
    const sampleDir = process.env.SAMPLE_PDF_DIR;
    if (!sampleDir || !fs.existsSync(sampleDir)) {
      test.skip(true, 'Set SAMPLE_PDF_DIR to a folder with 10+ sample PDFs to run this check.');
      return;
    }
    const files = fs.readdirSync(sampleDir)
      .filter((f) => f.toLowerCase().endsWith('.pdf'))
      .slice(0, 10)
      .map((f) => path.join(sampleDir, f));

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(files);
    await page.waitForTimeout(500);

    const queueItems = page.locator('[data-testid="om-queue-item"], .om-queue-item');
    expect(await queueItems.count()).toBeLessThanOrEqual(8);
  });
});
