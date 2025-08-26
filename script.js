// ================== أدوات تخزين بسيطة ==================
const DB = {
  get(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
  set(key, val) { localStorage.setItem(key, JSON.stringify(val)); },
  push(key, val) { const arr = DB.get(key, []); arr.push(val); DB.set(key, arr); },
  uid(prefix='') { return prefix + Math.random().toString(36).slice(2,9) + Date.now().toString(36).slice(-4); },
};

// مفاتيح قواعد البيانات
const KEYS = {
  INVENTORY: 'kiro_inventory',
  SALES: 'kiro_sales',            // المبيعات اليومية
  INVOICES: 'kiro_invoices',      // الفواتير
  ARCHIVES: 'kiro_archives',      // أرشيف الفواتير
  SALES_RET: 'kiro_sales_returns',
  INV_RET: 'kiro_invoice_returns',
  INSTANT: 'kiro_instant_sales',
  SESSION: 'kiro_session'
};

// ================== أدوات عامة ==================
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const fmt = n => (Number(n||0)).toFixed(2);
const todayISO = () => new Date().toISOString();
const ymd = d => new Date(d).toLocaleDateString('ar-EG');

function toast(msg){ alert(msg); }

function rebuildInventoryDatalist(){
  const list = $('#inventoryList');
  list.innerHTML = '';
  const inv = DB.get(KEYS.INVENTORY, []);
  inv.forEach(i => {
    const opt = document.createElement('option');
    opt.value = i.name;
    list.appendChild(opt);
  });
}

// ================== تسجيل الدخول ==================
function checkAuth(){
  const session = DB.get(KEYS.SESSION, {logged:false});
  if(session.logged){
    $('#loginSection').classList.add('hidden');
    $('#app').classList.remove('hidden');
  } else {
    $('#loginSection').classList.remove('hidden');
    $('#app').classList.add('hidden');
  }
}

$('#btnLogin').addEventListener('click', () => {
  const u = $('#loginUser').value.trim();
  const p = $('#loginPass').value.trim();
  if(u==='1234' && p==='1234'){
    DB.set(KEYS.SESSION, {logged:true, at: todayISO()});
    checkAuth();
  } else {
    toast('بيانات الدخول غير صحيحة');
  }
});

$('#btnLogout').addEventListener('click', () => {
  DB.set(KEYS.SESSION, {logged:false});
  checkAuth();
});

// زر طباعة عام
$('#btnPrint').addEventListener('click', () => window.print());

// ================== تبويبات ==================
$$('.tabs button').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('.tabs button').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    const id = btn.dataset.tab;
    $$('.tab').forEach(t=>t.classList.remove('active'));
    $('#'+id).classList.add('active');
  });
});

