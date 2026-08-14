/* ============================================================
   测评工作台 · Review Ops Workbench  (local, offline-capable)
   纯前端 + IndexedDB + Chart.js + SheetJS
   ============================================================ */
"use strict";

/* ---------- tiny utils ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2) + Date.now());
const todayISO = () => new Date().toISOString().slice(0, 10);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtMoney = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtInt = (n) => Number(n || 0).toLocaleString('en-US');
const fmtDate = (s) => (s ? String(s).slice(0, 10) : '—');

/* ---------- force horizontal scroll on all tables ---------- */
function forceTableScroll(root = document) {
  const content = $('#content');
  if (content) { content.style.overflowY = 'auto'; content.style.overflowX = 'hidden'; }
  /* 关键修复：解除 .maxw 的宽度限制，让表格可以撑开并触发横向滚动 */
  $$('.maxw', root).forEach((m) => { m.style.maxWidth = 'none'; });
  $$('.table-wrap', root).forEach((wrap) => {
    wrap.style.overflowX = 'auto';
    wrap.style.overflowY = 'visible';
    wrap.style.display = 'block';
  });
  $$('table.data', root).forEach((tbl) => {
    tbl.style.width = 'max-content';
    tbl.style.minWidth = '0';
  });
}
function toast(msg, type = '') {
  const root = $('#toast-root');
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = msg;
  root.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 300); }, 2600);
}
async function copyText(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch (e) {}
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.top = '-9999px'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.focus(); ta.select();
    const ok = document.execCommand('copy'); ta.remove(); return ok;
  } catch (e) { return false; }
}
// 从单个字段（可能含逗号/分号/全角分号/空格分隔的多个邮箱）提取干净邮箱数组
function normEmails(str) {
  return String(str || '').split(/[,;；\s]+/).map((s) => s.trim()).filter((s) => /@/.test(s));
}

/* ---------- 搜索：归一化 + 多关键词匹配 ---------- */
// 全角转半角、去零宽字符、转小写、去首尾空白 —— 保证从表格/邮件里复制来的邮箱也能搜到
function normSearch(s) {
  return String(s == null ? '' : s)
    .replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .replace(/\u3000/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .toLowerCase()
    .trim();
}
// kw 支持空格分隔的多关键词（AND 关系）；fields 为该行参与搜索的所有字段
function matchKw(kw, fields) {
  const k = normSearch(kw);
  if (!k) return true;
  const hay = normSearch(fields.filter((v) => v != null && v !== '').join(' \u0001 '));
  return k.split(/\s+/).filter(Boolean).every((t) => hay.includes(t));
}

/* ---------- 重渲染时保持输入框焦点与光标位置 ---------- */
function captureFocus() {
  const el = document.activeElement;
  if (!el || !el.id || !/^(INPUT|TEXTAREA)$/.test(el.tagName)) return null;
  const snap = { id: el.id, start: null, end: null };
  try { snap.start = el.selectionStart; snap.end = el.selectionEnd; } catch (e) { snap.start = null; }
  return snap;
}
function restoreFocus(snap) {
  if (!snap) return;
  const el = document.getElementById(snap.id);
  if (!el) return;
  try {
    el.focus();
    if (snap.start != null && typeof el.setSelectionRange === 'function') el.setSelectionRange(snap.start, snap.end);
  } catch (e) {}
}

/* ---------- status / currency config ---------- */
const STATUS = {
  pending_refund: { label: '待返款', cls: 'warning' },
  refunded: { label: '已返款', cls: 'success' },
  reviewed: { label: '已评价', cls: 'primary' },
};
const statusBadge = (s) => { const m = STATUS[s] || { label: s || '—', cls: 'neutral' }; return `<span class="badge ${m.cls}">${esc(m.label)}</span>`; };

const COUNTRY_CURRENCY = {
  US: 'USD', CA: 'CAD', GB: 'GBP', UK: 'GBP', DE: 'EUR', FR: 'EUR', IT: 'EUR', ES: 'EUR',
  NL: 'EUR', BE: 'EUR', AT: 'EUR', IE: 'EUR', PT: 'EUR', GR: 'EUR', FI: 'EUR', LU: 'EUR',
  MT: 'EUR', CY: 'EUR', SK: 'EUR', SI: 'EUR', LT: 'EUR', LV: 'EUR', EE: 'EUR', AU: 'AUD',
  JP: 'JPY', NZ: 'NZD', SG: 'SGD', HK: 'HKD', MX: 'MXN', BR: 'BRL', IN: 'INR', KR: 'KRW',
  CN: 'CNY', ZA: 'ZAR', SE: 'SEK', NO: 'NOK', DK: 'DKK', CH: 'CHF', PL: 'PLN', CZ: 'CZK',
  HU: 'HUF', MY: 'MYR', PH: 'PHP', TH: 'THB', ID: 'IDR', VN: 'VND', AE: 'AED', SA: 'SAR',
  IL: 'ILS', TR: 'TRY', RU: 'RUB', UA: 'UAH', RO: 'RON', BG: 'BGN', HR: 'HRK', IS: 'ISK',
};
const CURRENCY_SYMBOL = {
  USD: '$', CAD: '$', GBP: '£', EUR: '€', AUD: '$', JPY: '¥', NZD: '$', SGD: '$', HKD: '$',
  MXN: '$', BRL: 'R$', INR: '₹', KRW: '₩', CNY: '¥', ZAR: 'R', SEK: 'kr', NOK: 'kr',
  DKK: 'kr', CHF: 'Fr', PLN: 'zł', CZK: 'Kč', HUF: 'Ft', MYR: 'RM', PHP: '₱', THB: '฿',
  IDR: 'Rp', VND: '₫', AED: 'د.إ', SAR: '﷼', ILS: '₪', TRY: '₺', RUB: '₽', UAH: '₴',
  RON: 'lei', BGN: 'лв', HRK: 'kn', ISK: 'kr',
};
// 国家 → Amazon 站点（用于群发邀约文案中提示对应店铺）
const COUNTRY_MARKET = {
  US: 'Amazon.com', CA: 'Amazon.ca', UK: 'Amazon.co.uk', GB: 'Amazon.co.uk', DE: 'Amazon.de',
  FR: 'Amazon.fr', IT: 'Amazon.it', ES: 'Amazon.es', NL: 'Amazon.nl', BE: 'Amazon.com.be',
  AT: 'Amazon.at', IE: 'Amazon.de', PT: 'Amazon.es', SE: 'Amazon.se', PL: 'Amazon.pl',
  JP: 'Amazon.co.jp', AU: 'Amazon.com.au', MX: 'Amazon.com.mx', BR: 'Amazon.com.br',
  IN: 'Amazon.in', SG: 'Amazon.sg', AE: 'Amazon.ae', SA: 'Amazon.sa',
};
function currencyOfCountry(country) { return COUNTRY_CURRENCY[String(country).toUpperCase()] || 'USD'; }
function symbolOfCurrency(currency) { return CURRENCY_SYMBOL[currency] || '$'; }
function fmtAmount(amount, countryOrCurrency) {
  const currency = CURRENCY_SYMBOL[countryOrCurrency] ? countryOrCurrency : currencyOfCountry(countryOrCurrency);
  const symbol = symbolOfCurrency(currency);
  return `${symbol}${fmtMoney(amount)} <span class="currency-code">${currency}</span>`;
}

/* ---------- customer / order linkage helpers ---------- */
function normStr(s) { return String(s || '').trim().toLowerCase(); }
function sameName(a, b) { return normStr(a) === normStr(b); }
function sameEmail(a, b) {
  const as = normEmails(a);
  const bs = normEmails(b);
  return as.length > 0 && bs.length > 0 && as.some((x) => bs.includes(x));
}
function inferSourceFromUrl(url) {
  const u = String(url || '').toLowerCase();
  if (u.includes('tiktok')) return 'TikTok';
  if (u.includes('youtube')) return 'YouTube';
  if (u.includes('instagram')) return 'Instagram';
  if (u.includes('facebook')) return 'Facebook';
  if (u.includes('discord')) return 'Discord';
  return '';
}
function uniqProducts(list) {
  const parts = [];
  list.forEach((s) => String(s).split(/[,，;；]/).forEach((p) => { const t = p.trim(); if (t) parts.push(t); }));
  return [...new Set(parts)].join(', ');
}
async function findCustomerByOrder(order, customers) {
  if (!order) return null;
  if (order.customerId) {
    const c = customers.find((x) => x.id === order.customerId);
    if (c) return c;
  }
  if (order.customerEmail && sameEmail(order.customerEmail, order.customerEmail)) {
    const c = customers.find((x) => sameEmail(x.email, order.customerEmail));
    if (c) return c;
  }
  if (order.customerName) {
    const c = customers.find((x) => sameName(x.name, order.customerName));
    if (c) return c;
  }
  return null;
}
// 把订单与客户关联：无匹配则自动建档，有匹配则补齐空字段，order.customerId 会被写入
async function linkOrderToCustomer(order) {
  const customers = await getAll('customers');
  let c = await findCustomerByOrder(order, customers);
  const isNew = !c;
  const now = new Date().toISOString();
  if (!c) {
    c = {
      id: uid(),
      name: String(order.customerName || '').trim(),
      email: String(order.customerEmail || '').trim(),
      country: String(order.country || '').trim(),
      source: inferSourceFromUrl(order.socialMediaUrl),
      followers: 0,
      product: String(order.product || '').trim(),
      cooperationCount: 0,
      refundMethod: String(order.refundMethod || '').trim(),
      needShippingAdvance: false,
      ppAccount: String(order.ppAccount || '').trim(),
      latestFollowUp: '',
      socialMediaUrl: String(order.socialMediaUrl || '').trim(),
      startDate: order.orderDate || todayISO(),
      lastOrderDate: order.orderDate || todayISO(),
      createdAt: now,
    };
  } else {
    if (!c.country && order.country) c.country = String(order.country).trim();
    if (!c.ppAccount && order.ppAccount) c.ppAccount = String(order.ppAccount).trim();
    if (!c.refundMethod && order.refundMethod) c.refundMethod = String(order.refundMethod).trim();
    if (!c.socialMediaUrl && order.socialMediaUrl) c.socialMediaUrl = String(order.socialMediaUrl).trim();
    if (!c.email && order.customerEmail) c.email = String(order.customerEmail).trim();
    c.lastOrderDate = order.orderDate || c.lastOrderDate || todayISO();
  }
  order.customerId = c.id;
  await putOne('customers', c);
  return c.id;
}
async function recomputeCustomerStatsById(customerId) {
  const c = await getOne('customers', customerId);
  if (!c) return;
  const allOrders = await getAll('orders');
  const orders = allOrders.filter((o) => o.customerId === c.id || sameName(o.customerName, c.name) || sameEmail(o.customerEmail, c.email));
  c.cooperationCount = orders.length;
  c.product = uniqProducts(orders.map((o) => o.product).filter(Boolean));
  const dates = orders.map((o) => o.orderDate).filter(Boolean).sort();
  if (dates.length) {
    c.startDate = dates[0];
    c.lastOrderDate = dates[dates.length - 1];
  } else {
    c.lastOrderDate = c.lastOrderDate || null;
  }
  await putOne('customers', c);
}
async function recomputeCustomerStatsForOrder(order) {
  if (!order) return;
  if (order.customerId) await recomputeCustomerStatsById(order.customerId);
  else {
    const customers = await getAll('customers');
    const c = await findCustomerByOrder(order, customers);
    if (c) await recomputeCustomerStatsById(c.id);
  }
}

const CUSTOMER_ORDER_SYNC_FIELDS = ['name', 'email', 'country', 'refundMethod', 'ppAccount', 'socialMediaUrl'];
const CUSTOMER_ORDER_FIELD_MAP = { name: 'customerName', email: 'customerEmail', country: 'country', refundMethod: 'refundMethod', ppAccount: 'ppAccount', socialMediaUrl: 'socialMediaUrl' };

async function findOrdersByCustomer(c, allOrders) {
  const orders = allOrders || await getAll('orders');
  return orders.filter((o) => o.customerId === c.id || sameName(o.customerName, c.name) || sameEmail(o.customerEmail, c.email));
}

async function syncCustomerToOrders(c) {
  const allOrders = await getAll('orders');
  const orders = await findOrdersByCustomer(c, allOrders);
  let changedAny = false;
    for (const o of orders) {
    let changed = false;
    if (!o.customerId && c.id) { o.customerId = c.id; changed = true; }
    for (const custField of CUSTOMER_ORDER_SYNC_FIELDS) {
      const orderField = CUSTOMER_ORDER_FIELD_MAP[custField];
      const custVal = c[custField] == null ? '' : c[custField];
      if (o[orderField] !== custVal) { o[orderField] = custVal; changed = true; }
    }
    if (changed) { await putOne('orders', o); changedAny = true; }
  }
  return changedAny;
}

function renderCustomersIfVisible(keepScroll = true) {
  if (state.view === 'customers') {
    const c = $('#content');
    if (c) renderCustomers(c, keepScroll);
  }
}

/* ---------- IndexedDB layer ---------- */
const DB_NAME = 'review_ops_workbench';
let _db = null;
function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 3);
    r.onupgradeneeded = (e) => {
      const db = e.target.result;
      ['customers', 'orders', 'settlements', 'comments', 'versions'].forEach((s) => {
        if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
      });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function db() { if (!_db) _db = await openDB(); return _db; }
function tx(store, mode) { return db().then((d) => d.transaction(store, mode).objectStore(store)); }
function migrateOrder(o) {
  if (!o) return o;
  let changed = false;
  if (!Array.isArray(o.reviewImages)) { o.reviewImages = []; changed = true; }
  if (o.reviewScreenshotUrl && !o.reviewImages.includes(o.reviewScreenshotUrl)) { o.reviewImages.unshift(o.reviewScreenshotUrl); changed = true; }
  if (!o.currency) { o.currency = currencyOfCountry(o.country); changed = true; }
  return { obj: o, changed };
}
function getAll(store) {
  return new Promise((res, rej) => {
    tx(store, 'readonly').then((os) => {
      const r = os.getAll();
      r.onsuccess = () => {
        let data = r.result || [];
        if (store === 'orders') {
          data.forEach((o) => {
            const { obj, changed } = migrateOrder(o);
            if (changed) putOne('orders', obj);
          });
        }
        res(data);
      };
      r.onerror = () => rej(r.error);
    }).catch(rej);
  });
}
function getOne(store, id) {
  return new Promise((res, rej) => {
    tx(store, 'readonly').then((os) => {
      const r = os.get(id);
      r.onsuccess = () => {
        let data = r.result;
        if (store === 'orders' && data) {
          const { obj, changed } = migrateOrder(data);
          if (changed) putOne('orders', obj);
          data = obj;
        }
        res(data);
      };
      r.onerror = () => rej(r.error);
    }).catch(rej);
  });
}
function putOne(store, item) {
  return new Promise((res, rej) => {
    tx(store, 'readwrite').then((os) => { const r = os.put(item); r.onsuccess = () => res(item); r.onerror = () => rej(r.error); }).catch(rej);
  });
}
function delOne(store, id) {
  return new Promise((res, rej) => {
    tx(store, 'readwrite').then((os) => { const r = os.delete(id); r.onsuccess = () => res(); r.onerror = () => rej(r.error); }).catch(rej);
  });
}
async function bulkPut(store, items) { for (const it of items) await putOne(store, it); }
/* ---------- modal / drawer ---------- */
function openModal(html, { wide = false } = {}) {
  const root = $('#modal-root');
  const wrap = document.createElement('div');
  wrap.className = 'overlay';
  wrap.innerHTML = `<div class="modal ${wide ? 'wide' : ''}">${html}</div>`;
  root.appendChild(wrap);
  const close = () => wrap.remove();
  wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
  $$('.x-btn,.modal-close', wrap).forEach((b) => b.addEventListener('click', close));
  return { root: wrap, close };
}
function openDrawer(title, html, { headActions = '' } = {}) {
  const root = $('#modal-root');
  const overlay = document.createElement('div');
  overlay.className = 'drawer-overlay';
  const d = document.createElement('div');
  d.className = 'drawer';
  d.innerHTML = `<div class="drawer-head"><h3>${esc(title)}</h3><div class="drawer-head-actions">${headActions}</div><button class="x-btn modal-close">×</button></div><div class="drawer-body">${html}</div>`;
  overlay.appendChild(d);
  root.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));
  const close = () => { overlay.classList.remove('open'); setTimeout(() => overlay.remove(), 220); };
  $('.modal-close', overlay).addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  return { root: overlay, close };
}

/* ---------- inline edit & image helpers ---------- */
function kvEdit(label, field, rec, defs) {
  return `<dt>${esc(label)}</dt><dd class="editable" data-field="${field}">${defs[field].render(rec)}</dd>`;
}
function bindInlineEdit(root, rec, store, defs, { onSave } = {}) {
  root.querySelectorAll('.editable').forEach((dd) => {
    dd.addEventListener('click', () => {
      if (dd.querySelector('.inline-input')) return;
      const field = dd.dataset.field;
      const def = defs[field];
      const type = def.type;
      const current = rec[field];
      let input;
      if (type === 'textarea') {
        input = document.createElement('textarea');
        input.rows = 4;
        input.value = current || '';
      } else if (type === 'select') {
        input = document.createElement('select');
        def.options.forEach((o) => { const op = document.createElement('option'); op.value = o.value; op.textContent = o.label; if (String(current) === String(o.value)) op.selected = true; input.appendChild(op); });
      } else if (type === 'bool') {
        input = document.createElement('select');
        [{ value: 'false', label: '否' }, { value: 'true', label: '是' }].forEach((o) => { const op = document.createElement('option'); op.value = o.value; op.textContent = o.label; if (String(current) === String(o.value)) op.selected = true; input.appendChild(op); });
      } else if (type === 'status') {
        input = document.createElement('select');
        Object.entries(STATUS).forEach(([k, v]) => { const op = document.createElement('option'); op.value = k; op.textContent = v.label; if (k === (current || 'pending_refund')) op.selected = true; input.appendChild(op); });
      } else if (type === 'date') {
        input = document.createElement('input');
        input.type = 'date';
        input.value = current || '';
      } else if (type === 'number') {
        input = document.createElement('input');
        input.type = 'number';
        input.value = current ?? '';
      } else if (type === 'url') {
        input = document.createElement('input');
        input.type = 'url';
        input.value = current || '';
      } else {
        input = document.createElement('input');
        input.type = 'text';
        input.value = current || '';
      }
      input.className = 'inline-input';
      dd.innerHTML = '';
      dd.appendChild(input);
      input.focus();
      const commit = async () => {
        let val = input.value;
        if (type === 'number') val = Number(val || 0);
        else if (type === 'bool') val = val === 'true';
        else val = val.trim();
        if (val !== current) {
          rec[field] = val;
          await putOne(store, rec);
          toast('已更新', 'success');
          if (onSave) await onSave(rec, field);
        }
        dd.innerHTML = def.render(rec);
      };
      input.addEventListener('blur', commit);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && type !== 'textarea') { e.preventDefault(); input.blur(); } });
    });
  });
}
function imagePasteHtml(rec, field = 'image') {
  return `<div class="image-zone" tabindex="0" data-imgfield="${field}">
    ${rec[field] ? `<div class="img-wrap"><img src="${esc(rec[field])}" alt="附件"><button class="img-del" type="button" title="删除图片">×</button></div>` : `<div class="img-placeholder">点击此处后按 <b>Ctrl+V</b> 粘贴图片<br><span class="tiny">支持截图或直接复制图片粘贴</span></div>`}
  </div>`;
}
async function bindImagePaste(root, rec, store, field = 'image', closeAndReopen) {
  const zone = $('.image-zone', root);
  if (!zone) return;
  zone.addEventListener('click', () => zone.focus());
  zone.addEventListener('paste', async (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    for (const item of e.clipboardData.items) {
      if (item.type.indexOf('image') === -1) continue;
      e.preventDefault();
      const file = item.getAsFile();
      const dataUrl = await new Promise((res) => { const r = new FileReader(); r.onload = (ev) => res(ev.target.result); r.readAsDataURL(file); });
      rec[field] = dataUrl;
      await putOne(store, rec);
      toast('图片已保存', 'success');
      closeAndReopen();
      return;
    }
  });
  const del = $('.img-del', zone);
  if (del) del.addEventListener('click', async (e) => { e.stopPropagation(); delete rec[field]; await putOne(store, rec); toast('图片已删除', 'success'); closeAndReopen(); });
}
function imagesEditHtml(rec, field = 'reviewImages') {
  const imgs = rec[field] || [];
  return `<div class="images-edit" tabindex="0" data-imgfield="${field}">
    <div class="images-list">${imgs.map((u, i) => `<div class="img-thumb" data-idx="${i}"><img src="${esc(u)}" alt=""><button class="img-del" type="button" title="删除">×</button></div>`).join('')}</div>
    ${imgs.length ? '' : `<div class="images-placeholder">点击此处后按 <b>Ctrl+V</b> 粘贴评价截图<br><span class="tiny">可粘贴多张图片</span></div>`}
  </div>`;
}
async function bindImagesEdit(root, rec, store, field = 'reviewImages', onChange) {
  const zone = $('.images-edit', root);
  if (!zone) return;
  zone.addEventListener('click', (e) => { if (e.target.closest('.img-del')) return; zone.focus(); });
  zone.addEventListener('paste', async (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    const items = [...e.clipboardData.items].filter((it) => it.type.indexOf('image') !== -1);
    if (!items.length) return;
    e.preventDefault();
    for (const item of items) {
      const file = item.getAsFile();
      const dataUrl = await new Promise((res) => { const r = new FileReader(); r.onload = (ev) => res(ev.target.result); r.readAsDataURL(file); });
      if (!rec[field]) rec[field] = [];
      if (!rec[field].includes(dataUrl)) rec[field].push(dataUrl);
    }
    await putOne(store, rec);
    toast(`已粘贴 ${items.length} 张图片`, 'success');
    onChange();
  });
  $$('.img-del', zone).forEach((b) => b.addEventListener('click', async (e) => {
    e.stopPropagation();
    const idx = Number(b.closest('.img-thumb').dataset.idx);
    rec[field].splice(idx, 1);
    await putOne(store, rec);
    toast('图片已删除', 'success');
    onChange();
  }));
}

/* ---------- field helpers ---------- */
const fText = (v) => esc(v || '');
function kvRow(dt, dd) { return `<dt>${esc(dt)}</dt><dd>${dd}</dd>`; }

/* ============================================================
   STATE
   ============================================================ */
const PAGE = 15;
const state = {
  view: 'dashboard',
  customers: { page: 1, pageSize: 15, kw: '', country: '', source: '', minCoop: '', sel: [], displayCount: PAGE },
  orders: { page: 1, pageSize: 15, kw: '', store: '', refundMethod: '', country: '', status: '', start: '', end: '', reviewStart: '', reviewEnd: '', sortDir: 'desc', sel: [], displayCount: PAGE, _expanded: new Set() },
  pendingOrders: {},
  settlements: {},
  comments: { page: 1, pageSize: 15, kw: '', status: '', sourceTag: '', sel: [], displayCount: PAGE },
  charts: {},
};

/* ============================================================
   ROUTER
   ============================================================ */
function navigate(view) {
  state.view = view;
  $$('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  const titles = { dashboard: '数据仪表盘', customers: '客户管理', orders: '订单管理', settlements: '结算管理', comments: '客户评论管理' };
  $('#view-title').textContent = titles[view] || view;
  render();
}
function render(keepScroll = false) {
  const c = $('#content');
  if (!keepScroll) c.scrollTop = 0;
  if (state.view === 'dashboard') renderDashboard(c);
  else if (state.view === 'customers') renderCustomers(c, keepScroll);
  else if (state.view === 'orders') renderOrders(c, keepScroll);
  else if (state.view === 'settlements') renderSettlements(c);
  else if (state.view === 'comments') renderComments(c, keepScroll);
}
function bindInfiniteScroll() {
  const c = $('#content');
  let loading = false;
  c.addEventListener('scroll', async () => {
    if (loading) return;
    const nearBottom = c.scrollHeight - c.scrollTop - c.clientHeight < 80;
    if (!nearBottom) return;
    if (state.view === 'customers') {
      const total = state.customers._total || 0;
      if (state.customers.displayCount < total) { state.customers.displayCount += PAGE; loading = true; await renderCustomers(c, true); loading = false; }
    } else if (state.view === 'orders') {
      const total = state.orders._total || 0;
      if (state.orders.displayCount < total) { state.orders.displayCount += PAGE; loading = true; await renderOrders(c, true); loading = false; }
    } else if (state.view === 'comments') {
      const total = state.comments._total || 0;
      if (state.comments.displayCount < total) { state.comments.displayCount += PAGE; loading = true; await renderComments(c, true); loading = false; }
    }
  });
}

/* ============================================================
   TABLE COLUMN CUSTOMIZATION
   ============================================================ */
const TABLE_SCHEMAS = {
  customers: [
    { key: 'name', label: '姓名', sortable: true, filterable: true },
    { key: 'country', label: '国家', sortable: true, filterable: true },
    { key: 'source', label: '来源', sortable: true, filterable: true },
    { key: 'followers', label: '粉丝数', sortable: true, filterable: false },
    { key: 'cooperationCount', label: '合作次数', sortable: true, filterable: false },
    { key: 'product', label: '产品', sortable: true, filterable: true },
    { key: 'refundMethod', label: '返款方式', sortable: true, filterable: true },
    { key: 'ppAccount', label: 'PayPal', sortable: true, filterable: true },
    { key: 'startDate', label: '开始日期', sortable: true, filterable: false },
  ],
  pendingOrders: [
    { key: 'orderNumber', label: '订单号', sortable: true, filterable: true },
    { key: 'customerName', label: '客户', sortable: true, filterable: true },
    { key: 'store', label: '店铺', sortable: true, filterable: true },
    { key: 'amount', label: '金额', sortable: true, filterable: false },
    { key: 'country', label: '国家', sortable: true, filterable: true },
  ],
  settlements: [
    { key: 'settlementDate', label: '结算日期', sortable: true, filterable: false },
    { key: 'orderCount', label: '订单数', sortable: true, filterable: false },
    { key: 'totalAmount', label: '总金额', sortable: true, filterable: false },
    { key: 'remark', label: '备注', sortable: true, filterable: true },
  ],
  orders: [
    { key: 'orderDate', label: '订单日期', sortable: true, filterable: false },
    { key: 'customerName', label: '客户', sortable: true, filterable: true },
    { key: 'store', label: '店铺', sortable: true, filterable: true },
    { key: 'product', label: '产品', sortable: true, filterable: true },
    { key: 'amount', label: '金额', sortable: true, filterable: false },
    { key: 'orderNumber', label: '订单号', sortable: true, filterable: true },
    { key: 'refundMethod', label: '返款方式', sortable: true, filterable: true },
    { key: 'status', label: '状态', sortable: true, filterable: true },
    { key: 'reviewImages', label: '评论截图', sortable: false, filterable: false },
    { key: 'commentSummary', label: '评论内容', sortable: false, filterable: false },
    { key: 'reviewSubmitDate', label: '评论提交时间', sortable: true, filterable: false },
    { key: 'country', label: '国家', sortable: true, filterable: true },
  ],
  comments: [
    { key: 'customerName', label: '客户', sortable: true, filterable: true },
    { key: 'productStore', label: '产品 / 店铺', sortable: true, filterable: false },
    { key: 'orderNumber', label: '订单号', sortable: true, filterable: true },
    { key: 'reviewContent', label: '评论内容', sortable: false, filterable: false },
    { key: 'feedback', label: '测评内容 / 反馈', sortable: false, filterable: false },
    { key: 'images', label: '截图', sortable: false, filterable: false },
    { key: 'sourceTag', label: '来源', sortable: true, filterable: true },
    { key: 'reviewStatus', label: '状态', sortable: true, filterable: true },
    { key: 'reviewSubmitDate', label: '提交时间', sortable: true, filterable: false },
  ],
};
function getTableState(key) {
  if (!state[key].cols) {
    const schema = TABLE_SCHEMAS[key];
    state[key].cols = schema.map((c) => ({ key: c.key, label: c.label, hidden: false, sort: null, filter: '' }));
  }
  return state[key].cols;
}
function visibleCols(key) { return getTableState(key).filter((c) => !c.hidden); }
function moveCol(key, fromKey, toKey) {
  const cols = getTableState(key);
  const fi = cols.findIndex((c) => c.key === fromKey);
  const ti = cols.findIndex((c) => c.key === toKey);
  if (fi < 0 || ti < 0) return;
  const [moved] = cols.splice(fi, 1);
  cols.splice(ti, 0, moved);
}
function setColSort(key, colKey, dir) {
  getTableState(key).forEach((c) => { c.sort = c.key === colKey ? dir : null; });
}
function setColFilter(key, colKey, val) {
  const c = getTableState(key).find((x) => x.key === colKey);
  if (c) c.filter = val;
}
function clearColFilter(key, colKey) {
  const c = getTableState(key).find((x) => x.key === colKey);
  if (c) c.filter = '';
}
function clearAllTableFilters(key) {
  getTableState(key).forEach((c) => { c.filter = ''; c.sort = null; });
}
function thHtml(col) {
  return `<div class="th-wrap" draggable="true" data-col="${col.key}"><span>${esc(col.label)}</span>${col.sort ? `<span class="sort-caret">${col.sort === 'asc' ? '▲' : '▼'}</span>` : ''}<button class="th-menu-btn" title="列操作">▾</button></div>`;
}
function headerRowHtml(key) {
  const schema = TABLE_SCHEMAS[key];
  const cols = getTableState(key);
  return cols.map((c) => {
    const colSchema = schema.find((s) => s.key === c.key);
    const label = c.label || (colSchema ? colSchema.label : c.key);
    return `<th ${c.hidden ? 'style="display:none"' : ''} data-col="${c.key}">${thHtml({ ...c, label })}</th>`;
  }).join('');
}
function showHeaderMenu(e, key, col, onChange) {
  const schema = TABLE_SCHEMAS[key].find((c) => c.key === col.key);
  const existing = $('.th-menu');
  if (existing) existing.remove();
  const menu = document.createElement('div');
  menu.className = 'th-menu';
  menu.style.left = e.pageX + 'px';
  menu.style.top = e.pageY + 'px';
  const items = [
    { ico: '⚲', label: '筛选…', action: 'filter' },
    { ico: '⇅', label: '升序排序', action: 'sortAsc' },
    { ico: '⇅', label: '降序排序', action: 'sortDesc' },
    { ico: '👁', label: '隐藏列', action: 'hide' },
  ];
  menu.innerHTML = items.map((it) => `<div class="th-menu-item" data-action="${it.action}"><span class="ico">${it.ico}</span><span>${esc(it.label)}</span></div>`).join('');
  document.body.appendChild(menu);
  const close = () => menu.remove();
  const onDocClick = (ev) => { if (!menu.contains(ev.target)) { close(); document.removeEventListener('click', onDocClick); } };
  setTimeout(() => document.addEventListener('click', onDocClick), 0);
  $$('[data-action]', menu).forEach((el) => el.addEventListener('click', async () => {
    const action = el.dataset.action;
    close();
    const sLabel = schema ? schema.label : col.key;
    if (action === 'filter') {
      const val = prompt(`筛选「${sLabel}」：包含以下文字`, col.filter || '');
      if (val !== null) { setColFilter(key, col.key, val.trim()); onChange(); }
    } else if (action === 'sortAsc') { setColSort(key, col.key, 'asc'); onChange(); }
    else if (action === 'sortDesc') { setColSort(key, col.key, 'desc'); onChange(); }
    else if (action === 'hide') { col.hidden = true; onChange(); }
  }));
}
function bindHeaderMenus(root, key, onChange) {
  $$('th[data-col]', root).forEach((th) => {
    const colKey = th.dataset.col;
    const col = getTableState(key).find((c) => c.key === colKey);
    if (!col) return;
    th.addEventListener('contextmenu', (e) => { e.preventDefault(); showHeaderMenu(e, key, col, onChange); });
    const wrap = $('.th-wrap', th);
    const btn = $('.th-menu-btn', th);
    if (wrap) {
      wrap.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', colKey); e.dataTransfer.effectAllowed = 'move'; wrap.classList.add('th-drag-ghost'); });
      wrap.addEventListener('dragend', () => wrap.classList.remove('th-drag-ghost'));
      wrap.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });
      wrap.addEventListener('drop', (e) => {
        e.preventDefault();
        const fromKey = e.dataTransfer.getData('text/plain');
        if (fromKey && fromKey !== colKey) { moveCol(key, fromKey, colKey); onChange(); }
      });
    }
    const open = (e) => { e.stopPropagation(); showHeaderMenu(e, key, col, onChange); };
    if (btn) btn.addEventListener('click', open);
      else if (wrap) wrap.addEventListener('click', (e) => { if (!e.target.closest('.th-menu-btn')) return; open(e); });
  });
}

