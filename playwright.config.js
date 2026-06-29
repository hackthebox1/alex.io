import { defineConfig, devices } from "@playwright/test";

const firefoxAndroid = {
  ...devices["Pixel 5"],
  userAgent: "Mozilla/5.0 (Android 14; Mobile; rv:128.0) Gecko/128.0 Firefox/128.0",
};

const braveAndroid = {
  ...devices["Pixel 5"],
  userAgent: `${devices["Pixel 5"].userAgent} Brave/1.74.48`,
};

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  webServer: {
    command: "python3 -m http.server 4173 --bind 127.0.0.1",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop-chrome", use: { ...devices["Desktop Chrome"] } },
    { name: "desktop-firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "desktop-safari", use: { ...devices["Desktop Safari"] } },
    { name: "android-chrome", use: { ...devices["Pixel 5"] } },
    { name: "android-brave", use: braveAndroid },
    { name: "android-firefox", use: firefoxAndroid },
    { name: "iphone-safari", use: { ...devices["iPhone 14"] } },
  ],
});