// ================== إدارة المخزون ==================
function renderInventory(){
  const data = DB.get(KEYS.INVENTORY, []);
  const tbody = $('#invTable tbody');
  const q = $('#invSearch').value.trim();
  tbody.innerHTML = '';
  data
    .filter(i => !q || i.name.includes(q))
    .forEach((i, idx) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${idx+1}</td>
        <td>${i.name}</td>
        <td>${i.desc||''}</td>
        <td>${fmt(i.price)}</td>
        <td>${i.qty}</td>
        <td class="no-print">
          <button class="btn outline" data-act="edit" data-id="${i.id}">تعديل</button>
          <button class="btn danger" data-act="del" data-id="${i.id}">حذف</button>
        </td>`;
      tbody.appendChild(tr);
    });
  rebuildInventoryDatalist();
}

$('#btnAddItem').addEventListener('click', () => {
  const name = $('#invName').value.trim();
  const desc = $('#invDesc').value.trim();
  const price = Number($('#invPrice').value||0);
  const qty = Number($('#invQty').value||0);
  if(!name) return toast('أدخل اسم المنتج');
  const inv = DB.get(KEYS.INVENTORY, []);
  inv.push({id:DB.uid('i_'), name, desc, price, qty});
  DB.set(KEYS.INVENTORY, inv);
  $('#invName').value = $('#invDesc').value = $('#invPrice').value = $('#invQty').value = '';
  renderInventory();
});

$('#invSearch').addEventListener('input', renderInventory);

$('#invTable').addEventListener('click', (e) => {
  const btn = e.target.closest('button'); if(!btn) return;
  const id = btn.dataset.id;
  const act = btn.dataset.act;
  const inv = DB.get(KEYS.INVENTORY, []);
  const idx = inv.findIndex(x=>x.id===id);
  if(idx<0) return;
  if(act==='del'){
    if(confirm('حذف المنتج؟')){
      inv.splice(idx,1); DB.set(KEYS.INVENTORY, inv); renderInventory();
    }
  }else if(act==='edit'){
    const item = inv[idx];
    const name = prompt('الاسم', item.name) ?? item.name;
    const desc = prompt('الوصف', item.desc) ?? item.desc;
    const price = Number(prompt('السعر', item.price) ?? item.price);
    const qty = Number(prompt('الكمية', item.qty) ?? item.qty);
    inv[idx] = {...item, name, desc, price, qty};
    DB.set(KEYS.INVENTORY, inv); renderInventory();
  }
});

// ================== أدوات مشتركة للفواتير/المبيعات ==================
function getItemByName(name){
  const inv = DB.get(KEYS.INVENTORY, []);
  return inv.find(i => i.name === name);
}
function ensurePrice(name, fallback){
  const item = getItemByName(name);
  return Number(fallback || (item ? item.price : 0));
}
function updateStock(lines, sign){
  // sign = -1 للخصم، +1 للإرجاع
  const inv = DB.get(KEYS.INVENTORY, []);
  lines.forEach(l => {
    const idx = inv.findIndex(x=>x.name===l.name);
    if(idx>=0){
      inv[idx].qty += sign * Number(l.qty);
      if(inv[idx].qty < 0) inv[idx].qty = 0;
    }
  });
  DB.set(KEYS.INVENTORY, inv);
  renderInventory();
}

function buildLinesFromTable(tbody){
  const lines = [];
  tbody.querySelectorAll('tr').forEach(tr => {
    const tds = tr.querySelectorAll('td');
    lines.push({
      name: tds[1].textContent,
      qty: Number(tds[2].textContent),
      price: Number(tds[3].textContent),
      total: Number(tds[4].textContent)
    });
  });
  return lines;
}

function addRowToTable(tbody, line, withPrice=true){
  const tr = document.createElement('tr');
  const idx = tbody.querySelectorAll('tr').length + 1;
  tr.innerHTML = withPrice ? `
    <td>${idx}</td><td>${line.name}</td><td>${line.qty}</td><td>${fmt(line.price)}</td><td>${fmt(line.qty*line.price)}</td>
    <td class="no-print"><button class="btn danger">🗑️</button></td>`
    :
    `<td>${idx}</td><td>${line.name}</td><td>${line.qty}</td><td class="no-print"><button class="btn danger">🗑️</button></td>`;
  tbody.appendChild(tr);
}

function recalcTotal(tableId, totalCellId, price=true){
  let sum = 0;
  document.querySelectorAll(`#${tableId} tbody tr`).forEach(tr => {
    const tds = tr.querySelectorAll('td');
    sum += Number(price ? tds[4].textContent : 0);
  });
  if(price) $( '#'+totalCellId ).textContent = fmt(sum);
  return sum;
}

function clearTable(tbody){ tbody.innerHTML=''; }

function printTable(metaTitle, tableHtml){
  const meta = $('#printMeta');
  const content = $('#printContent');
  meta.innerHTML = `<div>${metaTitle}</div><div>${new Date().toLocaleString('ar-EG')}</div>`;
  content.innerHTML = tableHtml;
  window.print();
}

// ================== المبيعات اليومية ==================
const salesState = { lines:[] };

function renderSales(){
  const tbody = $('#salesTable tbody');
  tbody.innerHTML = '';
  salesState.lines.forEach((l, i) => {
    addRowToTable(tbody, l, true);
  });
  $('#salesTotal').textContent = fmt(salesState.lines.reduce((a,b)=>a+b.qty*b.price,0));
}

$('#btnAddSaleItem').addEventListener('click', () => {
  const name = $('#salesProduct').value.trim();
  const qty = Number($('#salesQty').value||1);
  const price = ensurePrice(name, $('#salesPrice').value);
  if(!name || qty<=0) return;
  salesState.lines.push({name, qty, price});
  $('#salesProduct').value = ''; $('#salesQty').value = 1; $('#salesPrice').value='';
  renderSales();
});

