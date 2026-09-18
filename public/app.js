/* ===========================================================================
   Inventory UI — vanilla JS, คุยกับ API ที่ /api โดยตรง
   =========================================================================== */

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const state = {
  categories: [],
  products: [],
  productPage: 1,
  productMeta: { total: 0, total_pages: 1 },
  ledgerPage: 1,
  ledgerMeta: { total: 0, total_pages: 1 },
  current: null, // สินค้าที่กำลังเปิดในลิ้นชัก
  editingId: null,
};

/* ------------------------------------------------------------ utilities */

async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (res.status === 204) return null;

  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok) {
    const err = new Error(body?.error?.message ?? `เกิดข้อผิดพลาด (HTTP ${res.status})`);
    err.code = body?.error?.code;
    err.details = body?.error?.details;
    throw err;
  }
  return body;
}

const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (ch) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]
  );

const baht = (value) =>
  new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    Number(value ?? 0)
  );

const compactBaht = (value) =>
  new Intl.NumberFormat('th-TH', { notation: 'compact', maximumFractionDigits: 1 }).format(
    Number(value ?? 0)
  );

const numberFmt = (value) => new Intl.NumberFormat('th-TH').format(Number(value ?? 0));

const dateTime = (value) =>
  new Date(value).toLocaleString('th-TH', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

function toast(message, kind = '') {
  const el = document.createElement('div');
  el.className = `toast${kind ? ` toast--${kind}` : ''}`;
  el.textContent = message;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), 4200);
}

/* --------------------------------------------------------- health check */

async function checkConnection() {
  const el = $('#connection');
  try {
    const res = await fetch('/health');
    const body = await res.json();
    if (res.ok && body.status === 'ok') {
      el.className = 'conn conn--ok';
      el.textContent = 'เชื่อมต่อฐานข้อมูลแล้ว';
      return true;
    }
    throw new Error(body.message ?? 'ฐานข้อมูลไม่พร้อมใช้งาน');
  } catch (err) {
    el.className = 'conn conn--down';
    el.textContent = 'เชื่อมต่อฐานข้อมูลไม่ได้';
    toast(`เชื่อมต่อฐานข้อมูลไม่ได้: ${err.message}`, 'error');
    return false;
  }
}

/* ------------------------------------------------------------- ภาพรวม */

async function loadSummary() {
  const { data } = await api('/summary');
  const t = data.totals;
  $('#statSku').textContent = numberFmt(t.active_products);
  $('#statUnits').textContent = numberFmt(t.total_units);
  $('#statValue').textContent = `฿${compactBaht(t.total_stock_value)}`;
  $('#statOut').textContent = numberFmt(t.out_of_stock_count);
}

async function loadRefillBand() {
  const { data, count } = await api('/products/low-stock');
  const band = $('#refill');
  const list = $('#refillList');

  $('#refillCount').textContent = count ? `${count} รายการ` : 'ครบทุกรายการ';
  band.classList.toggle('refill--clear', count === 0);

  if (!count) {
    list.innerHTML = '<p class="refill__empty">ทุกสินค้ามีคงเหลือสูงกว่าจุดเตือน ยังไม่ต้องสั่งเพิ่ม</p>';
    return;
  }

  list.innerHTML = data
    .map(
      (p) => `
      <button class="refill__chip${p.stock_quantity === 0 ? ' refill__chip--zero' : ''}" data-id="${p.id}">
        <b>${escapeHtml(p.name)}</b>
        <span>${p.stock_quantity}/${p.low_stock_threshold} ${escapeHtml(p.unit)}</span>
      </button>`
    )
    .join('');

  $$('.refill__chip').forEach((chip) =>
    chip.addEventListener('click', () => openDrawer(Number(chip.dataset.id)))
  );
}

/* --------------------------------------------------------------- สินค้า */

function productQuery() {
  const [sort, order] = $('#filterSort').value.split(':');
  const params = new URLSearchParams({ page: state.productPage, limit: 20, sort, order });

  const search = $('#search').value.trim();
  if (search) params.set('search', search);

  const category = $('#filterCategory').value;
  if (category) params.set('category_id', category);

  if ($('#filterLow').checked) params.set('low_stock', 'true');
  if (!$('#filterInactive').checked) params.set('is_active', 'true');

  return params.toString();
}