/* ---------- table helpers: formula / grouping / viz ---------- */
function applyFormula(expr, row) {
  try { const fn = new Function('row', 'return (' + expr + ');'); const v = fn(row); return (v == null || isNaN(v)) ? '' : v; } catch (e) { return ''; }
}
function buildTbody(key, rows, rowFn) {
  const gb = state[key].groupBy;
  if (!gb) return rows.map(rowFn).join('');
  const groups = {};
  rows.forEach((r) => { const v = r[gb]; const k = (v == null || v === '') ? '（未填）' : String(v); (groups[k] = groups[k] || []).push(r); });
  const label = (TABLE_SCHEMAS[key].find((s) => s.key === gb) || {}).label || gb;
  let html = '';
  Object.keys(groups).sort().forEach((g) => {
    html += `<tr class="group-row"><td colspan="50"><span class="group-label">${esc(label)}</span>：${esc(g)} <span class="tiny muted">(${groups[g].length})</span></td></tr>`;
    html += groups[g].map(rowFn).join('');
  });
  return html;
}
function openFormulaModal(key, col) {
  const cur = state[key].formula;
  const html = `<div class="modal-head"><h3>公式计算 · ${esc((TABLE_SCHEMAS[key].find((s) => s.key === col.key) || {}).label || col.key)}</h3><button class="x-btn modal-close">×</button></div>
    <div class="modal-body">
      <p class="tiny muted">输入公式，引用行字段：<code>row.amount * 1.1</code> 或 <code>row.amount + row.cooperationCount</code>。结果作为新列展示，不修改原始数据。</p>
      <div class="field"><label>公式（row.字段名）</label><input class="input" id="f-expr" value="${esc(cur ? cur.expr : 'row.amount * 1.1')}"></div>
      <div class="field"><label>列标题</label><input class="input" id="f-label" value="${esc(cur ? cur.label : '计算值')}"></div>
      <div class="row" style="gap:8px;margin-top:8px">
        <button class="btn btn-primary btn-sm" id="f-apply">应用公式列</button>
        ${cur ? '<button class="btn btn-sm btn-ghost" id="f-clear">移除公式列</button>' : ''}
      </div>
    </div>`;
  const m = openModal(html, { wide: true });
  $('#f-apply', m.root).addEventListener('click', () => {
    const expr = $('#f-expr', m.root).value.trim();
    const label = $('#f-label', m.root).value.trim() || '计算值';
    if (!expr) return;
    if (!TABLE_SCHEMAS[key].some((c) => c.key === '__formula__')) TABLE_SCHEMAS[key].push({ key: '__formula__', label, sortable: false, filterable: false });
    const fc = getTableState(key).find((c) => c.key === '__formula__') || (() => { const o = { key: '__formula__', hidden: false, sort: null, filter: '', color: '', person: false }; getTableState(key).push(o); return o; })();
    fc.formulaExpr = expr; fc.label = label; fc.hidden = false;
    state[key].formula = { expr, label };
    m.close(); render();
  });
  const clr = $('#f-clear', m.root);
  if (clr) clr.addEventListener('click', () => { state[key].formula = null; TABLE_SCHEMAS[key] = TABLE_SCHEMAS[key].filter((c) => c.key !== '__formula__'); const f = getTableState(key).find((c) => c.key === '__formula__'); if (f) f.hidden = true; m.close(); render(); });
}
async function openColViz(key, col) {
  const store = key === 'customers' ? 'customers' : (key === 'orders' || key === 'pendingOrders') ? 'orders' : 'settlements';
  const rows = await getAll(store);
  const freq = {};
  rows.forEach((r) => { const v = r[col.key]; const k = Array.isArray(v) ? (v.length + ' 张') : (v == null || v === '') ? '（空）' : String(v); freq[k] = (freq[k] || 0) + 1; });
  const entries = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 12);
  const html = `<div class="modal-head"><h3>数据可视化 · ${esc((TABLE_SCHEMAS[key].find((s) => s.key === col.key) || {}).label || col.key)}</h3><button class="x-btn modal-close">×</button></div>
    <div class="modal-body"><div class="chart-canvas-wrap" style="height:320px"><canvas id="viz-canvas"></canvas></div></div>`;
  const m = openModal(html, { wide: true });
  const ctx = $('#viz-canvas', m.root).getContext('2d');
  new Chart(ctx, { type: 'bar', data: { labels: entries.map((e) => e[0]), datasets: [{ label: '数量', data: entries.map((e) => e[1]), backgroundColor: '#111' }] }, options: { plugins: { legend: { display: false } }, scales: { x: { ticks: { maxRotation: 45, autoSkip: false } } } } });
}

function filterTagsHtml(key) {
  const active = getTableState(key).filter((c) => c.filter || c.sort);
  if (!active.length) return '';
  const schema = TABLE_SCHEMAS[key];
  return `<div class="filter-tags" data-table-key="${key}">
    ${active.map((c) => {
      const label = schema.find((s) => s.key === c.key)?.label || c.key;
      const text = c.filter ? `${label}：${esc(c.filter)}` : `${label} ${c.sort === 'asc' ? '升序' : '降序'}`;
      return `<span class="filter-tag">${text}<button class="clear" data-col="${c.key}" data-table-key="${key}">×</button></span>`;
    }).join('')}
    <button class="clear-all" data-clear-all data-table-key="${key}">清除全部</button>
  </div>`;
}
function applyColSort(key, list) {
  const sortCol = getTableState(key).find((c) => c.sort);
  if (!sortCol) return list;
  const dir = sortCol.sort === 'asc' ? 1 : -1;
  return [...list].sort((a, b) => {
    const av = a[sortCol.key], bv = b[sortCol.key];
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
    return String(av || '').localeCompare(String(bv || ''), 'zh') * dir;
  });
}
function applyColFilter(key, list) {
  const filters = getTableState(key).filter((c) => c.filter);
  if (!filters.length) return list;
  return list.filter((row) => filters.every((c) => String(row[c.key] || '').toLowerCase().includes(c.filter.toLowerCase())));
}

/* ============================================================
   COMBO FILTER (查找或添加选项：搜索 + 新增自定义标签)
   ============================================================ */
const CUSTOM_TAGS_KEY = 'review_custom_tags_v1';
let _customTags = {};
try { _customTags = JSON.parse(localStorage.getItem(CUSTOM_TAGS_KEY) || '{}') || {}; } catch (e) { _customTags = {}; }
function getCustomTags(field) { return Array.isArray(_customTags[field]) ? _customTags[field] : []; }
function addCustomTag(field, tag) {
  tag = (tag || '').trim(); if (!tag) return;
  _customTags[field] = Array.from(new Set([...(getCustomTags(field)), tag]));
  try { localStorage.setItem(CUSTOM_TAGS_KEY, JSON.stringify(_customTags)); } catch (e) {}
}
function removeCustomTag(field, tag) {
  tag = String(tag || ''); if (!tag) return;
  _customTags[field] = getCustomTags(field).filter((t) => String(t) !== tag);
  try { localStorage.setItem(CUSTOM_TAGS_KEY, JSON.stringify(_customTags)); } catch (e) {}
}
const HIDDEN_OPTIONS_KEY = 'review_hidden_options_v1';
let _hiddenOptions = {};
try { _hiddenOptions = JSON.parse(localStorage.getItem(HIDDEN_OPTIONS_KEY) || '{}') || {}; } catch (e) { _hiddenOptions = {}; }
function getHiddenOptions(field) { return Array.isArray(_hiddenOptions[field]) ? _hiddenOptions[field] : []; }
function addHiddenOption(field, tag) {
  tag = String(tag || ''); if (!tag) return;
  _hiddenOptions[field] = Array.from(new Set([...getHiddenOptions(field), tag]));
  try { localStorage.setItem(HIDDEN_OPTIONS_KEY, JSON.stringify(_hiddenOptions)); } catch (e) {}
}
function removeHiddenOption(field, tag) {
  tag = String(tag || ''); if (!tag) return;
  _hiddenOptions[field] = getHiddenOptions(field).filter((t) => String(t) !== tag);
  try { localStorage.setItem(HIDDEN_OPTIONS_KEY, JSON.stringify(_hiddenOptions)); } catch (e) {}
}
function clearHiddenOptions(field) {
  delete _hiddenOptions[field];
  try { localStorage.setItem(HIDDEN_OPTIONS_KEY, JSON.stringify(_hiddenOptions)); } catch (e) {}
}
function comboOptions(field, base) {
  const set = new Set();
  const hidden = new Set(getHiddenOptions(field).map(String));
  (base || []).forEach((x) => x && set.add(String(x)));
  getCustomTags(field).forEach((x) => set.add(String(x)));
  return [...set].filter((x) => !hidden.has(x)).sort((a, b) => a.localeCompare(b, 'zh'));
}
function comboDisplay(displayMap, val) { return displayMap && displayMap[val] != null ? displayMap[val] : val; }
function comboFilterHtml({ id, allLabel, value, options, displayMap, appendTo }) {
  const opts = options.map((o) => {
    const custom = getCustomTags(fieldOf(id)).includes(String(o));
    return `<div class="combo-opt${String(o) === String(value) ? ' active' : ''}${custom ? ' custom-tag' : ''}" data-val="${esc(o)}">${esc(comboDisplay(displayMap, o))}</div>`;
  }).join('');
  const btnText = value ? comboDisplay(displayMap, value) : allLabel;
  const detachedAttr = appendTo ? ' data-detached="1"' : '';
  return `<div class="combo" id="${id}"${detachedAttr}>
    <button class="combo-btn${value ? ' has-val' : ''}" type="button">${esc(btnText)}</button>
    <div class="combo-pop" id="${id}-pop" style="display:none">
      <input class="combo-search" type="text" placeholder="搜索或输入新选项…">
      <div class="combo-list">${opts}</div>
      <div class="combo-foot">
        <button class="combo-add" type="button" style="display:none">＋ 新增「<span class="combo-add-val"></span>」</button>
        <button class="combo-restore" type="button" style="display:none">↺ 恢复默认选项</button>
      </div>
    </div>
  </div>`;
}
function fieldOf(id) {
  return { 'c-country': 'customers.country', 'c-source': 'customers.source', 'o-store': 'orders.store', 'o-status': 'orders.status', 'o-country': 'orders.country', 'o-refund': 'orders.refundMethod' }[id] || id;
}
function closeAllCombosOpen() { $$('.combo-pop', document).forEach((p) => { p.style.display = 'none'; }); }
function positionPop(btn, pop) {
  const r = btn.getBoundingClientRect();
  pop.style.top = (r.bottom + window.scrollY + 6) + 'px';
  pop.style.left = (r.left + window.scrollX) + 'px';
  pop.style.minWidth = r.width + 'px';
}
function initCombo(c, id, { value, allLabel, options: initialOptions, displayMap, onSelect, appendTo, baseOptions }) {
  const root = $('#' + id, c); if (!root) return null;
  let pop = $('.combo-pop', root);
  const btn = $('.combo-btn', root), search = $('.combo-search', pop), list = $('.combo-list', pop), addBtn = $('.combo-add', pop), addVal = $('.combo-add-val', pop), restoreBtn = $('.combo-restore', pop);
  if (appendTo && pop && !pop._detached) {
    pop._detached = true;
    pop.style.position = 'fixed';
    pop.style.zIndex = '2500';
    const existing = document.getElementById(id + '-pop');
    if (existing && existing !== pop) existing.remove();
    appendTo.appendChild(pop);
  }
  let cur = value || '';
  const field = fieldOf(id);
  const baseSet = new Set((baseOptions || initialOptions || []).map((x) => String(x)));
  const allOptions = () => comboOptions(field, baseOptions || initialOptions || []);
  const renderList = (q = '') => {
    const options = allOptions();
    const ql = q.trim().toLowerCase();
    const items = options.filter((o) => !ql || String(o).toLowerCase().includes(ql));
    list.innerHTML = `<div class="combo-opt${cur === '' ? ' active' : ''}" data-val="">${esc(allLabel)}</div>` + items.map((o) => {
      const custom = getCustomTags(field).includes(String(o));
      return `<div class="combo-opt${String(o) === String(cur) ? ' active' : ''}${custom ? ' custom-tag' : ''}" data-val="${esc(o)}">
        <span class="combo-opt-text">${esc(comboDisplay(displayMap, o))}</span>
        <button class="combo-del" type="button" data-val="${esc(o)}" title="删除">×</button>
      </div>`;
    }).join('');
    list.querySelectorAll('.combo-opt').forEach((el) => el.addEventListener('click', () => selectVal(el.dataset.val)));
    list.querySelectorAll('.combo-del').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation(); e.preventDefault();
      const val = b.dataset.val;
      removeCustomTag(field, val);
      addHiddenOption(field, val);
      if (String(cur) === String(val)) { cur = ''; btn.textContent = allLabel; btn.classList.remove('has-val'); if (onSelect) onSelect(''); }
      renderList(search.value);
    }));
    restoreBtn.style.display = getHiddenOptions(field).length ? '' : 'none';
    const exists = options.some((o) => String(o).toLowerCase() === ql);
    if (q.trim() && !exists) { addBtn.style.display = ''; addVal.textContent = q.trim(); } else { addBtn.style.display = 'none'; }
  };
  const selectVal = (val) => {
    cur = val || '';
    btn.textContent = cur ? comboDisplay(displayMap, cur) : allLabel;
    btn.classList.toggle('has-val', !!cur);
    pop.style.display = 'none';
    if (onSelect) onSelect(cur);
  };
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const willOpen = pop.style.display === 'none';
    closeAllCombosOpen();
    if (willOpen) { renderList(search.value); if (appendTo) positionPop(btn, pop); pop.style.display = 'block'; search.focus(); }
  });
  search.addEventListener('input', () => renderList(search.value));
  search.addEventListener('click', (e) => e.stopPropagation());
  pop.addEventListener('click', (e) => e.stopPropagation());
  addBtn.addEventListener('click', (e) => { e.stopPropagation(); const v = search.value.trim(); if (v) selectVal(v); });
  restoreBtn.addEventListener('click', (e) => { e.stopPropagation(); clearHiddenOptions(field); renderList(search.value); });
  return pop;
}

/* ============================================================
   CELL DROPDOWN OPTIONS (单元格下拉选项)
   ============================================================ */
const DROPDOWN_CFG_KEY = 'review_dropdown_cfg_v1';
let _dropdownCfg = {};
try { _dropdownCfg = JSON.parse(localStorage.getItem(DROPDOWN_CFG_KEY) || '{}') || {}; } catch (e) { _dropdownCfg = {}; }
const DROPDOWN_PALETTE = ['#FFE066', '#FF8787', '#74C0FC', '#8CE99A', '#B197FC', '#FFA94D', '#FFD43B', '#63E6BE', '#F783AC', '#A5D8FF', '#D0BFFF', '#FFC9C9'];
function dropdownColor(i) { return DROPDOWN_PALETTE[((i % DROPDOWN_PALETTE.length) + DROPDOWN_PALETTE.length) % DROPDOWN_PALETTE.length]; }
function getDropdownCfg(cfgKey, colKey) {
  const t = _dropdownCfg[cfgKey];
  return (t && t[colKey]) ? t[colKey] : null;
}
function setDropdownCfg(cfgKey, colKey, cfg) {
  _dropdownCfg[cfgKey] = _dropdownCfg[cfgKey] || {};
  _dropdownCfg[cfgKey][colKey] = cfg;
  try { localStorage.setItem(DROPDOWN_CFG_KEY, JSON.stringify(_dropdownCfg)); } catch (e) {}
}
function storeForTableKey(key) {
  if (key === 'customers') return 'customers';
  if (key === 'settlements') return 'settlements';
  return 'orders';
}
function ddDisplayMap(cfgKey, colKey) {
  if (colKey === 'status') return Object.fromEntries(Object.entries(STATUS).map(([k, v]) => [k, v.label]));
  return null;
}
function ddDisplay(map, val) { return map && val != null && map[val] != null ? map[val] : val; }
function ensureDefaultDropdownCfg() {
  const def = {
    customers: ['country', 'source', 'refundMethod'],
    orders: ['store', 'country', 'refundMethod', 'status'],
    pendingOrders: ['store', 'country'],
  };
  let changed = false;
  Object.keys(def).forEach((cfgKey) => {
    def[cfgKey].forEach((colKey) => {
      if (!(_dropdownCfg[cfgKey] && _dropdownCfg[cfgKey][colKey])) {
        _dropdownCfg[cfgKey] = _dropdownCfg[cfgKey] || {};
        _dropdownCfg[cfgKey][colKey] = { enabled: true, multi: false, colored: false, source: 'auto', options: [] };
        changed = true;
      }
    });
  });
  if (changed) { try { localStorage.setItem(DROPDOWN_CFG_KEY, JSON.stringify(_dropdownCfg)); } catch (e) {} }
}
function buildDropdownOptions(cfgKey, colKey, cfg, allRows) {
  if (!cfg || !cfg.enabled) return [];
  if (cfg.source === 'manual') {
    return (cfg.options || []).map((o, i) => ({ value: o.value, color: cfg.colored ? (o.color || dropdownColor(i)) : null }));
  }
  const vals = [...new Set((allRows || []).map((x) => x[colKey]).filter((v) => v != null && String(v) !== ''))].sort((a, b) => String(a).localeCompare(String(b), 'zh'));
  return vals.map((v, i) => ({ value: v, color: cfg.colored ? dropdownColor(i) : null }));
}
function buildDropdownCache(cfgKey, allRows) {
  const cache = {};
  getTableState(cfgKey).forEach((col) => {
    const cfg = getDropdownCfg(cfgKey, col.key);
    if (cfg && cfg.enabled) cache[col.key] = buildDropdownOptions(cfgKey, col.key, cfg, allRows);
  });
  return cache;
}
function dropdownTd(cfgKey, store, col, rec, options) {
  const cfg = getDropdownCfg(cfgKey, col.key);
  if (!cfg || !cfg.enabled) return null;
  const raw = rec[col.key];
  const map = ddDisplayMap(cfgKey, col.key);
  const field = col.key, rid = rec.id;
  if (cfg.multi) {
    const sel = String(raw || '').split(',').map((s) => s.trim()).filter(Boolean);
    const tags = sel.map((v) => {
      const opt = options.find((o) => String(o.value) === String(v));
      const color = opt ? opt.color : null;
      return `<span class="dd-tag${color ? ' colored' : ''}" ${color ? `style="background:${color};border-color:${color}"` : ''}>${esc(ddDisplay(map, v))}</span>`;
    }).join('');
    return `<td class="cell-dropdown" data-field="${esc(field)}" data-store="${esc(store)}" data-id="${esc(rid)}" data-cfg="${esc(cfgKey)}">${tags || '<span class="muted">—</span>'}<span class="dd-edit" title="编辑下拉">▾</span></td>`;
  }
  const opt = options.find((o) => String(o.value) === String(raw));
  const color = opt ? opt.color : null;
  let inner;
  if (col.key === 'status') inner = statusBadge(raw);
  else inner = `<span class="dd-val-text">${esc(ddDisplay(map, (raw != null && raw !== '') ? raw : '—'))}</span>`;
  return `<td class="cell-dropdown" data-field="${esc(field)}" data-store="${esc(store)}" data-id="${esc(rid)}" data-cfg="${esc(cfgKey)}"><span class="dd-val${color ? ' colored' : ''}" ${color ? `style="background:${color}"` : ''}>${inner}</span><span class="dd-edit" title="编辑下拉">▾</span></td>`;
}
function openCellDropdownPopover(anchor, cfgKey, store, colKey, rec, options, onChange) {
  const existing = $('.dd-pop'); if (existing) existing.remove();
  const pop = document.createElement('div');
  pop.className = 'dd-pop';
  const r = anchor.getBoundingClientRect();
  pop.style.left = (r.left + window.scrollX) + 'px';
  pop.style.top = (r.bottom + window.scrollY + 4) + 'px';
  pop.style.minWidth = Math.max(r.width, 160) + 'px';
  const cfg = getDropdownCfg(cfgKey, colKey);
  const map = ddDisplayMap(cfgKey, colKey);
  const cur = cfg && cfg.multi ? String(rec[colKey] || '').split(',').map((s) => s.trim()).filter(Boolean) : [String(rec[colKey] || '')];
  let settled = false;
  const choose = (v) => {
    if (settled) return; settled = true;
    pop.remove(); document.removeEventListener('click', onDoc);
    onCellDropdownChange(store, colKey, rec, v, onChange);
  };
  const renderList = () => {
    pop.innerHTML = (options.length ? options.map((o) => {
      const selected = cfg.multi ? cur.includes(String(o.value)) : cur[0] === String(o.value);
      const sw = o.color ? `<span class="dd-swatch" style="background:${o.color}"></span>` : '';
      return `<div class="dd-opt${selected ? ' active' : ''}" data-val="${esc(o.value)}">${sw}<span class="dd-opt-text">${esc(ddDisplay(map, o.value))}</span></div>`;
    }).join('') : '<div class="dd-empty">暂无选项，请在表头右键「下拉选项」中配置</div>');
    pop.querySelectorAll('.dd-opt').forEach((el) => el.addEventListener('click', () => {
      const v = el.dataset.val;
      if (cfg.multi) {
        const idx = cur.indexOf(String(v));
        if (idx >= 0) cur.splice(idx, 1); else cur.push(String(v));
        choose(cur.join(','));
      } else {
        choose(v);
      }
    }));
  };
  renderList();
  document.body.appendChild(pop);
  const onDoc = (e) => {
    if (!pop.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) { pop.remove(); document.removeEventListener('click', onDoc); }
  };
  setTimeout(() => document.addEventListener('click', onDoc), 0);
}
async function onCellDropdownChange(store, field, rec, newValue, onChange) {
  rec[field] = newValue;
  await putOne(store, rec);
  toast('已更新', 'success');
  if (store === 'customers' && CUSTOMER_ORDER_SYNC_FIELDS.includes(field)) {
    await syncCustomerToOrders(rec);
  }
  if (store === 'orders') {
    renderCustomersIfVisible(true);
  }
  if (onChange) await onChange();
}
function bindDropdownCells(root, onChange) {
  $$('.cell-dropdown', root).forEach((td) => {
    td.addEventListener('click', async (e) => {
      e.stopPropagation();
      const field = td.dataset.field, store = td.dataset.store, id = td.dataset.id, cfgKey = td.dataset.cfg;
      const rec = await getOne(store, id);
      if (!rec) return;
      const options = (buildDropdownCache(cfgKey, await getAll(store))[field]) || [];
      openCellDropdownPopover(td, cfgKey, store, field, rec, options, onChange);
    });
  });
}
function openDropdownConfig(key, col, onChange) {
  const cfg0 = getDropdownCfg(key, col.key);
  const cur = cfg0 ? JSON.parse(JSON.stringify(cfg0)) : { enabled: false, multi: false, colored: false, source: 'manual', options: [] };
  if (cur.options == null) cur.options = [];
  const store = storeForTableKey(key);
  const label = (TABLE_SCHEMAS[key].find((s) => s.key === col.key) || {}).label || col.key;
  const html = `<div class="modal-head"><h3>下拉选项配置 · ${esc(label)}</h3><button class="x-btn modal-close">×</button></div>
  <div class="modal-body dd-cfg">
    <div class="dd-cfg-row"><label class="switch"><input type="checkbox" id="dd-enabled" ${cur.enabled ? 'checked' : ''}><span class="switch-track"></span></label><span>将「${esc(label)}」设为下拉选项</span></div>
    <div class="dd-cfg-row"><label class="switch"><input type="checkbox" id="dd-multi" ${cur.multi ? 'checked' : ''}><span class="switch-track"></span></label><span>允许多选（同一单元格可含多个值）</span></div>
    <div class="dd-cfg-row"><label class="switch"><input type="checkbox" id="dd-colored" ${cur.colored ? 'checked' : ''}><span class="switch-track"></span></label><span>为各选项搭配彩色色块</span></div>
    <div class="dd-cfg-row"><span class="lbl">录入模式：</span>
      <label class="radio"><input type="radio" name="dd-source" value="manual" ${cur.source !== 'auto' ? 'checked' : ''}> 手动输入选项</label>
      <label class="radio"><input type="radio" name="dd-source" value="auto" ${cur.source === 'auto' ? 'checked' : ''}> 引用表格现有数据</label>
    </div>
    <div id="dd-manual-box" style="display:${cur.source === 'auto' ? 'none' : 'block'}">
      <div class="dd-opt-list" id="dd-opt-list"></div>
      <button class="btn btn-sm" id="dd-add-opt" type="button">＋ 新增选项</button>
    </div>
    <div id="dd-auto-box" style="display:${cur.source === 'auto' ? 'block' : 'none'}">
      <p class="tiny muted">自动读取「${esc(label)}」列当前已有数据作为下拉选项，新增 / 修改记录后自动更新，无需手动录入。</p>
      <div class="dd-opt-list" id="dd-auto-list"></div>
    </div>
    <div class="row" style="margin-top:16px;justify-content:flex-end;gap:10px">
      <button class="btn modal-close" id="dd-cancel" type="button">取消</button>
      <button class="btn btn-primary" id="dd-save" type="button">保存配置</button>
    </div>
  </div>`;
  const m = openModal(html);
  const root = m.root;
  const renderManual = () => {
    const list = $('#dd-opt-list', root);
    if (!list) return;
    list.innerHTML = ((cur.options || []).length ? (cur.options || []).map((o, i) => `<div class="dd-cfg-opt" data-i="${i}">
      <input class="input dd-opt-val" value="${esc(o.value)}" placeholder="选项值">
      <label class="switch small"><input type="checkbox" class="dd-opt-colored" ${o.color ? 'checked' : ''}><span class="switch-track"></span></label>
      <span class="dd-opt-sw" style="background:${o.color || 'transparent'}"></span>
      <button class="btn btn-icon btn-sm dd-opt-del" type="button" title="删除">×</button>
    </div>`).join('') : '<p class="tiny muted">暂无选项，点击下方按钮新增。</p>');
    list.querySelectorAll('.dd-cfg-opt').forEach((row) => {
      const i = +row.dataset.i;
      const valInput = $('.dd-opt-val', row);
      valInput.addEventListener('input', () => { cur.options[i].value = valInput.value; });
      const colCb = $('.dd-opt-colored', row);
      colCb.addEventListener('change', () => { cur.options[i].color = colCb.checked ? (cur.options[i].color || dropdownColor(i)) : ''; $('.dd-opt-sw', row).style.background = cur.options[i].color || 'transparent'; });
      $('.dd-opt-del', row).addEventListener('click', () => { cur.options.splice(i, 1); renderManual(); });
    });
  };
  const renderAuto = async () => {
    const list = $('#dd-auto-list', root);
    if (!list) return;
    const all = await getAll(store);
    const vals = [...new Set(all.map((x) => x[col.key]).filter((v) => v != null && String(v) !== ''))].sort((a, b) => String(a).localeCompare(String(b), 'zh'));
    list.innerHTML = vals.length ? vals.map((v, i) => `<div class="dd-cfg-opt readonly"><span class="dd-opt-sw" style="background:${cur.colored ? dropdownColor(i) : 'transparent'}"></span><span>${esc(ddDisplay(ddDisplayMap(key, col.key), v))}</span></div>`).join('') : '<p class="tiny muted">该列暂无数据</p>';
  };
  renderManual();
  renderAuto();
  $('#dd-add-opt', root).addEventListener('click', () => { cur.options.push({ value: '', color: cur.colored ? dropdownColor(cur.options.length) : '' }); renderManual(); });
  root.querySelectorAll('input[name="dd-source"]').forEach((rd) => rd.addEventListener('change', () => {
    const auto = rd.value === 'auto';
    cur.source = auto ? 'auto' : 'manual';
    const mb = $('#dd-manual-box', root); if (mb) mb.style.display = auto ? 'none' : 'block';
    const ab = $('#dd-auto-box', root); if (ab) ab.style.display = auto ? 'block' : 'none';
    if (auto) renderAuto();
  }));
  $('#dd-save', root).addEventListener('click', () => {
    cur.enabled = $('#dd-enabled', root).checked;
    cur.multi = $('#dd-multi', root).checked;
    cur.colored = $('#dd-colored', root).checked;
    if (cur.source === 'manual') {
      cur.options = (cur.options || []).filter((o) => (o.value || '').trim() !== '').map((o) => ({ value: o.value.trim(), color: cur.colored ? (o.color || dropdownColor(0)) : '' }));
    }
    setDropdownCfg(key, col.key, cur);
    m.close();
    if (onChange) onChange();
  });
}

/* ============================================================
   DASHBOARD
   ============================================================ */
