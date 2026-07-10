// @ts-check
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000/cre-deal-analyzer-enh',
    headless: true,
    screenshot: 'only-on-failure',
  },
});
