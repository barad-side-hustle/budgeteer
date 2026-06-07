import fs from "node:fs/promises";
import path from "node:path";
import puppeteer from "puppeteer";

const APP_URL = "http://127.0.0.1:3000";
const OUT_DIR = path.resolve(
  new URL(".", import.meta.url).pathname,
  "../website/src/assets/screenshots",
);

const VIEWPORT = { width: 1600, height: 1100, deviceScaleFactor: 2 };

const SCREENS = [
  {
    name: "home-light.png",
    path: "/",
    theme: "light",
  },
  {
    name: "dashboard-light.png",
    path: "/budget",
    theme: "light",
  },
  {
    name: "dashboard-dark.png",
    path: "/",
    theme: "dark",
  },
  {
    name: "transactions-light.png",
    path: "/transactions",
    theme: "light",
  },
  {
    name: "setup-bank-light.png",
    path: "/settings/bank",
    theme: "light",
    afterLoad: async (page) => {
      await page.evaluate(() => {
        document.body.click();
      });
      await new Promise((r) => setTimeout(r, 300));
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll("button, a"));
        const addBtn = btns.find((b) => /add bank/i.test(b.textContent || ""));
        if (addBtn) addBtn.click();
      });
      await new Promise((r) => setTimeout(r, 600));
    },
  },
];

const setTheme = async (page, theme) => {
  await page.evaluate((t) => {
    const html = document.documentElement;
    html.classList.remove("light", "dark");
    html.classList.add(t);
    try {
      localStorage.setItem("theme", t);
    } catch {}
  }, theme);
};

(async () => {
  await fs.mkdir(OUT_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    headless: "new",
    defaultViewport: VIEWPORT,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport(VIEWPORT);

    await page.goto(APP_URL, { waitUntil: "networkidle2", timeout: 15000 });

    for (const screen of SCREENS) {
      const dest = path.join(OUT_DIR, screen.name);
      console.log(`Capturing ${screen.name} ← ${screen.path} (${screen.theme}) → ${dest}`);

      await setTheme(page, screen.theme);
      await page.goto(`${APP_URL}${screen.path}`, {
        waitUntil: "networkidle2",
        timeout: 20000,
      });
      await setTheme(page, screen.theme);

      if (screen.injectCss) {
        await page.addStyleTag({ content: screen.injectCss });
      }

      await new Promise((r) => setTimeout(r, 1200));

      if (typeof screen.afterLoad === "function") {
        await screen.afterLoad(page);
      }

      await page.screenshot({ path: dest, fullPage: false });
      console.log(`  ✓ saved`);
    }
  } finally {
    await browser.close();
  }

  console.log("\nDone. Files in:", OUT_DIR);
})().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