function levelCell(p) {
  const max = Math.max(p.low_stock_threshold * 2, p.stock_quantity, 1);
  const width = Math.min(100, Math.round((p.stock_quantity / max) * 100));
  const tone = p.stock_quantity === 0 ? ' level--zero' : p.is_low_stock ? ' level--low' : '';
  return `
    <div class="level${tone}">
      <span class="level__num">${numberFmt(p.stock_quantity)} ${escapeHtml(p.unit)}</span>
      <span class="level__bar"><span class="level__fill" style="width:${width}%"></span></span>
    </div>`;
}

async function loadProducts() {
  const tbody = $('#productRows');
  try {
    const { data, meta } = await api(`/products?${productQuery()}`);
    state.products = data;
    state.productMeta = meta;

    if (!data.length) {
      tbody.innerHTML =
        '<tr><td colspan="6" class="state">ไม่พบสินค้าที่ตรงกับเงื่อนไข ลองล้างตัวกรอง หรือกดเพิ่มสินค้า</td></tr>';
    } else {
      tbody.innerHTML = data
        .map(
          (p) => `
        <tr class="${p.is_active ? '' : 'inactive'}">
          <td data-label="SKU" class="sku">${escapeHtml(p.sku)}</td>
          <td data-label="สินค้า" class="pname">${escapeHtml(p.name)}
            ${p.description ? `<small>${escapeHtml(p.description)}</small>` : ''}</td>
          <td data-label="กลุ่ม"><span class="pill${p.is_active ? '' : ' pill--off'}">${escapeHtml(p.category.name)}</span></td>
          <td data-label="ราคาทุน" class="num">฿${baht(p.cost_price)}</td>
          <td data-label="คงเหลือ" class="num">${levelCell(p)}</td>
          <td class="actions">
            <button class="btn btn--sm btn--primary" data-adjust="${p.id}">ปรับสต็อก</button>
            <button class="btn btn--sm" data-edit="${p.id}">แก้ไข</button>
            <button class="btn btn--sm" data-toggle="${p.id}">${p.is_active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}</button>
          </td>
        </tr>`
        )
        .join('');
    }

    renderPager('#productPager', meta, (page) => {
      state.productPage = page;
      loadProducts();
    });

    $$('[data-adjust]').forEach((b) =>
      b.addEventListener('click', () => openDrawer(Number(b.dataset.adjust)))
    );
    $$('[data-edit]').forEach((b) =>
      b.addEventListener('click', () => openProductDialog(Number(b.dataset.edit)))
    );
    $$('[data-toggle]').forEach((b) =>
      b.addEventListener('click', () => toggleActive(Number(b.dataset.toggle)))
    );
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="state">โหลดข้อมูลไม่สำเร็จ: ${escapeHtml(err.message)}</td></tr>`;
  }
}

function renderPager(selector, meta, onChange) {
  const el = $(selector);
  const totalPages = Math.max(meta.total_pages ?? 1, 1);
  if (meta.total === 0) {
    el.innerHTML = '';
    return;
  }
  el.innerHTML = `
    <span>ทั้งหมด ${numberFmt(meta.total)} รายการ · หน้า ${meta.page}/${totalPages}</span>
    <button class="btn btn--sm" ${meta.page <= 1 ? 'disabled' : ''} data-page="${meta.page - 1}">ก่อนหน้า</button>
    <button class="btn btn--sm" ${meta.page >= totalPages ? 'disabled' : ''} data-page="${meta.page + 1}">ถัดไป</button>`;
  el.querySelectorAll('[data-page]').forEach((b) =>
    b.addEventListener('click', () => onChange(Number(b.dataset.page)))
  );
}

async function toggleActive(id) {
  const product = state.products.find((p) => p.id === id);
  if (!product) return;
  try {
    await api(`/products/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_active: !product.is_active }),
    });
    toast(product.is_active ? `ปิดใช้งาน ${product.name} แล้ว` : `เปิดใช้งาน ${product.name} แล้ว`, 'ok');
    await refreshAll();
  } catch (err) {
    toast(err.message, 'error');
  }
}