async function renderDashboard(c) {
  const [customers, orders, settlements] = await Promise.all([getAll('customers'), getAll('orders'), getAll('settlements')]);
  const now = new Date();
  const ym = (d) => d ? new Date(d).getFullYear() + '-' + String(new Date(d).getMonth() + 1).padStart(2, '0') : '';
  const thisMonth = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');

  const totalCustomers = customers.length;
  const totalOrders = orders.length;
  const monthlyNewCustomers = customers.filter((x) => ym(x.startDate) === thisMonth || ym(x.createdAt) === thisMonth).length;
  const pendingCount = orders.filter((o) => o.status === 'pending_refund').length;
  const settledAmount = orders.filter((o) => o.status !== 'pending_refund').reduce((s, o) => s + Number(o.amount || 0), 0);

  // country dist
  const cd = {};
  customers.forEach((x) => { const k = x.country || '未知'; cd[k] = (cd[k] || 0) + 1; });
  const countryDist = Object.entries(cd).sort((a, b) => b[1] - a[1]);

  // store dist
  const sd = {};
  orders.forEach((x) => { const k = x.store || '未知'; sd[k] = (sd[k] || 0) + 1; });
  const storeDist = Object.entries(sd).sort((a, b) => b[1] - a[1]);

  // monthly trend (last 6 months)
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
  }
  const trend = months.map((m) => {
    const os = orders.filter((o) => ym(o.orderDate) === m);
    const settled = os.filter((o) => o.status !== 'pending_refund').reduce((s, o) => s + Number(o.amount || 0), 0);
    return { month: m.slice(2), orderCount: os.length, settledAmount: settled };
  });

  const recent = [...orders].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, 5);

  c.innerHTML = `<div class="maxw">
    <div class="dash-title">核心指标概览与业务趋势分析</div>
    <div class="stat-grid">
      <div class="stat" data-stat="customers" style="cursor:pointer" title="点击查看客户明细"><div class="stat-head"><span class="label">总客户数</span><span class="stat-ico">☺</span></div><div class="value">${fmtInt(totalCustomers)}</div><div class="sub">Customers</div></div>
      <div class="stat" data-stat="orders" style="cursor:pointer" title="点击查看订单明细"><div class="stat-head"><span class="label">总订单数</span><span class="stat-ico">▤</span></div><div class="value">${fmtInt(totalOrders)}</div><div class="sub">Review Orders</div></div>
      <div class="stat" data-stat="monthlyNew" style="cursor:pointer" title="点击查看本月新增客户"><div class="stat-head"><span class="label">本月新增客户</span><span class="stat-ico">✚</span></div><div class="value">${fmtInt(monthlyNewCustomers)}</div><div class="sub">This Month</div></div>
      <div class="stat" data-stat="pending" style="cursor:pointer" title="点击查看待结算订单"><div class="stat-head"><span class="label">待结算订单</span><span class="stat-ico">⧗</span></div><div class="value">${fmtInt(pendingCount)}</div><div class="sub">Pending Refund</div></div>
      <div class="stat" data-stat="settled" style="cursor:pointer" title="点击查看已结算明细"><div class="stat-head"><span class="label">已结算金额</span><span class="stat-ico">$</span></div><div class="value">${fmtAmount(settledAmount, 'USD')}</div><div class="sub">Settled Amount (USD 等值)</div></div>
    </div>
    <div class="chart-grid">
      <div class="chart-box">
        <h4>国家客户分布</h4>
        <div class="chart-toolbar"><button class="btn btn-sm" id="cty-reset">⟲ 重置视图</button><button class="btn btn-sm" id="cty-all">显示全部</button></div>
        <div class="chart-canvas-wrap"><canvas id="countryChart"></canvas></div>
      </div>
      <div class="chart-box">
        <h4>店铺订单分布</h4>
        <div class="chart-toolbar"><button class="btn btn-sm" id="store-reset">⟲ 重置视图</button></div>
        <div class="chart-canvas-wrap"><canvas id="storeChart"></canvas></div>
      </div>
    </div>
    <div class="chart-grid" style="grid-template-columns:1fr">
      <div class="chart-box">
        <h4>月度订单与结算趋势</h4>
        <div class="chart-toolbar">
          <button class="btn btn-sm ${state.charts.trendRange === 1 ? 'active' : ''}" data-tr="1">近1个月</button>
          <button class="btn btn-sm ${state.charts.trendRange === 3 ? 'active' : ''}" data-tr="3">近3个月</button>
          <button class="btn btn-sm ${state.charts.trendRange === 6 ? 'active' : ''}" data-tr="6">近6个月</button>
          <button class="btn btn-sm ${!state.charts.trendRange ? 'active' : ''}" data-tr="all">全部</button>
          <div class="grow"></div>
          <button class="btn btn-sm" id="trend-reset">⟲ 重置视图</button>
        </div>
        <div class="chart-canvas-wrap"><canvas id="trendChart"></canvas></div>
      </div>
    </div>
    <div class="card mt"><h4 style="font-size:13px;font-weight:600;margin-bottom:10px">最近订单</h4>
      ${recent.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>订单号</th><th>客户</th><th>店铺</th><th>产品</th><th class="num">金额</th><th>状态</th><th>日期</th></tr></thead><tbody>
        ${recent.map((o) => `<tr style="cursor:pointer" data-order="${o.id}"><td class="mono">${esc(o.orderNumber)}</td><td>${esc(o.customerName)}</td><td>${esc(o.store)}</td><td class="cell-ellipsis">${esc(o.product)}</td><td class="num">${fmtAmount(o.amount, o.currency || o.country)}</td><td>${statusBadge(o.status)}</td><td>${fmtDate(o.orderDate)}</td></tr>`).join('')}
      </tbody></table></div>` : '<div class="empty">暂无订单数据</div>'}
    </div>
  </div>`;

  $$('tr[data-order]', c).forEach((tr) => tr.addEventListener('click', (e) => { e.stopPropagation(); openOrderDetail(tr.dataset.order); }));
  $$('.stat[data-stat]', c).forEach((s) => s.addEventListener('click', () => openStatDetail(s.dataset.stat)));

  drawTrend('trendChart', trend);
  drawStore('storeChart', storeDist);
  drawCountry('countryChart', countryDist);

  // chart toolbar bindings
  const ctyReset = $('#cty-reset');
  if (ctyReset) ctyReset.addEventListener('click', () => { state.charts.countryShowAll = false; renderDashboard(c); });
  const ctyAll = $('#cty-all');
  if (ctyAll) ctyAll.addEventListener('click', () => { state.charts.countryShowAll = true; renderDashboard(c); });
  const storeReset = $('#store-reset');
  if (storeReset) storeReset.addEventListener('click', () => { renderDashboard(c); });
  $$('[data-tr]', c).forEach((b) => b.addEventListener('click', () => {
    const v = b.dataset.tr;
    state.charts.trendRange = v === 'all' ? null : Number(v);
    renderDashboard(c);
  }));
  const trendReset = $('#trend-reset');
  if (trendReset) trendReset.addEventListener('click', () => { state.charts.trendRange = null; renderDashboard(c); });
}
async function openStatDetail(type) {
  const customers = await getAll('customers');
  const orders = await getAll('orders');
  const now = new Date();
  const thisMonth = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  const ym = (d) => d ? new Date(d).getFullYear() + '-' + String(new Date(d).getMonth() + 1).padStart(2, '0') : '';
  let title = '', rows = [], headers = [];
  if (type === 'customers') {
    title = `总客户明细 (${customers.length})`;
    headers = ['姓名', '国家', '来源', '合作次数'];
    const html = `<div class="table-wrap"><table class="data"><thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>
      ${customers.map((x) => `<tr><td><span class="customer-name-link" data-cid="${x.id}">${esc(x.name)}</span></td><td>${esc(x.country)}</td><td>${esc(x.source)}</td><td>${fmtInt(x.cooperationCount)}</td></tr>`).join('')}
    </tbody></table></div>`;
    const d = openDrawer(title, html);
    $$('.customer-name-link', d.root).forEach((el) => el.addEventListener('click', () => openCustomerFloat(el.dataset.cid)));
    return;
  } else if (type === 'orders') {
    title = `总订单明细 (${orders.length})`;
    headers = ['订单号', '客户', '店铺', '金额', '状态'];
    rows = orders.map((o) => [esc(o.orderNumber), esc(o.customerName), esc(o.store), fmtAmount(o.amount, o.currency || o.country), statusBadge(o.status)]);
  } else if (type === 'monthlyNew') {
    const list = customers.filter((x) => ym(x.startDate) === thisMonth || ym(x.createdAt) === thisMonth);
    title = `本月新增客户明细 (${list.length})`;
    headers = ['姓名', '国家', '来源', '开始日期'];
    rows = list.map((x) => [esc(x.name), esc(x.country), esc(x.source), fmtDate(x.startDate)]);
  } else if (type === 'pending') {
    const list = orders.filter((o) => o.status === 'pending_refund');
    title = `待结算订单明细 (${list.length})`;
    headers = ['订单号', '客户', '店铺', '金额', '日期'];
    rows = list.map((o) => [esc(o.orderNumber), esc(o.customerName), esc(o.store), fmtAmount(o.amount, o.currency || o.country), fmtDate(o.orderDate)]);
  } else if (type === 'settled') {
    const list = orders.filter((o) => o.status !== 'pending_refund');
    title = `已结算金额明细 (${list.length})`;
    headers = ['订单号', '客户', '店铺', '金额', '状态'];
    rows = list.map((o) => [esc(o.orderNumber), esc(o.customerName), esc(o.store), fmtAmount(o.amount, o.currency || o.country), statusBadge(o.status)]);
  }
  const html = `<div class="table-wrap"><table class="data"><thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>
    ${rows.map((cells) => `<tr>${cells.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')}
  </tbody></table></div>`;
  openDrawer(title, html);
}

function destroyChart(id) { if (state.charts[id]) { state.charts[id].destroy(); delete state.charts[id]; } }
function drawTrend(id, trend) {
  destroyChart(id);
  const ctx = document.getElementById(id);
  const data = trendDataForRange(trend);
  state.charts[id] = new Chart(ctx, {
    type: 'bar',
    data: { labels: data.map((t) => t.month), datasets: [
      { type: 'bar', label: '订单数量', data: data.map((t) => t.orderCount), yAxisID: 'y', backgroundColor: '#FFD600', borderRadius: 6, barPercentage: 0.45, order: 2 },
      { type: 'line', label: '结算金额($)', data: data.map((t) => t.settledAmount), yAxisID: 'y1', borderColor: '#111111', backgroundColor: '#111111', pointRadius: 5, pointBackgroundColor: '#FFD600', pointBorderColor: '#111111', pointBorderWidth: 2, tension: .35, borderWidth: 2.5, order: 1 },
    ]},
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}：${c.raw}` } } },
      scales: {
        y: { position: 'left', beginAtZero: true, title: { display: true, text: '订单数量', color: '#666', font: { weight: '700' } }, grid: { color: 'rgba(0,0,0,.05)' }, ticks: { color: '#666' } },
        y1: { position: 'right', beginAtZero: true, title: { display: true, text: '结算金额($)', color: '#666', font: { weight: '700' } }, grid: { drawOnChartArea: false }, ticks: { color: '#666' } },
        x: { grid: { display: false }, ticks: { color: '#666', maxRotation: 30, minRotation: 0 } }
      }
    },
  });
}
function drawStore(id, dist) {
  destroyChart(id);
  const ctx = document.getElementById(id);
  const colors = ['#FFD600', '#111111', '#9CA3AF', '#FF6B6B', '#4ECDC4', '#A78BFA', '#F59E0B', '#22D3EE'];
  const prepared = prepareStoreDist(dist);
  state.charts[id] = new Chart(ctx, {
    type: 'doughnut',
    data: { labels: prepared.map((d) => d[0]), datasets: [{ data: prepared.map((d) => d[1]), backgroundColor: prepared.map((_, i) => colors[i % colors.length]), borderWidth: 0, hoverOffset: 6 }] },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '58%',
      plugins: {
        legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, padding: 12, color: '#374151', font: { weight: '600' } } },
        tooltip: { callbacks: { label: (c) => `${c.label}：${c.raw} 单 (${c.parsed.toFixed ? c.parsed.toFixed(1) : c.parsed}%)` } }
      }
    }
  });
}
function drawCountry(id, dist) {
  destroyChart(id);
  const ctx = document.getElementById(id);
  const showAll = state.charts.countryShowAll !== false;
  const sliceN = showAll ? dist.length : Math.min(10, dist.length);
  const labels = dist.slice(0, sliceN).map((d) => d[0]);
  const data = dist.slice(0, sliceN).map((d) => d[1]);
  state.charts[id] = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ label: '客户数', data, backgroundColor: '#111111', barPercentage: 0.55, borderRadius: 6 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `客户数：${c.raw}` } } },
      scales: {
        y: { beginAtZero: true, ticks: { precision: 0, color: '#6B7280' }, grid: { color: 'rgba(0,0,0,.05)' }, title: { display: true, text: '客户数' } },
        x: { grid: { display: false }, ticks: { color: '#6B7280', maxRotation: 45, minRotation: 30, autoSkip: true, maxTicksLimit: sliceN } }
      }
    }
  });
}
function prepareStoreDist(dist) {
  if (dist.length <= 8) return dist;
  const sorted = [...dist].sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, 7);
  const other = sorted.slice(7).reduce((s, d) => s + d[1], 0);
  return other > 0 ? [...top, ['其他', other]] : top;
}
function trendDataForRange(trend) {
  const range = state.charts.trendRange;
  if (!range || range === 'all') return trend;
  return trend.slice(-range);
}

/* ============================================================
   CUSTOMERS
   ============================================================ */
async function fetchCustomers() {
  let list = await getAll('customers');
  const f = state.customers;
  if (f.kw) list = list.filter((x) => matchKw(f.kw, [x.name, x.email, x.socialMediaUrl, x.ppAccount, x.product, x.latestFollowUp]));
  if (f.country) list = list.filter((x) => x.country === f.country);
  if (f.source) list = list.filter((x) => x.source === f.source);
  if (f.minCoop) list = list.filter((x) => Number(x.cooperationCount || 0) >= Number(f.minCoop));
  list = applyColFilter('customers', list);
  list = applyColSort('customers', list);
  // default sort when no column sort active
  if (!getTableState('customers').some((c) => c.sort)) list.sort((a, b) => (b.cooperationCount || 0) - (a.cooperationCount || 0));
  return list;
}
async function renderCustomers(c, keepScroll = false) {
  const all = await getAll('customers');
  if (!all.length) return renderEmptyCustomers(c);
  const list = await fetchCustomers();
  const ddCache = buildDropdownCache('customers', all);
  const countries = [...new Set(all.map((x) => x.country).filter(Boolean))].sort();
  const sources = [...new Set(all.map((x) => x.source).filter(Boolean))].sort();
  const total = list.length;
  state.customers._total = total;
  state.customers.displayCount = Math.min(Math.max(state.customers.displayCount || PAGE, PAGE), total);
  const pageRows = list.slice(0, state.customers.displayCount);

  const _focusSnap = captureFocus();
  c.innerHTML = `<div class="maxw">
    <div class="toolbar">
      <input class="input" style="max-width:250px" id="c-kw" placeholder="搜索姓名 / 邮箱 / 社媒 / PayPal…" value="${esc(state.customers.kw)}">
      ${comboFilterHtml({ id: 'c-country', allLabel: '全部国家', value: state.customers.country, options: comboOptions('customers.country', countries) })}
      ${comboFilterHtml({ id: 'c-source', allLabel: '全部来源', value: state.customers.source, options: comboOptions('customers.source', sources) })}
      <input class="input" style="max-width:140px" id="c-coop" type="number" min="0" placeholder="≥合作次数" value="${esc(state.customers.minCoop)}">
      <div class="grow"></div>
      <button class="btn btn-sm" id="c-excel-out">⭳ 导出Excel</button>
      <button class="btn btn-sm" id="c-excel-in">⭱ 导入Excel</button>
      <button class="btn btn-sm btn-danger" id="c-batch">🗑 批量删除 (<span id="c-batch-n">0</span>)</button>
      <button class="btn btn-sm btn-primary" id="c-invite" style="display:none">📧 批量邀约 (<span id="c-invite-n">0</span>)</button>
      <button class="btn btn-sm" id="c-cols" title="列设置（显示/隐藏/下拉配置）">⚙ 列设置</button>
      <button class="btn btn-primary btn-sm" id="c-add">+ 新增客户</button>
    </div>
    ${filterTagsHtml('customers')}
    <div class="table-wrap"><table class="data sticky-first-col" data-table="customers"><thead><tr>
      <th class="chk-col"><input type="checkbox" id="c-all"></th>
      ${headerRowHtml('customers')}
      <th class="col-actions-th"></th>
    </tr></thead><tbody>
      ${buildTbody('customers', pageRows, (x) => {
        const tds = getTableState('customers').filter((c) => !c.hidden).map((c) => {
          let v = '';
          const _dd = dropdownTd('customers', 'customers', c, x, ddCache[c.key]);
          if (_dd) { v = _dd; }
          else if (c.key === 'name') v = `<td><span class="customer-name-link" data-cid="${x.id}">${esc(x.name)}</span></td>`;
          else if (c.key === 'followers' || c.key === 'cooperationCount') v = `<td class="num">${fmtInt(x[c.key])}</td>`;
          else if (c.key === 'startDate') v = `<td>${fmtDate(x.startDate)}</td>`;
          else if (c.key === '__formula__') v = `<td class="num">${esc(applyFormula(c.formulaExpr, x))}</td>`;
          else v = `<td ${c.key === 'product' || c.key === 'ppAccount' ? 'class="cell-ellipsis"' : ''}>${esc(x[c.key])}</td>`;
          if (c.person && x[c.key]) v = `<td><span class="avatar">${esc(String(x[c.key])[0] || '?')}</span></td>`;
          if (c.alert && !isNaN(Number(x[c.key]))) { const num = Number(x[c.key]); if ((c.alert.op === '>' && num > c.alert.value) || (c.alert.op === '<' && num < c.alert.value)) v = v.replace('<td', '<td class="cell-alert"'); }
          if (c.color) v = v.replace('<td', `<td style="background:${c.color}"`);
          return v;
        }).join('');
        return `<tr style="cursor:pointer" data-id="${x.id}">
          <td class="chk-col"><input type="checkbox" class="c-chk" value="${x.id}" ${state.customers.sel.includes(x.id) ? 'checked' : ''}></td>
          ${tds}
          <td class="action-cell-btns"><button class="btn btn-icon btn-sm start-coop-btn" data-cid="${x.id}" title="发起合作">🤝</button><button class="btn btn-icon btn-sm modal-close-row" data-del="${x.id}">🗑</button></td>
        </tr>`;
      })}
    </tbody></table></div>
    <div class="load-more" id="c-load-more">${state.customers.displayCount < total ? `已显示 ${state.customers.displayCount}/${total} 条 · 继续向下滚动加载更多` : `已加载全部 ${total} 条`}</div>
  </div>`;

  $('#c-kw').addEventListener('input', (e) => { state.customers.kw = e.target.value; state.customers.displayCount = PAGE; renderCustomers(c, true); });
  initCombo(c, 'c-country', { value: state.customers.country, allLabel: '全部国家', options: comboOptions('customers.country', countries), baseOptions: countries, onSelect: (v) => { if (v && !countries.includes(v)) addCustomTag('customers.country', v); state.customers.country = v; state.customers.displayCount = PAGE; renderCustomers(c); } });
  initCombo(c, 'c-source', { value: state.customers.source, allLabel: '全部来源', options: comboOptions('customers.source', sources), baseOptions: sources, onSelect: (v) => { if (v && !sources.includes(v)) addCustomTag('customers.source', v); state.customers.source = v; state.customers.displayCount = PAGE; renderCustomers(c); } });
  $('#c-coop').addEventListener('input', (e) => { state.customers.minCoop = e.target.value; state.customers.displayCount = PAGE; renderCustomers(c); });
  $('#c-add').addEventListener('click', () => openCustomerForm(null));
  $('#c-cols').addEventListener('click', () => openColumnSettings('customers', () => renderCustomers(c, true)));
  $('#c-excel-out').addEventListener('click', () => exportCustomersExcel());
  $('#c-excel-in').addEventListener('click', () => importCustomersExcel());
  $('#c-batch').addEventListener('click', batchDeleteCustomers);
  $('#c-invite').addEventListener('click', openBulkInvite);
  const updateCustBatchUI = () => {
    const n = state.customers.sel.length;
    const bn = $('#c-batch-n'); if (bn) bn.textContent = n;
    const inv = $('#c-invite'); if (inv) inv.style.display = n > 0 ? '' : 'none';
    const inn = $('#c-invite-n'); if (inn) inn.textContent = n;
    const all = $('#c-all');
    if (all) all.checked = pageRows.length > 0 && pageRows.every((x) => state.customers.sel.includes(x.id));
  };
  $('#c-all').addEventListener('change', (e) => {
    const chk = e.target.checked;
    $$('.c-chk', c).forEach((cb) => { cb.checked = chk; const id = cb.value; if (chk) { if (!state.customers.sel.includes(id)) state.customers.sel.push(id); } else { state.customers.sel = state.customers.sel.filter((x) => x !== id); } });
    updateCustBatchUI();
  });
  $$('.c-chk', c).forEach((cb) => cb.addEventListener('change', (e) => {
    const id = e.target.value;
    if (e.target.checked) { if (!state.customers.sel.includes(id)) state.customers.sel.push(id); } else { state.customers.sel = state.customers.sel.filter((x) => x !== id); }
    updateCustBatchUI();
  }));
  updateCustBatchUI();
  $$('tr[data-id]', c).forEach((tr) => tr.addEventListener('click', (e) => { if (e.target.closest('.modal-close-row') || e.target.closest('.start-coop-btn') || e.target.closest('input[type="checkbox"]') || e.target.closest('.customer-name-link')) return; e.stopPropagation(); openCustomerFloat(tr.dataset.id); }));
  $$('.customer-name-link', c).forEach((el) => el.addEventListener('click', (e) => { e.stopPropagation(); openCustomerFloat(el.dataset.cid); }));
  $$('[data-del]', c).forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); deleteCustomer(b.dataset.del); }));
  $$('.start-coop-btn', c).forEach((b) => b.addEventListener('click', async (e) => { e.stopPropagation(); const cust = await getOne('customers', b.dataset.cid); if (cust) openOrderForm(null, cust); }));
  bindHeaderMenus(c, 'customers', () => renderCustomers(c, true));
  bindDropdownCells(c, () => renderCustomers(c, true));
  $$('[data-col][data-table-key]', c).forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); clearColFilter(b.dataset.tableKey, b.dataset.col); renderCustomers(c); }));
  const clearAll = $('[data-clear-all]', c);
  if (clearAll) clearAll.addEventListener('click', () => { clearAllTableFilters(clearAll.dataset.tableKey); renderCustomers(c); });
  if (!keepScroll) c.scrollTop = 0;
  forceTableScroll(c);
  restoreFocus(_focusSnap);
}

function renderEmptyCustomers(c) {
  c.innerHTML = `<div class="maxw"><div class="card"><div class="empty">
    <p>还没有客户数据。</p>
    <div class="row" style="justify-content:center;margin-top:14px;gap:10px">
      <button class="btn btn-primary" id="c-add2">+ 新增客户</button>
      <button class="btn" id="c-in2">⭱ 导入 Excel</button>
      <button class="btn" id="c-demo2">填充示例数据(演示)</button>
    </div></div></div></div>`;
  $('#c-add2').addEventListener('click', () => openCustomerForm(null));
  $('#c-in2').addEventListener('click', () => importCustomersExcel());
  $('#c-demo2').addEventListener('click', async () => { await seedDemo(); toast('已填充示例数据', 'success'); render(); });
}

function customerFormFields(v = {}, { countryOptions = [], sourceOptions = [], refundOptions = [] } = {}) {
  const dl = (id, opts) => `<datalist id="${id}">${opts.map((x) => `<option value="${esc(x)}">`).join('')}</datalist>`;
  return `
    <div class="two-col">
      <div class="field"><label>姓名 / 账号名 *</label><input class="input" id="f-name" value="${esc(v.name)}"></div>
      <div class="field"><label>邮箱 *</label><input class="input" id="f-email" value="${esc(v.email)}"></div>
      <div class="field"><label>国家</label><input class="input" id="f-country" value="${esc(v.country)}" placeholder="如 US / UK / DE"></div>
      <div class="field"><label>来源渠道</label><input class="input" id="f-source" value="${esc(v.source)}" placeholder="TikTok / Instagram / YouTube"></div>
      <div class="field"><label>粉丝数</label><input class="input" id="f-followers" type="number" min="0" value="${esc(v.followers || 0)}"></div>
      <div class="field"><label>合作次数</label><input class="input" id="f-coop" type="number" min="0" value="${esc(v.cooperationCount || 0)}"></div>
      <div class="field"><label>测评产品</label><input class="input" id="f-product" value="${esc(v.product)}"></div>
      <div class="field"><label>返款方式</label><input class="input" id="f-refund" value="${esc(v.refundMethod)}" placeholder="PP转账 / 平台退款"></div>
      <div class="field"><label>是否垫付运费</label><select class="select" id="f-advance"><option value="false" ${v.needShippingAdvance ? '' : 'selected'}>否</option><option value="true" ${v.needShippingAdvance ? 'selected' : ''}>是</option></select></div>
      <div class="field"><label>PayPal 账号</label><input class="input" id="f-pp" value="${esc(v.ppAccount)}"></div>
      <div class="field"><label>合作开始日期</label><input class="input" id="f-start" type="date" value="${esc(v.startDate)}"></div>
      <div class="field" style="grid-column:1/-1"><label>社媒主页链接</label><input class="input" id="f-social" value="${esc(v.socialMediaUrl)}"></div>
      <div class="field" style="grid-column:1/-1"><label>最新跟进备注</label><textarea class="textarea" id="f-follow">${esc(v.latestFollowUp)}</textarea></div>
    </div>`;
}
async function openCustomerForm(id) {
  const isEdit = !!id;
  const v = isEdit ? (window.__custCache || {})[id] || {} : {};
  const allCustomers = await getAll('customers');
  const allOrders = await getAll('orders');
  const countryOptions = [...new Set([...allCustomers.map((x) => x.country), ...allOrders.map((x) => x.country), 'US', 'DE', 'UK', 'AU', 'CA', 'FR', 'IT', 'ES', 'JP'].filter(Boolean))].sort();
  const refundOptions = [...new Set([...allCustomers.map((x) => x.refundMethod), ...allOrders.map((x) => x.refundMethod), 'PayPal', '平台退款', '银行转账'].filter(Boolean))].sort();
  const sourceOptions = [...new Set([...allCustomers.map((x) => x.source), 'TikTok', 'Instagram', 'YouTube', 'Facebook', 'Discord', '其他'].filter(Boolean))].sort();
  const m = openModal(`<div class="modal-head"><h3>${isEdit ? '编辑客户' : '新增客户'}</h3><button class="x-btn modal-close">×</button></div>
    <div class="modal-body">${customerFormFields(v, { countryOptions, sourceOptions, refundOptions })}</div>
    <div class="modal-foot"><button class="btn modal-close">取消</button><button class="btn btn-primary" id="f-save">保存</button></div>`);
  m.root.querySelector('#f-save').addEventListener('click', async () => {
    const q = (sel) => m.root.querySelector(sel);
    $$('.field.error', m.root).forEach((el) => el.classList.remove('error'));
    const required = [
      { id: 'f-name', label: '姓名' },
      { id: 'f-email', label: '邮箱' },
    ];
    let firstError = null;
    const missingLabels = [];
    required.forEach((r) => {
      const el = q('#' + r.id);
      const val = el ? String(el.value).trim() : '';
      const ok = r.validate ? r.validate(val) : !!val;
      if (!ok) {
        const fieldWrap = el && el.closest('.field');
        if (fieldWrap) { fieldWrap.classList.add('error'); if (!firstError) firstError = el; }
        missingLabels.push(r.label);
      }
    });
    if (missingLabels.length) {
      if (firstError && typeof firstError.scrollIntoView === 'function') firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return toast('请填写：' + missingLabels.join(' / '), 'danger');
    }
    try {
      const name = q('#f-name').value.trim();
      const rec = {
        id: id || uid(), name,
        email: q('#f-email').value.trim(),
        socialMediaUrl: q('#f-social').value.trim(),
        country: q('#f-country').value.trim(),
        source: q('#f-source').value.trim(),
        followers: Number(q('#f-followers').value || 0),
        product: q('#f-product').value.trim(),
        cooperationCount: Number(q('#f-coop').value || 0),
        refundMethod: q('#f-refund').value.trim(),
        needShippingAdvance: q('#f-advance').value === 'true',
        ppAccount: q('#f-pp').value.trim(),
        latestFollowUp: q('#f-follow').value.trim(),
        startDate: q('#f-start').value || null,
        createdAt: v.createdAt || new Date().toISOString(),
      };
      await putOne('customers', rec);
      if (isEdit) await syncCustomerToOrders(rec);
      m.close(); toast(isEdit ? '已更新' : '已新增', 'success'); renderCustomersIfVisible(true);
    } catch (err) {
      console.error('保存客户失败:', err);
      toast('保存失败：' + (err && err.message ? err.message : err), 'danger');
    }
  });
}
function buildCustomerDetailDefs() {
  return {
    name: { type: 'text', render: (r) => esc(r.name) || '—' },
    email: { type: 'text', render: (r) => esc(r.email) || '—' },
    country: { type: 'text', render: (r) => esc(r.country) || '—' },
    source: { type: 'text', render: (r) => esc(r.source) || '—' },
    followers: { type: 'number', render: (r) => fmtInt(r.followers) },
    cooperationCount: { type: 'number', render: (r) => fmtInt(r.cooperationCount) },
    product: { type: 'text', render: (r) => esc(r.product) || '—' },
    refundMethod: { type: 'text', render: (r) => esc(r.refundMethod) || '—' },
    needShippingAdvance: { type: 'bool', render: (r) => r.needShippingAdvance ? '是' : '否' },
    ppAccount: { type: 'text', render: (r) => esc(r.ppAccount) || '—' },
    startDate: { type: 'date', render: (r) => fmtDate(r.startDate) },
    lastOrderDate: { type: 'date', render: (r) => fmtDate(r.lastOrderDate) },
    socialMediaUrl: { type: 'url', render: (r) => r.socialMediaUrl ? `<a class="link" href="${esc(r.socialMediaUrl)}" target="_blank">打开</a>` : '—' },
    latestFollowUp: { type: 'textarea', render: (r) => esc(r.latestFollowUp) || '—' },
  };
}
function kvCombo(label, field, rec, options, allLabel = '请选择') {
  const id = `combo-${field}-${rec.id}`;
  return `<dt>${esc(label)}</dt><dd>${comboFilterHtml({ id, allLabel, value: rec[field] || '', options, appendTo: true })}</dd>`;
}
function buildCustomerDetailBody(c, allOrders, allSettlements, opts = {}) {
  const orders = allOrders.filter((o) => o.customerId === c.id || o.customerName === c.name || sameEmail(o.customerEmail, c.email));
  const pendingOrders = orders.filter((o) => o.status === 'pending_refund');
  const linkedSettlements = (allSettlements || []).filter((s) => (s.orderIds || []).some((oid) => orders.some((o) => o.id === oid)));
  const defs = buildCustomerDetailDefs();
  const useCombo = !!opts.useCombo;
  const countryOpts = opts.countryOptions || [];
  const sourceOpts = opts.sourceOptions || [];
  const refundOpts = opts.refundOptions || [];
  const body = `${imagePasteHtml(c, 'image')}
  <dl class="kv">
    ${kvEdit('姓名', 'name', c, defs)}${kvEdit('邮箱', 'email', c, defs)}
    ${useCombo ? kvCombo('国家', 'country', c, countryOpts, '请选择国家') : kvEdit('国家', 'country', c, defs)}${useCombo ? kvCombo('来源', 'source', c, sourceOpts, '请选择来源') : kvEdit('来源', 'source', c, defs)}
    ${kvEdit('粉丝数', 'followers', c, defs)}${kvEdit('合作次数', 'cooperationCount', c, defs)}
    ${kvEdit('测评产品', 'product', c, defs)}${useCombo ? kvCombo('返款方式', 'refundMethod', c, refundOpts, '请选择返款方式') : kvEdit('返款方式', 'refundMethod', c, defs)}
    ${kvEdit('垫付运费', 'needShippingAdvance', c, defs)}${kvEdit('PayPal', 'ppAccount', c, defs)}
    ${kvEdit('开始日期', 'startDate', c, defs)}${kvEdit('最新合作日期', 'lastOrderDate', c, defs)}
    ${kvEdit('社媒', 'socialMediaUrl', c, defs)}
    <div style="grid-column:1/-1">${kvEdit('最新跟进', 'latestFollowUp', c, defs)}</div>
  </dl>
  <div class="section-h">待结算订单 (${pendingOrders.length})</div>
  ${pendingOrders.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>订单号</th><th>店铺</th><th class="num">金额</th></tr></thead><tbody>
    ${pendingOrders.map((o) => `<tr style="cursor:pointer" data-oid="${o.id}"><td class="mono">${esc(o.orderNumber)}</td><td>${esc(o.store)}</td><td class="num">${fmtAmount(o.amount, o.currency || o.country)}</td></tr>`).join('')}
  </tbody></table></div>` : '<div class="muted tiny">暂无待结算订单</div>'}
  <div class="section-h">历史合作订单 (${orders.length})</div>
  ${orders.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>订单号</th><th>店铺</th><th>产品</th><th class="num">金额</th><th>状态</th><th>评价截图</th></tr></thead><tbody>
    ${orders.map((o) => {
      const imgCount = (o.reviewImages || []).length;
      return `<tr style="cursor:pointer" data-oid="${o.id}"><td class="mono">${esc(o.orderNumber)}</td><td>${esc(o.store)}</td><td class="cell-ellipsis">${esc(o.product)}</td><td class="num">${fmtAmount(o.amount, o.currency || o.country)}</td><td>${statusBadge(o.status)}</td><td><button class="review-up-btn" type="button" data-review-oid="${o.id}" style="border:1px solid ${imgCount ? '#111' : '#e5e5e5'};background:${imgCount ? '#111' : '#fff'};color:${imgCount ? '#FFD600' : '#111'};border-radius:8px;padding:4px 9px;font-size:12px;font-weight:700;cursor:pointer">${imgCount ? imgCount + ' 张 📷' : '📷 上传'}</button></td></tr>`;
    }).join('')}
  </tbody></table></div>` : '<div class="muted tiny">暂无订单</div>'}
  ${linkedSettlements.length ? `<div class="section-h">结算记录 (${linkedSettlements.length})</div>
  <div class="table-wrap"><table class="data"><thead><tr><th>结算日期</th><th class="num">订单数</th><th class="num">总金额</th></tr></thead><tbody>
    ${linkedSettlements.map((s) => `<tr style="cursor:pointer" data-sid="${s.id}"><td>${fmtDate(s.settlementDate)}</td><td class="num">${fmtInt(s.orderCount)}</td><td class="num">${fmtAmount(s.totalAmount, 'USD')}</td></tr>`).join('')}
  </tbody></table></div>` : ''}
  <div class="row mt2" style="gap:8px"><button class="btn btn-sm btn-danger" id="d-del">删除客户</button><button class="btn btn-sm" id="d-view-comments" title="在客户评论管理中查看此客户的全部评论">💬 全部评论记录</button></div>`;
  return { body, defs, orders, linkedSettlements };
}
/* ============================================================
   FLOAT PANEL FRAMEWORK (right-side, multi-open, stack-managed)
   ============================================================ */
const floatStack = [];
function updateBackBtn() {
  const back = $('#btn-back'); const closeAll = $('#btn-close-all');
  if (back) back.style.display = floatStack.length ? '' : 'none';
  if (closeAll) closeAll.style.display = floatStack.length ? '' : 'none';
  const n = $('#back-count'); if (n) n.textContent = floatStack.length;
  const n2 = $('#close-all-count'); if (n2) n2.textContent = floatStack.length;
}
function pushFloat(closeFn) { floatStack.push(closeFn); updateBackBtn(); }
function closeTopFloat() { const f = floatStack.pop(); if (f) f(); updateBackBtn(); }
function closeAllFloats() { while (floatStack.length) { const f = floatStack.pop(); try { f(); } catch (e) {} } updateBackBtn(); }
let floatZ = 80;
let suppressFloatUntil = 0;
function endInteraction() { suppressFloatUntil = Date.now() + 60; }

function openFloatPanel({ title, bodyHtml, tabs, key, onReady, onClose }) {
  const root = $('#float-root');
  const panel = document.createElement('div');
  panel.className = 'float-panel';
  const idx = floatStack.length;
  panel.style.width = '400px';
  panel.style.left = Math.max(20, window.innerWidth - 400 - 20 - idx * 34) + 'px';
  panel.style.top = (16 + idx * 16) + 'px';
  panel.style.right = 'auto';
  panel.style.zIndex = ++floatZ;
  if (key) panel.dataset.key = key;
  const floatBodyInner = (tabs && tabs.length)
    ? `<div class="float-tabs">${tabs.map((t, i) => `<button class="float-tab ${i === 0 ? 'active' : ''}" data-tab="${i}">${esc(t.label)}</button>`).join('')}</div>
       <div class="float-tab-panes">${tabs.map((t, i) => `<div class="float-tab-pane" data-pane="${i}" style="${i === 0 ? '' : 'display:none'}"><div class="float-body">${t.html}</div></div>`).join('')}</div>`
    : `<div class="float-body">${bodyHtml}</div>`;
  panel.innerHTML = `
    <div class="resize-handle"></div>
    <div class="float-head">
      <h3>${esc(title)}</h3>
      <button class="pin-btn" title="置顶/取消置顶">📌</button>
      <button class="x-btn" title="关闭">×</button>
    </div>
    <div class="float-tabs-wrap">${floatBodyInner}</div>`;
  root.appendChild(panel);

  const close = () => {
    if (!panel.isConnected) return;
    panel.remove();
    const i = floatStack.indexOf(close); if (i >= 0) floatStack.splice(i, 1);
    updateBackBtn();
    if (onClose) onClose();
  };
  pushFloat(close);
  panel._close = close;

  $('.x-btn', panel).addEventListener('click', (e) => { e.stopPropagation(); close(); });
  $('.pin-btn', panel).addEventListener('click', (e) => {
    e.stopPropagation();
    const pinned = panel.classList.toggle('pinned');
    $('.pin-btn', panel).classList.toggle('pinned', pinned);
    if (pinned) panel.style.zIndex = ++floatZ;
  });
  if (tabs && tabs.length) {
    $$('.float-tab', panel).forEach((tab) => tab.addEventListener('click', () => {
      const i = +tab.dataset.tab;
      $$('.float-tab', panel).forEach((t) => t.classList.toggle('active', t === tab));
      $$('.float-tab-pane', panel).forEach((p) => { p.style.display = (+p.dataset.pane === i) ? '' : 'none'; });
    }));
  }

  const head = $('.float-head', panel);
  let dragging = false, sx, sy, sl, st;
  head.addEventListener('mousedown', (e) => {
    if (e.target.closest('button')) return;
    dragging = true; sx = e.clientX; sy = e.clientY;
    const r = panel.getBoundingClientRect(); sl = r.left; st = r.top;
    panel.style.transition = 'none'; document.body.style.userSelect = 'none';
    panel.style.zIndex = ++floatZ;
  });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    panel.style.left = (sl + e.clientX - sx) + 'px';
    panel.style.top = Math.max(0, st + e.clientY - sy) + 'px';
    panel.style.right = 'auto';
  });
  const endDrag = () => { dragging = false; panel.style.transition = ''; document.body.style.userSelect = ''; endInteraction(); };
  window.addEventListener('mouseup', endDrag);

  const handle = $('.resize-handle', panel);
  let resizing = false, sw, sx2, sLeft;
  handle.addEventListener('mousedown', (e) => {
    resizing = true; sx2 = e.clientX; sw = panel.offsetWidth;
    sLeft = panel.getBoundingClientRect().left;
    e.preventDefault(); document.body.style.userSelect = 'none';
  });
  window.addEventListener('mousemove', (e) => {
    if (!resizing) return;
    const dx = e.clientX - sx2;
    const newW = Math.max(320, Math.min(window.innerWidth * 0.9, sw - dx));
    panel.style.width = newW + 'px';
    panel.style.left = (sLeft + dx) + 'px';
  });
  window.addEventListener('mouseup', () => { resizing = false; document.body.style.userSelect = ''; endInteraction(); });

  panel.addEventListener('mousedown', () => { panel.style.zIndex = ++floatZ; });

  if (onReady) onReady(panel, close);
  return { panel, close };
}

async function openCustomerDetail(id) {
  const c = await getOne('customers', id);
  if (!c) return;
  const [allOrders, allSettlements] = await Promise.all([getAll('orders'), getAll('settlements')]);
  const { body, defs, orders } = buildCustomerDetailBody(c, allOrders, allSettlements);
  const d = openDrawer('客户详情 · ' + c.name, body);
  bindImagePaste(d.root, c, 'customers', 'image', () => { d.close(); openCustomerDetail(id); });
  bindInlineEdit(d.root, c, 'customers', defs, { onSave: async (rec, field) => { if (CUSTOMER_ORDER_SYNC_FIELDS.includes(field)) await syncCustomerToOrders(rec); renderCustomersIfVisible(true); } });
  $$('tr[data-oid]', d.root).forEach((tr) => tr.addEventListener('click', () => { d.close(); openOrderDetail(tr.dataset.oid); }));
  $$('tr[data-sid]', d.root).forEach((tr) => tr.addEventListener('click', () => { d.close(); openSettlementDetail(tr.dataset.sid); }));
  $('#d-del', d.root).addEventListener('click', () => { d.close(); deleteCustomer(id); });
}
async function openCustomerFloat(id) {
  const prev = document.querySelector('#float-root .float-panel[data-key="customer-' + id + '"]');
  if (prev && prev._close) prev._close();
  const c = await getOne('customers', id);
  if (!c) return;
  const [allCustomers, allOrders, allSettlements] = await Promise.all([getAll('customers'), getAll('orders'), getAll('settlements')]);
  const countryBase = [...new Set([...allCustomers.map((x) => x.country), ...allOrders.map((x) => x.country), 'US', 'DE', 'UK', 'AU', 'CA', 'FR', 'IT', 'ES', 'JP'])].filter(Boolean);
  const sourceBase = [...new Set([...allCustomers.map((x) => x.source), 'TikTok', 'Instagram', 'YouTube', 'Facebook', 'Discord', '其他'])].filter(Boolean);
  const refundBase = [...new Set([...allCustomers.map((x) => x.refundMethod), ...allOrders.map((x) => x.refundMethod), 'PayPal', '平台退款', '银行转账'])].filter(Boolean);
  const countryOptions = comboOptions('customers.country', countryBase);
  const sourceOptions = comboOptions('customers.source', sourceBase);
  const refundOptions = comboOptions('customers.refundMethod', refundBase);
  const { body, defs } = buildCustomerDetailBody(c, allOrders, allSettlements, { useCombo: true, countryOptions, sourceOptions, refundOptions });
  const cmPaneHtml = `<div id="cm-customer-${id}" class="comment-mgr-pane"></div>`;
  const detachedPops = [];
  const saveField = async (field, val, tagField) => {
    if (val && tagField) addCustomTag(tagField, val);
    c[field] = val;
    await putOne('customers', c);
    if (CUSTOMER_ORDER_SYNC_FIELDS.includes(field)) await syncCustomerToOrders(c);
    renderCustomersIfVisible(true);
    toast('已更新', 'success');
  };
  openFloatPanel({
    title: c.name, key: 'customer-' + id,
    tabs: [{ label: '详情', html: body }, { label: '评论管理', html: cmPaneHtml }],
    onReady: (panel, close) => {
      bindImagePaste(panel, c, 'customers', 'image', () => { close(); openCustomerFloat(id); });
      bindInlineEdit(panel, c, 'customers', defs, { onSave: async (rec, field) => { if (CUSTOMER_ORDER_SYNC_FIELDS.includes(field)) await syncCustomerToOrders(rec); renderCustomersIfVisible(true); } });
      const p1 = initCombo(panel, `combo-country-${c.id}`, { value: c.country || '', allLabel: '请选择国家', options: countryOptions, baseOptions: countryBase, onSelect: (v) => saveField('country', v, 'customers.country'), appendTo: document.body });
      const p2 = initCombo(panel, `combo-source-${c.id}`, { value: c.source || '', allLabel: '请选择来源', options: sourceOptions, baseOptions: sourceBase, onSelect: (v) => saveField('source', v, 'customers.source'), appendTo: document.body });
      const p3 = initCombo(panel, `combo-refundMethod-${c.id}`, { value: c.refundMethod || '', allLabel: '请选择返款方式', options: refundOptions, baseOptions: refundBase, onSelect: (v) => saveField('refundMethod', v, 'customers.refundMethod'), appendTo: document.body });
      if (p1) detachedPops.push(p1); if (p2) detachedPops.push(p2); if (p3) detachedPops.push(p3);
      $$('tr[data-oid]', panel).forEach((tr) => tr.addEventListener('click', () => openOrderDetail(tr.dataset.oid)));
      $$('tr[data-sid]', panel).forEach((tr) => tr.addEventListener('click', () => openSettlementDetail(tr.dataset.sid)));
      $$('.review-up-btn', panel).forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); openReviewImagesEditor(b.dataset.reviewOid, id); }));
      $('#d-del', panel).addEventListener('click', () => { close(); deleteCustomer(id); });
      $('#d-view-comments', panel).addEventListener('click', () => { close(); state.comments.kw = c.name || ''; navigate('comments'); });
      const cmPane = $('#cm-customer-' + id, panel);
      if (cmPane) renderCustomerCommentManager(cmPane, { id, onChange: () => renderCustomersIfVisible(true) });
    },
    onClose: () => { detachedPops.forEach((p) => { if (p && p.isConnected) p.remove(); }); }
  });
}
async function openReviewImagesEditor(orderId, customerId) {
  const o = await getOne('orders', orderId); if (!o) return;
  if (!Array.isArray(o.reviewImages)) o.reviewImages = [];
  const m = openModal(`<div class="modal-head"><h3>评论截图 · 订单 ${esc(o.orderNumber || '')}</h3><button class="x-btn modal-close">×</button></div><div class="modal-body">${imagesEditHtml(o, 'reviewImages')}</div>`, { wide: true });
  bindImagesEdit(m.root, o, 'orders', 'reviewImages', () => { m.close(); if (customerId) openCustomerFloat(customerId); });
}
async function deleteCustomer(id) {
  const cust = await getOne('customers', id);
  const allComments = await getAll('comments');
  const linkedComments = allComments.filter((c) => c.customerName === (cust?.name || ''));
  let msg = '确定删除该客户？此操作不可撤销。';
  if (linkedComments.length > 0) msg += `\n\n⚠️ 该客户关联 ${linkedComments.length} 条评论记录，删除后评论仍保留但失去客户关联。`;
  if (!confirm(msg)) return;
  await delOne('customers', id);
  toast('已删除', 'success'); render();
}
async function batchDeleteCustomers() {
  const ids = [...state.customers.sel];
  if (!ids.length) { toast('请先勾选要删除的客户', 'info'); return; }
  if (!confirm(`确定删除选中的 ${ids.length} 个客户？\n关联订单不会被删除，但会失去客户关联。`)) return;
  for (const id of ids) await delOne('customers', id);
  state.customers.sel = [];
  toast(`已删除 ${ids.length} 个客户`, 'success'); render();
}

/* ---------- 新品测评批量邀约 ---------- */
// 纯函数：根据参数生成群发邀约邮件（通用 BCC 版 / 个性化逐条版）
function buildInviteEmail({ product, brand, platform, region, market, personalized, items }) {
  const b = (brand && brand.trim()) || 'IBAY Aqua';
  const p = (product && product.trim()) || '【请填写产品名】';
  const plat = (platform && platform.trim()) || 'social media';
  const reg = (region && region.trim()) || 'your region';
  const mk = market ? ` (${market})` : '';
  const subject = `合作邀约｜${p} 新品免费测评（${plat} 达人）`;
  const greetBlock = (name) => (name ? `Hi ${name},` : 'Hi Creator,');
  const intro = (name) => `${greetBlock(name)}\n\nHope you're doing great! We're ${b}, an aquarium equipment brand on Amazon${mk}. We're launching a new product — ${p} — and would love to invite you to a free product review on your ${plat} channel.`;
  const tail = `\n\nWhat we offer:\n- Free product sample shipped to you\n- Commission / affiliate discount code for your audience\n- Full creative freedom for an honest review or unboxing\n\nWe noticed you're a ${plat} creator based in ${reg} — a great fit for our${mk} storefront. If you're interested, just reply to this email and we'll arrange the sample right away.\n\nBest regards,\nAnna\n${b} · Overseas Social Media Team`;
  const valid = items.filter((it) => normEmails(it.email).length);
  if (!personalized) {
    const body = intro('') + tail;
    return { subject, body, raw: `Subject: ${subject}\n\n${body}`, count: valid.length };
  }
  const blocks = valid.map((it) => {
    const first = String(it.name || '').split(/[_\s]+/)[0] || 'Creator';
    return `To: ${normEmails(it.email).join(', ')}\n${intro(first)}${tail}`;
  });
  return { subject, body: intro('') + tail, raw: blocks.join('\n\n----------------------------------------\n\n'), count: valid.length };
}

async function openBulkInvite() {
  const ids = [...state.customers.sel];
  if (!ids.length) { toast('请先勾选要邀约的客户', 'info'); return; }
  const all = await getAll('customers');
  const items = all.filter((x) => ids.includes(x.id)).map((x) => ({ id: x.id, name: x.name, email: x.email, source: x.source, country: x.country }));
  const withEmail = items.filter((x) => normEmails(x.email).length);
  const platforms = [...new Set(items.map((x) => x.source).filter(Boolean))];
  const countries = [...new Set(items.map((x) => x.country).filter(Boolean))];
  const commonPlatform = platforms.length === 1 ? platforms[0] : '';
  const commonCountry = countries.length === 1 ? countries[0] : '';
  const commonMarket = commonCountry ? (COUNTRY_MARKET[commonCountry.toUpperCase()] || '') : '';

  const listHtml = items.map((x) => `<div class="bi-row">
    <div class="bi-name">${esc(x.name || '—')}</div>
    <div class="bi-meta"><span class="badge neutral">${esc(x.source || '—')}</span> <span class="badge neutral">${esc(x.country || '—')}</span></div>
    <div class="bi-email">${x.email ? esc(x.email) : '<span class="bi-noemail">无邮箱</span>'}</div>
  </div>`).join('');

  const html = `<div class="bi-wrap">
    <div class="bi-summary">已选 <b>${items.length}</b> 位达人，其中 <b>${withEmail.length}</b> 位有可用邮箱${items.length !== withEmail.length ? `（<span class="bi-noemail">${items.length - withEmail.length} 位缺邮箱</span>）` : ''}。</div>
    <div class="bi-list">${listHtml}</div>
    <div class="field"><label>产品 / 测评主题 *</label><input class="input" id="bi-product" placeholder="如 HITOP 50W 鱼缸加热棒 新品测评"></div>
    <div class="field"><label>品牌署名</label><input class="input" id="bi-brand" value="IBAY Aqua"></div>
    <div class="field"><label>社媒平台</label><input class="input" id="bi-platform" value="${esc(commonPlatform)}" placeholder="TikTok / Instagram / YouTube"></div>
    <div class="field"><label>地区 / 国家</label><input class="input" id="bi-region" value="${esc(commonCountry)}" placeholder="如 DE / US"></div>
    <label class="bi-check"><input type="checkbox" id="bi-personalized"> 个性化逐条（每位达人单独一段，含姓名问候）</label>
    <div class="bi-copy-btns">
      <button class="btn btn-sm" id="bi-copy-emails">📋 复制全部邮箱 (BCC)</button>
      <button class="btn btn-sm btn-primary" id="bi-copy-mail">📋 复制邀约邮件</button>
    </div>
    <div class="field" style="margin-top:14px"><label>预览 / 可手动编辑</label><textarea class="textarea" id="bi-preview" style="min-height:220px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;white-space:pre-wrap"></textarea></div>
  </div>`;

  const d = openDrawer(`📧 新品测评批量邀约 (${items.length})`, html, { headActions: '' });
  const q = (s) => d.root.querySelector(s);
  const render = () => {
    const data = {
      product: q('#bi-product').value, brand: q('#bi-brand').value, platform: q('#bi-platform').value,
      region: q('#bi-region').value, market: commonMarket, personalized: q('#bi-personalized').checked, items,
    };
    const out = buildInviteEmail(data);
    q('#bi-preview').value = out.raw;
    return out;
  };
  ['#bi-product', '#bi-brand', '#bi-platform', '#bi-region', '#bi-personalized'].forEach((s) => {
    const el = q(s); if (el) el.addEventListener('input', render); if (el && el.type === 'checkbox') el.addEventListener('change', render);
  });
  q('#bi-copy-emails').addEventListener('click', async () => {
    const emails = withEmail.flatMap((x) => normEmails(x.email)).join(', ');
    if (!emails) return toast('没有可用的邮箱', 'danger');
    const ok = await copyText(emails);
    toast(ok ? `已复制 ${withEmail.length} 位达人的邮箱` : '复制失败，请手动选择', ok ? 'success' : 'danger');
  });
  q('#bi-copy-mail').addEventListener('click', async () => {
    if (!q('#bi-product').value.trim()) { q('#bi-product').focus(); return toast('请先填写产品 / 测评主题', 'danger'); }
    const out = render();
    if (!out.count) return toast('所选达人都没有可用邮箱', 'danger');
    const ok = await copyText(out.raw);
    toast(ok ? `已复制邀约邮件（${out.count} 位）` : '复制失败，请手动复制', ok ? 'success' : 'danger');
  });
  render();
}

/* ============================================================
   ORDERS
   ============================================================ */
async function fetchOrders() {
  let list = await getAll('orders');
  const f = state.orders;
  if (f.kw) list = list.filter((x) => matchKw(f.kw, [x.customerName, x.customerEmail, x.orderNumber, x.product, x.store, x.ppAccount, x.socialMediaUrl]));
  if (f.store) list = list.filter((x) => x.store === f.store);
  if (f.refundMethod) list = list.filter((x) => x.refundMethod === f.refundMethod);
  if (f.country) list = list.filter((x) => x.country === f.country);
  if (f.status) list = list.filter((x) => x.status === f.status);
  if (f.start) list = list.filter((x) => x.orderDate && x.orderDate >= f.start);
  if (f.end) list = list.filter((x) => x.orderDate && x.orderDate <= f.end);
  if (f.reviewStart) list = list.filter((x) => x.reviewSubmitDate && x.reviewSubmitDate >= f.reviewStart);
  if (f.reviewEnd) list = list.filter((x) => x.reviewSubmitDate && x.reviewSubmitDate <= f.reviewEnd);
  list = applyColFilter('orders', list);
  const colSort = getTableState('orders').find((c) => c.sort);
  if (colSort) {
    list = applyColSort('orders', list);
  } else {
    const dir = state.orders.sortDir === 'asc' ? 1 : -1;
    list.sort((a, b) => (new Date(a.orderDate || 0) - new Date(b.orderDate || 0)) * dir);
  }
  return list;
}
async function renderOrders(c, keepScroll = false) {
  const all = await getAll('orders');
  if (!all.length) return renderEmptyOrders(c);
  const list = await fetchOrders();
  const reviewedCount = list.filter((x) => (x.reviewImages || []).length > 0).length;
  // 月度有效评论统计：有内容或图片且提交时间非空
  let validAll = 0, validMonth = 0;
  const curMonth = todayISO().slice(0, 7);
  list.forEach((o) => (o.comments || []).forEach((cm) => {
    const hasContent = (cm.content || '').trim() || (cm.images || []).length;
    if (hasContent && cm.submitDate) { validAll++; if (String(cm.submitDate).slice(0, 7) === curMonth) validMonth++; }
  }));
  const ddCache = buildDropdownCache('orders', all);
  const stores = [...new Set(all.map((x) => x.store).filter(Boolean))].sort();
  const countries = [...new Set(all.map((x) => x.country).filter(Boolean))].sort();
  const refunds = [...new Set(all.map((x) => x.refundMethod).filter(Boolean))].sort();
  const total = list.length;
  state.orders._total = total;
  state.orders.displayCount = Math.min(Math.max(state.orders.displayCount || PAGE, PAGE), total);
  const pageRows = list.slice(0, state.orders.displayCount);

  const _focusSnap = captureFocus();
  c.innerHTML = `<div class="maxw">
    <div class="toolbar">
      <input class="input" style="max-width:250px" id="o-kw" placeholder="搜索客户 / 邮箱 / 订单号 / 产品…" value="${esc(state.orders.kw)}">
      ${comboFilterHtml({ id: 'o-store', allLabel: '全部店铺', value: state.orders.store, options: comboOptions('orders.store', stores) })}
      ${comboFilterHtml({ id: 'o-status', allLabel: '全部状态', value: state.orders.status, options: Object.keys(STATUS), displayMap: Object.fromEntries(Object.entries(STATUS).map(([k, v]) => [k, v.label])) })}
      ${comboFilterHtml({ id: 'o-country', allLabel: '全部国家', value: state.orders.country, options: comboOptions('orders.country', countries) })}
      ${comboFilterHtml({ id: 'o-refund', allLabel: '全部返款方式', value: state.orders.refundMethod, options: comboOptions('orders.refundMethod', refunds) })}
      <input class="input" style="max-width:140px" id="o-start" type="date" value="${esc(state.orders.start)}">
      <input class="input" style="max-width:140px" id="o-end" type="date" value="${esc(state.orders.end)}">
      <span class="filter-group"><span class="filter-label">评论提交</span><input class="input" style="max-width:140px" id="o-review-start" type="date" value="${esc(state.orders.reviewStart)}"><span class="filter-sep">~</span><input class="input" style="max-width:140px" id="o-review-end" type="date" value="${esc(state.orders.reviewEnd)}"></span>
      <span class="stat-pill" title="统计：评论提交时间在所选范围内，且评论截图不为空的订单数"><span class="stat-ico">📸</span>评论提交且有截图（${(state.orders.reviewStart || state.orders.reviewEnd) ? `${esc(state.orders.reviewStart || '…')} ~ ${esc(state.orders.reviewEnd || '…')}` : '全部'}）：<b>${reviewedCount}</b> 条</span>
      <span class="stat-pill stat-pill-comment" id="o-comment-stat" title="按评论提交时间统计的有效评论（有内容或图片且提交时间非空），点击查看月度柱状图"><span class="stat-ico">💬</span>有效评论(按提交时间)：全部 <b>${validAll}</b> / 本月 <b>${validMonth}</b></span>
      <button class="btn btn-sm" id="o-sort" title="切换订单时间排序">${state.orders.sortDir === 'asc' ? '↑ 时间升序' : '↓ 时间降序'}</button>
      <div class="grow"></div>
      <button class="btn btn-sm" id="o-excel-out">⭳ 导出Excel</button>
      <button class="btn btn-sm" id="o-excel-in">⭱ 导入Excel</button>
      <button class="btn btn-sm btn-danger" id="o-batch">🗑 批量删除 (<span id="o-batch-n">0</span>)</button>
      <button class="btn btn-sm" id="o-cols" title="列设置（显示/隐藏/下拉配置）">⚙ 列设置</button>
      <button class="btn btn-primary btn-sm" id="o-add">+ 新增订单</button>
    </div>
    ${filterTagsHtml('orders')}
    <div class="table-wrap"><table class="data sticky-first-col" data-table="orders"><thead><tr>
      <th class="chk-col"><input type="checkbox" id="o-all"></th>
      ${headerRowHtml('orders')}
      <th></th>
    </tr></thead><tbody>
      ${buildTbody('orders', pageRows, (x) => {
        const tds = getTableState('orders').filter((c) => !c.hidden).map((c) => {
          let v = '';
          const _dd = dropdownTd('orders', 'orders', c, x, ddCache[c.key]);
          if (_dd) { v = _dd; }
          else if (c.key === 'orderDate') v = `<td>${fmtDate(x.orderDate)}</td>`;
          else if (c.key === 'customerName') v = `<td><span class="customer-name-link" data-cid="${esc(x.customerId || '')}">${esc(x.customerName)}</span></td>`;
          else if (c.key === 'amount') v = `<td class="num">${fmtAmount(x.amount, x.currency || x.country)}</td>`;
          else if (c.key === 'orderNumber') v = `<td class="mono">${esc(x.orderNumber)}</td>`;
          else if (c.key === 'status') v = `<td>${statusBadge(x.status)}</td>`;
          else if (c.key === 'reviewImages') { const imgs = x.reviewImages || []; v = imgs.length ? `<td><div class="thumb-row">${imgs.slice(0, 3).map((u) => `<img class="cell-thumb" src="${esc(u)}" title="点击放大">`).join('')}${imgs.length > 3 ? ` <span class="tiny">+${imgs.length - 3}</span>` : ''}</div></td>` : `<td>—</td>`; }
          else if (c.key === 'reviewSubmitDate') v = `<td>${x.reviewSubmitDate ? fmtDate(x.reviewSubmitDate) : '—'}</td>`;
          else if (c.key === 'commentSummary') {
            const cms = x.comments || [];
            if (!cms.length) v = `<td>—</td>`;
            else if (cms.length === 1) {
              const txt = (cms[0].content || '').slice(0, 60);
              const imgN = (cms[0].images || []).length;
              v = `<td class="cell-ellipsis">${esc(txt)}${imgN ? ` <span class="tiny">${imgN}图</span>` : ''}<button class="link comment-open" data-cid="${esc(x.id)}" title="打开评论管理">⤢</button></td>`;
            } else {
              const expanded = state.orders._expanded.has(x.id);
              const first = (cms[0].content || '').slice(0, 60);
              const all = cms.map((cm) => (cm.content || '') + ((cm.images || []).length ? ` [${cm.images.length}图]` : '')).join(' | ');
              v = `<td class="cell-ellipsis">${expanded ? esc(all) : esc(first)}<button class="link comment-expand" data-cid="${esc(x.id)}">共${cms.length}条 ▾展开</button><button class="link comment-open" data-cid="${esc(x.id)}" title="打开评论管理">⤢</button></td>`;
            }
          }
          else if (c.key === 'product') v = `<td class="cell-ellipsis">${esc(x.product)}</td>`;
          else if (c.key === '__formula__') v = `<td class="num">${esc(applyFormula(c.formulaExpr, x))}</td>`;
          else v = `<td>${esc(x[c.key])}</td>`;
          if (c.person && x[c.key]) v = `<td><span class="avatar">${esc(String(x[c.key])[0] || '?')}</span></td>`;
          if (c.alert && !isNaN(Number(x[c.key]))) { const num = Number(x[c.key]); if ((c.alert.op === '>' && num > c.alert.value) || (c.alert.op === '<' && num < c.alert.value)) v = v.replace('<td', '<td class="cell-alert"'); }
          if (c.color) v = v.replace('<td', `<td style="background:${c.color}"`);
          return v;
        }).join('');
        return `<tr style="cursor:pointer" data-id="${x.id}">
          <td class="chk-col"><input type="checkbox" class="o-chk" value="${x.id}" ${state.orders.sel.includes(x.id) ? 'checked' : ''}></td>
          ${tds}
          <td class="action-cell-btns"><button class="btn btn-icon btn-sm quick-order-btn" data-qo="${x.id}" title="快捷复购下单">➕</button><button class="btn btn-icon btn-sm modal-close-row" data-del="${x.id}">🗑</button></td>
        </tr>`;
      })}
    </tbody></table></div>
    <div class="load-more" id="o-load-more">${state.orders.displayCount < total ? `已显示 ${state.orders.displayCount}/${total} 条 · 继续向下滚动加载更多` : `已加载全部 ${total} 条`}</div>
  </div>`;

  $('#o-kw').addEventListener('input', (e) => { state.orders.kw = e.target.value; state.orders.displayCount = PAGE; renderOrders(c, true); });
  initCombo(c, 'o-store', { value: state.orders.store, allLabel: '全部店铺', options: comboOptions('orders.store', stores), baseOptions: stores, onSelect: (v) => { if (v && !stores.includes(v)) addCustomTag('orders.store', v); state.orders.store = v; state.orders.displayCount = PAGE; renderOrders(c); } });
  initCombo(c, 'o-status', { value: state.orders.status, allLabel: '全部状态', options: Object.keys(STATUS), baseOptions: Object.keys(STATUS), displayMap: Object.fromEntries(Object.entries(STATUS).map(([k, v]) => [k, v.label])), onSelect: (v) => { state.orders.status = v; state.orders.displayCount = PAGE; renderOrders(c); } });
  initCombo(c, 'o-country', { value: state.orders.country, allLabel: '全部国家', options: comboOptions('orders.country', countries), baseOptions: countries, onSelect: (v) => { if (v && !countries.includes(v)) addCustomTag('orders.country', v); state.orders.country = v; state.orders.displayCount = PAGE; renderOrders(c); } });
  initCombo(c, 'o-refund', { value: state.orders.refundMethod, allLabel: '全部返款方式', options: comboOptions('orders.refundMethod', refunds), baseOptions: refunds, onSelect: (v) => { if (v && !refunds.includes(v)) addCustomTag('orders.refundMethod', v); state.orders.refundMethod = v; state.orders.displayCount = PAGE; renderOrders(c); } });
  $('#o-start').addEventListener('change', (e) => { state.orders.start = e.target.value; state.orders.displayCount = PAGE; renderOrders(c); });
  $('#o-end').addEventListener('change', (e) => { state.orders.end = e.target.value; state.orders.displayCount = PAGE; renderOrders(c); });
  $('#o-review-start').addEventListener('change', (e) => { state.orders.reviewStart = e.target.value; state.orders.displayCount = PAGE; renderOrders(c); });
  $('#o-review-end').addEventListener('change', (e) => { state.orders.reviewEnd = e.target.value; state.orders.displayCount = PAGE; renderOrders(c); });
  const toggleSort = () => { state.orders.sortDir = state.orders.sortDir === 'asc' ? 'desc' : 'asc'; state.orders.displayCount = PAGE; renderOrders(c); };
  $('#o-sort').addEventListener('click', toggleSort);
  const sortTh = $('#o-sort-th');
  if (sortTh) sortTh.addEventListener('click', toggleSort);
  $('#o-add').addEventListener('click', () => openOrderForm(null));
  $('#o-cols').addEventListener('click', () => openColumnSettings('orders', () => renderOrders(c, true)));
  $('#o-comment-stat').addEventListener('click', () => openCommentMonthChart(list));
  $$('.comment-expand', c).forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); const id = b.dataset.cid; if (state.orders._expanded.has(id)) state.orders._expanded.delete(id); else state.orders._expanded.add(id); renderOrders(c, true); }));
  $('#o-excel-out').addEventListener('click', () => exportOrdersExcel());
  $('#o-excel-in').addEventListener('click', () => importOrdersExcel());
  $('#o-batch').addEventListener('click', batchDeleteOrders);
  const updateOrdBatchUI = () => {
    const n = state.orders.sel.length;
    const bn = $('#o-batch-n'); if (bn) bn.textContent = n;
    const all = $('#o-all');
    if (all) all.checked = pageRows.length > 0 && pageRows.every((x) => state.orders.sel.includes(x.id));
  };
  $('#o-all').addEventListener('change', (e) => {
    const chk = e.target.checked;
    $$('.o-chk', c).forEach((cb) => { cb.checked = chk; const id = cb.value; if (chk) { if (!state.orders.sel.includes(id)) state.orders.sel.push(id); } else { state.orders.sel = state.orders.sel.filter((x) => x !== id); } });
    updateOrdBatchUI();
  });
  $$('.o-chk', c).forEach((cb) => cb.addEventListener('change', (e) => {
    const id = e.target.value;
    if (e.target.checked) { if (!state.orders.sel.includes(id)) state.orders.sel.push(id); } else { state.orders.sel = state.orders.sel.filter((x) => x !== id); }
    updateOrdBatchUI();
  }));
  updateOrdBatchUI();
  $$('tr[data-id]', c).forEach((tr) => tr.addEventListener('click', (e) => { if (e.target.closest('.modal-close-row') || e.target.closest('.quick-order-btn') || e.target.closest('.customer-name-link') || e.target.closest('input[type="checkbox"]')) return; e.stopPropagation(); openOrderDetail(tr.dataset.id); }));
  $$('[data-del]', c).forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); deleteOrder(b.dataset.del); }));
  $$('.quick-order-btn', c).forEach((b) => b.addEventListener('click', async (e) => { e.stopPropagation(); const src = await getOne('orders', b.dataset.qo); if (src) openOrderForm(null, src); }));
  $$('.customer-name-link', c).forEach((el) => el.addEventListener('click', (e) => { e.stopPropagation(); const cid = el.dataset.cid; if (cid) openCustomerFloat(cid); }));
  bindHeaderMenus(c, 'orders', () => renderOrders(c, true));
  bindDropdownCells(c, () => renderOrders(c, true));
  $$('.cell-thumb', c).forEach((img) => img.addEventListener('click', (e) => { e.stopPropagation(); openModal(`<div class="modal-body" style="text-align:center"><img src="${img.src}" style="max-width:100%;border-radius:12px"></div>`, { wide: true }); }));
  $$('[data-col][data-table-key]', c).forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); clearColFilter(b.dataset.tableKey, b.dataset.col); renderOrders(c); }));
  const clearAll = $('[data-clear-all]', c);
  if (clearAll) clearAll.addEventListener('click', () => { clearAllTableFilters(clearAll.dataset.tableKey); renderOrders(c); });
  if (!keepScroll) c.scrollTop = 0;
  forceTableScroll(c);
  restoreFocus(_focusSnap);
}
function renderEmptyOrders(c) {
  c.innerHTML = `<div class="maxw"><div class="card"><div class="empty">
    <p>还没有订单数据。</p>
    <div class="row" style="justify-content:center;margin-top:14px;gap:10px">
      <button class="btn btn-primary" id="o-add2">+ 新增订单</button>
      <button class="btn" id="o-in2">⭱ 导入 Excel</button>
      <button class="btn" id="o-demo2">填充示例数据(演示)</button>
    </div></div></div></div>`;
  $('#o-add2').addEventListener('click', () => openOrderForm(null));
  $('#o-in2').addEventListener('click', () => importOrdersExcel());
  $('#o-demo2').addEventListener('click', async () => { await seedDemo(); toast('已填充示例数据', 'success'); render(); });
}
function orderFormFields(v = {}, { storeOptions = [], countryOptions = [], refundOptions = [] } = {}) {
  const dl = (id, opts) => `<datalist id="${id}">${opts.map((x) => `<option value="${esc(x)}">`).join('')}</datalist>`;
  const currency = v.currency || currencyOfCountry(v.country);
  return `
    <div class="two-col">
      <div class="field"><label>订单日期</label><input class="input" id="o-orderDate" type="date" value="${esc(v.orderDate)}"></div>
      <div class="field"><label>评论提交时间</label><input class="input" id="o-reviewSubmitDate" type="date" value="${esc(v.reviewSubmitDate)}"></div>
      <div class="field"><label>客户名称 *</label><input class="input" id="o-customerName" value="${esc(v.customerName)}"></div>
      <div class="field"><label>客户邮箱</label><input class="input" id="o-customerEmail" value="${esc(v.customerEmail)}"></div>
      <div class="field"><label>店铺 *</label><input class="input" id="of-store" value="${esc(v.store)}" placeholder="HS-US / IB-US"></div>
      <div class="field"><label>产品 *</label><input class="input" id="o-product" value="${esc(v.product)}"></div>
      <div class="field"><label>产品链接</label><input class="input" id="o-productUrl" value="${esc(v.productUrl)}"></div>
      <div class="field"><label>金额 *</label><input class="input" id="o-amount" type="number" step="0.01" min="0" value="${esc(v.amount || 0)}"></div>
      <div class="field"><label>货币单位 *</label><select class="select" id="o-currency">${Object.keys(CURRENCY_SYMBOL).map((c) => `<option value="${esc(c)}" ${c === currency ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
      <div class="field"><label>合作序号</label><input class="input" id="o-coopIdx" type="number" min="1" value="${esc(v.cooperationIndex || 1)}"></div>
      <div class="field"><label>订单号 (唯一) *</label><input class="input" id="o-orderNumber" value="${esc(v.orderNumber)}"></div>
      <div class="field"><label>返款方式</label><input class="input" id="o-refundMethod" value="${esc(v.refundMethod)}"></div>
      <div class="field"><label>PayPal 账号</label><input class="input" id="o-ppAccount" value="${esc(v.ppAccount)}"></div>
      <div class="field"><label>状态</label><select class="select" id="o-statusSel">${Object.entries(STATUS).map(([k, m]) => `<option value="${k}" ${k === (v.status || 'pending_refund') ? 'selected' : ''}>${m.label}</option>`).join('')}</select></div>
      <div class="field"><label>国家</label><input class="input" id="of-country" value="${esc(v.country)}"></div>
      <div class="field"><label>社媒链接</label><input class="input" id="o-social" value="${esc(v.socialMediaUrl)}"></div>
      <div class="field" style="grid-column:1/-1"><label>评价截图 URL</label><input class="input" id="o-reviewShot" value="${esc(v.reviewScreenshotUrl)}"></div>
      <div class="field" style="grid-column:1/-1"><label>转账凭证 URL</label><input class="input" id="o-transferShot" value="${esc(v.transferScreenshotUrl)}"></div>
      <div class="field" style="grid-column:1/-1"><label>测评文案</label><textarea class="textarea" id="o-reviewContent">${esc(v.reviewContent)}</textarea></div>
      <div class="field" style="grid-column:1/-1"><label>沟通反馈</label><textarea class="textarea" id="o-feedback">${esc(v.feedback)}</textarea></div>
    </div>`;
}
function buildOrderPrefillFromOrder(order) {
  return {
    customerName: order.customerName,
    customerEmail: order.customerEmail,
    country: order.country,
    refundMethod: order.refundMethod,
    ppAccount: order.ppAccount,
    socialMediaUrl: order.socialMediaUrl,
    status: 'pending_refund',
    store: order.store,
    cooperationIndex: Number(order.cooperationIndex || 0) + 1,
    orderDate: todayISO(),
  };
}
function buildOrderPrefillFromCustomer(c) {
  return {
    customerName: c.name,
    customerEmail: c.email,
    country: c.country,
    refundMethod: c.refundMethod,
    ppAccount: c.ppAccount,
    socialMediaUrl: c.socialMediaUrl,
    status: 'pending_refund',
    store: '',
    cooperationIndex: Number(c.cooperationCount || 0) + 1,
    orderDate: todayISO(),
  };
}
async function openOrderForm(id, prefill = null) {
  const isEdit = !!id;
  let v = {};
  if (isEdit) {
    v = (window.__ordCache || {})[id] || {};
    if (!v.id) {
      const dbOrder = await getOne('orders', id);
      if (dbOrder) v = dbOrder;
    }
  } else if (prefill) {
    v = prefill.orderNumber != null ? buildOrderPrefillFromOrder(prefill) : buildOrderPrefillFromCustomer(prefill);
  }
  const allOrders = await getAll('orders');
  const storeOptions = [...new Set([...allOrders.map((x) => x.store), 'HS-US', 'HS-UK', 'HS-DE', 'HS-AU', 'HS-CA', 'HS-FR', 'IB-US', 'IB-UK', 'IB-DE', 'IB-AU', 'IB-CA', 'IB-FR'].filter(Boolean))].sort();
  const countryOptions = [...new Set([...allOrders.map((x) => x.country), 'US', 'DE', 'UK', 'AU', 'CA', 'FR', 'IT', 'ES', 'JP'].filter(Boolean))].sort();
  const refundOptions = [...new Set([...allOrders.map((x) => x.refundMethod), 'PayPal', '平台退款', '银行转账'].filter(Boolean))].sort();
  const m = openModal(`<div class="modal-head"><h3>${isEdit ? '编辑订单' : '新增订单'}</h3><button class="x-btn modal-close">×</button></div>
    <div class="modal-body">${orderFormFields(v, { storeOptions, countryOptions, refundOptions })}</div>
    <div class="modal-foot"><button class="btn modal-close">取消</button><button class="btn btn-primary" id="o-save">保存</button></div>`, { wide: true });
  const countryInput = m.root.querySelector('#of-country'); const currencySelect = m.root.querySelector('#o-currency');
  if (countryInput && currencySelect) countryInput.addEventListener('input', () => { currencySelect.value = currencyOfCountry(countryInput.value); });
  $('#o-save').addEventListener('click', async () => {
    const q = (sel) => m.root.querySelector(sel);
    $$('.field.error', m.root).forEach((el) => el.classList.remove('error'));
    const required = [
      { id: 'o-customerName', label: '客户名称' },
      { id: 'of-store', label: '店铺' },
      { id: 'o-product', label: '产品' },
      { id: 'o-orderNumber', label: '订单号' },
      { id: 'o-amount', label: '金额', validate: (v) => Number(v) > 0 },
      { id: 'o-currency', label: '货币单位' },
    ];
    let firstError = null;
    const missingLabels = [];
    required.forEach((r) => {
      const el = q('#' + r.id);
      const val = el ? String(el.value).trim() : '';
      const ok = r.validate ? r.validate(val) : !!val;
      if (!ok) {
        const fieldWrap = el && el.closest('.field');
        if (fieldWrap) { fieldWrap.classList.add('error'); if (!firstError) firstError = el; }
        missingLabels.push(r.label);
      }
    });
    if (missingLabels.length) {
      if (firstError && typeof firstError.scrollIntoView === 'function') firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return toast('请填写：' + missingLabels.join(' / '), 'danger');
    }
    try {
      const customerName = q('#o-customerName').value.trim();
      const store = q('#of-store').value.trim();
      const product = q('#o-product').value.trim();
      const orderNumber = q('#o-orderNumber').value.trim();
      const rec = {
        id: id || uid(),
        orderDate: q('#o-orderDate').value || null,
        customerName, customerEmail: q('#o-customerEmail').value.trim(),
        socialMediaUrl: q('#o-social').value.trim(),
        store, product, productUrl: q('#o-productUrl').value.trim(),
        amount: Number(q('#o-amount').value || 0),
        cooperationIndex: Number(q('#o-coopIdx').value || 1),
        orderNumber, refundMethod: q('#o-refundMethod').value.trim(),
        ppAccount: q('#o-ppAccount').value.trim(),
        reviewScreenshotUrl: q('#o-reviewShot').value.trim(),
        reviewSubmitDate: q('#o-reviewSubmitDate').value || null,
        reviewContent: q('#o-reviewContent').value.trim(),
        feedback: q('#o-feedback').value.trim(),
        transferScreenshotUrl: q('#o-transferShot').value.trim(),
        status: q('#o-statusSel').value,
        customerId: v.customerId || null, country: q('#of-country').value.trim(),
        currency: q('#o-currency').value || currencyOfCountry(q('#of-country').value.trim()),
        createdAt: v.createdAt || new Date().toISOString(),
      };
      const originalOrder = isEdit ? await getOne('orders', id) : null;
      await linkOrderToCustomer(rec);
      await putOne('orders', rec);
      await recomputeCustomerStatsById(rec.customerId);
      if (originalOrder && originalOrder.customerId && originalOrder.customerId !== rec.customerId) {
        await recomputeCustomerStatsById(originalOrder.customerId);
      }
      // 跨模块联动：订单评论字段 -> 客户评论管理（按订单号同步/新建）
      await syncOrderReviewToComments(rec);
      renderCustomersIfVisible(true);
      m.close(); toast(isEdit ? '已更新' : '已新增', 'success'); render();
    } catch (err) {
      console.error('保存订单失败:', err);
      toast('保存失败：' + (err && err.message ? err.message : err), 'danger');
    }
  });
}
async function openOrderDetail(id) {
  const o = await getOne('orders', id);
  if (!o) return;
  const [allOrders, allCustomers] = await Promise.all([getAll('orders'), getAll('customers')]);
  const linkedCustomer = await findCustomerByOrder(o, allCustomers);
  const storeOptions = [...new Set([...allOrders.map((x) => x.store), 'HS-US', 'HS-UK', 'HS-DE', 'HS-AU', 'HS-CA', 'HS-FR', 'IB-US', 'IB-UK', 'IB-DE', 'IB-AU', 'IB-CA', 'IB-FR'].filter(Boolean))].sort();
  const countryOptions = [...new Set([...allOrders.map((x) => x.country), 'US', 'DE', 'UK', 'AU', 'CA', 'FR', 'IT', 'ES', 'JP'].filter(Boolean))].sort();
  const refundOptions = [...new Set([...allOrders.map((x) => x.refundMethod), 'PayPal', '平台退款', '银行转账'].filter(Boolean))].sort();
  const shot = (u) => u ? `<a class="link" href="${esc(u)}" target="_blank">查看</a>${/\.(png|jpe?g|gif|webp)$/i.test(u) ? `<div class="mt2"><img src="${esc(u)}" style="max-width:100%;border:1px solid var(--border);border-radius:6px"></div>` : ''}` : '—';
  const customerCard = linkedCustomer ? `<div class="customer-card">
    <div class="customer-card-title">客户最新资料（已联动）</div>
    <div class="customer-card-body">
      <div><b>${esc(linkedCustomer.name)}</b> <span class="badge neutral">${esc(linkedCustomer.country || '—')}</span></div>
      <div class="tiny muted">${esc(linkedCustomer.email || '—')} · 来源：${esc(linkedCustomer.source || '—')} · 粉丝：${fmtInt(linkedCustomer.followers)}</div>
      <div class="tiny muted">返款：${esc(linkedCustomer.refundMethod || '—')} · PayPal：${esc(linkedCustomer.ppAccount || '—')}</div>
    </div>
    <div class="row" style="gap:8px;margin-top:10px">
      <button class="btn btn-sm btn-primary" id="d-view-cust">查看客户档案</button>
      <button class="btn btn-sm" id="d-new-order">➕ 基于该客户新建复购订单</button>
    </div>
  </div>` : '';
  const cid = linkedCustomer ? linkedCustomer.id : '';
  const defs = {
    orderNumber: { type: 'text', render: (r) => `<span class="mono">${esc(r.orderNumber)}</span>` },
    orderDate: { type: 'date', render: (r) => fmtDate(r.orderDate) },
    customerName: { type: 'text', render: (r) => cid ? `<span class="customer-name-link" data-cid="${cid}">${esc(r.customerName)}</span>` : esc(r.customerName) },
    customerEmail: { type: 'text', render: (r) => esc(r.customerEmail) || '—' },
    store: { type: 'text',render: (r) => esc(r.store) || '—' },
    product: { type: 'text', render: (r) => esc(r.product) || '—' },
    amount: { type: 'number', render: (r) => fmtAmount(r.amount, r.currency || r.country) },
    cooperationIndex: { type: 'number', render: (r) => fmtInt(r.cooperationIndex) },
    refundMethod: { type: 'text',render: (r) => esc(r.refundMethod) || '—' },
    ppAccount: { type: 'text', render: (r) => esc(r.ppAccount) || '—' },
    status: { type: 'status', render: (r) => statusBadge(r.status) },
    country: { type: 'text', render: (r) => esc(r.country) || '—' },
    reviewSubmitDate: { type: 'date', render: (r) => fmtDate(r.reviewSubmitDate) },
    productUrl: { type: 'url', render: (r) => r.productUrl ? `<a class="link" href="${esc(r.productUrl)}" target="_blank">打开</a>` : '—' },
    socialMediaUrl: { type: 'url', render: (r) => r.socialMediaUrl ? `<a class="link" href="${esc(r.socialMediaUrl)}" target="_blank">打开</a>` : '—' },
    reviewContent: { type: 'textarea', render: (r) => esc(r.reviewContent) || '—' },
    feedback: { type: 'textarea', render: (r) => esc(r.feedback) || '—' },
    transferScreenshotUrl: { type: 'url', render: (r) => shot(r.transferScreenshotUrl) },
  };
  const body = `${customerCard}<dl class="kv">
    ${kvEdit('订单号', 'orderNumber', o, defs)}${kvEdit('订单日期', 'orderDate', o, defs)}
    ${kvEdit('客户', 'customerName', o, defs)}${kvEdit('邮箱', 'customerEmail', o, defs)}
    ${kvEdit('店铺', 'store', o, defs)}${kvEdit('产品', 'product', o, defs)}
    ${kvEdit('金额', 'amount', o, defs)}
    ${kvEdit('合作序号', 'cooperationIndex', o, defs)}${kvEdit('返款方式', 'refundMethod', o, defs)}
    ${kvEdit('状态', 'status', o, defs)}${kvEdit('国家', 'country', o, defs)}${kvEdit('评论提交时间', 'reviewSubmitDate', o, defs)}
    <div style="grid-column:1/-1">${kvEdit('产品链接', 'productUrl', o, defs)}</div>
    <div style="grid-column:1/-1">${kvEdit('社媒', 'socialMediaUrl', o, defs)}</div>
    <div style="grid-column:1/-1">${kvEdit('测评文案', 'reviewContent', o, defs)}</div>
    <div style="grid-column:1/-1">${kvEdit('沟通反馈', 'feedback', o, defs)}</div>
    <div style="grid-column:1/-1">${kvEdit('转账凭证', 'transferScreenshotUrl', o, defs)}</div>
  </dl>
  <div class="section-h">评价截图（点击区域后按 Ctrl+V 粘贴，可多张）</div>
  ${imagesEditHtml(o, 'reviewImages')}
  <div class="row mt2" style="gap:8px">
    <label class="tiny muted">标记状态：</label>
    <select class="select btn-sm" id="d-status" style="width:auto">${Object.entries(STATUS).map(([k, m]) => `<option value="${k}" ${k === o.status ? 'selected' : ''}>${m.label}</option>`).join('')}</select>
    <button class="btn btn-sm btn-primary" id="d-setstatus">更新</button>
  </div>
  <div class="row mt2" style="gap:8px"><button class="btn btn-sm btn-danger" id="d-del">删除订单</button><button class="btn btn-sm" id="d-view-comments" title="在客户评论管理中查看此订单的全部评论">💬 查看评论记录</button></div>`;
  const cmPaneHtml = `<div id="cm-orders-${id}" class="comment-mgr-pane"></div>`;
  openFloatPanel({
    title: '订单 · ' + o.orderNumber, key: 'order-' + id,
    tabs: [{ label: '详情', html: body }, { label: '评论管理', html: cmPaneHtml }],
    onReady: (panel, close) => {
      bindImagesEdit(panel, o, 'orders', 'reviewImages', () => { close(); openOrderDetail(id); });
      bindInlineEdit(panel, o, 'orders', defs, { onSave: async (rec) => { await recomputeCustomerStatsForOrder(rec); await syncOrderReviewToComments(rec); renderCustomersIfVisible(true); } });
      if (linkedCustomer) {
        $('#d-view-cust', panel).addEventListener('click', () => openCustomerFloat(linkedCustomer.id));
        $('#d-new-order', panel).addEventListener('click', () => openOrderForm(null, linkedCustomer));
        $$('.customer-name-link', panel).forEach((el) => el.addEventListener('click', (e) => { e.stopPropagation(); openCustomerFloat(linkedCustomer.id); }));
      }
      $('#d-setstatus', panel).addEventListener('click', async () => {
        o.status = $('#d-status', panel).value; await putOne('orders', o); await recomputeCustomerStatsForOrder(o); renderCustomersIfVisible(true); close(); toast('状态已更新', 'success'); render();
      });
      $('#d-del', panel).addEventListener('click', () => { close(); deleteOrder(id); });
      $('#d-view-comments', panel).addEventListener('click', () => { close(); state.comments.kw = o.orderNumber || ''; navigate('comments'); });
      const cmPane = $('#cm-orders-' + id, panel);
      if (cmPane) renderCommentManager(cmPane, { store: 'orders', id, loadRecord: (rid) => getOne('orders', rid), onChange: () => { renderCustomersIfVisible(true); } });
    }
  });
}
async function deleteOrder(id) {
  const o = await getOne('orders', id);
  const allComments = await getAll('comments');
  const linkedComments = allComments.filter((c) => c.orderId === id || (c.orderNumber && o && c.orderNumber === o.orderNumber));
  let msg = '确定删除该订单？此操作不可撤销。';
  if (linkedComments.length > 0) msg += `\n\n⚠️ 该订单关联 ${linkedComments.length} 条评论记录，删除后评论仍保留但失去订单关联。`;
  if (!confirm(msg)) return;
  await delOne('orders', id);
  if (o) await recomputeCustomerStatsForOrder(o);
  renderCustomersIfVisible(true);
  toast('已删除', 'success'); render();
}
async function batchDeleteOrders() {
  const ids = [...state.orders.sel];
  if (!ids.length) { toast('请先勾选要删除的订单', 'info'); return; }
  if (!confirm(`确定删除选中的 ${ids.length} 个订单？此操作不可撤销。\n（批量删除不会自动删除相关客户的其它订单）`)) return;
  const orders = await getAll('orders');
  const toDelete = orders.filter((o) => ids.includes(o.id));
  const affectedCustomerIds = new Set();
  for (const o of toDelete) {
    await delOne('orders', o.id);
    if (o.customerId) affectedCustomerIds.add(o.customerId);
  }
  for (const cid of affectedCustomerIds) await recomputeCustomerStatsById(cid);
  renderCustomersIfVisible(true);
  state.orders.sel = [];
  toast(`已删除 ${ids.length} 个订单`, 'success'); render();
}

/* ============================================================
   SETTLEMENTS
   ============================================================ */
async function renderSettlements(c) {
  const orders = await getAll('orders');
  const settlements = (await getAll('settlements')).sort((a, b) => new Date(b.settlementDate || 0) - new Date(a.settlementDate || 0));
  let pending = orders.filter((o) => o.status === 'pending_refund');
  pending = applyColFilter('pendingOrders', pending);
  pending = applyColSort('pendingOrders', pending);
  let settlementRows = applyColFilter('settlements', settlements);
  settlementRows = applyColSort('settlements', settlementRows);
  const ddCachePending = buildDropdownCache('pendingOrders', orders);
  const ddCacheSettle = buildDropdownCache('settlements', settlements);

  // monthly stats
  const ms = {};
  orders.forEach((o) => { const m = (o.orderDate || '').slice(0, 7); if (!m) return; if (!ms[m]) ms[m] = { count: 0, amount: 0 }; ms[m].count++; ms[m].amount += Number(o.amount || 0); });
  const monthly = Object.entries(ms).sort((a, b) => a[0] < b[0] ? 1 : -1).slice(0, 6).reverse();

  const pendingTds = (o) => getTableState('pendingOrders').filter((c) => !c.hidden).map((c) => {
    let v = '';
    const _dd = dropdownTd('pendingOrders', 'orders', c, o, ddCachePending[c.key]);
    if (_dd) { v = _dd; }
    else if (c.key === 'amount') v = `<td class="num">${fmtAmount(o.amount, o.currency || o.country)}</td>`;
    else if (c.key === 'orderNumber') v = `<td class="mono">${esc(o.orderNumber)}</td>`;
    else if (c.key === '__formula__') v = `<td class="num">${esc(applyFormula(c.formulaExpr, o))}</td>`;
    else v = `<td>${esc(o[c.key])}</td>`;
    if (c.person && o[c.key]) v = `<td><span class="avatar">${esc(String(o[c.key])[0] || '?')}</span></td>`;
    if (c.color) v = v.replace('<td', `<td style="background:${c.color}"`);
    return v;
  }).join('');
  const settlementTds = (s) => getTableState('settlements').filter((c) => !c.hidden).map((c) => {
    let v = '';
    const _dd = dropdownTd('settlements', 'settlements', c, s, ddCacheSettle[c.key]);
    if (_dd) { v = _dd; }
    else if (c.key === 'orderCount') v = `<td class="num">${fmtInt(s.orderCount)}</td>`;
    else if (c.key === 'totalAmount') v = `<td class="num">${fmtAmount(s.totalAmount, 'USD')}</td>`;
    else if (c.key === 'settlementDate') v = `<td>${fmtDate(s.settlementDate)}</td>`;
    else if (c.key === '__formula__') v = `<td class="num">${esc(applyFormula(c.formulaExpr, s))}</td>`;
    else v = `<td ${c.key === 'remark' ? 'class="cell-ellipsis"' : ''}>${esc(s[c.key])}</td>`;
    if (c.person && s[c.key]) v = `<td><span class="avatar">${esc(String(s[c.key])[0] || '?')}</span></td>`;
    if (c.color) v = v.replace('<td', `<td style="background:${c.color}"`);
    return v;
  }).join('');

  c.innerHTML = `<div class="maxw">
    <div class="stat-grid" style="grid-template-columns:repeat(3,1fr)">
      <div class="stat"><div class="label">待结算订单</div><div class="value">${fmtInt(pending.length)}</div><div class="sub">Pending Refund</div></div>
      <div class="stat"><div class="label">待结算金额</div><div class="value">${fmtAmount(pending.reduce((s, o) => s + Number(o.amount || 0), 0), 'USD')}</div><div class="sub">Amount (USD 等值)</div></div>
      <div class="stat"><div class="label">结算记录数</div><div class="value">${fmtInt(settlements.length)}</div><div class="sub">Records</div></div>
    </div>

    <div class="card mt"><h4 style="font-size:13px;font-weight:600;margin-bottom:10px">月度结算统计</h4>
      <div class="table-wrap"><table class="data"><thead><tr><th>月份</th><th class="num">订单数</th><th class="num">结算金额（USD 等值）</th></tr></thead><tbody>
        ${monthly.map(([m, v]) => `<tr><td>${m}</td><td class="num">${fmtInt(v.count)}</td><td class="num">${fmtAmount(v.amount, 'USD')}</td></tr>`).join('')}
      </tbody></table></div>
    </div>

    <div class="card mt"><div class="row spread" style="margin-bottom:10px"><h4 style="font-size:13px;font-weight:600">待结算订单 (${pending.length})</h4>
      <button class="btn btn-primary btn-sm" id="s-batch" ${pending.length ? '' : 'disabled'}>批量标记已结算</button></div>
      ${filterTagsHtml('pendingOrders')}
      ${pending.length ? `<div class="table-wrap" style="max-height:320px;overflow:auto"><table class="data" data-table="pendingOrders"><thead><tr><th><input type="checkbox" id="s-all"></th>${headerRowHtml('pendingOrders')}<th></th></tr></thead><tbody>
        ${pending.map((o) => `<tr><td><input type="checkbox" class="s-chk" value="${o.id}"></td>${pendingTds(o)}<td></td></tr>`).join('')}
      </tbody></table></div>` : '<div class="empty">暂无待结算订单 🎉</div>'}
    </div>

    <div class="card mt"><h4 style="font-size:13px;font-weight:600;margin-bottom:10px">结算记录</h4>
      ${filterTagsHtml('settlements')}
      ${settlementRows.length ? `<div class="table-wrap"><table class="data" data-table="settlements"><thead><tr>${headerRowHtml('settlements')}<th></th></tr></thead><tbody>
        ${settlementRows.map((s) => `<tr style="cursor:pointer" data-sid="${s.id}">${settlementTds(s)}<td><button class="btn btn-icon btn-sm modal-close-row" data-sdel="${s.id}">🗑</button></td></tr>`).join('')}
      </tbody></table></div>` : '<div class="empty">暂无结算记录</div>'}
    </div>
  </div>`;

  const allChk = $('#s-all');
  if (allChk) allChk.addEventListener('change', (e) => $$('.s-chk').forEach((c) => (c.checked = e.target.checked)));
  const batch = $('#s-batch');
  if (batch) batch.addEventListener('click', () => batchSettle());
  $$('tr[data-sid]', c).forEach((tr) => tr.addEventListener('click', (e) => { if (e.target.closest('.modal-close-row')) return; e.stopPropagation(); openSettlementDetail(tr.dataset.sid); }));
  $$('[data-sdel]', c).forEach((b) => b.addEventListener('click', async (e) => { e.stopPropagation(); if (!confirm('删除该结算记录？')) return; await delOne('settlements', b.dataset.sdel); toast('已删除', 'success'); render(); }));
  bindHeaderMenus(c, 'pendingOrders', () => renderSettlements(c));
  bindHeaderMenus(c, 'settlements', () => renderSettlements(c));
  bindDropdownCells(c, () => renderSettlements(c));
  $$('[data-col][data-table-key]', c).forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); clearColFilter(b.dataset.tableKey, b.dataset.col); renderSettlements(c); }));
  $$('[data-clear-all]', c).forEach((b) => b.addEventListener('click', () => { clearAllTableFilters(b.dataset.tableKey); renderSettlements(c); }));
  forceTableScroll(c);
}

/* ============================================================
   COMMENTS — 客户评论管理（独立页面）
   ============================================================ */
const REVIEW_STATUS = {
  pending_invite: { label: '待邀约', cls: 'warning' },
  published: { label: '已发布', cls: 'primary' },
  review_lost: { label: '评价丢失', cls: 'danger' },
  declined: { label: '拒绝评价', cls: 'muted' },
  reviewed: { label: '已评价', cls: 'success' },
};

async function fetchComments() {
  const all = await getAll('comments');
  let list = all;
  const f = state.comments;
  if (f.kw) list = list.filter((x) => matchKw(f.kw, [x.customerName, x.customerEmail, x.product, x.orderNumber]));
  if (f.status) list = list.filter((x) => x.reviewStatus === f.status);
  if (f.sourceTag) list = list.filter((x) => (x.sourceTag || '').toLowerCase().includes(f.sourceTag.toLowerCase()));
  list = applyColFilter('comments', list);
  list = applyColSort('comments', list);
  return list;
}

async function renderComments(c, keepScroll = false) {
  const allComments = await getAll('comments');
  const allCustomers = await getAll('customers');
  const allOrders = await getAll('orders');

  // 如果 comments store 为空但有订单评论数据，做一次迁移
  if (!allComments.length) {
    const migrated = await migrateOrderCommentsToDedicatedStore();
    if (migrated > 0) { toast(`已从订单迁移 ${migrated} 条评论记录`, 'success'); return renderComments(c, keepScroll); }
  }

  const list = await fetchComments();
  const sourceTags = [...new Set(allComments.map((x) => x.sourceTag).filter(Boolean))].sort();
  const total = list.length;
  state.comments._total = total;
  state.comments.displayCount = Math.min(Math.max(state.comments.displayCount || PAGE, PAGE), total);
  const pageRows = list.slice(0, state.comments.displayCount);

  // 统计卡片
  const uniqueCustomers = new Set(allComments.map((x) => x.customerName).filter(Boolean)).size;
  const totalImages = allComments.reduce((s, x) => s + (x.images ? x.images.length : 0), 0);
  const dataSource = state.comments._dataSource || '—';

  const _focusSnap = captureFocus();
  c.innerHTML = `<div class="maxw">
    <div class="stat-grid" style="grid-template-columns:repeat(4,1fr)">
      <div class="stat"><div class="label">客户数</div><div class="value">${fmtInt(uniqueCustomers)}</div><div class="sub">关联唯一测评客户</div></div>
      <div class="stat"><div class="label">评论记录</div><div class="value">${fmtInt(allComments.length)}</div><div class="sub">全部评论条目</div></div>
      <div class="stat"><div class="label">评论截图</div><div class="value">${fmtInt(totalImages)}</div><div class="sub">附件截图数量</div></div>
      <div class="stat"><div class="label">数据源</div><div class="value" style="font-size:14px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(dataSource)}">${esc(dataSource)}</div><div class="sub">当前导入文件</div></div>
    </div>

    <div class="card mt">
      <h4 style="font-size:15px;font-weight:700;margin-bottom:12px">📋 评论列表</h4>
      <div class="toolbar">
        <input class="input" style="max-width:260px" id="cm-kw" placeholder="搜索客户、邮箱、产品、订单号…" value="${esc(state.comments.kw)}">
        ${comboFilterHtml({ id: 'cm-status', allLabel: '全部状态', value: state.comments.status, options: Object.keys(REVIEW_STATUS), displayMap: Object.fromEntries(Object.entries(REVIEW_STATUS).map(([k,v])=>[k,v.label])) })}
        ${comboFilterHtml({ id: 'cm-source', allLabel: '全部来源', value: state.comments.sourceTag, options: sourceTags })}
        <div class="grow"></div>
        <button class="btn btn-sm" id="cm-excel-out">⭳ 导出Excel</button>
        <button class="btn btn-sm" id="cm-excel-in">⭱ 导入Excel</button>
        <button class="btn btn-sm btn-danger" id="cm-batch">🗑 批量删除 (<span id="cm-batch-n">0</span>)</button>
        <button class="btn btn-sm" id="cm-cols" title="列设置">⚙ 列设置</button>
        <button class="btn btn-primary btn-sm" id="cm-add">+ 新增评论</button>
      </div>
      ${filterTagsHtml('comments')}
      <div class="table-wrap"><table class="data sticky-first-col" data-table="comments"><thead><tr>
        <th class="chk-col"><input type="checkbox" id="cm-all"></th>
        ${headerRowHtml('comments')}
        <th class="col-actions-th"></th>
      </tr></thead><tbody>
        ${pageRows.length ? buildTbody('comments', pageRows, (x) => {
          const cust = allCustomers.find((cc) => cc.name === x.customerName) || {};
          const tds = getTableState('comments').filter((col) => !col.hidden).map((col) => {
            let v = '';
            if (col.key === 'customerName') v = `<td><span class="customer-name-link" data-cid="${cust.id || ''}" title="跳转客户详情">${esc(x.customerName)}</span>${x.customerEmail ? `<br><span class="tiny muted">${esc(x.customerEmail)}</span>` : ''}</td>`;
            else if (col.key === 'productStore') {
              const parts = [];
              if (x.product) parts.push(esc(x.product));
              if (x.store) parts.push(`<span class="tiny tag">${esc(x.store)}</span>`);
              if (x.orderNumber) parts.push(`<br><span class="mono tiny order-link" data-oid="${x.orderId || ''}" data-onum="${esc(x.orderNumber)}" title="跳转订单详情">#${esc(x.orderNumber)}</span>`);
              v = `<td>${parts.join(' ') || '—'}</td>`;
            }
            else if (col.key === 'reviewContent') {
              const stars = x.rating ? `<span class="stars">${'★'.repeat(Math.min(5,Math.max(0,x.rating)))}${'☆'.repeat(5-Math.min(5,Math.max(0,x.rating)))}</span> ` : '';
              const text = x.reviewContent ? esc(x.reviewContent.slice(0, 120)) + (x.reviewContent.length > 120 ? '…' : '') : '无';
              v = `<td class="cell-ellipsis" style="max-width:280px">${stars}${text}</td>`;
            }
            else if (col.key === 'feedback') v = `<td class="cell-ellipsis" style="max-width:220px">${esc((x.feedback || '').slice(0, 100)) || '—'}</td>`;
            else if (col.key === 'images') {
              const imgs = x.images || [];
              v = `<td>${imgs.length ? `<div class="img-thumbs">${imgs.slice(0,3).map((img,i) => `<img src="${img}" class="thumb-img" data-cmid="${x.id}" data-idx="${i}" style="width:36px;height:36px;object-fit:cover;border-radius:4px;cursor:pointer;margin-right:4px;border:1px solid #eee" title="点击预览">`).join('')}${imgs.length > 3 ? `<span class="tiny muted">+${imgs.length-3}</span>` : ''}</div>` : '<span class="muted">—</span>'}<span class="tiny muted">${imgs.length ? imgs.length + '张' : ''}</span></td>`;
            }
            else if (col.key === 'sourceTag') v = `<td><span class="tag">${esc(x.sourceTag) || '—'}</span></td>`;
            else if (col.key === 'reviewStatus') {
              const st = REVIEW_STATUS[x.reviewStatus] || REVIEW_STATUS.pending_invite;
              v = `<td><span class="badge badge-${st.cls}">${st.label}</span></td>`;
            }
            else if (col.key === 'reviewSubmitDate') v = `<td>${fmtDate(x.reviewSubmitDate)}</td>`;
            else if (col.key === 'orderNumber') v = `<td><span class="mono order-link" data-oid="${x.orderId || ''}" data-onum="${esc(x.orderNumber)}">${esc(x.orderNumber) || '—'}</span></td>`;
            else v = `<td>${esc(x[col.key])}</td>`;
            return v;
          }).join('');
          return `<tr data-id="${x.id}">
            <td class="chk-col"><input type="checkbox" class="cm-chk" value="${x.id}" ${state.comments.sel.includes(x.id) ? 'checked' : ''}></td>
            ${tds}
            <td class="action-cell-btns"><button class="btn btn-icon btn-sm modal-close-row" data-cmedit="${x.id}" title="编辑">✏️</button><button class="btn btn-icon btn-sm modal-close-row" data-cmdel="${x.id}" title="删除">🗑</button></td>
          </tr>`;
        }) : ''}
      </tbody></table></div>
      <div class="load-more" id="cm-load-more">${state.comments.displayCount < total ? `已显示 ${state.comments.displayCount}/${total} 条 · 继续向下滚动加载更多` : `已加载全部 ${total} 条`}</div>
    </div>
  </div>`;

  // ---- event bindings ----
  $('#cm-kw').addEventListener('input', (e) => { state.comments.kw = e.target.value; state.comments.displayCount = PAGE; renderComments(c, true); });
  initCombo(c, 'cm-status', { value: state.comments.status, allLabel: '全部状态', options: Object.keys(REVIEW_STATUS), baseOptions: Object.keys(REVIEW_STATUS), displayMap: Object.fromEntries(Object.entries(REVIEW_STATUS).map(([k,v])=>[k,v.label])), onSelect: (v) => { state.comments.status = v; state.comments.displayCount = PAGE; renderComments(c); } });
  initCombo(c, 'cm-source', { value: state.comments.sourceTag, allLabel: '全部来源', options: sourceTags, baseOptions: sourceTags, onSelect: (v) => { state.comments.sourceTag = v; state.comments.displayCount = PAGE; renderComments(c); } });

  $('#cm-excel-out').addEventListener('click', () => exportCommentsExcel());
  $('#cm-excel-in').addEventListener('click', () => importCommentsExcel());
  $('#cm-cols').addEventListener('click', () => openColumnSettings('comments', () => renderComments(c, true)));
  $('#cm-add').addEventListener('click', () => openCommentForm(null));

  // batch delete
  const updateBatchUI = () => {
    const n = state.comments.sel.length;
    const bn = $('#cm-batch-n'); if (bn) bn.textContent = n;
    const all = $('#cm-all');
    if (all) all.checked = pageRows.length > 0 && pageRows.every((x) => state.comments.sel.includes(x.id));
  };
  $('#cm-all').addEventListener('change', (e) => {
    const chk = e.target.checked;
    $$('.cm-chk', c).forEach((cb) => { cb.checked = chk; const id = cb.value; if (chk) { if (!state.comments.sel.includes(id)) state.comments.sel.push(id); } else { state.comments.sel = state.comments.sel.filter((x) => x !== id); } });
    updateBatchUI();
  });
  $$('.cm-chk', c).forEach((cb) => cb.addEventListener('change', (e) => {
    const id = e.target.value;
    if (e.target.checked) { if (!state.comments.sel.includes(id)) state.comments.sel.push(id); } else { state.comments.sel = state.comments.sel.filter((x) => x !== id); }
    updateBatchUI();
  }));
  updateBatchUI();
  $('#cm-batch').addEventListener('click', batchDeleteComments);

  // row click → edit
  $$('tr[data-id]', c).forEach((tr) => tr.addEventListener('click', (e) => {
    if (e.target.closest('.modal-close-row') || e.target.closest('input[type="checkbox"]') || e.target.closest('.customer-name-link') || e.target.closest('.order-link') || e.target.closest('.thumb-img')) return;
    e.stopPropagation(); openCommentForm(tr.dataset.id);
  }));

  // customer name link → jump to customer detail
  $$('.customer-name-link', c).forEach((el) => el.addEventListener('click', (e) => { e.stopPropagation(); const cid = el.dataset.cid; if (cid) { navigate('customers'); setTimeout(() => openCustomerFloat(cid), 100); } else toast('未关联到客户记录', 'warning'); }));

  // order number link → jump to order detail
  $$('.order-link', c).forEach((el) => el.addEventListener('click', (e) => { e.stopPropagation(); const oid = el.dataset.oid; if (oid) { navigate('orders'); setTimeout(() => openOrderDetail(oid), 100); } else { const onum = el.dataset.onum; toast('订单号 '+onum+' 未找到对应记录', 'warning'); } }));

  // thumbnail preview
  $$('.thumb-img', c).forEach((img) => img.addEventListener('click', (e) => { e.stopPropagation(); openImagePreview(img.src); }));

  // edit/delete buttons
  $$('[data-cmedit]', c).forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); openCommentForm(b.dataset.cmedit); }));
  $$('[data-cmdel]', c).forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); deleteComment(b.dataset.cmdel); }));

  bindHeaderMenus(c, 'comments', () => renderComments(c, true));
  bindDropdownCells(c, () => renderComments(c, true));
  $$('[data-col][data-table-key]', c).forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); clearColFilter(b.dataset.tableKey, b.dataset.col); renderComments(c); }));
  const clearAll = $('[data-clear-all]', c);
  if (clearAll) clearAll.addEventListener('click', () => { clearAllTableFilters(clearAll.dataset.tableKey); renderComments(c); });
  if (!keepScroll) c.scrollTop = 0;
  forceTableScroll(c);
  restoreFocus(_focusSnap);
}

/* ---- Comment CRUD ---- */
function commentFormFields(v = {}) {
  return `
    <div class="two-col">
      <div class="field"><label>订单号 *</label><input class="input" id="cf-order" value="${esc(v.orderNumber || '')}" placeholder="输入订单号自动回填客户/产品"></div>
      <div class="field"><label>客户名称 *</label><input class="input" id="cf-cust" value="${esc(v.customerName || '')}"></div>
      <div class="field"><label>邮箱</label><input class="input" id="cf-email" value="${esc(v.customerEmail || '')}"></div>
      <div class="field"><label>产品型号</label><input class="input" id="cf-product" value="${esc(v.product || '')}"></div>
      <div class="field"><label>店铺/站点</label><input class="input" id="cf-store" value="${esc(v.store || '')}"></div>
      <div class="field"><label>来源标签</label><input class="input" id="cf-sourcetag" value="${esc(v.sourceTag || '')}" placeholder="如 9-2月份、Tiktok渠道"></div>
      <div class="field"><label>评论状态</label>
        <select class="input" id="cf-status">
          ${Object.entries(REVIEW_STATUS).map(([k,st]) => `<option value="${k}" ${(v.reviewStatus||'')===k?'selected':''}>${st.label}</option>`).join('')}
        </select>
      </div>
      <div class="field"><label>星级 (1-5)</label><input class="input" id="cf-rating" type="number" min="1" max="5" value="${v.rating||''}" placeholder="留空则不显示"></div>
      <div class="field"><label>提交时间</label><input class="input" id="cf-date" type="date" value="${esc(v.reviewSubmitDate || '')}"></div>
      <div class="field" style="grid-column:1/-1"><label>Amazon 评论原文</label><textarea class="input" id="cf-content" rows="4" placeholder="粘贴 Amazon 平台评论内容…">${esc(v.reviewContent || '')}</textarea></div>
      <div class="field" style="grid-column:1/-1"><label>测评内容 / 跟进反馈</label><textarea class="input" id="cf-feedback" rows="4" placeholder="邀约时间、视频发布、价格协商、物流问题、评价是否成功、扣款备注等…">${esc(v.feedback || '')}</textarea></div>
      <div class="field" style="grid-column:1/-1"><label>截图上传</label>
        <div id="cf-images-area">
          ${(v.images||[]).map((img,i) => `<div style="display:inline-block;margin:4px;position:relative"><img src="${img}" style="width:72px;height:72px;object-fit:cover;border-radius:6px;border:1px solid #ddd;cursor:pointer" class="cf-preview-img" data-idx="${i}" title="点击预览"><button type="button" class="x-btn cf-rm-img" data-idx="${i}" style="position:absolute;top:-6px;right:-6px;width18px;height:18px;border-radius:50%;background:#e33;font-size:11px;line-height:18px;padding:0;text-align:center;color:#fff">×</button></div>`).join('')}
          <label class="btn btn-sm" style="display:inline-block;vertical-align:top;margin:4px;cursor:pointer">📷 上传图片<input type="file" id="cf-img-upload" accept="image/*" multiple style="display:none"></label>
        </div>
      </div>
    </div>`;
}

async function openCommentForm(id) {
  const rec = id ? await getOne('comments', id) : null;
  const isEdit = !!rec;
  const title = isEdit ? '编辑评论' : '新增评论';
  const m = openModal(`<div class="modal-head"><h3>${title}</h3><button class="x-btn modal-close">×</button></div>
    <div class="modal-body">${commentFormFields(rec || {})}</div>
    <div class="modal-foot"><button class="btn modal-close">取消</button><button class="btn btn-primary" id="cf-save">${isEdit ? '保存修改' : '创建评论'}</button></div>`);

  // auto-fill by order number
  $('#cf-order').addEventListener('blur', async (e) => {
    const onum = String(e.target.value || '').trim();
    if (!onum) return;
    const orders = await getAll('orders');
    const ord = orders.find((o) => o.orderNumber && o.orderNumber.toLowerCase() === onum.toLowerCase());
    if (ord) {
      $('#cf-cust').value = ord.customerName || '';
      $('#cf-email').value = ord.customerEmail || '';
      $('#cf-product').value = ord.product || '';
      $('#cf-store').value = ord.store || '';
      if (!$('#cf-date').value && ord.reviewSubmitDate) $('#cf-date').value = ord.reviewSubmitDate;
    }
  });

  // image upload
  const uploadEl = $('#cf-img-upload');
  if (uploadEl) uploadEl.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files || []);
    for (const f of files) {
      const reader = new FileReader();
      const dataUrl = await new Promise((resolve) => { reader.onload = () => resolve(reader.result); reader.readAsDataURL(f); });
      const area = $('#cf-images-area');
      const idx = $$('.cf-preview-img', area).length;
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:inline-block;margin:4px;position:relative';
      wrap.innerHTML = `<img src="${dataUrl}" style="width:72px;height:72px;object-fit:cover;border-radius:6px;border:1px solid #ddd;cursor:pointer" class="cf-preview-img" data-new="${dataUrl}" title="点击预览"><button type="button" class="x-btn cf-rm-img-new" style="position:absolute;top:-6px;right:-6px;width:18px;height:18px;border-radius:50%;background:#e33;font-size:11px;line-height:18px;padding:0;text-align:center;color:#fff;cursor:pointer">×</button>`;
      area.insertBefore(wrap, uploadEl.parentElement);
      wrap.querySelector('img').addEventListener('click', () => openImagePreview(dataUrl));
      wrap.querySelector('.cf-rm-img-new').addEventListener('click', () => wrap.remove());
    }
    e.target.value = '';
  });

  // preview & remove existing images
  $$('.cf-preview-img', m).forEach((img) => img.addEventListener('click', (e) => { if (e.target === img) openImagePreview(img.src); }));
  $$('.cf-rm-img', m).forEach((btn) => btn.addEventListener('click', (e) => { e.stopPropagation(); btn.parentElement.remove(); }));

  // save
  $('#cf-save').addEventListener('click', async () => {
    const orderNumber = String($('#cf-order').value || '').trim();
    const customerName = String($('#cf-cust').value || '').trim();
    if (!orderNumber || !customerName) { toast('订单号和客户名称为必填项', 'danger'); return; }

    // find matching order for linkage
    const orders = await getAll('orders');
    const matchedOrder = orders.find((o) => o.orderNumber && o.orderNumber.toLowerCase() === orderNumber.toLowerCase());

    const images = [];
    $$('.cf-preview-img', $('#cf-images-area')).forEach((img) => { if (img.dataset.new) images.push(img.dataset.new); else if (rec && rec.images[img.dataset.idx]) images.push(rec.images[img.dataset.idx]); });

    const recData = {
      id: rec?.id || uid(),
      orderNumber,
      orderId: matchedOrder?.id || null,
      customerName,
      customerEmail: String($('#cf-email').value || '').trim(),
      product: String($('#cf-product').value || '').trim(),
      store: String($('#cf-store').value || '').trim(),
      sourceTag: String($('#cf-sourcetag').value || '').trim(),
      reviewStatus: $('#cf-status').value || 'pending_invite',
      rating: parseInt($('#cf-rating').value, 10) || null,
      reviewSubmitDate: $('#cf-date').value || null,
      reviewContent: String($('#cf-content').value || '').trim(),
      feedback: String($('#cf-feedback').value || '').trim(),
      images,
      createdAt: rec?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await putOne('comments', recData);
    // 跨模块联动：评论 -> 对应订单（回写评论内容/截图/提交时间到订单顶层字段）
    await syncCommentReviewToOrder(recData);
    // also sync comment into order's comments[] array (保留既有聚合逻辑)
    if (matchedOrder) {
      if (!Array.isArray(matchedOrder.comments)) matchedOrder.comments = [];
      const exists = matchedOrder.comments.findIndex((c) => c.id === recData.id);
      if (exists >= 0) matchedOrder.comments[exists] = { id: recData.id, content: recData.reviewContent, images: recData.images, submitDate: recData.reviewSubmitDate, source: 'comments_page' };
      else matchedOrder.comments.push({ id: recData.id, content: recData.reviewContent, images: recData.images, submitDate: recData.reviewSubmitDate, source: 'comments_page' });
      await syncCommentMirrors(matchedOrder, 'orders');
    }
    closeAndReopen();
    toast(isEdit ? '评论已更新' : '评论已创建', 'success');
    render();
  });
}

async function deleteComment(id) {
  const rec = await getOne('comments', id);
  if (!rec) return;
  // check related order comments[]
  if (rec.orderId) {
    const ord = await getOne('orders', rec.orderId);
    if (ord && Array.isArray(ord.comments)) { ord.comments = ord.comments.filter((c) => c.id !== id); await syncCommentMirrors(ord, 'orders'); }
  }
  await delOne('comments', id);
  toast('评论已删除', 'success');
  render();
}

async function batchDeleteComments() {
  const ids = [...state.comments.sel];
  if (!ids.length) return toast('请先勾选评论', 'danger');
  if (!confirm(`确定删除选中的 ${ids.length} 条评论？此操作不可撤销。`)) return;
  for (const id of ids) {
    const rec = await getOne('comments', id);
    if (rec?.orderId) { const ord = await getOne('orders', rec.orderId); if (ord && Array.isArray(ord.comments)) { ord.comments = ord.comments.filter((c) => c.id !== id); await putOne('orders', ord); } }
    await delOne('comments', id);
  }
  state.comments.sel = [];
  toast(`已删除 ${ids.length} 条评论`, 'success');
  render();
}

/* ---- Comments Excel Import / Export ---- */
async function importCommentsExcel() {
  const input = document.createElement('input'); input.type = 'file'; input.accept = '.xlsx,.xls,.csv';
  input.onchange = async () => {
    const f = input.files[0]; if (!f) return;
    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (!matrix.length) { toast('文件为空', 'danger'); return; }
    const sheetName = wb.SheetNames[0];
    let imageMap = new Map();
    try { imageMap = await extractXlsxImages(buf); } catch (e) { console.warn('extract images failed', e); }
    state.comments._dataSource = f.name;

    const headerRow = matrix[0].map((h) => normHeader(h));
    const colOf = (...names) => { for (const n of names) { const i = headerRow.indexOf(n); if (i >= 0) return i; } return -1; };
    const cOrder = colOf('orderNumber');
    const cCust = colOf('customerName', 'name');
    const cEmail = colOf('email');
    const cProduct = colOf('product');
    const cStore = colOf('store');
    const cContent = colOf('reviewContent');
    const cFeedback = colOf('feedback');
    const cShot = colOf('reviewScreenshotUrl');
    const cSource = colOf('sourceTag', 'source');
    const cStatus = colOf('reviewStatus', 'status');
    const cRating = colOf('rating');
    const cDate = colOf('reviewSubmitDate');

    let inserted = 0, updated = 0, failed = 0;
    const failedRows = [];
    for (let r = 1; r < matrix.length; r++) {
      const raw = matrix[r];
      const rowObj = {};
      headerRow.forEach((h, i) => { rowObj[h] = raw[i]; });
      const orderNumber = String(rowObj.orderNumber || '').trim();
      const customerName = String(rowObj.customerName || rowObj.name || '').trim();
      if (!orderNumber && !customerName) { failed++; failedRows.push({ excelRow: r+1, reason: '缺少订单号或客户名' }); continue; }

      const excelRow = r + 1;
      const shotImgs = cShot >= 0 ? (imageMap.get(`${sheetName}::${cShot}:${excelRow}`) || []) : [];

      const rec = {
        id: uid(),
        orderNumber, customerName,
        customerEmail: String(rowObj.email || ''),
        product: String(rowObj.product || ''),
        store: String(rowObj.store || ''),
        reviewContent: String(rowObj.reviewContent || ''),
        feedback: String(rowObj.feedback || ''),
        images: shotImgs,
        sourceTag: String(rowObj.sourceTag || rowObj.source || ''),
        reviewStatus: normStatus(String(rowObj.reviewStatus || rowObj.status || '')),
        rating: parseInt(rowObj.rating, 10) || null,
        reviewSubmitDate: excelDate(rowObj.reviewSubmitDate),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await putOne('comments', rec);
      inserted++;
    }
    const msg = `导入完成：新增 ${inserted}，更新 ${updated}，失败 ${failed}`;
    if (failed) { toast(msg, 'danger'); showImportFailedModal(failedRows); } else toast(msg, 'success');
    render();
  };
  input.click();
}

async function exportCommentsExcel() {
  const all = await fetchComments();
  if (!all.length) return toast('没有评论数据可导出', 'warning');
  const rows = all.map((x) => ({
    '订单号': x.orderNumber || '',
    '客户': x.customerName || '',
    '邮箱': x.customerEmail || '',
    '产品': x.product || '',
    '店铺': x.store || '',
    '评论内容': x.reviewContent || '',
    '测评内容/反馈': x.feedback || '',
    '星级': x.rating || '',
    '状态': (REVIEW_STATUS[x.reviewStatus] || {}).label || '',
    '提交时间': x.reviewSubmitDate || '',
    '来源标签': x.sourceTag || '',
    '截图': (x.images || []).join('; '),
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.sheet_add_aoa(ws, [['订单号','客户','邮箱','产品','店铺','评论内容','测评内容/反馈','星级','状态','提交时间','来源标签','截图']], { origin: 'A1' });
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, '评论列表');
  XLSX.writeFile(wb, `评论导出_${todayISO()}.xlsx`);
  toast(`已导出 ${all.length} 条评论`, 'success');
}

/* ---- Migrate order comments[] to dedicated comments store ---- */
async function migrateOrderCommentsToDedicatedStore() {
  const orders = await getAll('orders');
  const existing = await getAll('comments');
  const existingIds = new Set(existing.map((c) => c.id));
  let count = 0;
  for (const o of orders) {
    if (!Array.isArray(o.comments) || !o.comments.length) continue;
    for (const cm of o.comments) {
      if (!cm.content && !cm.images?.length) continue;
      const rec = {
        id: cm.id || uid(),
        orderNumber: o.orderNumber || '',
        orderId: o.id,
        customerName: o.customerName || '',
        customerEmail: o.customerEmail || '',
        product: o.product || '',
        store: o.store || '',
        reviewContent: cm.content || '',
        feedback: '',
        images: cm.images || [],
        sourceTag: o.orderDate ? o.orderDate.slice(0,7) : '',
        reviewStatus: cm.images?.length ? 'reviewed' : 'pending_invite',
        rating: null,
        reviewSubmitDate: cm.submitDate || o.reviewSubmitDate || null,
        createdAt: o.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      if (!existingIds.has(rec.id)) { await putOne('comments', rec); count++; }
    }
  }
  return count;
}

/* ---- Image Preview (reusable) ---- */
function openImagePreview(src) {
  const m = openModal(`<div class="modal-head"><h3>图片预览</h3><button class="x-btn modal-close">×</button></div>
    <div class="modal-body" style="text-align:center;padding:20px"><img src="${src}" style="max-width:100%;max-height:70vh;object-contain;border-radius:8px"></div>
    <div class="modal-foot"><a class="btn btn-sm" href="${src}" download>⭳ 下载图片</a><button class="btn btn-sm modal-close">关闭</button></div>`);
}
async function batchSettle() {
  const ids = $$('.s-chk').filter((c) => c.checked).map((c) => c.value);
  if (!ids.length) return toast('请先勾选订单', 'danger');
  const orders = await getAll('orders');
  const chosen = orders.filter((o) => ids.includes(o.id));
  const total = chosen.reduce((s, o) => s + Number(o.amount || 0), 0);
  const m = openModal(`<div class="modal-head"><h3>批量结算确认</h3><button class="x-btn modal-close">×</button></div>
    <div class="modal-body"><p class="muted">将标记 <b>${ids.length}</b> 笔订单为「已返款」，并生成一条结算记录。</p>
      <div class="field" style="margin-top:12px"><label>结算日期</label><input class="input" id="st-date" type="date" value="${todayISO()}"></div>
      <div class="field"><label>备注</label><input class="input" id="st-remark" placeholder="如 2026-08 月度结算"></div>
      <div class="tiny muted">结算总额（USD 等值）：${fmtAmount(total, 'USD')}</div>
    </div>
    <div class="modal-foot"><button class="btn modal-close">取消</button><button class="btn btn-primary" id="st-go">确认结算</button></div>`);
  $('#st-go').addEventListener('click', async () => {
    const date = $('#st-date').value || todayISO();
    const remark = $('#st-remark').value.trim();
    for (const o of chosen) { o.status = 'refunded'; await putOne('orders', o); }
    for (const o of chosen) { await recomputeCustomerStatsForOrder(o); }
    renderCustomersIfVisible(true);
    const rec = { id: uid(), settlementDate: date, orderCount: chosen.length, totalAmount: total, remark, orderIds: ids, createdAt: new Date().toISOString() };
    await putOne('settlements', rec);
    m.close(); toast('结算完成', 'success'); render();
  });
}
async function openSettlementDetail(id) {
  const s = await getOne('settlements', id);
  if (!s) return;
  const orders = await getAll('orders');
  const linked = (s.orderIds || []).map((oid) => orders.find((o) => o.id === oid)).filter(Boolean);
  const body = `<dl class="kv">
    ${kvRow('结算日期', fmtDate(s.settlementDate))}${kvRow('订单数', fmtInt(s.orderCount))}
    ${kvRow('总金额（USD 等值）', fmtAmount(s.totalAmount, 'USD'))}${kvRow('备注', esc(s.remark) || '—')}
  </dl>
  <div class="section-h">结算凭证 / 截图（点击区域后按 Ctrl+V 粘贴）</div>
  ${imagePasteHtml(s, 'image')}
  <div class="section-h">包含订单 (${linked.length})</div>
  ${linked.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>订单号</th><th>客户</th><th>店铺</th><th class="num">金额</th></tr></thead><tbody>
    ${linked.map((o) => `<tr style="cursor:pointer" data-oid="${o.id}"><td class="mono">${esc(o.orderNumber)}</td><td>${esc(o.customerName)}</td><td>${esc(o.store)}</td><td class="num">${fmtAmount(o.amount, o.currency || o.country)}</td></tr>`).join('')}
  </tbody></table></div>` : '<div class="muted tiny">无关联订单</div>'}`;
  openFloatPanel({
    title: '结算 · ' + fmtDate(s.settlementDate), key: 'settlement-' + id, bodyHtml: body,
    onReady: (panel, close) => {
      bindImagePaste(panel, s, 'settlements', 'image', () => { close(); openSettlementDetail(id); });
      $$('tr[data-oid]', panel).forEach((tr) => tr.addEventListener('click', () => openOrderDetail(tr.dataset.oid)));
    }
  });
}

/* ============================================================
   PAGINATION
   ============================================================ */
function pagerHtml(total, page, key) {
  const pages = Math.max(1, Math.ceil(total / PAGE));
  return `<div class="pager"><span>共 ${total} 条 · 第 ${page}/${pages} 页</span>
    <button class="btn btn-sm" data-pg="${key}" data-to="${page - 1}" ${page <= 1 ? 'disabled' : ''}>上一页</button>
    <button class="btn btn-sm" data-pg="${key}" data-to="${page + 1}" ${page >= pages ? 'disabled' : ''}>下一页</button></div>`;
}
function bindPager(key) {
  $$('[data-pg="' + key + '"]').forEach((b) => b.addEventListener('click', () => {
    const to = Number(b.dataset.to); if (to < 1) return;
    if (key === 'cust') state.customers.page = to; else state.orders.page = to;
    render();
  }));
}

/* ============================================================
   EXCEL IMPORT / EXPORT
   ============================================================ */
function normHeader(h) {
  const s = String(h || '').trim().toLowerCase().replace(/[\s_\-]/g, '');
  const map = {
    name: 'name', 客户名称: 'name', 姓名: 'name', 客户: 'name', 测评客户: 'name',
    email: 'email', 邮箱: 'email',
    socialmediaurl: 'socialMediaUrl', 社媒: 'socialMediaUrl', 社交主页: 'socialMediaUrl', 主页链接: 'socialMediaUrl',
    country: 'country', 国家: 'country',
    source: 'source', 来源: 'source', 来源渠道: 'source',
    followers: 'followers', 粉丝数: 'followers', 粉丝: 'followers',
    product: 'product', 测评产品: 'product', 产品: 'product',
    cooperationcount: 'cooperationCount', 合作次数: 'cooperationCount',
    refundmethod: 'refundMethod', 返款方式: 'refundMethod',
    needshippingadvance: 'needShippingAdvance', 是否垫付运费: 'needShippingAdvance', 垫付运费: 'needShippingAdvance',
    ppaccount: 'ppAccount', paypal: 'ppAccount', pp账号: 'ppAccount', paypal账号: 'ppAccount',
    latestfollowup: 'latestFollowUp', 最新跟进: 'latestFollowUp', 跟进: 'latestFollowUp',
    startdate: 'startDate', 开始日期: 'startDate', 合作开始日期: 'startDate',
    orderdate: 'orderDate', 订单日期: 'orderDate', 日期: 'orderDate',
    customername: 'customerName', 测评客户: 'customerName', orderno: 'orderNumber', ordernumber: 'orderNumber',
    paypalaccount: 'ppAccount', productlink: 'productUrl', reviewtext: 'reviewContent',
    reviewscreenshot: 'reviewScreenshotUrl', 评价截图: 'reviewScreenshotUrl', 评论截图: 'reviewScreenshotUrl', transferscreenshot: 'transferScreenshotUrl',
    store: 'store', 店铺: 'store',
    producturl: 'productUrl', 产品链接: 'productUrl',
    amount: 'amount', 金额: 'amount', 订单金额: 'amount',
    cooperationindex: 'cooperationIndex', 合作序号: 'cooperationIndex',
    ordernumber: 'orderNumber', 订单号: 'orderNumber',
    reviewcontent: 'reviewContent', 测评文案: 'reviewContent', 评价内容: 'reviewContent', 评论内容: 'reviewContent', 测评内容: 'reviewContent',
    feedback: 'feedback', 反馈: 'feedback', 沟通反馈: 'feedback',
    reviewscreenshoturl: 'reviewScreenshotUrl', 评价截图: 'reviewScreenshotUrl', 评价截图url: 'reviewScreenshotUrl',
    transferscreenshoturl: 'transferScreenshotUrl', 转账凭证: 'transferScreenshotUrl', 转账截图: 'transferScreenshotUrl',
    comments: 'comments', 评论数据: 'comments', 客户评论: 'comments',
    status: 'status', 状态: 'status',
    reviewsubmitdate: 'reviewSubmitDate', 评论提交时间: 'reviewSubmitDate', 评论提交日期: 'reviewSubmitDate', 提交时间: 'reviewSubmitDate',
  };
  return map[s] || s;
}
function excelDate(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  if (!s) return null;
  if (/^\d{1,5}(\.\d+)?$/.test(s) && parseFloat(s) < 60000) {
    const serial = parseFloat(s);
    const d = new Date(Date.UTC(1899, 11, 30));
    d.setUTCDate(d.getUTCDate() + serial);
    return d.toISOString().slice(0, 10);
  }
  return s.slice(0, 10);
}
function parseNum(v) { if (v == null) return 0; const n = parseFloat(String(v).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 0 : n; }
function normStatus(v) {
  const s = String(v || '').trim().toLowerCase();
  if (['pending', 'pending_refund', '待返款', '待结算'].includes(s)) return 'pending_refund';
  if (['refunded', '已返款', '已退款'].includes(s)) return 'refunded';
  if (['reviewed', '已评价', '已评'].includes(s)) return 'reviewed';
  return 'pending_refund';
}
function pick(row, field) {
  // row keys already normalized to camelCase
  return row[field];
}
async function importCustomersExcel() {
  const input = document.createElement('input'); input.type = 'file'; input.accept = '.xlsx,.xls,.csv';
  input.onchange = async () => {
    const f = input.files[0]; if (!f) return;
    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (!matrix.length) { toast('文件为空', 'danger'); return; }
    const sheetName = wb.SheetNames[0];
    let imageMap = new Map();
    try { imageMap = await extractXlsxImages(buf); } catch (e) { console.warn('extract images failed', e); }
    const headerRow = matrix[0].map((h) => normHeader(h));
    const colOf = (...names) => { for (const n of names) { const i = headerRow.indexOf(n); if (i >= 0) return i; } return -1; };
    const cContent = colOf('reviewContent');
    const cComments = colOf('comments');
    const cShot = colOf('reviewScreenshotUrl');
    const existing = await getAll('customers');
    let inserted = 0, updated = 0, failed = 0;
    const failedRows = [];
    for (let r = 1; r < matrix.length; r++) {
      const raw = matrix[r];
      const rowObj = {};
      headerRow.forEach((h, i) => { rowObj[h] = raw[i]; });
      const name = String(rowObj.name || '').trim();
      const excelRow = r + 1;
      if (!name) { failed++; failedRows.push({ excelRow, orderNumber: '', customerName: '', content: String(rowObj.reviewContent || ''), imgCount: 0, reason: '缺少客户姓名' }); continue; }
      const cShotImgs = cShot >= 0 ? (imageMap.get(`${sheetName}::${cShot}:${excelRow}`) || []) : [];
      const comments = buildCommentsFromRow({ rowObj, cContent, cComments, cShot, cShotImgs, tShot: -1, tShotImgs: [] });
      const ex = existing.find((x) => x.name && x.name.toLowerCase() === name.toLowerCase());
      if (ex) {
        ex.comments = Array.isArray(ex.comments) ? ex.comments.concat(comments) : comments;
        await syncCommentMirrors(ex, 'customers');
        if (comments.length) await syncCustomerToOrders(ex);
        updated++;
      } else {
        const rec = {
          id: uid(),
          name, email: String(rowObj.email || ''),
          socialMediaUrl: String(rowObj.socialMediaUrl || ''),
          country: String(rowObj.country || ''), source: String(rowObj.source || ''),
          followers: parseNum(rowObj.followers), product: String(rowObj.product || ''),
          cooperationCount: parseNum(rowObj.cooperationCount), refundMethod: String(rowObj.refundMethod || ''),
          needShippingAdvance: ['true', '是', 'yes', '1'].includes(String(rowObj.needShippingAdvance || '').trim().toLowerCase()),
          ppAccount: String(rowObj.ppAccount || ''), latestFollowUp: String(rowObj.latestFollowUp || ''),
          startDate: rowObj.startDate ? String(rowObj.startDate).slice(0, 10) : null,
          comments,
          createdAt: new Date().toISOString(),
        };
        await putOne('customers', rec);
        if (comments.length) await syncCustomerToOrders(rec);
        inserted++;
      }
    }
    const msg = `导入完成：新增 ${inserted}，更新 ${updated}，失败 ${failed}`;
    if (failed) { toast(msg, 'danger'); showImportFailedModal(failedRows); } else toast(msg, 'success');
    render();
  };
  input.click();
}
async function importOrdersExcel() {
  const input = document.createElement('input'); input.type = 'file'; input.accept = '.xlsx,.xls,.csv';
  input.onchange = async () => {
    const f = input.files[0]; if (!f) return;
    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (!matrix.length) { toast('文件为空', 'danger'); return; }
    const sheetName = wb.SheetNames[0];
    let imageMap = new Map();
    try { imageMap = await extractXlsxImages(buf); } catch (e) { console.warn('extract images failed', e); }
    const headerRow = matrix[0].map((h) => normHeader(h));
    const colOf = (...names) => { for (const n of names) { const i = headerRow.indexOf(n); if (i >= 0) return i; } return -1; };
    const cShot = colOf('reviewScreenshotUrl');        // 评价截图（内嵌图片所在列）
    const tShot = colOf('transferScreenshotUrl');       // 转账截图
    const cContent = colOf('reviewContent');            // 评论内容
    const cComments = colOf('comments');                // 评论数据（JSON）
    const existing = await getAll('orders');
    const customers = await getAll('customers');
    let inserted = 0, updated = 0, failed = 0;
    const failedRows = [];
    const recomputeIds = new Set();
    for (let r = 1; r < matrix.length; r++) {
      const raw = matrix[r];
      const rowObj = {};
      headerRow.forEach((h, i) => { rowObj[h] = raw[i]; });
      const orderNumber = String(rowObj.orderNumber || '').trim();
      const customerName = String(rowObj.customerName || '').trim();
      const excelRow = r + 1;
      if (!orderNumber || !customerName) { failed++; failedRows.push({ excelRow, orderNumber, customerName, content: String(rowObj.reviewContent || ''), imgCount: 0, reason: '缺少订单号或客户名' }); continue; }
      const cShotImgs = cShot >= 0 ? (imageMap.get(`${sheetName}::${cShot}:${excelRow}`) || []) : [];
      const tShotImgs = tShot >= 0 ? (imageMap.get(`${sheetName}::${tShot}:${excelRow}`) || []) : [];
      const comments = buildCommentsFromRow({ rowObj, cContent, cComments, cShot, cShotImgs, tShot, tShotImgs });
      const ex = existing.find((x) => x.orderNumber && x.orderNumber.toLowerCase() === orderNumber.toLowerCase());
      if (ex) {
        ex.comments = Array.isArray(ex.comments) ? ex.comments.concat(comments) : comments;
        await syncCommentMirrors(ex, 'orders');
        if (ex.customerId) recomputeIds.add(ex.customerId);
        updated++;
      } else {
        const cust = customers.find((x) => x.name && x.name.toLowerCase() === customerName.toLowerCase());
        const rec = {
          id: uid(),
          orderDate: rowObj.orderDate ? String(rowObj.orderDate).slice(0, 10) : null,
          reviewSubmitDate: excelDate(rowObj.reviewSubmitDate),
          customerName, customerEmail: String(rowObj.customerEmail || ''),
          socialMediaUrl: String(rowObj.socialMediaUrl || ''),
          store: String(rowObj.store || ''), product: String(rowObj.product || ''),
          productUrl: String(rowObj.productUrl || ''), amount: parseNum(rowObj.amount),
          cooperationIndex: parseNum(rowObj.cooperationIndex) || 1,
          orderNumber, refundMethod: String(rowObj.refundMethod || ''),
          ppAccount: String(rowObj.ppAccount || ''),
          reviewImages: cShotImgs.slice(),
          reviewScreenshotUrl: cShotImgs[0] || '',
          reviewContent: comments.map((c) => c.content).filter(Boolean).join('\n\n'),
          feedback: String(rowObj.feedback || ''),
          transferScreenshotUrl: tShotImgs[0] || '',
          status: normStatus(rowObj.status),
          customerId: cust ? cust.id : null,
          comments,
          country: String(rowObj.country || (cust ? cust.country : '')),
          currency: String(rowObj.currency || currencyOfCountry(String(rowObj.country || (cust ? cust.country : '')))),
          createdAt: new Date().toISOString(),
        };
        await putOne('orders', rec);
        await linkOrderToCustomer(rec);
        if (rec.customerId) recomputeIds.add(rec.customerId);
        inserted++;
      }
    }
    for (const cid of recomputeIds) await recomputeCustomerStatsById(cid);
    renderCustomersIfVisible(true);
    const msg = `导入完成：新增 ${inserted}，更新 ${updated}，失败 ${failed}`;
    if (failed) { toast(msg, 'danger'); showImportFailedModal(failedRows); } else toast(msg, 'success');
    render();
  };
  input.click();
}
function exportToExcel(rows, filename, headers) {
  const ws = XLSX.utils.json_to_sheet(rows, { header: headers.map((h) => h.key) });
  ws['!cols'] = headers.map((h) => ({ wch: h.wch || 16 }));
  // set header row labels
  headers.forEach((h, i) => { const cell = XLSX.utils.encode_col(i) + '1'; if (ws[cell]) ws[cell].v = h.label; });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  XLSX.writeFile(wb, filename);
}
async function exportCustomersExcel() {
  const list = await getAll('customers');
  const headers = [
    { key: 'name', label: '姓名', wch: 18 }, { key: 'email', label: '邮箱', wch: 24 },
    { key: 'country', label: '国家', wch: 8 }, { key: 'source', label: '来源', wch: 12 },
    { key: 'followers', label: '粉丝数', wch: 10 }, { key: 'product', label: '测评产品', wch: 20 },
    { key: 'cooperationCount', label: '合作次数', wch: 10 }, { key: 'refundMethod', label: '返款方式', wch: 14 },
    { key: 'needShippingAdvance', label: '垫付运费', wch: 10 }, { key: 'ppAccount', label: 'PayPal账号', wch: 22 },
    { key: 'latestFollowUp', label: '最新跟进', wch: 28 }, { key: 'startDate', label: '开始日期', wch: 12 },
    { key: 'lastOrderDate', label: '最新合作日期', wch: 12 }, { key: 'socialMediaUrl', label: '社媒链接', wch: 30 },
    { key: 'reviewContent', label: '评论内容', wch: 40 }, { key: 'comments', label: '评论数据', wch: 60 },
  ];
  const rows = list.map((x) => {
    const comments = Array.isArray(x.comments) ? x.comments : [];
    const images = [];
    comments.forEach((c) => (c.images || []).forEach((u) => { if (u && !images.includes(u)) images.push(u); }));
    (x.reviewImages || []).forEach((u) => { if (u && !images.includes(u)) images.push(u); });
    const content = comments.length ? comments.map((c) => (c.content || '').trim()).filter(Boolean).join('\n\n') : (x.reviewContent || '');
    let submitDate = null;
    for (const c of comments) { if (c.submitDate) { submitDate = c.submitDate; break; } }
    if (!submitDate && comments.length) submitDate = comments[0].submitDate || null;
    if (!submitDate) submitDate = x.reviewSubmitDate || null;
    return {
      ...x,
      needShippingAdvance: x.needShippingAdvance ? '是' : '否',
      reviewImages: images.join('\n'),
      reviewContent: content,
      reviewSubmitDate: submitDate,
      comments: JSON.stringify(comments),
    };
  });
  exportToExcel(rows, `客户数据_${todayISO()}.xlsx`, headers);
  toast('客户已导出', 'success');
}
async function exportOrdersExcel() {
  const list = await getAll('orders');
  const headers = [
    { key: 'orderDate', label: '订单日期', wch: 12 }, { key: 'customerName', label: '客户名称', wch: 18 },
    { key: 'customerEmail', label: '客户邮箱', wch: 24 }, { key: 'store', label: '店铺', wch: 10 },
    { key: 'product', label: '产品', wch: 22 }, { key: 'productUrl', label: '产品链接', wch: 30 },
    { key: 'amount', label: '金额', wch: 10 }, { key: 'currency', label: '货币', wch: 8 }, { key: 'cooperationIndex', label: '合作序号', wch: 10 },
    { key: 'orderNumber', label: '订单号', wch: 20 }, { key: 'refundMethod', label: '返款方式', wch: 14 },
    { key: 'ppAccount', label: 'PayPal账号', wch: 22 }, { key: 'status', label: '状态', wch: 10 },
    { key: 'country', label: '国家', wch: 8 }, { key: 'reviewSubmitDate', label: '评论提交时间', wch: 14 }, { key: 'reviewImages', label: '评价截图', wch: 40 },
    { key: 'reviewContent', label: '测评文案', wch: 40 }, { key: 'feedback', label: '反馈', wch: 30 },
    { key: 'transferScreenshotUrl', label: '转账凭证', wch: 30 }, { key: 'comments', label: '评论数据', wch: 60 },
  ];
  const rows = list.map((x) => {
    const comments = Array.isArray(x.comments) ? x.comments : [];
    const images = [];
    comments.forEach((c) => (c.images || []).forEach((u) => { if (u && !images.includes(u)) images.push(u); }));
    (x.reviewImages || []).forEach((u) => { if (u && !images.includes(u)) images.push(u); });
    const content = comments.length ? comments.map((c) => (c.content || '').trim()).filter(Boolean).join('\n\n') : (x.reviewContent || '');
    let submitDate = null;
    for (const c of comments) { if (c.submitDate) { submitDate = c.submitDate; break; } }
    if (!submitDate && comments.length) submitDate = comments[0].submitDate || null;
    if (!submitDate) submitDate = x.reviewSubmitDate || null;
    return {
      ...x,
      status: (STATUS[x.status] || {}).label || x.status,
      reviewImages: images.join('\n'),
      reviewContent: content,
      reviewSubmitDate: submitDate,
      comments: JSON.stringify(comments),
    };
  });
  exportToExcel(rows, `订单数据_${todayISO()}.xlsx`, headers);
  toast('订单已导出', 'success');
}

/* ============================================================
   COMMENTS (一对多评论管理) · 数据模型 + 迁移 + 导入导出 + UI
   ============================================================ */
const COMMENTS_MIG_GUARD = 'mig_comments_v1';

// 将 rec.comments 镜像回旧标量字段（不破坏既有字段）
function syncCommentMirrors(rec, store) {
  const comments = Array.isArray(rec.comments) ? rec.comments : [];
  const content = comments.map((c) => (c.content || '').trim()).filter(Boolean).join('\n\n');
  const images = [];
  comments.forEach((c) => (c.images || []).forEach((u) => { if (u && !images.includes(u)) images.push(u); }));
  let submitDate = null;
  for (const c of comments) { if (c.submitDate) { submitDate = c.submitDate; break; } }
  if (!submitDate && comments.length) submitDate = comments[0].submitDate || null;
  rec.reviewContent = content;
  rec.reviewImages = images;
  rec.reviewSubmitDate = submitDate;
  // 注意：保留 reviewScreenshotUrl / transferScreenshotUrl 等既有字段，不覆盖
  return putOne(store, rec);
}

/* ---------- 跨模块双向联动：订单 <-> 客户评论管理 (v20260814c) ---------- */

// 方向1：订单保存后，把订单的评论字段同步到 comments store（按订单号匹配）
// 存在对应评论则更新（仅更新最近一条，避免误改多条手动评论）；不存在且订单含评论数据则自动新建
async function syncOrderReviewToComments(order) {
  if (!order) return;
  const onum = String(order.orderNumber || '').trim().toLowerCase();
  if (!onum) return;
  const hasReviewData = Boolean(
    (order.reviewContent && String(order.reviewContent).trim()) ||
    (Array.isArray(order.reviewImages) && order.reviewImages.length) ||
    order.reviewSubmitDate
  );
  const allComments = await getAll('comments');
  const matched = allComments
    .filter((c) => c.orderNumber && String(c.orderNumber).trim().toLowerCase() === onum)
    .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));

  if (matched.length) {
    // 仅更新最近一条，保留其他（如手动多条）评论不被覆盖
    const target = matched[0];
    target.reviewContent = order.reviewContent || '';
    target.images = Array.isArray(order.reviewImages) ? order.reviewImages.slice() : [];
    target.reviewSubmitDate = order.reviewSubmitDate || null;
    if (order.customerName) target.customerName = order.customerName;
    if (order.customerEmail) target.customerEmail = order.customerEmail;
    if (order.product) target.product = order.product;
    if (order.store) target.store = order.store;
    target.orderId = order.id;
    target.updatedAt = new Date().toISOString();
    await putOne('comments', target);
    // 同步更新订单内嵌 comments[] 镜像，保持详情页"评论管理"标签一致
    if (!Array.isArray(order.comments)) order.comments = [];
    const mi = order.comments.findIndex((c) => c.id === target.id);
    const mirror = { id: target.id, content: target.reviewContent, images: target.images, submitDate: target.reviewSubmitDate, source: 'order_sync' };
    if (mi >= 0) order.comments[mi] = mirror; else order.comments.push(mirror);
    await putOne('orders', order);
    return;
  }

  if (!hasReviewData) return; // 订单无评论数据则不新建空评论

  // 不存在对应评论 -> 自动新建一条评论记录
  const now = new Date().toISOString();
  const recData = {
    id: uid(),
    orderNumber: order.orderNumber,
    orderId: order.id,
    customerName: order.customerName || '',
    customerEmail: order.customerEmail || '',
    product: order.product || '',
    store: order.store || '',
    sourceTag: '',
    reviewStatus: 'reviewed',
    rating: null,
    reviewSubmitDate: order.reviewSubmitDate || null,
    reviewContent: order.reviewContent || '',
    feedback: '',
    images: Array.isArray(order.reviewImages) ? order.reviewImages.slice() : [],
    createdAt: now,
    updatedAt: now,
  };
  await putOne('comments', recData);
  if (!Array.isArray(order.comments)) order.comments = [];
  order.comments.push({ id: recData.id, content: recData.reviewContent, images: recData.images, submitDate: recData.reviewSubmitDate, source: 'order_sync' });
  await putOne('orders', order);
}

// 方向2：评论保存后，把评论信息回写到对应订单的顶层评论字段
async function syncCommentReviewToOrder(comment) {
  if (!comment) return;
  const orders = await getAll('orders');
  const ord = comment.orderId
    ? orders.find((o) => o.id === comment.orderId)
    : orders.find((o) => o.orderNumber && String(o.orderNumber).trim().toLowerCase() === String(comment.orderNumber || '').trim().toLowerCase());
  if (!ord) return;
  ord.reviewContent = comment.reviewContent || '';
  ord.reviewImages = Array.isArray(comment.images) ? comment.images.slice() : [];
  ord.reviewSubmitDate = comment.reviewSubmitDate || null;
  // 同步更新订单内嵌 comments[] 镜像
  if (!Array.isArray(ord.comments)) ord.comments = [];
  const mi = ord.comments.findIndex((c) => c.id === comment.id);
  const mirror = { id: comment.id, content: comment.reviewContent, images: comment.images, submitDate: comment.reviewSubmitDate, source: 'comments_page' };
  if (mi >= 0) ord.comments[mi] = mirror; else ord.comments.push(mirror);
  await putOne('orders', ord);
}

// 一次性迁移守卫：把旧标量字段构造成 comments 数组
function migrateComments() {
  let guardSet = false;
  try { if (localStorage.getItem(COMMENTS_MIG_GUARD)) return; } catch (e) {}
  let count = 0;
  const migrateOne = (store, rec) => {
    if (!rec || !Array.isArray(rec.comments)) rec.comments = [];
    if (rec.comments.length) return;
    const content = String(rec.reviewContent || '').trim();
    const images = Array.isArray(rec.reviewImages) ? rec.reviewImages.filter(Boolean) : [];
    const cShot = String(rec.reviewScreenshotUrl || '').trim();
    if (cShot && !images.includes(cShot)) images.unshift(cShot);
    if (!content && !images.length) return;
    const now = new Date().toISOString();
    rec.comments = [{
      id: uid(), content, images, submitDate: rec.reviewSubmitDate || null,
      source: 'migrated', createdAt: now, updatedAt: now,
    }];
    count++;
    try { syncCommentMirrors(rec, store); } catch (e) { console.warn('migrate comment failed', e); }
  };
  const finish = () => {
    try { localStorage.setItem(COMMENTS_MIG_GUARD, '1'); guardSet = true; } catch (e) {}
    if (count) toast(`已迁移 ${count} 条历史评论到评论管理`, 'success');
  };
  getAll('orders').then(async (orders) => {
    orders.forEach((o) => { try { migrateOne('orders', o); } catch (e) {} });
    const customers = await getAll('customers');
    customers.forEach((c) => { try { migrateOne('customers', c); } catch (e) {} });
    finish();
  }).catch((e) => { console.warn('migrateComments failed', e); if (!guardSet) { try { localStorage.setItem(COMMENTS_MIG_GUARD, '1'); } catch (x) {} } });
}

// 使用正则解析 xlsx 内嵌图片（drawing XML 带命名空间，getElementsByTagName 取不到）—— 浏览器与 Node 通用
async function extractXlsxImages(arrayBuffer) {
  const files = fflate.unzipSync(new Uint8Array(arrayBuffer)); // { 'xl/...': Uint8Array }
  const map = new Map();
  const dec = (p) => (files[p] ? new TextDecoder().decode(files[p]) : '');
  const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };
  const bytesToBase64 = (b) => { let s = ''; const k = 0x8000; for (let i = 0; i < b.length; i += k) s += String.fromCharCode.apply(null, b.subarray(i, i + k)); return btoa(s); };
  const mediaURL = (ext, b) => `data:${(MIME[(ext || '').toLowerCase()] || 'image/png')};base64,${bytesToBase64(b)}`;
  const resolveRel = (base, rel) => {
    const parts = base.split('/'); parts.pop();
    rel.split('/').forEach((seg) => { if (seg === '..') parts.pop(); else if (seg !== '.') parts.push(seg); });
    return parts.join('/');
  };
  // workbook rels: Id -> Target
  const ridTarget = {};
  (dec('xl/_rels/workbook.xml.rels').match(/<Relationship[^>]*>/g) || []).forEach((r) => {
    const id = (r.match(/Id="([^"]+)"/) || [])[1];
    const t = (r.match(/Target="([^"]+)"/) || [])[1];
    if (id && t) ridTarget[id] = t;
  });
  // sheet name -> r:id
  const sheetRid = {};
  const wbXml = dec('xl/workbook.xml');
  (wbXml.match(/<sheet\b[^>]*>/g) || []).forEach((s) => {
    const name = (s.match(/name="([^"]+)"/) || [])[1];
    const rid = (s.match(/r:id="([^"]+)"/) || [])[1] || (s.match(/r:Id="([^"]+)"/) || [])[1];
    if (name && rid) sheetRid[name] = rid;
  });
  const wb = XLSX.read(arrayBuffer, { type: 'array' });
  for (const name of wb.SheetNames) {
    const rid = sheetRid[name]; if (!rid) continue;
    let sheetPath = (ridTarget[rid] || '').replace(/^\//, '');
    if (sheetPath && !sheetPath.startsWith('xl/')) sheetPath = 'xl/' + sheetPath.replace(/^\.\//, '');
    if (!files[sheetPath]) continue;
    const sRels = sheetPath.replace(/xl\/worksheets\//, 'xl/worksheets/_rels/').replace(/\.xml$/, '.xml.rels');
    if (!files[sRels]) continue;
    const drawingTarget = (dec(sRels).match(/<Relationship[^>]*Type="[^"]*drawing[^"]*"[^>]*>/i) || [])[0];
    if (!drawingTarget) continue;
    const dTarget = (drawingTarget.match(/Target="([^"]+)"/) || [])[1]; if (!dTarget) continue;
    const drawingPath = resolveRel(sheetPath, dTarget);
    const dXml = dec(drawingPath); if (!dXml) continue;
    const dRels = drawingPath.replace(/xl\/drawings\//, 'xl/drawings/_rels/').replace(/\.xml$/, '.xml.rels');
    const blipMedia = {};
    (dec(dRels).match(/<Relationship[^>]*>/g) || []).forEach((r) => {
      const id = (r.match(/Id="([^"]+)"/) || [])[1];
      const t = (r.match(/Target="([^"]+)"/) || [])[1];
      if (id && t) blipMedia[id] = resolveRel(drawingPath, t);
    });
    // 注意：OOXML 中 <xdr:pic> 总是包在 <xdr:oneCellAnchor>/<xdr:twoCellAnchor> 内，
    // <xdr:from>(col/row) 是 anchor 的子节点，而非 pic 的子节点。因此按 anchor 整体匹配。
    const anchors = dXml.match(/<xdr:oneCellAnchor>[\s\S]*?<\/xdr:oneCellAnchor>/g)
      || dXml.match(/<xdr:twoCellAnchor>[\s\S]*?<\/xdr:twoCellAnchor>/g) || [];
    anchors.forEach((anchor) => {
      const from = (anchor.match(/<xdr:from>[\s\S]*?<\/xdr:from>/) || [])[0]; if (!from) return;
      const col = +(from.match(/<xdr:col>(\d+)<\/xdr:col>/) || [])[1];
      const row = +(from.match(/<xdr:row>(\d+)<\/xdr:row>/) || [])[1];
      if (isNaN(col) || isNaN(row)) return;
      const blip = (anchor.match(/<a:blip[^>]*>/) || [])[0]; if (!blip) return;
      const rId = (blip.match(/r:embed="([^"]+)"/) || [])[1] || (blip.match(/embed="([^"]+)"/) || [])[1];
      const mediaPath = rId ? blipMedia[rId] : null; if (!mediaPath || !files[mediaPath]) return;
      const ext = mediaPath.split('.').pop();
      const key = `${name}::${col}:${row + 1}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(mediaURL(ext, files[mediaPath]));
    });
  }
  return map;
}

// 由一行 Excel 数据构造 comments 数组（优先 JSON 精确重建 → 内嵌图片+文本 → 旧标量回退）
function buildCommentsFromRow({ rowObj, cContent, cComments, cShot, cShotImgs, tShot, tShotImgs }) {
  const now = new Date().toISOString();
  const content = cContent >= 0 ? String(rowObj[cContent] || '') : '';
  // 1) JSON 精确重建
  if (cComments >= 0) {
    const raw = rowObj[cComments];
    const rawStr = typeof raw === 'string' ? raw.trim() : (raw ? JSON.stringify(raw) : '');
    if (rawStr) {
      try {
        const arr = typeof raw === 'string' ? JSON.parse(rawStr) : raw;
        if (Array.isArray(arr) && arr.length) {
          return arr.filter((x) => x && ((x.content || '').trim() || (x.images && x.images.length)))
            .map((x) => ({
              id: x.id || uid(), content: String(x.content || ''),
              images: Array.isArray(x.images) ? x.images.filter(Boolean) : [],
              submitDate: x.submitDate || null, source: x.source || 'import',
              createdAt: x.createdAt || now, updatedAt: x.updatedAt || now,
            }));
        }
      } catch (e) { /* 解析失败 → 走下方文本/图片逻辑 */ }
    }
  }
  // 收集图片：内嵌优先，否则旧标量评价截图 URL
  const imgs = (cShotImgs || []).slice();
  const scalarShot = cShot >= 0 ? String(rowObj[cShot] || '').trim() : '';
  if (!imgs.length && scalarShot) {
    scalarShot.split(/[\n;,；]+/).map((s) => s.trim()).filter(Boolean).forEach((u) => { if (!imgs.includes(u)) imgs.push(u); });
  }
  // 2) 内嵌图片 + 文本 建一条
  if (content.trim() || imgs.length) {
    return [{ id: uid(), content: content.trim(), images: imgs, submitDate: excelDate(rowObj.reviewSubmitDate) || null, source: imgs.length ? 'import' : 'manual', createdAt: now, updatedAt: now }];
  }
  // 3) 旧标量回退（仅 URL，无文本）
  if (scalarShot) {
    return [{ id: uid(), content: '', images: imgs, submitDate: excelDate(rowObj.reviewSubmitDate) || null, source: 'import', createdAt: now, updatedAt: now }];
  }
  return [];
}

// 导入失败项弹窗 + 导出 xlsx
function showImportFailedModal(failedRows) {
  if (!failedRows || !failedRows.length) return;
  const headers = [
    { key: 'excelRow', label: 'Excel行', wch: 10 },
    { key: 'orderNumber', label: '订单号', wch: 20 },
    { key: 'customerName', label: '客户', wch: 18 },
    { key: 'content', label: '评论内容', wch: 40 },
    { key: 'imgCount', label: '图片数', wch: 8 },
    { key: 'reason', label: '原因', wch: 30 },
  ];
  const html = `<div class="modal-head"><h3>导入失败项（${failedRows.length}）</h3><button class="x-btn modal-close">×</button></div>
  <div class="modal-body">
    <div class="table-wrap" style="max-height:50vh;overflow:auto"><table class="data"><thead><tr>${headers.map((h) => `<th>${esc(h.label)}</th>`).join('')}</tr></thead><tbody>
    ${failedRows.map((r) => `<tr><td>${r.excelRow}</td><td>${esc(r.orderNumber)}</td><td>${esc(r.customerName)}</td><td class="cell-ellipsis">${esc(r.content)}</td><td>${r.imgCount}</td><td>${esc(r.reason)}</td></tr>`).join('')}
    </tbody></table></div>
    <div class="row mt2" style="gap:10px;justify-content:flex-end"><button class="btn modal-close">关闭</button><button class="btn btn-primary" id="exp-failed">导出失败项为xlsx</button></div>
  </div>`;
  const m = openModal(html, { wide: true });
  $('#exp-failed', m.root).addEventListener('click', () => {
    exportToExcel(failedRows, `导入失败_${todayISO()}.xlsx`, headers);
    toast('已导出失败项', 'success');
  });
}

/* ---------- 评论管理（订单详情 Tab） ---------- */
function cmItemHtml(c, i) {
  const imgs = Array.isArray(c.images) ? c.images : [];
  return `<div class="cm-item" data-i="${i}">
    <div class="cm-item-head">
      <span class="badge ${c.source === 'migrated' ? 'neutral' : 'primary'}">${esc(c.source || 'manual')}</span>
      ${c.submitDate ? `<span class="cm-item-date">📅 ${esc(c.submitDate)}</span>` : ''}
      <span class="grow"></span>
      <button class="btn btn-icon btn-sm cm-edit" data-i="${i}" title="保存">💾</button>
      <button class="btn btn-icon btn-sm cm-del" data-i="${i}" title="删除">🗑</button>
    </div>
    <textarea class="textarea cm-content" data-i="${i}" rows="2" placeholder="评论内容…">${esc(c.content || '')}</textarea>
    <div class="row" style="gap:8px;margin-top:6px"><input class="input cm-date" data-i="${i}" type="date" value="${esc(c.submitDate || '')}"></div>
    ${imgs.length ? `<div class="cm-imgs">${imgs.map((u, j) => `<span class="cm-thumb" data-i="${i}" data-j="${j}"><img src="${esc(u)}" alt=""><a class="cm-dl" href="${esc(u)}" download title="下载">⬇</a><button type="button" class="cm-img-del" data-i="${i}" data-j="${j}">×</button></span>`).join('')}</div>` : ''}
  </div>`;
}
function bindCommentItem(paneEl, i, ctx) {
  const { store, id, loadRecord, onChange } = ctx;
  const item = $(`.cm-item[data-i="${i}"]`, paneEl);
  if (!item) return;
  $('.cm-del', item).addEventListener('click', async () => {
    const rec = await loadRecord(id);
    rec.comments.splice(i, 1);
    await syncCommentMirrors(rec, store);
    toast('已删除评论', 'success');
    onChange();
    renderCommentManager(paneEl, ctx);
  });
  $('.cm-edit', item).addEventListener('click', async () => {
    const content = $('.cm-content', item).value.trim();
    const submitDate = $('.cm-date', item).value || null;
    const rec = await loadRecord(id);
    rec.comments[i].content = content;
    rec.comments[i].submitDate = submitDate;
    rec.comments[i].updatedAt = new Date().toISOString();
    await syncCommentMirrors(rec, store);
    toast('已保存', 'success');
    onChange();
  });
  $$('.cm-img-del', item).forEach((b) => b.addEventListener('click', async () => {
    const j = +b.dataset.j;
    const rec = await loadRecord(id);
    rec.comments[i].images.splice(j, 1);
    await syncCommentMirrors(rec, store);
    onChange();
    renderCommentManager(paneEl, ctx);
  }));
  $$('.cm-thumb img', item).forEach((img) => img.addEventListener('click', () => openModal(`<div class="modal-body" style="text-align:center"><img src="${esc(img.src)}" style="max-width:100%;border-radius:12px"></div>`, { wide: true })));
}
async function bindCommentAddForm(paneEl, paneId, onAdd) {
  const addImgs = [];
  const pasteZone = $('.cm-add-paste', paneEl);
  if (pasteZone) {
    pasteZone.addEventListener('click', () => pasteZone.focus());
    pasteZone.addEventListener('paste', async (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      const items = [...e.clipboardData.items].filter((it) => it.type.indexOf('image') !== -1);
      if (!items.length) return; e.preventDefault();
      for (const item of items) {
        const file = item.getAsFile();
        const dataUrl = await new Promise((res) => { const r = new FileReader(); r.onload = (ev) => res(ev.target.result); r.readAsDataURL(file); });
        if (!addImgs.includes(dataUrl)) addImgs.push(dataUrl);
      }
      renderAddImgs();
      toast(`已粘贴 ${items.length} 张`, 'success');
    });
  }
  const urlInput = $('.cm-add-url', paneEl);
  const renderAddImgs = () => {
    const box = $('.cm-add-imgs', paneEl); if (!box) return;
    box.innerHTML = addImgs.map((u, i) => `<span class="cm-thumb"><img src="${esc(u)}" alt=""><button type="button" class="cm-thumb-del" data-i="${i}">×</button></span>`).join('');
    $$('.cm-thumb-del', paneEl).forEach((b) => b.addEventListener('click', () => { addImgs.splice(+b.dataset.i, 1); renderAddImgs(); }));
    $$('.cm-thumb img', paneEl).forEach((img) => img.addEventListener('click', () => openModal(`<div class="modal-body" style="text-align:center"><img src="${esc(img.src)}" style="max-width:100%;border-radius:12px"></div>`, { wide: true })));
  };
  const addBtn = $('#' + paneId + '-add', paneEl);
  if (addBtn) addBtn.addEventListener('click', async () => {
    const content = $('.cm-add-content', paneEl).value.trim();
    const submitDate = $('.cm-add-date', paneEl).value || null;
    const urlStr = urlInput ? urlInput.value.trim() : '';
    if (urlStr) urlStr.split(/[,，;；\s]+/).map((s) => s.trim()).filter(Boolean).forEach((u) => { if (!addImgs.includes(u)) addImgs.push(u); });
    await onAdd(content, submitDate, addImgs.slice());
  });
}
async function renderCommentManager(paneEl, { store, id, loadRecord, onChange }) {
  const rec = await loadRecord(id);
  if (!rec) return;
  if (!Array.isArray(rec.comments)) rec.comments = [];
  const paneId = paneEl.id;
  paneEl.innerHTML = `<div class="cm-wrap">
    <div class="cm-list">${rec.comments.map((c, i) => cmItemHtml(c, i)).join('') || '<div class="muted tiny">暂无评论</div>'}</div>
    <div class="cm-add">
      <div class="cm-add-title">＋ 新增评论</div>
      <textarea class="textarea cm-add-content" rows="2" placeholder="评论内容…"></textarea>
      <div class="row" style="gap:8px;margin-top:6px"><input class="input cm-add-date" type="date" value="${todayISO()}"><input class="input cm-add-url" style="flex:1" placeholder="图片URL（可选，多个用逗号分隔）"></div>
      <div class="cm-add-paste" tabindex="0">点击此处后按 Ctrl+V 粘贴图片</div>
      <div class="cm-add-imgs"></div>
      <button class="btn btn-sm btn-primary" id="${paneId}-add" type="button" style="margin-top:8px">保存评论</button>
    </div>
  </div>`;
  rec.comments.forEach((c, i) => bindCommentItem(paneEl, i, { store, id, loadRecord, onChange }));
  await bindCommentAddForm(paneEl, paneId, async (content, submitDate, imgs) => {
    if (!content && !imgs.length) { toast('请输入内容或图片', 'danger'); return; }
    const r2 = await loadRecord(id);
    if (!Array.isArray(r2.comments)) r2.comments = [];
    r2.comments.push({ id: uid(), content, images: imgs, submitDate, source: 'manual', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    await syncCommentMirrors(r2, store);
    toast('已添加评论', 'success');
    onChange();
    renderCommentManager(paneEl, { store, id, loadRecord, onChange });
  });
}

/* ---------- 评论管理（客户详情 Tab，聚合客户+其订单评论） ---------- */
function cmAggItemHtml(it, i) {
  const c = it.cm;
  const imgs = Array.isArray(c.images) ? c.images : [];
  const ownerLabel = it.owner === 'order' ? `订单 · ${esc(it.orderNumber || '')}` : '客户';
  return `<div class="cm-item" data-i="${i}">
    <div class="cm-item-head">
      <span class="badge ${c.source === 'migrated' ? 'neutral' : 'primary'}">${esc(c.source || 'manual')}</span>
      <span class="cm-owner">${ownerLabel}</span>
      ${c.submitDate ? `<span class="cm-item-date">📅 ${esc(c.submitDate)}</span>` : ''}
      <span class="grow"></span>
      <button class="btn btn-icon btn-sm cm-edit" data-i="${i}" title="保存">💾</button>
      <button class="btn btn-icon btn-sm cm-del" data-i="${i}" title="删除">🗑</button>
    </div>
    <textarea class="textarea cm-content" data-i="${i}" rows="2" placeholder="评论内容…">${esc(c.content || '')}</textarea>
    <div class="row" style="gap:8px;margin-top:6px"><input class="input cm-date" data-i="${i}" type="date" value="${esc(c.submitDate || '')}"></div>
    ${imgs.length ? `<div class="cm-imgs">${imgs.map((u, j) => `<span class="cm-thumb" data-i="${i}" data-j="${j}"><img src="${esc(u)}" alt=""><a class="cm-dl" href="${esc(u)}" download title="下载">⬇</a><button type="button" class="cm-img-del" data-i="${i}" data-j="${j}">×</button></span>`).join('')}</div>` : ''}
  </div>`;
}
async function renderCustomerCommentManager(paneEl, { id, onChange }) {
  const c = await getOne('customers', id);
  if (!c) return;
  if (!Array.isArray(c.comments)) c.comments = [];
  const orders = await findOrdersByCustomer(c, await getAll('orders'));
  orders.forEach((o) => { if (!Array.isArray(o.comments)) o.comments = []; });
  const orderMap = {};
  orders.forEach((o) => { orderMap[o.id] = o; });
  const items = [];
  c.comments.forEach((cm) => items.push({ owner: 'customer', refId: null, cm }));
  orders.forEach((o) => o.comments.forEach((cm) => items.push({ owner: 'order', refId: o.id, cm, orderNumber: o.orderNumber })));
  const paneId = paneEl.id;
  paneEl.innerHTML = `<div class="cm-wrap">
    <div class="cm-list">${items.map((it, i) => cmAggItemHtml(it, i)).join('') || '<div class="muted tiny">暂无评论</div>'}</div>
    <div class="cm-add">
      <div class="cm-add-title">＋ 新增评论（归入客户）</div>
      <textarea class="textarea cm-add-content" rows="2" placeholder="评论内容…"></textarea>
      <div class="row" style="gap:8px;margin-top:6px"><input class="input cm-add-date" type="date" value="${todayISO()}"><input class="input cm-add-url" style="flex:1" placeholder="图片URL（可选，多个用逗号分隔）"></div>
      <div class="cm-add-paste" tabindex="0">点击此处后按 Ctrl+V 粘贴图片</div>
      <div class="cm-add-imgs"></div>
      <button class="btn btn-sm btn-primary" id="${paneId}-add" type="button" style="margin-top:8px">保存评论</button>
    </div>
  </div>`;
  items.forEach((it, i) => {
    const item = $(`.cm-item[data-i="${i}"]`, paneEl);
    if (!item) return;
    $('.cm-del', item).addEventListener('click', async () => {
      if (it.owner === 'customer') { c.comments.splice(i, 1); await syncCommentMirrors(c, 'customers'); }
      else { const o = orderMap[it.refId]; o.comments.splice(o.comments.indexOf(it.cm), 1); await syncCommentMirrors(o, 'orders'); }
      toast('已删除评论', 'success'); onChange(); renderCustomerCommentManager(paneEl, { id, onChange });
    });
    $('.cm-edit', item).addEventListener('click', async () => {
      const content = $('.cm-content', item).value.trim();
      const submitDate = $('.cm-date', item).value || null;
      if (it.owner === 'customer') { c.comments[i].content = content; c.comments[i].submitDate = submitDate; c.comments[i].updatedAt = new Date().toISOString(); await syncCommentMirrors(c, 'customers'); }
      else { const o = orderMap[it.refId]; const idx = o.comments.indexOf(it.cm); o.comments[idx].content = content; o.comments[idx].submitDate = submitDate; o.comments[idx].updatedAt = new Date().toISOString(); await syncCommentMirrors(o, 'orders'); }
      toast('已保存', 'success'); onChange();
    });
    $$('.cm-img-del', item).forEach((b) => b.addEventListener('click', async () => {
      const j = +b.dataset.j;
      if (it.owner === 'customer') { c.comments[i].images.splice(j, 1); await syncCommentMirrors(c, 'customers'); }
      else { const o = orderMap[it.refId]; const idx = o.comments.indexOf(it.cm); o.comments[idx].images.splice(j, 1); await syncCommentMirrors(o, 'orders'); }
      onChange(); renderCustomerCommentManager(paneEl, { id, onChange });
    }));
    $$('.cm-thumb img', item).forEach((img) => img.addEventListener('click', () => openModal(`<div class="modal-body" style="text-align:center"><img src="${esc(img.src)}" style="max-width:100%;border-radius:12px"></div>`, { wide: true })));
  });
  await bindCommentAddForm(paneEl, paneId, async (content, submitDate, imgs) => {
    if (!content && !imgs.length) { toast('请输入内容或图片', 'danger'); return; }
    c.comments.push({ id: uid(), content, images: imgs, submitDate, source: 'manual', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    await syncCommentMirrors(c, 'customers');
    toast('已添加评论', 'success'); onChange(); renderCustomerCommentManager(paneEl, { id, onChange });
  });
}

/* ---------- 列设置（含下拉配置入口） ---------- */
function openColumnSettings(key, onChange) {
  const schema = TABLE_SCHEMAS[key];
  const cols = getTableState(key);
  const title = key === 'orders' ? '订单' : (key === 'customers' ? '客户' : key);
  const html = `<div class="modal-head"><h3>列设置 · ${title}</h3><button class="x-btn modal-close">×</button></div>
  <div class="modal-body col-set">
    <p class="tiny muted">勾选控制列是否显示；点击"下拉配置"可设置该列的下拉选项。</p>
    <div class="col-set-list">${cols.map((c) => {
      const sch = schema.find((s) => s.key === c.key) || {};
      const label = sch.label || c.label || c.key;
      return `<div class="col-set-row">
        <label class="switch small"><input type="checkbox" class="col-vis" data-key="${c.key}" ${c.hidden ? '' : 'checked'}><span class="switch-track"></span></label>
        <span class="col-set-label">${esc(label)}</span>
        <button class="btn btn-sm col-dd" data-key="${c.key}">下拉配置</button>
      </div>`;
    }).join('')}</div>
    <div class="row mt2" style="gap:10px;justify-content:flex-end"><button class="btn modal-close">关闭</button></div>
  </div>`;
  const m = openModal(html);
  $$('.col-vis', m.root).forEach((cb) => cb.addEventListener('change', () => {
    const col = cols.find((x) => x.key === cb.dataset.key);
    if (col) { col.hidden = !cb.checked; onChange(); }
  }));
  $$('.col-dd', m.root).forEach((b) => b.addEventListener('click', () => {
    const col = cols.find((x) => x.key === b.dataset.key);
    if (col) openDropdownConfig(key, col, onChange);
  }));
}

/* ---------- 月度有效评论统计（Chart.js） ---------- */
function openCommentMonthChart(rows) {
  const byMonth = {};
  (rows || []).forEach(function (o) {
    (o.comments || []).forEach(function (cm) {
      const hasContent = (cm.content || '').trim() || (cm.images || []).length;
      if (hasContent && cm.submitDate) {
        const m = String(cm.submitDate).slice(0, 7);
        byMonth[m] = (byMonth[m] || 0) + 1;
      }
    });
  });
  const months = Object.keys(byMonth).sort();
  const labels = months.length ? months : [todayISO().slice(0, 7)];
  const data = labels.map(function (m) { return byMonth[m] || 0; });
  const emptyHint = months.length ? '' : '<p class="tiny muted">当前筛选范围内暂无带提交时间的有效评论。</p>';
  const html = '<div class="modal-head"><h3>月度有效评论统计（按提交时间）</h3><button class="x-btn modal-close">×</button></div>'
    + '<div class="modal-body"><canvas id="comment-month-chart" height="180"></canvas>' + emptyHint + '</div>';
  const m = openModal(html, { wide: true });
  const canvas = $('#comment-month-chart', m.root);
  if (canvas && window.Chart) {
    const datasets = [{
      label: '有效评论数',
      data: data,
      backgroundColor: '#FFD600',
      borderColor: '#111',
      borderWidth: 1,
    }];
    const config = {
      type: 'bar',
      data: { labels: labels, datasets: datasets },
      options: {
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
      },
    };
    new window.Chart(canvas.getContext('2d'), config);
  }
}

/* ============================================================
   DEMO DATA
   ============================================================ */
async function seedDemo() {
  const cust = [
    { name: 'AquaLily_US', email: 'lily@aquapets.com', country: 'US', source: 'TikTok', followers: 124000, product: 'HITOP 50W Heater', cooperationCount: 3, refundMethod: 'PP转账', needShippingAdvance: true, ppAccount: 'lily.aqua@paypal.com', latestFollowUp: '已寄出第3批样品，等待评价', startDate: '2026-03-12', socialMediaUrl: 'https://tiktok.com/@aqualily' },
    { name: 'FishTankFrank_DE', email: 'frank@fishtube.de', country: 'DE', source: 'YouTube', followers: 88000, product: 'FEDOUR Canister Filter', cooperationCount: 2, refundMethod: 'PP转账', needShippingAdvance: false, ppAccount: 'frank.fish@paypal.de', latestFollowUp: '视频已发布，转化不错', startDate: '2026-04-02', socialMediaUrl: 'https://youtube.com/@fishtankfrank' },
    { name: 'ReeferMia_AU', email: 'mia@reef.au', country: 'AU', source: 'Instagram', followers: 54000, product: 'PYPABL LED Light', cooperationCount: 1, refundMethod: '平台退款', needShippingAdvance: false, ppAccount: 'mia.reef@paypal.com', latestFollowUp: '首次合作，沟通顺畅', startDate: '2026-05-20', socialMediaUrl: 'https://instagram.com/reefermia' },
    { name: 'GoldfishGuru_UK', email: 'guru@goldfish.uk', country: 'UK', source: 'TikTok', followers: 203000, product: 'HITOP Air Pump', cooperationCount: 4, refundMethod: 'PP转账', needShippingAdvance: true, ppAccount: 'guru.gold@paypal.co.uk', latestFollowUp: '老客户，优先安排新品', startDate: '2026-01-15', socialMediaUrl: 'https://tiktok.com/@goldfishguru' },
    { name: 'PlantedPete_CA', email: 'pete@planted.ca', country: 'CA', source: 'YouTube', followers: 67000, product: 'FEDOUR CO2 Kit', cooperationCount: 2, refundMethod: 'PP转账', needShippingAdvance: false, ppAccount: 'pete.plant@paypal.ca', latestFollowUp: '草缸测评中', startDate: '2026-02-28', socialMediaUrl: 'https://youtube.com/@plantedpete' },
    { name: 'NanoNora_FR', email: 'nora@nano.fr', country: 'FR', source: 'Instagram', followers: 41000, product: 'PYPABL Sponge Filter', cooperationCount: 1, refundMethod: 'PP转账', needShippingAdvance: false, ppAccount: 'nora.nano@paypal.fr', latestFollowUp: '样品已签收', startDate: '2026-06-10', socialMediaUrl: 'https://instagram.com/nanonora' },
  ];
  const cIds = {};
  for (const c of cust) { const id = uid(); cIds[c.name] = id; await putOne('customers', { id, ...c, createdAt: new Date().toISOString() }); }
  const mk = (on, cn, store, product, amount, currency, status, date, country) => ({
    id: uid(), orderDate: date, customerName: cn, customerEmail: 'x@x.com', socialMediaUrl: '',
    store, product, productUrl: 'https://example.com/p/' + on, amount, currency,
    cooperationIndex: 1, orderNumber: on, refundMethod: 'PP转账', ppAccount: 'x@paypal.com',
    reviewScreenshotUrl: '', reviewImages: [], reviewContent: '', feedback: '', transferScreenshotUrl: '',
    status, customerId: cIds[cn] || null, country, createdAt: new Date().toISOString(),
  });
  const orders = [
    mk('AMZ-1001', 'AquaLily_US', 'HS-US', 'HITOP 50W Heater', 39.99, 'USD', 'reviewed', '2026-07-02', 'US'),
    mk('AMZ-1002', 'FishTankFrank_DE', 'IB-DE', 'FEDOUR Canister Filter', 89.50, 'EUR', 'refunded', '2026-07-08', 'DE'),
    mk('AMZ-1003', 'GoldfishGuru_UK', 'HS-UK', 'HITOP Air Pump', 19.99, 'GBP', 'pending_refund', '2026-07-15', 'UK'),
    mk('AMZ-1004', 'ReeferMia_AU', 'IB-AU', 'PYPABL LED Light', 65.00, 'AUD', 'pending_refund', '2026-07-18', 'AU'),
    mk('AMZ-1005', 'PlantedPete_CA', 'HS-CA', 'FEDOUR CO2 Kit', 54.20, 'CAD', 'reviewed', '2026-07-22', 'CA'),
    mk('AMZ-1006', 'NanoNora_FR', 'IB-FR', 'PYPABL Sponge Filter', 12.50, 'EUR', 'pending_refund', '2026-07-25', 'FR'),
    mk('AMZ-1007', 'AquaLily_US', 'HS-US', 'HITOP 100W Heater', 49.99, 'USD', 'refunded', '2026-06-20', 'US'),
    mk('AMZ-1008', 'GoldfishGuru_UK', 'HS-UK', 'HITOP Thermometer', 9.99, 'GBP', 'pending_refund', '2026-07-28', 'UK'),
  ];
  for (const o of orders) await putOne('orders', o);
  await putOne('settlements', { id: uid(), settlementDate: '2026-07-01', orderCount: 2, totalAmount: 129.49, remark: '2026-07 月初结算', orderIds: [], createdAt: new Date().toISOString() });
}

/* ============================================================
   SEED DATA
   ============================================================ */
async function loadSeedData() {
  try {
    const existing = await getAll('customers');
    if (existing && existing.length > 0) return; // 已有数据，避免覆盖
    let data = null;
    if (typeof window !== 'undefined' && window.SEED_DATA) {
      data = window.SEED_DATA;
    } else {
      const res = await fetch('seed_data.json');
      if (!res.ok) return;
      data = await res.json();
    }
    if (data.customers) await bulkPut('customers', data.customers);
    if (data.orders) await bulkPut('orders', data.orders);
    if (data.settlements) await bulkPut('settlements', data.settlements);
    toast('已恢复初始数据', 'success');
  } catch (e) {
    console.log('seed load skipped', e);
  }
}

/* ============================================================
   INIT
   ============================================================ */
async function init() {
  $$('.nav-item').forEach((b) => b.addEventListener('click', () => navigate(b.dataset.view)));
  $('#btn-back').addEventListener('click', (e) => { e.stopPropagation(); closeTopFloat(); });
  $('#btn-close-all').addEventListener('click', (e) => { e.stopPropagation(); closeAllFloats(); });
  bindInfiniteScroll();
  // 点击页面任意空白区域：关闭所有下拉/菜单/侧边浮窗
  document.addEventListener('click', (e) => {
    if (Date.now() < suppressFloatUntil) { suppressFloatUntil = 0; return; }
    const inControl = e.target.closest('.float-panel, .drawer, .drawer-overlay, .overlay, .modal, .th-menu, .combo, .combo-pop, .dd-pop, button, a, input, select, textarea, [contenteditable]');
    if (!inControl) {
      closeAllCombosOpen();
      const tm = $('.th-menu'); if (tm) tm.remove();
      if (floatStack.length) closeAllFloats();
    } else if (!e.target.closest('.combo, .combo-pop, .th-menu, .dd-pop')) {
      // 在浮窗/按钮等内部点击，仍关闭其它已打开的下拉/表头菜单
      closeAllCombosOpen();
      const tm = $('.th-menu'); if (tm) tm.remove();
    }
  });
  await loadSeedData();
  ensureDefaultDropdownCfg();
  migrateComments();
  navigate('dashboard');
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