$('#salesTable').addEventListener('click', (e)=>{
  const btn = e.target.closest('button'); if(!btn) return;
  const idx = [...$('#salesTable tbody').children].indexOf(btn.closest('tr'));
  salesState.lines.splice(idx,1); renderSales();
});

$('#btnSaveSale').addEventListener('click', () => {
  if(salesState.lines.length===0) return toast('لا توجد عناصر');
  const customer = $('#salesCustomer').value.trim() || 'عميل نقدي';
  const total = salesState.lines.reduce((a,b)=>a+b.qty*b.price,0);
  const rec = { id: DB.uid('s_'), date: todayISO(), customer, lines: salesState.lines, total };
  DB.push(KEYS.SALES, rec);
  updateStock(salesState.lines, -1);
  salesState.lines = []; renderSales();
  toast('تم الحفظ في سجل المبيعات');
});

$('#btnClearSale').addEventListener('click', ()=>{ salesState.lines=[]; renderSales(); });

// ================== الفاتورة ==================
const invoiceState = { lines:[], number: 1000 };

function updateInvoiceMeta(){
  $('#invoiceDate').textContent = ymd(new Date());
  const maxNum = DB.get(KEYS.INVOICES, []).reduce((m, x)=> Math.max(m, x.number||1000), 1000);
  invoiceState.number = maxNum + 1;
  $('#invoiceNumber').textContent = invoiceState.number;
}

function renderInvoice(){
  const tbody = $('#invoiceTable tbody'); tbody.innerHTML='';
  invoiceState.lines.forEach(l => addRowToTable(tbody, l, true));
  $('#invoiceTotal').textContent = fmt(invoiceState.lines.reduce((a,b)=>a+b.qty*b.price,0));
}

$('#btnAddInvRow').addEventListener('click', () => {
  const name = $('#invProductInput').value.trim();
  const qty = Number($('#invProductQty').value||1);
  const price = ensurePrice(name, $('#invProductPrice').value);
  if(!name || qty<=0) return;
  invoiceState.lines.push({name, qty, price});
  $('#invProductInput').value=''; $('#invProductQty').value=1; $('#invProductPrice').value='';
  renderInvoice();
});

$('#invoiceTable').addEventListener('click', (e) => {
  const btn = e.target.closest('button'); if(!btn) return;
  const idx = [...$('#invoiceTable tbody').children].indexOf(btn.closest('tr'));
  invoiceState.lines.splice(idx,1); renderInvoice();
});

$('#btnInvoiceSave').addEventListener('click', () => {
  if(invoiceState.lines.length===0) return toast('أضف عناصر أولاً');
  const customer = $('#invCustomer').value.trim() || 'عميل نقدي';
  const total = invoiceState.lines.reduce((a,b)=>a+b.qty*b.price,0);
  const rec = { id: DB.uid('inv_'), number: invoiceState.number, date: todayISO(), customer, lines: invoiceState.lines, total };
  DB.push(KEYS.INVOICES, rec);
  updateStock(invoiceState.lines, -1);
  invoiceState.lines = []; renderInvoice(); updateInvoiceMeta();
  toast('تم حفظ الفاتورة وخصم المخزون');
});

$('#btnInvoiceArchive').addEventListener('click', () => {
  if(invoiceState.lines.length===0) return toast('أضف عناصر أولاً');
  const customer = $('#invCustomer').value.trim() || 'عميل نقدي';
  const total = invoiceState.lines.reduce((a,b)=>a+b.qty*b.price,0);
  const rec = { id: DB.uid('arc_'), number: invoiceState.number, date: todayISO(), customer, lines: invoiceState.lines, total };
  DB.push(KEYS.ARCHIVES, rec);
  invoiceState.lines = []; renderInvoice(); updateInvoiceMeta();
  toast('تم الأرشفة بدون خصم المخزون');
});