/* --------------------------------------------------- ลิ้นชักปรับสต็อก */

async function openDrawer(id) {
  try {
    const { data } = await api(`/products/${id}`);
    state.current = data;

    $('#drawerSku').textContent = data.sku;
    $('#drawerTitle').textContent = data.name;
    $('#drawerBalance').textContent = numberFmt(data.stock_quantity);
    $('#adjustQty').value = 1;
    $('#adjustReason').value = '';
    updatePreview();

    $('#drawer').hidden = false;
    $('#scrim').hidden = false;
    $('#adjustQty').focus();
    $('#adjustQty').select();

    loadDrawerHistory(id);
  } catch (err) {
    toast(err.message, 'error');
  }
}

function closeDrawer() {
  $('#drawer').hidden = true;
  $('#scrim').hidden = true;
  state.current = null;
}

async function loadDrawerHistory(id) {
  const list = $('#drawerHistory');
  list.innerHTML = '<li class="state">กำลังโหลด…</li>';
  try {
    const { data } = await api(`/products/${id}/transactions?limit=8`);
    list.innerHTML = data.length
      ? data
          .map(
            (t) => `
        <li>
          <span>${escapeHtml(t.reason ?? 'ไม่ระบุเหตุผล')}
            <span class="history__meta">${dateTime(t.transacted_at)}${t.created_by ? ` · ${escapeHtml(t.created_by)}` : ''}</span>
          </span>
          <span class="history__delta history__delta--${t.type === 'IN' ? 'in' : 'out'}">
            ${t.change > 0 ? '+' : ''}${t.change} → ${t.balance_after}
          </span>
        </li>`
          )
          .join('')
      : '<li class="state">ยังไม่มีการเคลื่อนไหวของสินค้านี้</li>';
  } catch (err) {
    list.innerHTML = `<li class="state">${escapeHtml(err.message)}</li>`;
  }
}

function updatePreview() {
  if (!state.current) return;
  const qty = Number($('#adjustQty').value || 0);
  const before = state.current.stock_quantity;
  const after = before + qty;
  const balance = $('.balance');
  const hint = $('#adjustHint');

  $('#drawerPreview').textContent = numberFmt(after);
  balance.classList.remove('balance--up', 'balance--down', 'balance--invalid');

  if (!Number.isInteger(qty) || qty === 0) {
    hint.className = 'hint';
    hint.textContent = 'ใส่จำนวนเต็มที่ไม่ใช่ 0 — ค่าบวกคือรับเข้า ค่าลบคือตัดออก';
    $('#adjustSubmit').disabled = true;
    return;
  }

  if (after < 0) {
    balance.classList.add('balance--invalid');
    hint.className = 'hint hint--error';
    hint.textContent = `ตัดออกได้สูงสุด ${before} ${state.current.unit} เพราะสต็อกติดลบไม่ได้`;
    $('#adjustSubmit').disabled = true;
    return;
  }

  balance.classList.add(qty > 0 ? 'balance--up' : 'balance--down');
  $('#adjustSubmit').disabled = false;

  if (after < state.current.low_stock_threshold) {
    hint.className = 'hint hint--warn';
    hint.textContent = `หลังปรับจะเหลือ ${after} ซึ่งต่ำกว่าจุดเตือน ${state.current.low_stock_threshold}`;
  } else {
    hint.className = 'hint';
    hint.textContent = '';
  }
}

async function submitAdjust(event) {
  event.preventDefault();
  if (!state.current) return;

  const payload = {
    product_id: state.current.id,
    quantity: Number($('#adjustQty').value),
    reason: $('#adjustReason').value.trim() || undefined,
    created_by: $('#adjustBy').value.trim() || undefined,
  };

  $('#adjustSubmit').disabled = true;
  try {
    const result = await api('/stock/adjust', { method: 'PATCH', body: JSON.stringify(payload) });
    toast(result.message, 'ok');
    state.current = { ...state.current, stock_quantity: result.data.product.stock_quantity };
    $('#drawerBalance').textContent = numberFmt(state.current.stock_quantity);
    $('#adjustQty').value = 1;
    $('#adjustReason').value = '';
    updatePreview();
    loadDrawerHistory(state.current.id);
    await refreshAll();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    $('#adjustSubmit').disabled = false;
  }
}

