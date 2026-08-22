/* v20260821h validation: review image fix + order status expansion + lead-order link */
const { chromium } = require('playwright');

const BASE = 'http://127.0.0.1:18921';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errs = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') errs.push(msg.text());
  });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // 1. Login
  await page.evaluate(() => sessionStorage.setItem('app_access_ok', '1'));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // 2. Check version
  const ver = await page.evaluate(() => typeof APP_VERSION !== 'undefined' ? APP_VERSION : 'N/A');
  console.log(`[Version] ${ver}`);
  if (ver !== '20260821h') errs.push('Version mismatch: ' + ver);

  // 3. Navigate to orders
  await page.click('text=订单管理');
  await page.waitForTimeout(1000);

  // 4. Check new order statuses in dropdown (should have 8 statuses now)
  // Open new order form
  const addBtn = await page.$('#o-add') || await page.$('#o-add2');
  if (addBtn) await addBtn.click();
  else {
    // Try clicking by text
    try { await page.click('text=+ 新增订单', { timeout: 5000 }); } catch(e) {}
  }
  await page.waitForTimeout(1000);
  
  const statusOpts = await page.evaluate(() => {
    const sel = document.querySelector('#o-statusSel');
    return sel ? Array.from(sel.options).map(o => ({ val: o.value, label: o.textContent.trim() })) : [];
  });
  console.log(`[Order Statuses] ${statusOpts.length} options:`);
  statusOpts.forEach(s => console.log(`  ${s.val} → ${s.label}`));
  
  const expectedStatuses = ['pending_refund', 'transferred', 'reviewing', 'review_requested', 'review_retry', 'reviewed', 'completed', 'abandoned'];
  const actualStatusKeys = statusOpts.map(s => s.val);
  for (const exp of expectedStatuses) {
    if (!actualStatusKeys.includes(exp)) errs.push(`Missing status: ${exp}`);
  }
  if (statusOpts.length < 8) errs.push(`Expected >= 8 statuses, got ${statusOpts.length}`);

  // 5. Check linked lead field exists in order form
  const hasLinkedLead = await page.evaluate(() => !!document.querySelector('#o-linkedLead'));
  console.log(`[Linked Lead Field] ${hasLinkedLead ? 'EXISTS' : 'MISSING'}`);
  if (!hasLinkedLead) errs.push('Missing #o-linkedLead field');

  // 6. Check lead datalist exists
  const hasDatalist = await page.evaluate(() => !!document.querySelector('#ol-leadlist'));
  console.log(`[Lead Datalist] ${hasDatalist ? 'EXISTS' : 'MISSING'}`);

  // Close modal
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // 7. Navigate to outreach to check kanban cards
  await page.click('text=红人跟进');
  await page.waitForTimeout(1500);

  // Check kanban renders
  const kanbanExists = await page.evaluate(() => !!document.querySelector('.kanban-col'));
  console.log(`[Kanban] ${kanbanExists ? 'RENDERED' : 'NOT RENDERED'}`);

  // Summary
  console.log('\n=== VALIDATION RESULT ===');
  if (errs.length === 0) {
    console.log('ALL CHECKS PASSED ✅');
  } else {
    errs.forEach(e => console.log('❌ ' + e));
  }

  await browser.close();
  process.exit(errs.length > 0 ? 1 : 0);
})();