$('#btnInvoicePrint').addEventListener('click', () => {
  const lines = invoiceState.lines;
  if(lines.length===0) return toast('لا توجد عناصر للطباعة');
  const table = `
    <h3 style="margin:0 0 8px 0">فاتورة رقم ${invoiceState.number} — للعميل: ${$('#invCustomer').value||'عميل نقدي'}</h3>
    <table>
      <thead><tr><th>#</th><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead>
      <tbody>
        ${lines.map((l,i)=>`<tr><td>${i+1}</td><td>${l.name}</td><td>${l.qty}</td><td>${fmt(l.price)}</td><td>${fmt(l.qty*l.price)}</td></tr>`).join('')}
      </tbody>
      <tfoot><tr><td colspan="4">الإجمالي</td><td>${fmt(lines.reduce((a,b)=>a+b.qty*b.price,0))}</td></tr></tfoot>
    </table>`;
  printTable('فاتورة مبيعات', table);
});

$('#btnInvoiceClear').addEventListener('click', () => { invoiceState.lines=[]; renderInvoice(); });

// ================== مرتجع المبيعات ==================
const srState = { lines:[] };
function renderSR(){
  const tbody = $('#srTable tbody'); tbody.innerHTML='';
  srState.lines.forEach(l => addRowToTable(tbody, {name:l.name, qty:l.qty}, false));
}
$('#btnAddSR').addEventListener('click', () => {
  const name = $('#srProduct').value.trim();
  const qty = Number($('#srQty').value||1);
  if(!name || qty<=0) return;
  srState.lines.push({name, qty});
  $('#srProduct').value=''; $('#srQty').value=1; renderSR();
});
$('#srTable').addEventListener('click', (e)=>{
  const btn = e.target.closest('button'); if(!btn) return;
  const idx = [...$('#srTable tbody').children].indexOf(btn.closest('tr'));
  srState.lines.splice(idx,1); renderSR();
});
$('#btnSaveSR').addEventListener('click', () => {
  if(srState.lines.length===0) return;
  const customer = $('#srCustomer').value.trim() || 'عميل';
  const rec = { id: DB.uid('sr_'), date: todayISO(), customer, lines: srState.lines };
  DB.push(KEYS.SALES_RET, rec);
  updateStock(srState.lines.map(l=>({...l, price:0})), +1);
  srState.lines=[]; renderSR(); toast('تم حفظ المرتجع وإرجاع الكميات للمخزون');
});
$('#btnClearSR').addEventListener('click', ()=>{ srState.lines=[]; renderSR(); });

// ================== مرتجع الفاتورة ==================
const irState = { lines:[] };
function renderIR(){
  const tbody = $('#irTable tbody'); tbody.innerHTML='';
  irState.lines.forEach(l => addRowToTable(tbody, {name:l.name, qty:l.qty}, false));
}
$('#btnAddIR').addEventListener('click', () => {
  const name = $('#irProduct').value.trim();
  const qty = Number($('#irQty').value||1);
  if(!name || qty<=0) return;
  irState.lines.push({name, qty}); $('#irProduct').value=''; $('#irQty').value=1; renderIR();
});
$('#irTable').addEventListener('click', (e)=>{
  const btn = e.target.closest('button'); if(!btn) return;
  const idx = [...$('#irTable tbody').children].indexOf(btn.closest('tr'));
  irState.lines.splice(idx,1); renderIR();
});
$('#btnSaveIR').addEventListener('click', () => {
  if(irState.lines.length===0) return;
  const customer = $('#irCustomer').value.trim() || 'عميل';
  const rec = { id: DB.uid('ir_'), date: todayISO(), customer, lines: irState.lines };
  DB.push(KEYS.INV_RET, rec);
  updateStock(irState.lines.map(l=>({...l, price:0})), +1);
  irState.lines=[]; renderIR(); toast('تم حفظ مرتجع الفاتورة');
});
$('#btnClearIR').addEventListener('click', ()=>{ irState.lines=[]; renderIR(); });

