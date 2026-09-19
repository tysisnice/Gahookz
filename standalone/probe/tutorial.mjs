import puppeteer from "puppeteer";
const BASE = process.env.GAHOOKZ_BASE_URL || "http://127.0.0.1:3199";
const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });
await page.goto(BASE + "/", { waitUntil: "networkidle2" });
// Open the standalone How to play from the welcome screen if present.
const text = await page.evaluate(() => document.body.innerText);
console.log("WELCOME:", text.slice(0, 300).replace(/\n+/g, " | "));
const opened = await page.evaluate(() => {
  const button = [...document.querySelectorAll("button, a")].find((el) => /how to play/i.test(el.textContent || ""));
  if (!button) return false;
  button.click();
  return true;
});
console.log("opened:", opened);
await new Promise((r) => setTimeout(r, 900));
const herd = await page.evaluate(() => {
  const tab = [...document.querySelectorAll(".tutorial-mode-tab")].find((el) => /herd/i.test(el.textContent || ""));
  if (tab) tab.click();
  return Boolean(tab);
});
await new Promise((r) => setTimeout(r, 600));
const report = await page.evaluate(() => {
  const dialog = document.querySelector(".tutorial-dialog");
  const numbers = [...document.querySelectorAll(".tutorial-dialog__step-number")].map((el) => {
    const box = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    const range = document.createRange();
    range.selectNodeContents(el);
    const textBox = range.getBoundingClientRect();
    return {
      text: el.textContent,
      box: { w: Math.round(box.width), h: Math.round(box.height) },
      display: style.display,
      alignItems: style.alignItems,
      justifyContent: style.justifyContent,
      fontSize: style.fontSize,
      lineHeight: style.lineHeight,
      offsetFromCentreX: Math.round((textBox.left + textBox.width / 2) - (box.left + box.width / 2)),
      offsetFromCentreY: Math.round((textBox.top + textBox.height / 2) - (box.top + box.height / 2))
    };
  });
  return { herdTab: Boolean(dialog), dialogClass: dialog?.className, dialogWidth: Math.round(dialog?.getBoundingClientRect().width || 0), numbers };
});
console.log(JSON.stringify(report, null, 1));
await page.screenshot({ path: "/tmp/tutorial-herd.png" });
await browser.close();