/* ------------------------------------------------------- ฟอร์มสินค้า */

function fillCategorySelects() {
  const options = state.categories
    .map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`)
    .join('');
  $('#pfCategory').innerHTML = options;
  $('#filterCategory').innerHTML = `<option value="">ทุกกลุ่มสินค้า</option>${options}`;
}

function openProductDialog(id = null) {
  const form = $('#productForm');
  form.reset();
  $('#pfError').hidden = true;
  state.editingId = id;

  if (id) {
    const p = state.products.find((item) => item.id === id);
    if (!p) return;
    $('#productDialogTitle').textContent = 'แก้ไขสินค้า';
    $('#pfSku').value = p.sku;
    $('#pfName').value = p.name;
    $('#pfDesc').value = p.description ?? '';
    $('#pfCost').value = p.cost_price;
    $('#pfUnit').value = p.unit;
    $('#pfThreshold').value = p.low_stock_threshold;
    $('#pfCategory').value = p.category.id;
    $('#pfStockWrap').hidden = true; // สต็อกแก้ที่นี่ไม่ได้ ต้องผ่านการปรับสต็อก
  } else {
    $('#productDialogTitle').textContent = 'เพิ่มสินค้า';
    $('#pfUnit').value = 'ชิ้น';
    $('#pfThreshold').value = 5;
    $('#pfStock').value = 0;
    $('#pfStockWrap').hidden = false;
  }

  $('#productDialog').showModal();
}

async function submitProduct(event) {
  event.preventDefault();
  const errorBox = $('#pfError');
  errorBox.hidden = true;

  const payload = {
    sku: $('#pfSku').value.trim(),
    name: $('#pfName').value.trim(),
    description: $('#pfDesc').value.trim() || undefined,
    unit: $('#pfUnit').value.trim() || 'ชิ้น',
    category_id: Number($('#pfCategory').value),
    cost_price: Number($('#pfCost').value),
    low_stock_threshold: Number($('#pfThreshold').value),
  };

  $('#pfSubmit').disabled = true;
  try {
    if (state.editingId) {
      await api(`/products/${state.editingId}`, { method: 'PATCH', body: JSON.stringify(payload) });
      toast('บันทึกการแก้ไขแล้ว', 'ok');
    } else {
      payload.stock_quantity = Number($('#pfStock').value || 0);
      await api('/products', { method: 'POST', body: JSON.stringify(payload) });
      toast(`เพิ่มสินค้า ${payload.name} แล้ว`, 'ok');
    }
    $('#productDialog').close();
    await refreshAll();
  } catch (err) {
    errorBox.hidden = false;
    errorBox.textContent = err.message;
  } finally {
    $('#pfSubmit').disabled = false;
  }
}

/* ------------------------------------------------------------- ประวัติ */

async function loadLedger() {
  const tbody = $('#ledgerRows');
  const params = new URLSearchParams({ page: state.ledgerPage, limit: 25 });
  if ($('#ledgerType').value) params.set('type', $('#ledgerType').value);
  if ($('#ledgerFrom').value) params.set('from', `${$('#ledgerFrom').value}T00:00:00`);
  if ($('#ledgerTo').value) params.set('to', `${$('#ledgerTo').value}T23:59:59`);

  try {
    const { data, meta } = await api(`/stock/transactions?${params}`);
    state.ledgerMeta = meta;

    tbody.innerHTML = data.length
      ? data
          .map(
            (t) => `
        <tr>
          <td data-label="เวลา">${dateTime(t.transacted_at)}</td>
          <td data-label="สินค้า" class="pname">${escapeHtml(t.product?.name ?? '')}<small>${escapeHtml(t.product?.sku ?? '')}</small></td>
          <td data-label="ประเภท"><span class="pill pill--${t.type === 'IN' ? 'in' : 'out'}">${t.type === 'IN' ? 'รับเข้า' : 'ตัดออก'}</span></td>
          <td data-label="จำนวน" class="num">${t.change > 0 ? '+' : ''}${t.change}</td>
          <td data-label="คงเหลือ" class="num">${t.balance_after}</td>
          <td data-label="เหตุผล">${escapeHtml(t.reason ?? '—')}${t.created_by ? `<small>${escapeHtml(t.created_by)}</small>` : ''}</td>
        </tr>`
          )
          .join('')
      : '<tr><td colspan="6" class="state">ยังไม่มีรายการในช่วงเวลาที่เลือก</td></tr>';

    renderPager('#ledgerPager', meta, (page) => {
      state.ledgerPage = page;
      loadLedger();
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="state">${escapeHtml(err.message)}</td></tr>`;
  }
}