// ================== مبيعات فورية ==================
const isState = { lines:[], meta: {} };
function renderIS(){
  const tbody = $('#isTable tbody'); tbody.innerHTML='';
  isState.lines.forEach(l => addRowToTable(tbody, l, true));
  $('#isTotal').textContent = fmt(isState.lines.reduce((a,b)=>a+b.qty*b.price,0));
}
$('#btnAddIS').addEventListener('click', () => {
  const name = $('#isProduct').value.trim();
  const qty = Number($('#isQty').value||1);
  const price = ensurePrice(name, $('#isPrice').value);
  if(!name || qty<=0) return;
  isState.lines.push({name, qty, price}); renderIS();
  $('#isProduct').value=''; $('#isQty').value=1; $('#isPrice').value='';
});
$('#isTable').addEventListener('click', (e)=>{
  const btn = e.target.closest('button'); if(!btn) return;
  const idx = [...$('#isTable tbody').children].indexOf(btn.closest('tr'));
  isState.lines.splice(idx,1); renderIS();
});
$('#btnSaveIS').addEventListener('click', () => {
  if(isState.lines.length===0) return;
  const rec = {
    id: DB.uid('is_'), date: todayISO(),
    customer: $('#isCustomer').value.trim() || 'عميل',
    type: $('#isType').value, status: $('#isStatus').value,
    paid: Number($('#isPaid').value||0), remain: Number($('#isRemain').value||0),
    lines: isState.lines,
    total: isState.lines.reduce((a,b)=>a+b.qty*b.price,0)
  };
  DB.push(KEYS.INSTANT, rec);
  isState.lines=[]; renderIS(); toast('تم حفظ المبيع الفوري');
});
$('#btnClearIS').addEventListener('click', ()=>{ isState.lines=[]; renderIS(); });

// ================== السجلات ==================
function activeRecordTableKey(){
  const btn = document.querySelector('.record-tabs button.active');
  const map = {
    sales: KEYS.SALES, invoices: KEYS.INVOICES, archives: KEYS.ARCHIVES,
    salesReturns: KEYS.SALES_RET, invoiceReturns: KEYS.INV_RET, instant: KEYS.INSTANT
  };
  return map[btn?.dataset.r] || KEYS.SALES;
}

function renderRecordTables(){
  const q = $('#recSearch').value.trim();
  $$('#recTables .rec').forEach(div => {
    const key = ({
      sales: KEYS.SALES, invoices: KEYS.INVOICES, archives: KEYS.ARCHIVES,
      salesReturns: KEYS.SALES_RET, invoiceReturns: KEYS.INV_RET, instant: KEYS.INSTANT
    })[div.dataset.rt];
    const data = DB.get(key, []);
    const tbody = div.querySelector('tbody');
    if(!tbody){ div.querySelector('.muted')?.classList.add('show'); return; }
    tbody.innerHTML='';
    data
      .filter(r => !q || (r.customer||'').includes(q))
      .forEach((r, i) => {
        if(key===KEYS.SALES_RET || key===KEYS.INV_RET){
          // عرض أول عنصر للتوضيح
          const first = r.lines?.[0];
          const tr = document.createElement('tr');
          tr.innerHTML = `<td>${i+1}</td><td>${ymd(r.date)}</td><td>${r.customer||''}</td><td>${first?.name||''}</td><td>${first?.qty||''}</td>
          <td class="no-print"><button class="btn outline" data-id="${r.id}" data-k="${key}" data-act="view">تفاصيل</button></td>
          <td class="no-print"><button class="btn danger" data-id="${r.id}" data-k="${key}" data-act="del">حذف</button></td>`;
          tbody.appendChild(tr);
        } else if(key===KEYS.INSTANT){
          const tr = document.createElement('tr');
          tr.innerHTML = `<td>${i+1}</td><td>${ymd(r.date)}</td><td>${r.customer||''}</td><td>${r.type||''}</td><td>${r.status||''}</td><td>${fmt(r.total||0)}</td>
          <td class="no-print"><button class="btn outline" data-id="${r.id}" data-k="${key}" data-act="view">تفاصيل</button></td>
          <td class="no-print"><button class="btn danger" data-id="${r.id}" data-k="${key}" data-act="del">حذف</button></td>`;
          tbody.appendChild(tr);
        } else {
          const tr = document.createElement('tr');
          tr.innerHTML = `<td>${i+1}</td><td>${ymd(r.date)}</td><td>${r.customer||''}</td><td>${fmt(r.total||0)}</td>
          <td class="no-print"><button class="btn outline" data-id="${r.id}" data-k="${key}" data-act="view">تفاصيل</button></td>
          <td class="no-print"><button class="btn danger" data-id="${r.id}" data-k="${key}" data-act="del">حذف</button></td>`;
          tbody.appendChild(tr);
        }
      });
  });
}
$('#recSearch').addEventListener('input', renderRecordTables);

