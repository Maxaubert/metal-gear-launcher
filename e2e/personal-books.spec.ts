import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { cp, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

// Original fixture pages keep the entire importer/renderer path under test without distributing books.
function samplePdf(): Buffer {
  const stream = (text: string) => `BT /F1 30 Tf 40 320 Td (${text}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 400] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 400] /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ...["Personal field notes", "Second page of field notes"].map(text => `<< /Length ${stream(text).length} >>\nstream\n${stream(text)}\nendstream`),
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}

async function chooseFiles(app: ElectronApplication, files: string[], canceled = false) {
  await app.evaluate(({ dialog }, value) => {
    dialog.showOpenDialog = async () => ({ canceled: value.canceled, filePaths: value.files });
  }, { files, canceled });
}

async function enterLibrary(page: Page) {
  await expect(page.getByTestId("startup-screen")).toHaveCount(0, { timeout: 20000 });
  await page.keyboard.press("Tab");
  await page.getByTestId("tile-bonus").click();
  await page.getByTestId("bonus-menu-books").click();
  await expect(page.getByTestId("books-screen")).toBeVisible();
}

test("personal PDFs import through the picker, remember pages, survive missing drives and remain user-owned", async () => {
  test.setTimeout(120000);
  const root = await mkdtemp(join(tmpdir(), "hub-personal-books-ui-"));
  const data = join(root, "hub");
  const folder = join(root, "My Books");
  await cp(join(__dirname, "fixtures/assets"), join(data, "assets"), { recursive: true });
  await mkdir(folder, { recursive: true });
  const source = join(folder, "Personal Field Notes.pdf");
  const original = samplePdf();
  await writeFile(source, original);
  const options = {
    args: [join(__dirname, "../out/main/index.js"), "--game", "mgs2"],
    env: { ...process.env, HUB_DATA_DIR: data, HUB_STEAM_ROOT: join(__dirname, "fixtures/steam"), HUB_WINDOWED: "1", HUB_FAKE_LAUNCH: "1" },
  };
  let app = await electron.launch(options);
  try {
    let page = await app.firstWindow();
    await page.setViewportSize({ width: 1920, height: 1080 });
    await enterLibrary(page);
    const imported = async () => {
      const result = await page.evaluate(() => window.hub.getBooksCatalog());
      if (!result.ok) throw new Error(result.error);
      return result.value.filter(entry => entry.importedId);
    };
    expect(await imported()).toHaveLength(0);
    await chooseFiles(app, [], true);
    await page.getByRole("button", { name: "Add Books", exact: true }).click();
    await expect(page.getByTestId("books-screen")).toBeVisible();
    expect(await imported()).toHaveLength(0);

    await chooseFiles(app, [source]);
    await page.getByRole("button", { name: "Add Books", exact: true }).click();
    await expect.poll(async () => (await imported()).length).toBe(1);
    const id = (await imported())[0]!.importedId!;
    const entry = () => page.getByTestId(`book-entry-${id}`);
    await expect(entry()).toContainText("Personal Field Notes");
    await entry().click();
    await expect(page.getByTestId("book-page")).toHaveAttribute("aria-label", "Book page 1");
    await expect(page.getByTestId("book-page").locator("img").first()).toBeVisible();
    expect(await page.getByTestId("book-page").locator("img").first().evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await page.keyboard.press("PageDown");
    await expect(page.getByTestId("book-page")).toHaveAttribute("aria-label", "Book page 2");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("books-screen")).toBeVisible();
    await chooseFiles(app, [source]);
    await page.getByRole("button", { name: "Add Books", exact: true }).click();
    expect(await imported()).toHaveLength(1);
    await expect(entry()).toHaveCount(1);

    // A nested folder import adds only the new file and preserves the existing entry identity.
    const nested = join(folder, "Notes");
    await mkdir(nested);
    await writeFile(join(nested, "Additional Briefing.pdf"), original);
    await writeFile(join(nested, "ignored.txt"), "This is not a book.");
    await chooseFiles(app, [folder]);
    await page.getByRole("button", { name: "Add Folder", exact: true }).click();
    await expect.poll(async () => (await imported()).length).toBe(2).catch(async error => {
      console.log(await page.locator("body").innerText());
      await page.screenshot({ path: "e2e/out/personal-books-import-error.png" });
      throw error;
    });
    expect((await imported()).some(book => book.importedId === id)).toBe(true);

    const secondId = (await imported()).find(book => book.title === "Additional Briefing")!.importedId!;
    const secondEntry = () => page.getByTestId(`book-entry-${secondId}`);
    // Arrow navigation changes the logical selection while DOM focus can remain on the first row.
    for (const confirm of ["Enter", "Space"]) {
      await entry().focus();
      await page.keyboard.press("ArrowDown");
      await expect(secondEntry()).toHaveAttribute("aria-current", "true");
      await page.keyboard.press(confirm);
      await expect(page.getByTestId("book-reader").getByRole("heading", { level: 1 })).toHaveText("Additional Briefing");
      await expect(page.getByTestId("book-page")).toHaveAttribute("aria-label", "Book page 1");
      await page.keyboard.press("Escape");
    }
    // Leaving the toolbar for an aside action must return arrow keys to the book list.
    await entry().focus();
    await page.getByRole("button", { name: "Add Books", exact: true }).focus();
    await page.getByRole("button", { name: "Read Book", exact: true }).focus();
    await page.keyboard.press("ArrowDown");
    await expect(secondEntry()).toHaveAttribute("aria-current", "true");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("book-reader").getByRole("heading", { level: 1 })).toHaveText("Additional Briefing");
    await page.keyboard.press("Escape");

    await app.close();
    app = await electron.launch(options);
    page = await app.firstWindow();
    await page.setViewportSize({ width: 1920, height: 1080 });
    await enterLibrary(page);
    await entry().click();
    await expect(page.getByTestId("book-page")).toHaveAttribute("aria-label", "Book page 2");
    await page.keyboard.press("Escape");
    await rename(source, `${source}.offline`);
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect.poll(async () => (await imported()).find(book => book.importedId === id)?.available).toBe(false);
    await expect(entry()).toBeVisible();
    // The row explains unavailability but still permits activation to show the recovery dialog.
    await entry().click({ force: true });
    await expect(page.getByRole("dialog")).toContainText(/unavailable|not installed|not found/i);
    await expect(page.getByTestId("book-reader")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await rename(`${source}.offline`, source);
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect.poll(async () => (await imported()).find(book => book.importedId === id)?.available).toBe(true);
    await entry().hover();
    await page.screenshot({ path: "e2e/out/personal-books-1080.png" });
    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(page.getByRole("button", { name: "Add Books", exact: true })).toBeInViewport();
    await expect(page.getByRole("button", { name: "Read Book", exact: true })).toBeInViewport();
    expect(await page.getByTestId("books-screen").evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: "e2e/out/personal-books-720.png" });

    await page.getByRole("button", { name: "Remove from Library", exact: true }).click();
    await expect(entry()).toHaveCount(0);
    expect(await readFile(source)).toEqual(original);
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect(entry()).toHaveCount(0);
    expect(await imported()).toHaveLength(1);
  } finally {
    await app.close();
    if (dirname(resolve(root)) !== resolve(tmpdir())) throw new Error("Unexpected fixture directory");
    await rm(root, { recursive: true, force: true });
  }
});
