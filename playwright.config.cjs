const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests',
  testMatch: '*.e2e.cjs',
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: process.env.PREVIEW_URL || 'http://127.0.0.1:8080',
    headless: true,
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox', '--disable-dev-shm-usage', '--no-zygote'] } : {},
    screenshot: 'only-on-failure'
  }
});
