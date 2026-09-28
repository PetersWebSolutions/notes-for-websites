const { test, expect } = require('@playwright/test');
const pass = String.fromCharCode(69,108,105,116,101,50,54);
const docsKey = 'team-elite-documents-v1';
// This suite drives the device-local flow — sign in, pick a file, tally — which
// index.html only enters when no Supabase connection is configured. The repo
// may well ship a live one, so the connection file is stubbed rather than
// depending on what happens to be committed in supabase-config.js. Routes are
// per context, so every context the suite opens needs this, including the
// reopened one at the end; without it that context quietly loads the live
// shared list instead of the saved file.
const stub = async (context) => {
  // Only the optional external fonts are stubbed; all app files load over HTTP.
  await context.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:'',contentType:'text/css'}));
  await context.route('https://fonts.gstatic.com/**',route=>route.abort());
  await context.route(/supabase-config\.js/,route=>route.fulfill({body:'window.SUPABASE_CONFIG = { url: "", anonKey: "", listId: "main" };',contentType:'application/javascript'}));
};
for (const width of [390, 1440]) {
  test(`${width}px: sign in → create/open → tally → caret/edit → refresh → reopen → sign out`, async ({ page, context }, testInfo) => {
    await page.setViewportSize({width, height:900});
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await stub(context);
    await page.goto('index.html');
    await expect(page).toHaveURL(/login\.html$/);
    await page.screenshot({path:testInfo.outputPath('01-login.png'),fullPage:true});
    await page.locator('#login-name').fill('Joyce');
    await page.locator('#login-pass').fill(pass);
    await page.locator('#login-btn').click();
    await expect(page).toHaveURL(/lists\.html$/);
    await expect(page.locator('#who')).toHaveText('Signed in as Joyce');
    await page.goto('index.html');
    await expect(page).toHaveURL(/lists\.html$/);
    await page.goto('index.html?doc=missing');
    await expect(page).toHaveURL(/lists\.html$/);
    await page.locator('#file-name').fill('Joyce listing');
    await page.locator('#new-file-btn').click();
    await page.screenshot({path:testInfo.outputPath('02-files.png'),fullPage:true});
    await page.locator('.file-open').click();
    await expect(page).toHaveURL(/index\.html\?doc=/);
    const fileURL=page.url();
    await expect(page.locator('#open-file-name')).toHaveText('Joyce listing');
    await page.locator('#name-input').fill('Ana Reyes');
    await page.locator('#size-input').selectOption('M');
    await page.locator('#qty-input').fill('2');
    await page.locator('#cart-add').click();
    await expect(page.locator('#cart-count')).toHaveText('2 shirts');
    await page.locator('#add-person-btn').click();
    await expect(page.locator('#sum-shirts')).toHaveText('2');
    const row=page.locator('#order-body tr').first();
    await expect(row.locator('[data-cell-input]')).toHaveCount(0);
    if(width<721) {
      await expect(row.locator('.cell-qty').first()).toBeHidden();
      await expect(row.locator('.col-summary')).toBeHidden();
      await row.locator('.expand-btn').click();
      await expect(row.locator('.expand-btn')).toHaveAttribute('aria-expanded','true');
      await expect(row.locator('.cell-qty').first()).toBeVisible();
      await expect(row.locator('.col-summary')).toBeVisible();
      const white=await row.locator('.sz-white').evaluateAll(cells=>cells.map(cell=>cell.getBoundingClientRect()));
      const blue=await row.locator('.sz-blue').evaluateAll(cells=>cells.map(cell=>cell.getBoundingClientRect()));
      // All seven cells of each colour share a line, rather than drifting due to gaps.
      expect(Math.max(...white.map(r=>r.bottom))-Math.min(...white.map(r=>r.y))).toBeLessThan(60);
      expect(Math.max(...blue.map(r=>r.bottom))-Math.min(...blue.map(r=>r.y))).toBeLessThan(60);
      expect(blue[0].y).toBeGreaterThanOrEqual(Math.max(...white.map(r=>r.bottom)));
      await page.locator('#orders').screenshot({path:testInfo.outputPath('03-expanded.png')});
      await row.locator('.expand-btn').click();
      await expect(row.locator('.cell-qty').first()).toBeHidden();
    } else {
      await expect(row.locator('.expand-btn')).toBeHidden();
      await expect(row.locator('.col-summary')).toBeHidden();
      // Bounding boxes prove hidden colgroup does not shift NAME/size/footer.
      const head=await page.locator('#order-head tr').first().locator('.col-name').boundingBox();
      const name=await row.locator('.col-name').boundingBox();
      expect(Math.abs(head.x-name.x)).toBeLessThan(1);
      expect(Math.abs(head.width-name.width)).toBeLessThan(1);
      const size=await page.locator('#order-head .sz-white').first().boundingBox();
      const cell=await row.locator('.sz-white').first().boundingBox();
      expect(Math.abs(size.x-cell.x)).toBeLessThan(1);
      expect(Math.abs(size.width-cell.width)).toBeLessThan(1);
      const footer=await page.locator('#order-foot .sz-white').first().boundingBox();
      expect(Math.abs(size.x-footer.x)).toBeLessThan(1);
      expect(Math.abs(size.width-footer.width)).toBeLessThan(1);
      await page.locator('#orders').screenshot({path:testInfo.outputPath('03-desktop-grid.png')});
    }
    await row.locator('[data-action="toggle"]').click();
    await expect(page.locator('#sum-paid')).toHaveText('₱798');
    await row.locator('[data-action="edit"]').click();
    await expect(row.locator('[data-cell-input]')).toHaveCount(14);
    await row.locator('[data-cell-input="white|M"]').fill('3');
    await row.locator('[data-cell-input="white|M"]').press('Tab');
    await expect(page.locator('#sum-shirts')).toHaveText('3');
    await row.locator('[data-action="edit"]').click();
    await expect(row.locator('[data-cell-input]')).toHaveCount(0);
    await page.reload();
    await expect(page).toHaveURL(fileURL);
    await expect(row.locator('.name-text')).toHaveText('Ana Reyes');
    await expect(page.locator('#sum-shirts')).toHaveText('3');
    await expect(page.locator('#sum-paid')).toHaveText('₱1,197');
    await expect(page.locator('#open-file-name')).toHaveText('Joyce listing');
    if(width<721) {
      await expect(row.locator('.cell-qty').first()).toBeHidden();
      await row.locator('.expand-btn').click();
      await expect(row.locator('.sum-qty')).toHaveText('×3');
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    }
    await page.locator('.back-link').click();
    await expect(page.locator('.file-meta')).toHaveText('1 person · 3 shirts · by Joyce');
    await page.locator('#file-name').fill('Second file');
    await page.locator('#new-file-btn').click();
    await page.locator('.file-item').filter({hasText:'Second file'}).locator('.file-open').click();
    await expect(page.locator('#sum-shirts')).toHaveText('0');
    await page.goto(fileURL);
    await expect(page.locator('#sum-shirts')).toHaveText('3');
    const profile=await context.storageState();
    const reopened=await context.browser().newContext({storageState:profile, viewport:{width,height:900}});
    await stub(reopened);
    const newPage=await reopened.newPage();
    await newPage.goto(fileURL);
    await expect(newPage.locator('#sum-shirts')).toHaveText('3');
    await reopened.close();
    await page.goto('login.html');
    await expect(page).toHaveURL(/lists\.html$/);
    await page.locator('#signout-btn').click();
    await expect(page).toHaveURL(/login\.html$/);
    await page.goto('lists.html');
    await expect(page).toHaveURL(/login\.html$/);
    expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).length,docsKey)).toBe(2);
    expect(errors).toEqual([]);
  });
}