$('.record-tabs').addEventListener('click', (e)=>{
  const btn = e.target.closest('button'); if(!btn) return;
  $$('.record-tabs button').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  $$('#recTables .rec').forEach(r=>r.classList.remove('active'));
  $(`#recTables [data-rt="${btn.dataset.r}"]`).classList.add('active');
  renderRecordTables();
});

// أحداث على جداول السجلات (تفاصيل/حذف)
$('#records').addEventListener('click', (e) => {
  const btn = e.target.closest('button'); if(!btn) return;
  const act = btn.dataset.act;
  const id = btn.dataset.id; const key = btn.dataset.k;
  if(!act || !id || !key) return;
  const arr = DB.get(key, []);
  const idx = arr.findIndex(x=>x.id===id);
  if(idx<0) return;
  if(act==='view'){
    const r = arr[idx];
    const lines = r.lines||[];
    const table = `
      <h3 style="margin:0 0 8px 0">تفاصيل العملية — ${r.customer||''} — ${ymd(r.date)}</h3>
      <table><thead><tr><th>#</th><th>الصنف</th><th>الكمية</th><th>${r.total!=null?'السعر':''}</th><th>${r.total!=null?'الإجمالي':''}</th></tr></thead>
      <tbody>
        ${lines.map((l,i)=>`<tr><td>${i+1}</td><td>${l.name}</td><td>${l.qty}</td>${r.total!=null?`<td>${fmt(l.price||0)}</td><td>${fmt((l.price||0)*l.qty)}</td>`:''}</tr>`).join('')}
      </tbody>${r.total!=null?`<tfoot><tr><td colspan="4">الإجمالي</td><td>${fmt(r.total||0)}</td></tr></tfoot>`:''}
      </table>`;
    printTable('عرض التفاصيل', table);
  } else if(act==='del'){
    if(confirm('حذف السجل؟')){
      // إن كان من المبيعات أو الفواتير: نرجع الكميات للمخزون
      const refundable = (key===KEYS.SALES || key===KEYS.INVOICES);
      if(refundable) updateStock(arr[idx].lines, +1);
      arr.splice(idx,1); DB.set(key, arr); renderRecordTables();
    }
  }
});

// ================== التقارير ==================
function withinRange(d, range){
  const dt = new Date(d);
  const now = new Date();
  if(range==='day'){
    return dt.toDateString() === now.toDateString();
  } else if(range==='month'){
    return dt.getFullYear()===now.getFullYear() && dt.getMonth()===now.getMonth();
  }
  return true;
}

$('#btnGenReport').addEventListener('click', () => {
  const type = $('#repType').value;
  const range = $('#repRange').value;
  const key = ({
    sales:'kiro_sales', invoices:'kiro_invoices', archives:'kiro_archives',
    salesReturns:'kiro_sales_returns', invoiceReturns:'kiro_invoice_returns', instant:'kiro_instant_sales'
  })[type];
  const data = DB.get(key, []).filter(r=>withinRange(r.date, range));
  const tbody = $('#repTable tbody'); tbody.innerHTML='';
  let sum = 0;
  data.forEach((r,i)=>{
    const total = r.total ?? (r.lines?.reduce((a,b)=>a + (b.qty||0)*(b.price||0), 0) || 0);
    sum += total;
    const desc = r.customer || (r.type? `${r.type} - ${r.status||''}` : '—');
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${i+1}</td><td>${ymd(r.date)}</td><td>${desc}</td><td>${fmt(total)}</td>`;
    tbody.appendChild(tr);
  });
  $('#repTotal').textContent = fmt(sum);
});

$('#btnPrintReport').addEventListener('click', () => {
  const html = $('#repTable').outerHTML;
  printTable('تقرير', html);
});

// زر طباعة في رأس الصفحة يطبع المحتوى المرئي
// تمت إضافة زر طباعة خاص في الفاتورة والتقارير أيضاً

// ================== تهيئة ==================
function init(){
  checkAuth();
  renderInventory();
  updateInvoiceMeta();
  renderRecordTables();
  rebuildInventoryDatalist();
}
document.addEventListener('DOMContentLoaded', init);