/* --------------------------------------------------------- กลุ่มสินค้า */

async function loadCategories() {
  const { data } = await api('/categories');
  state.categories = data;
  fillCategorySelects();

  $('#categoryList').innerHTML = data
    .map(
      (c) => `
      <div class="cat">
        <h3>${escapeHtml(c.name)}</h3>
        <p>${escapeHtml(c.description ?? 'ไม่มีคำอธิบาย')}</p>
        <span class="cat__count">${numberFmt(c.product_count ?? 0)} รายการ</span>
      </div>`
    )
    .join('');
}

async function submitCategory(event) {
  event.preventDefault();
  const form = event.target;
  // ใช้ querySelector เพราะ form.name ชนกับ property ชื่อฟอร์มของ HTMLFormElement
  const payload = {
    name: form.querySelector('[name="name"]').value.trim(),
    description: form.querySelector('[name="description"]').value.trim() || undefined,
  };
  try {
    await api('/categories', { method: 'POST', body: JSON.stringify(payload) });
    toast(`เพิ่มกลุ่ม ${payload.name} แล้ว`, 'ok');
    form.reset();
    await loadCategories();
  } catch (err) {
    toast(err.message, 'error');
  }
}

/* ----------------------------------------------------------------- init */

async function refreshAll() {
  await Promise.all([loadSummary(), loadRefillBand(), loadProducts(), loadLedger()]);
}

let searchTimer;

function wireEvents() {
  $$('.tab').forEach((tab) =>
    tab.addEventListener('click', () => {
      $$('.tab').forEach((t) => t.classList.toggle('is-active', t === tab));
      $$('.panel').forEach((p) => p.classList.toggle('is-active', p.id === `panel-${tab.dataset.tab}`));
    })
  );

  $('#search').addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.productPage = 1;
      loadProducts();
    }, 250);
  });

  ['#filterCategory', '#filterSort', '#filterLow', '#filterInactive'].forEach((sel) =>
    $(sel).addEventListener('change', () => {
      state.productPage = 1;
      loadProducts();
    })
  );

  ['#ledgerType', '#ledgerFrom', '#ledgerTo'].forEach((sel) =>
    $(sel).addEventListener('change', () => {
      state.ledgerPage = 1;
      loadLedger();
    })
  );

  $('#ledgerReset').addEventListener('click', () => {
    $('#ledgerType').value = '';
    $('#ledgerFrom').value = '';
    $('#ledgerTo').value = '';
    state.ledgerPage = 1;
    loadLedger();
  });

  $('#btnNewProduct').addEventListener('click', () => openProductDialog(null));
  $('#pfCancel').addEventListener('click', () => $('#productDialog').close());
  $('#productForm').addEventListener('submit', submitProduct);
  $('#categoryForm').addEventListener('submit', submitCategory);

  $('#drawerClose').addEventListener('click', closeDrawer);
  $('#scrim').addEventListener('click', closeDrawer);
  $('#adjustForm').addEventListener('submit', submitAdjust);
  $('#adjustQty').addEventListener('input', updatePreview);

  $$('.chipbtn').forEach((btn) =>
    btn.addEventListener('click', () => {
      const current = Number($('#adjustQty').value || 0);
      const delta = Number(btn.dataset.delta);
      // กดซ้ำเพื่อบวกสะสม แต่ถ้าสลับทิศให้เริ่มนับใหม่
      $('#adjustQty').value = Math.sign(current) === Math.sign(delta) ? current + delta : delta;
      updatePreview();
    })
  );

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !$('#drawer').hidden) closeDrawer();
  });
}

(async function init() {
  wireEvents();
  const healthy = await checkConnection();
  if (!healthy) return;
  await loadCategories();
  await refreshAll();
})();
