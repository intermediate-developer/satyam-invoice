'use strict';

const packages = {'Starter Website':7999,'Premium Website':9999,'Business Pro':12999,'Business Plus':21999,'E-Commerce Pro':29999,'Enterprise':38999};
const methods = ['UPI','Bank Transfer','Cash','Cheque','Other'];
const sections = {dashboard:'Dashboard',projects:'Projects',payments:'Payment Tracker',history:'Invoice History',clients:'Clients',settings:'Business Settings',backup:'Backup & Restore'};
const initial = () => ({
  version:1, revision:0, clients:[], projects:[], counters:{},
  settings:{name:'Satyam Singh',title:'Intermediate Web Developer',terms:'50% advance before work begins. The remaining 50% is payable after completion of the agreed work and before final website handover. Domain, hosting and third-party charges are excluded unless itemized. Domain and hosting prices are shared for approval before purchase.',thanks:'Thank you for your business.'}
});
const $ = selector => document.querySelector(selector);
const view = $('#view');
const modal = $('#modal');
const body = $('#modal-body');
const currency = new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',minimumFractionDigits:2,maximumFractionDigits:2});
const money = paise => currency.format(paise / 100);
const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const indiaDate = new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'});
const today = () => indiaDate.format(new Date()).split('/').reverse().join('-');
const date = value => value ? value.split('-').reverse().join('/') : '—';
const clone = value => structuredClone(value);
const uid = () => crypto.randomUUID?.() ?? Array.from(crypto.getRandomValues(new Uint32Array(4)), n => n.toString(16).padStart(8,'0')).join('');
let state;
let page = 'dashboard';
let activeProject;
let dirty = false;
let working = false;
let noticeTimer;

function decimal(value) {
  const match = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(String(value).trim());
  if (!match) throw new Error('Enter a nonnegative amount with up to two decimal places.');
  return Number(match[1])*100 + Number((match[2] ?? '').padEnd(2,'0'));
}

function totals(project) {
  const subtotal = project.items.reduce((sum,item) => sum + item.quantity * item.price,0);
  const discount = project.items.reduce((sum,item) => sum + item.discount,0);
  const tax = project.tax;
  const total = subtotal - discount + tax;
  const confirmed = project.payments.filter(payment => payment.confirmed);
  const received = confirmed.reduce((sum,payment) => sum + payment.amount,0);
  const advance = confirmed.filter(payment => payment.kind === 'Advance').reduce((sum,payment) => sum + payment.amount,0);
  return {subtotal,discount,tax,total,confirmed,received,advance,balance:total-received};
}

function status(project) {
  const {balance,received} = totals(project);
  if (project.invoice) return 'Paid in full';
  if (balance === 0) return 'Ready to invoice';
  if (project.due && project.due < today()) return 'Overdue';
  return received ? 'Partially paid' : 'Awaiting payment';
}

function flash(message) {
  $('#notice').textContent = message;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { $('#notice').textContent = ''; },4500);
}

function assert(condition,message) {
  if (!condition) throw new Error(message);
}

async function save(change, after) {
  if (working) return;
  working = true;
  try {
    state = await StudioDB.access(initial, stored => {
      assert(stored.revision === state.revision,'Records changed in another tab. Reload this page and try again.');
      const revision = stored.revision + 1;
      const next = change(stored) ?? stored;
      next.revision = revision;
      return next;
    });
    dirty = false;
    render();
    after?.();
  } catch (error) {
    flash(error.message);
  } finally {
    working = false;
  }
}

const projectById = (id, data=state) => data.projects.find(project => project.id === id);
const button = (label, action, id='', classes='', disabled=false) => `<button type="button" class="${classes}" data-action="${action}" data-id="${esc(id)}"${disabled?' disabled':''}>${esc(label)}</button>`;
const field = (label,key,value='',type='text',attrs='') => `<label>${label}<input name="${key}" type="${type}" value="${esc(value)}" ${attrs}></label>`;
const area = (label,key,value='',attrs='') => `<label class="wide">${label}<textarea name="${key}" ${attrs}>${esc(value)}</textarea></label>`;
const options = (values,current) => values.map(value => `<option${value===current?' selected':''}>${esc(value)}</option>`).join('');
const select = (label,key,values,current) => `<label>${label}<select name="${key}">${options(values,current)}</select></label>`;
const badge = label => `<span class="badge ${['Paid in full','Ready to invoice','Confirmed'].includes(label)?'paid':''}">${esc(label)}</span>`;
const card = (label,value) => `<div class="card"><span class="muted">${esc(label)}</span><strong>${esc(value)}</strong></div>`;
const heading = (title,description,action='') => `<div class="heading"><div><h1>${title}</h1><p class="muted">${description}</p></div>${action}</div>`;
const table = (headers,rows,empty) => rows.length ? `<div class="table"><table><thead><tr>${headers.map(value=>`<th scope="col">${value}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>` : `<p class="muted">${empty}</p>`;
const row = (...cells) => `<tr>${cells.map(value=>`<td>${value}</td>`).join('')}</tr>`;
const values = form => Object.fromEntries([...new FormData(form)].map(([key,value]) => [key,typeof value==='string'?value.trim():value]));
const rupees = paise => (paise/100).toFixed(2);

function show(title, html) {
  body.innerHTML = `<div class="dialoghead"><h2>${esc(title)}</h2>${button('Close','close')}</div>${html}`;
  dirty = false;
  if (!modal.open) modal.showModal();
}

function close() {
  if (dirty && !confirm('Discard unsaved changes?')) return;
  dirty = false;
  modal.close();
}

function projectRows(projects) {
  return projects.map(project => {
    const {total,received,balance} = totals(project);
    return row(`<strong>${esc(project.name)}</strong><small>${esc(project.package)}</small>`,esc(project.client.name),money(total),money(received),money(balance),badge(status(project)),date(project.due),button('Open','open-project',project.id));
  });
}

function projectTable(projects) {
  return table(['Project','Client','Value','Confirmed','Balance','Status','Due',''], projectRows(projects),'No projects match this view.');
}

function dashboard() {
  const projects = state.projects;
  const invoices = projects.flatMap(project => project.invoice ? [project.invoice] : []);
  const aggregate = projects.reduce((sum,project) => {
    const {received,balance} = totals(project);
    return {received:sum.received+received,balance:sum.balance+balance};
  },{received:0,balance:0});
  return heading('Dashboard','Manage website projects, confirmed payments and issued documents.',button('New project','new-project','','primary')) +
    `<div class="metrics">${card('Final invoices',invoices.length)}${card('Total invoiced',money(invoices.reduce((sum,document)=>sum+document.amounts.total,0)))}${card('Confirmed payments',money(aggregate.received))}${card('Outstanding balance',money(aggregate.balance))}${card('Partially paid projects',projects.filter(p=>{const t=totals(p);return t.received>0&&t.balance>0;}).length)}${card('Fully paid projects',projects.filter(p=>totals(p).balance===0).length)}${card('Overdue projects',projects.filter(p=>status(p)==='Overdue').length)}</div>
    <section class="card"><h2>Recent projects</h2>${projectTable(projects.slice().reverse().slice(0,7))}</section>`;
}

function projectsView() {
  return heading('Projects','Manage packages, services and billing details.',button('New project','new-project','','primary')) +
    `<section class="card"><div class="bar"><input id="search" type="search" aria-label="Search projects" placeholder="Search projects or clients"><select id="filter" aria-label="Project status">${options(['All','Awaiting payment','Partially paid','Overdue','Ready to invoice','Paid in full'])}</select></div><div id="results"></div></section>`;
}

function paymentsView() {
  const projects = state.projects;
  const amount = (subset,get) => money(subset.reduce((sum,p)=>sum+get(totals(p)),0));
  const advancePending = t => Math.min(t.balance,Math.max(0,Math.round(t.total/2)-t.advance));
  const recent = projects.flatMap(project=>project.payments.filter(p=>p.confirmed).map(payment=>({project,payment}))).sort((a,b)=>b.payment.date.localeCompare(a.payment.date)).slice(0,10);
  return heading('Payment Tracker','Record transactions, then confirm the funds you received.') +
    `<div class="metrics">${card('Outstanding',amount(projects,t=>t.balance))}${card('Advance pending',amount(projects,advancePending))}${card('Final payment pending',amount(projects,t=>t.balance-advancePending(t)))}${card('Overdue',amount(projects.filter(p=>status(p)==='Overdue'),t=>t.balance))}</div>
    <section class="card"><h2>Projects awaiting payment</h2><div class="bar"><label>Due by <input type="date" id="due-filter"></label></div><div id="results"></div></section>
    <section class="card"><h2>Recently confirmed payments</h2>${table(['Project','Date','Method','Confirmed amount'],recent.map(({project,payment})=>row(esc(project.name),date(payment.date),esc(payment.method),money(payment.amount))),'No confirmed payments yet.')}</section>`;
}

function historyView() {
  return heading('Invoice History','Find and reprint saved final invoices and advance receipts.') +
    `<section class="card"><div class="bar"><input id="search" type="search" aria-label="Search documents" placeholder="Search by number, client or project"><select id="filter" aria-label="Document type">${options(['All','Final invoices','Advance receipts'])}</select><select id="sort" aria-label="Sort documents">${options(['Newest','Oldest','Highest amount','Lowest amount'])}</select></div><div id="results"></div></section>`;
}

function updateResults() {
  const results = $('#results');
  if (!results) return;
  const query = ($('#search')?.value ?? '').trim().toLowerCase();
  const filter = $('#filter')?.value ?? 'All';
  const matches = fields => fields.join(' ').toLowerCase().includes(query);
  if (page === 'projects') {
    results.innerHTML = projectTable(state.projects.filter(p=>matches([p.name,p.client.name,p.client.business,p.invoice?.number]) && (filter==='All'||status(p)===filter)).reverse());
  } else if (page === 'payments') {
    const due = $('#due-filter').value;
    results.innerHTML = projectTable(state.projects.filter(p=>totals(p).balance>0 && (!due || (p.due && p.due<=due))));
  } else {
    const sort = $('#sort').value;
    const documents = state.projects.flatMap(p=>[p.invoice,p.receipt].filter(Boolean).map(document=>({p,document})));
    const filtered = documents.filter(({document:d})=>matches([d.number,d.client.name,d.client.business,d.project.name]) && (filter==='All'||filter===(d.type==='invoice'?'Final invoices':'Advance receipts')));
    filtered.sort((a,b)=> {
      if (sort==='Highest amount') return b.document.amounts.total-a.document.amounts.total;
      if (sort==='Lowest amount') return a.document.amounts.total-b.document.amounts.total;
      const order = b.document.date.localeCompare(a.document.date)||b.document.number.localeCompare(a.document.number);
      return sort==='Oldest' ? -order : order;
    });
    results.innerHTML = table(['Document','Client','Project','Project value','Amount received','Balance','Issue date',''],filtered.map(({p,document:d})=>row(`<strong>${esc(d.number)}</strong><small>${d.type==='invoice'?'Final paid invoice':'Advance payment receipt'}</small>`,esc(d.client.name),esc(d.project.name),money(d.amounts.total),money(d.amounts.received),money(d.amounts.balance),date(d.date),button('View',d.type,p.id))),'No issued documents match this view.');
  }
}

function clientsView() {
  return heading('Clients','Save billing details and see project totals by client.',button('New client','client','','primary')) +
    `<section class="card">${table(['Client','Contact','Projects','Billed','Received','Outstanding',''],state.clients.map(client=>{
      const projects=state.projects.filter(p=>p.client.id===client.id);
      const sum=get=>money(projects.reduce((total,p)=>total+get(p),0));
      return row(`<strong>${esc(client.name)}</strong><small>${esc(client.business)}</small>`,`${esc(client.email)}<small>${esc(client.phone)}</small>`,projects.length,sum(p=>p.invoice?.amounts.total??0),sum(p=>totals(p).received),sum(p=>totals(p).balance),`<div class="actions">${button('Edit','client',client.id)}${button('Delete','delete-client',client.id,'danger')}</div>`);
    }),'No clients yet.')}</section>`;
}

function clientFields(client={}) {
  return field('Client name','name',client.name,'text','required maxlength="120"')+field('Client business name','business',client.business)+field('Email','email',client.email,'email')+field('Phone','phone',client.phone,'tel')+area('Billing address','address',client.address)+field('City','city',client.city)+field('State','region',client.region)+field('PIN code','pin',client.pin);
}

function clientData(data,id) {
  assert(data.name,'Enter a client name.');
  return {id,name:data.name,business:data.business,phone:data.phone,email:data.email,address:data.address,city:data.city,region:data.region,pin:data.pin};
}

function settingsView() {
  const s = state.settings;
  return heading('Business Settings','Set the business details and artwork used on new documents.')+`<form id="settings-form" class="card formgrid">
    ${field('Business name','name',s.name,'text','required')}${field('Professional title','title',s.title,'text','required')}${field('Email','email',s.email,'email')}${field('Phone','phone',s.phone,'tel')}${area('Business address','address',s.address)}${field('GSTIN (if applicable)','gstin',s.gstin)}${field('UPI ID','upi',s.upi)}${area('Bank account details','bank',s.bank)}
    ${area('Payment terms','terms',s.terms)}${area('Thank you message','thanks',s.thanks)}
    ${['logo','signature'].map(key=>`<label>${key==='logo'?'Business logo':'Signature image'}<input type="file" name="${key}" accept="image/png,image/jpeg,image/webp"><small>${s[key]?'Image saved':'PNG, JPEG or WebP up to 2 MB'}</small></label>${s[key]?`<label class="check"><input type="checkbox" name="remove-${key}"> Remove saved ${key}</label>`:'<span></span>'}`).join('')}
    <div class="wide"><button class="primary">Save settings</button></div></form>`;
}

function backupView() {
  return heading('Backup & Restore','Export or restore the local workspace, including issued documents and images.')+
    `<section class="card"><h2>Backup file</h2><div class="actions">${button('Export all data','export','','primary')}${button('Import backup','import')}<input id="backup-file" type="file" accept=".json,application/json" hidden></div><p class="muted spaced">${state.lastExport?'Last export '+date(state.lastExport):'No backup has been exported.'} Keep an exported copy in a separate location.</p></section>
    <section class="card"><h2>Reset workspace</h2><p class="muted">Permanently clear all records and settings in this browser profile.</p>${button('Reset application','reset','','danger')}</section>`;
}

function render() {
  Object.entries(sections).forEach(([key,label])=>{
    const control = document.querySelector(`[data-page="${key}"]`);
    control.classList.toggle('active',key===page);
    if (key===page) {
      control.setAttribute('aria-current','page');
      $('#crumb').textContent=label;
    } else control.removeAttribute('aria-current');
  });
  view.innerHTML = ({dashboard,projects:projectsView,payments:paymentsView,history:historyView,clients:clientsView,settings:settingsView,backup:backupView})[page]();
  updateResults();
}

function line(item={description:'',quantity:1,price:0,discount:0}) {
  return `<div class="line">
    ${field('Service','description',item.description,'text','required')}
    ${field('Quantity','quantity',item.quantity,'number','required min="1" max="9999" step="1"')}
    ${field('Unit price (₹)','price',rupees(item.price),'number','required min="0" step="0.01"')}
    ${field('Discount (₹)','discount',rupees(item.discount),'number','required min="0" step="0.01"')}
    ${button('Remove','remove-line')}</div>`;
}

function itemsFrom(form) {
  return [...form.querySelectorAll('.line')].map(element => {
    const get = name => element.querySelector(`[name="${name}"]`).value.trim();
    const quantity=Number(get('quantity'));
    const price=decimal(get('price'));
    const discount=decimal(get('discount'));
    const description=get('description');
    assert(description && Number.isInteger(quantity) && quantity>0 && quantity<=9999 && discount<=quantity*price,'Check service descriptions, quantities and discounts.');
    return {description,quantity,price,discount};
  });
}

function projectForm(project, duplicate=false) {
  const p = project ?? {};
  const selected = p.package && !Object.hasOwn(packages,p.package) ? 'Custom' : p.package ?? 'Starter Website';
  const clients = `<label class="wide">Saved client<select id="saved-client"><option value="">Enter client details</option>${state.clients.map(c=>`<option value="${esc(c.id)}"${c.id===p.client?.id?' selected':''}>${esc(c.name)}${c.business?' · '+esc(c.business):''}</option>`).join('')}</select></label>`;
  show(duplicate?'Duplicate project':project?'Edit project':'New project',`<form id="project-form" data-id="${duplicate?'':esc(p.id)}" class="formgrid">
    ${clients}
    ${field('Client name','name',p.client?.name,'text','required maxlength="120"')}${field('Client business name','business',p.client?.business)}
    ${field('Project name','project',duplicate?p.name+' (copy)':p.name,'text','required')}
    ${select('Website package','package',[...Object.keys(packages),'Custom'],selected)}
    <div id="custom-package"${selected==='Custom'?'':' hidden'}>${field('Custom package name','custom',selected==='Custom'?p.package:'')}</div>
    ${area('Billing address','address',p.client?.address)}
    <details class="wide"><summary>More client and project details</summary><div class="formgrid spaced">
    ${field('Email','email',p.client?.email,'email')}${field('Phone','phone',p.client?.phone,'tel')}
    ${field('City','city',p.client?.city)}${field('State','region',p.client?.region)}${field('PIN code','pin',p.client?.pin)}
    ${field('Project type','type',p.type)}${field('Expected delivery date','delivery',p.delivery,'date')}${field('Payment due date','due',p.due,'date')}
    ${area('Project description','project-description',p.description)}${area('Internal notes','notes',p.notes)}
    </div></details>
    <section class="wide"><h3>Itemized services</h3><div id="lines">${(p.items??[{description:'Website development',quantity:1,price:799900,discount:0}]).map(line).join('')}</div>${button('Add service','add-line')}</section>
    ${field('Applicable tax (₹, optional)','tax',p.tax?rupees(p.tax):'','number','min="0" step="0.01"')}
    <div id="estimate" class="spaced"></div>
    <div class="wide"><button class="primary">Save project</button></div></form>`);
  estimate();
}

function estimate() {
  const form = $('#project-form');
  if (!form) return;
  try {
    const {total} = totals({items:itemsFrom(form),tax:form.elements.tax.value?decimal(form.elements.tax.value):0,payments:[]});
    $('#estimate').textContent=`Project total ${money(total)} · 50% target ${money(Math.round(total/2))}`;
  } catch {
    $('#estimate').textContent='Complete the service details to calculate totals.';
  }
}

function projectDetail(id) {
  const p = projectById(id);
  if (!p) return;
  activeProject = id;
  const t = totals(p);
  const remainingAdvance = Math.max(0,Math.round(t.total/2)-t.advance);
  const advances = t.confirmed.filter(payment=>payment.kind==='Advance');
  const ready = t.balance===0 && t.received>0;
  show(p.name,`<p>${esc(p.client.name)} · ${esc(p.package)} · ${badge(status(p))}</p>
    <div class="metrics">${card('Project value',money(t.total))}${card('Advance confirmed',money(t.advance))}${card('Final payments confirmed',money(t.received-t.advance))}${card('Total confirmed',money(t.received))}${card('Outstanding balance',money(t.balance))}</div>
    <div class="actions">${button('Record payment','record',id,'primary',!!p.invoice||t.balance===0)}${button(p.receipt?'View advance receipt':'Advance Payment Receipt',p.receipt?'receipt':'issue-receipt',id,'',!p.receipt&&!advances.length)}${button(p.invoice?'View final invoice':'Generate final paid invoice',p.invoice?'invoice':'issue-invoice',id,'',!p.invoice&&!ready)}</div>
    <details class="spaced"><summary>Project options</summary>
    <div class="actions spaced">${button('Edit project','edit-project',id,'',!!p.invoice||!!p.receipt)}${button('Duplicate project','duplicate',id)}${button('Delete project','delete-project',id,'danger',!!p.invoice||!!p.receipt)}</div>
    <p class="muted spaced">Advance target ${money(Math.round(t.total/2))} · Target remaining ${money(remainingAdvance)} · Due ${date(p.due)}</p></details>
    <h3>Payment history</h3>
    ${table(['Payment','Date and reference','Amount','Status','Actions'],p.payments.map(payment=>{
      const locked=!!p.invoice||(p.receipt?.paymentIds??[]).includes(payment.id);
      const cannotConfirm = locked || (payment.kind==='Advance' && !!p.receipt) || payment.amount>t.balance;
      return row(`${esc(payment.kind)}<small>${esc(payment.method)}</small>`,`${date(payment.date)}<small>${esc(payment.reference)}</small>`,money(payment.amount),badge(payment.confirmed?'Confirmed':'Recorded'),`<div class="actions">${payment.confirmed?'':button('Confirm','confirm-payment',payment.id,'primary',cannotConfirm)}${button('Edit','edit-payment',payment.id,'',locked)}${button('Delete','delete-payment',payment.id,'danger',locked)}</div>${payment.notes?`<small class="pre">${esc(payment.notes)}</small>`:''}`);
    }),'No payments recorded.')}`);
}

function paymentForm(id, payment) {
  const p = projectById(id);
  const t = totals(p);
  const kind = payment?.kind ?? (t.advance===0?'Advance':'Final');
  const amount = payment?.amount ?? (kind==='Advance'?Math.min(t.balance,Math.round(t.total/2)):t.balance);
  show(payment?'Edit payment':'Record payment',`<p class="muted">Recorded entries count towards the balance after you confirm receipt.</p><form id="payment-form" data-id="${esc(id)}" data-payment="${esc(payment?.id)}" class="formgrid">
    ${select('Payment stage','kind',['Advance','Final'],kind)}
    ${field('Amount (₹)','amount',rupees(amount),'number','min="0.01" step="0.01" required')}
    ${field('Payment date','date',payment?.date??today(),'date',`required max="${today()}"`)}
    ${select('Payment method','method',methods,payment?.method)}
    ${field('Transaction reference','reference',payment?.reference,'text','maxlength="100"')}
    ${area('Internal notes','notes',payment?.notes)}
    <div class="wide"><button class="primary">${payment?'Save as recorded':'Save recorded payment'}</button> ${button('Back to project','open-project',id)}</div></form>`);
}

function issueForm(p,type) {
  const isInvoice=type==='invoice';
  const prefix=isInvoice?'INV':'APR';
  const year=today().slice(0,4);
  const key=prefix+'-'+year;
  const number=key+'-'+String((state.counters[key]??0)+1).padStart(4,'0');
  show(isInvoice?'Issue final paid invoice':'Issue advance payment receipt',`<form class="formgrid" id="issue-form" data-id="${esc(p.id)}" data-type="${type}">
    ${field(isInvoice?'Invoice number':'Receipt number','number',number,'text','required maxlength="50" pattern="[A-Za-z0-9._\\-]+"')}
    ${field('Issue date','date',today(),'date',`required max="${today()}"`)}
    <p class="muted wide">The issued document keeps its number and figures for future copies.</p>
    <div class="wide"><button class="primary">${isInvoice?'Issue invoice':'Issue receipt'}</button> ${button('Back to project','open-project',p.id)}</div></form>`);
}

function issue(data,p,type,form) {
  if (p[type]) return;
  const t=totals(p);
  const invoice=type==='invoice';
  const payments=invoice?t.confirmed:t.confirmed.filter(payment=>payment.kind==='Advance');
  assert(invoice?t.total>0&&t.balance===0:payments.length>0,invoice?'Confirm full payment before issuing an invoice.':'Confirm an advance before issuing a receipt.');
  assert(/^[A-Za-z0-9._-]{1,50}$/.test(form.number),'Enter a valid document number.');
  assert(!data.projects.some(project=>[project.invoice,project.receipt].some(d=>d?.number.toLowerCase()===form.number.toLowerCase())),'This document number is already in use.');
  assert(form.date<=today() && payments.every(payment=>payment.date<=form.date),'The issue date must be on or after the payments and no later than today.');
  const received=invoice?t.received:t.advance;
  const standard=/^(INV|APR)-(\d{4})-(\d{1,9})$/.exec(form.number);
  if (standard) {
    const key=standard[1]+'-'+standard[2];
    data.counters[key]=Math.max(data.counters[key]??0,Number(standard[3]));
  }
  p[type]={type,number:form.number,date:form.date,client:clone(p.client),
    project:{name:p.name,package:p.package,type:p.type,description:p.description},
    business:clone(data.settings),items:clone(p.items),payments:clone(payments),paymentIds:payments.map(payment=>payment.id),
    amounts:{subtotal:t.subtotal,discount:t.discount,tax:t.tax,total:t.total,received,balance:t.total-received},notes:p.notes};
}

function words(number) {
  const small=['Zero','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const tens=['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  if (number<20) return small[number];
  if (number<100) return tens[Math.floor(number/10)]+(number%10?' '+words(number%10):'');
  for (const [unit,label] of [[10000000,'Crore'],[100000,'Lakh'],[1000,'Thousand'],[100,'Hundred']]) {
    if (number>=unit) return words(Math.floor(number/unit))+' '+label+(number%unit?' '+words(number%unit):'');
  }
}

function documentMarkup(d, office=false) {
  const invoice=d.type==='invoice';
  const client=d.client;
  const business=d.business;
  const a=d.amounts;
  const title=invoice?'Final Paid Invoice':'Advance Payment Receipt';
  const art=(key,alt)=> /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(business[key]??'') ? `<img src="${business[key]}" alt="${alt}">` : '';
  const block=(...lines)=>lines.filter(Boolean).map(esc).join('<br>');
  const amountLine=(label,amount)=>`<div><span>${label}</span><strong class="money">${money(amount)}</strong></div>`;
  const payments=d.payments.slice().sort((a,b)=>a.date.localeCompare(b.date));
  const last=payments.at(-1);
  const paymentDetails=invoice
    ? `<p>Payment date ${date(last.date)}<br>Payment method ${esc([...new Set(payments.map(p=>p.method))].join(', '))}</p>`
    : table(['Payment date','Method','Transaction reference','Advance received'],payments.map(p=>row(date(p.date),esc(p.method),esc(p.reference||'—'),money(p.amount))),'');
  return `<header class="dochead"><div>${art('logo','Business logo')}<h3>${esc(business.name)}</h3><div>${esc(business.title)}</div></div><div><h2>${title}</h2><strong>${esc(d.number)}</strong><div>${date(d.date)}</div>${office?'<strong>OFFICE COPY</strong>':''}</div></header>
    <div class="docgrid"><section><h3>${invoice?'Bill from':'Received by'}</h3><div class="pre">${block(business.name,business.address,business.email,business.phone,business.gstin?'GSTIN '+business.gstin:'')}</div></section>
    <section><h3>${invoice?'Bill to':'Received from'}</h3><div class="pre">${block(client.name,client.business,client.address,[client.city,client.region,client.pin].filter(Boolean).join(', '),client.email,client.phone)}</div></section></div>
    <section><h3>${esc(d.project.name)}</h3><p class="pre">${block('Website package · '+d.project.package,d.project.type,d.project.description)}</p></section>
    ${invoice?table(['Service','Qty','Rate','Discount','Amount'],d.items.map(i=>row(esc(i.description),i.quantity,money(i.price),money(i.discount),money(i.price*i.quantity-i.discount))),''):''}
    <div class="summary">${invoice?amountLine('Subtotal',a.subtotal)+(a.discount?amountLine('Discount',a.discount):'')+(a.tax?amountLine('Applicable tax',a.tax):''):''}
    ${amountLine(invoice?'Grand total':'Total project value',a.total)}${amountLine(invoice?'Total amount paid':'Advance received',a.received)}${amountLine(invoice?'Balance due':'Remaining balance after advance',a.balance)}</div>
    ${invoice?`<p><strong class="badge paid">PAID IN FULL</strong></p><p>${words(Math.floor(a.received/100))} Rupees${a.received%100?' and '+words(a.received%100)+' Paise':''} Only</p>`:''}
    ${paymentDetails}
    ${invoice&&business.terms?`<h3>Payment terms</h3><p class="pre">${esc(business.terms)}</p>`:''}
    ${office&&(d.notes||payments.some(p=>p.notes))?`<h3>Internal notes</h3><p class="notes">${esc([d.notes,...payments.filter(p=>p.notes).map(p=>date(p.date)+' · '+p.notes)].filter(Boolean).join('\n'))}</p>`:''}
    <footer class="docfoot"><p class="pre">${esc(business.thanks)}</p><div>${art('signature','Signature')}<div class="signed"><strong>${esc(business.name)}</strong><br>Authorized signature</div></div></footer>`;
}

let preview;
let originalTitle;
function previewDocument(id,type) {
  const p=projectById(id);
  preview=p[type];
  show(type==='invoice'?'Final paid invoice':'Advance payment receipt',`<div class="actions">
    ${button(type==='invoice'?'Download Customer Invoice':'Download Customer Receipt','print-customer','','primary')}
    ${button('Download Office Copy','print-office')}${button(type==='invoice'?'Print Invoice':'Print Receipt','print-customer')}${button('Back to project','open-project',id)}
    </div><p class="muted spaced">Choose Save as PDF or select a printer in the browser print dialog.</p><article class="paper">${documentMarkup(preview)}</article>`);
}

function printDocument(office) {
  $('#paper').innerHTML=documentMarkup(preview,office);
  originalTitle=document.title;
  document.title=preview.number+(office?'-OFFICE':'-CUSTOMER');
  document.body.classList.add('printing');
  window.print();
}

window.addEventListener('afterprint',()=>{
  document.body.classList.remove('printing');
  $('#paper').replaceChildren();
  if (originalTitle) document.title=originalTitle;
  originalTitle=undefined;
});

function paymentEditable(project,payment) {
  assert(project && payment && !project.invoice && !project.receipt?.paymentIds.includes(payment.id),'This payment is attached to an issued document.');
}

function onAction(action,id,element) {
  const p=projectById(id);
  const current=projectById(activeProject);
  const payment=current?.payments.find(entry=>entry.id===id);
  switch(action) {
    case 'close': close(); break;
    case 'open-project':
      if (!dirty || confirm('Discard unsaved changes?')) projectDetail(id);
      break;
    case 'new-project': projectForm(); break;
    case 'edit-project': projectForm(p); break;
    case 'duplicate': projectForm(p,true); break;
    case 'delete-project':
      if (confirm('Delete this project and its recorded payments?')) save(data=>{
        const project=projectById(id,data);
        assert(!project.invoice&&!project.receipt,'Issued documents must remain in the history.');
        data.projects=data.projects.filter(item=>item.id!==id);
      },()=>{modal.close();flash('Project deleted.');});
      break;
    case 'record': paymentForm(id); break;
    case 'edit-payment': paymentEditable(current,payment); paymentForm(current.id,payment); break;
    case 'confirm-payment': {
      if (!confirm('Confirm receipt of '+money(payment.amount)+' by '+payment.method+'?')) break;
      const projectId=current.id;
      save(data=>{
        const project=projectById(projectId,data);
        const entry=project.payments.find(item=>item.id===id);
        assert(entry&&!entry.confirmed&&!project.invoice,'This payment cannot be confirmed.');
        assert(entry.kind!=='Advance'||!project.receipt,'The advance receipt has already been issued.');
        assert(entry.amount<=totals(project).balance,'This payment would exceed the outstanding balance.');
        entry.confirmed=true;
      },()=>{projectDetail(projectId);flash('Payment confirmed.');});
      break;
    }
    case 'delete-payment': {
      if (!confirm('Delete this payment entry?')) break;
      const projectId=current.id;
      save(data=>{
        const project=projectById(projectId,data);
        paymentEditable(project,project.payments.find(item=>item.id===id));
        project.payments=project.payments.filter(item=>item.id!==id);
      },()=>{projectDetail(projectId);flash('Payment deleted.');});
      break;
    }
    case 'issue-receipt': issueForm(p,'receipt'); break;
    case 'issue-invoice': issueForm(p,'invoice'); break;
    case 'receipt': case 'invoice': previewDocument(id,action); break;
    case 'print-customer': case 'print-office': printDocument(action==='print-office'); break;
    case 'client': {
      const client=state.clients.find(c=>c.id===id);
      show(client?'Edit client':'New client',`<form id="client-form" data-id="${esc(id)}" class="formgrid">${clientFields(client)}<div class="wide"><button class="primary">Save client</button></div></form>`);
      break;
    }
    case 'delete-client':
      if (confirm('Delete this saved client? Project and document records will be kept.')) save(data=>{data.clients=data.clients.filter(client=>client.id!==id);},()=>flash('Client deleted.'));
      break;
    case 'add-line': $('#lines').insertAdjacentHTML('beforeend',line()); dirty=true; estimate(); break;
    case 'remove-line':
      if ($('#lines').children.length<=1) flash('A project needs at least one service.');
      else {element.closest('.line').remove();dirty=true;estimate();}
      break;
    case 'export': save(data=>{data.lastExport=today();},exportBackup); break;
    case 'import': $('#backup-file').click(); break;
    case 'reset':
      if (prompt('Type RESET to permanently clear this workspace.')==='RESET') save(initial,()=>flash('Workspace cleared.'));
      break;
  }
}

function submitProject(form,input) {
  const id=form.dataset.id;
  const items=itemsFrom(form);
  const tax=input.tax?decimal(input.tax):0;
  const packageName=input.package==='Custom'?input.custom:input.package;
  assert(items.length&&items.length<=200&&packageName&&input.project,'Enter a project name, package and between 1 and 200 services.');
  const projectId=id||uid();
  const savedId=$('#saved-client').value;
  const details=clientData(input,savedId||uid());
  save(data=>{
    const p=projectById(id,data);
    assert(!p?.invoice&&!p?.receipt,'Project details are locked after issuing a document.');
    const next={id:projectId,client:details,name:input.project,type:input.type,package:packageName,
      items,tax,description:input['project-description'],notes:input.notes,due:input.due,delivery:input.delivery,payments:p?.payments??[]};
    const t=totals(next);
    assert(Number.isSafeInteger(t.subtotal)&&Number.isSafeInteger(t.total)&&t.total>0&&t.balance>=0,'The total must be positive and cover all confirmed payments.');
    if (!savedId) data.clients.push(details);
    if (p) Object.assign(p,next);
    else data.projects.push(next);
  },()=>{projectDetail(projectId);flash('Project saved.');});
}

function submitPayment(form,input) {
  const {id,payment:paymentId}=form.dataset;
  const entry={id:paymentId||uid(),amount:decimal(input.amount),kind:input.kind,date:input.date,method:input.method,reference:input.reference,notes:input.notes,confirmed:false};
  assert(entry.amount>0 && entry.date && entry.date<=today(),'Enter a positive amount and a valid payment date.');
  save(data=>{
    const project=projectById(id,data);
    const previous=project.payments.find(p=>p.id===paymentId);
    if (paymentId) paymentEditable(project,previous);
    const {balance}=totals(project);
    assert(!project.invoice && entry.amount<=balance+(previous?.confirmed?previous.amount:0),'The recorded amount exceeds the available balance.');
    assert(!(entry.kind==='Advance'&&project.receipt),'Record any further funds under the final payment stage after issuing the advance receipt.');
    assert(!project.payments.some(p=>p.id!==entry.id && (
      entry.reference && p.reference?.toLowerCase()===entry.reference.toLowerCase() ||
      p.date===entry.date && p.amount===entry.amount && p.kind===entry.kind && p.method===entry.method && p.reference?.toLowerCase()===entry.reference.toLowerCase()
    )),'An entry with these payment details already exists.');
    if (previous) Object.assign(previous,entry);
    else project.payments.push(entry);
  },()=>{projectDetail(id);flash('Payment recorded. Confirm receipt when verified.');});
}

function imageData(file) {
  assert(['image/png','image/jpeg','image/webp'].includes(file.type)&&file.size<=2*1024*1024,'Choose a PNG, JPEG or WebP image up to 2 MB.');
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(reader.result);
    reader.onerror=()=>reject(new Error('Could not read the selected image.'));
    reader.readAsDataURL(file);
  });
}

async function submitSettings(input) {
  const {logo,signature,...settings}=input;
  assert(settings.name&&settings.title,'Business name and title are required.');
  for (const [key,file] of Object.entries({logo,signature})) {
    settings[key]=file.size?await imageData(file):settings['remove-'+key]?'':state.settings[key]??'';
    delete settings['remove-'+key];
  }
  await save(data=>{data.settings=settings;},()=>flash('Settings saved.'));
}

function exportBackup() {
  const url=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}));
  const link=document.createElement('a');
  link.href=url;
  link.download='invoice-studio-'+today()+'.json';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
  flash('Backup exported.');
}

function validateBackup(data) {
  const object = value => value && typeof value==='object' && !Array.isArray(value);
  const record = (value,required,optional=[]) => object(value)&&required.every(k=>typeof value[k]==='string'&&value[k].trim())&&optional.every(k=>value[k]===undefined||typeof value[k]==='string');
  const client = value => record(value,['id','name'],['business','phone','email','address','city','region','pin']);
  const settings = value => record(value,['name','title'],['terms','thanks','email','phone','address','gstin','upi','bank','logo','signature'])&&['logo','signature'].every(key=>!value[key]||/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value[key]));
  const integer = value => Number.isSafeInteger(value)&&value>=0;
  const iso = value => typeof value==='string'&&/^\d{4}-\d\d-\d\d$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
  const items = list => Array.isArray(list)&&list.length>0&&list.length<=200&&list.every(i=>record(i,['description'])&&integer(i.quantity)&&i.quantity>0&&i.quantity<=9999&&integer(i.price)&&integer(i.discount)&&integer(i.price*i.quantity)&&i.discount<=i.price*i.quantity);
  const payment = p => record(p,['id','date','kind','method'],['reference','notes'])&&iso(p.date)&&p.date<=today()&&['Advance','Final'].includes(p.kind)&&methods.includes(p.method)&&integer(p.amount)&&p.amount>0&&typeof p.confirmed==='boolean';
  const unique = list => new Set(list).size===list.length;
  const invalid='This file contains invalid or unsupported Invoice Studio records.';
  assert(object(data)&&data.version===1&&Array.isArray(data.projects)&&Array.isArray(data.clients)&&settings(data.settings)&&object(data.counters)&&Object.entries(data.counters).every(([k,v])=>/^(INV|APR)-\d{4}$/.test(k)&&integer(v)),invalid);
  assert(data.clients.every(client)&&unique(data.clients.map(c=>c.id)),invalid);
  const numbers=[];
  for (const p of data.projects) {
    assert(record(p,['id','name','package'],['type','description','notes','due','delivery'])&&client(p.client)&&items(p.items)&&integer(p.tax)&&Array.isArray(p.payments)&&p.payments.every(payment)&&unique(p.payments.map(e=>e.id)),invalid);
    const t=totals(p);
    assert(integer(t.subtotal)&&integer(t.total)&&t.total>0&&integer(t.balance),invalid);
    for (const type of ['invoice','receipt']) {
      const d=p[type];
      if (d===undefined) continue;
      assert(record(d,['number','date','type'],['notes'])&&d.type===type&&/^[A-Za-z0-9._-]{1,50}$/.test(d.number)&&iso(d.date)&&d.date<=today()&&client(d.client)&&record(d.project,['name','package'],['description','type'])&&settings(d.business)&&items(d.items)&&object(d.amounts)&&Array.isArray(d.payments)&&d.payments.length>0&&Array.isArray(d.paymentIds),invalid);
      assert(d.payments.every(e=>payment(e)&&e.confirmed&&e.date<=d.date&&(type==='invoice'||e.kind==='Advance')&&p.payments.some(current=>current.id===e.id&&current.confirmed&&current.amount===e.amount&&current.kind===e.kind&&current.method===e.method&&current.date===e.date&&current.reference===e.reference)),invalid);
      assert(unique(d.paymentIds)&&d.paymentIds.length===d.payments.length&&d.payments.every(e=>d.paymentIds.includes(e.id)),invalid);
      const snapshot=totals({items:d.items,tax:d.amounts.tax,payments:d.payments});
      for (const key of ['subtotal','discount','tax','total','received','balance']) assert(integer(d.amounts[key])&&d.amounts[key]===snapshot[key],invalid);
      assert(d.amounts.total===t.total&&(type==='invoice'?d.amounts.balance===0&&t.balance===0:d.amounts.received===t.advance),invalid);
      numbers.push(d.number.toLowerCase());
    }
  }
  assert(unique(numbers)&&unique(data.projects.map(p=>p.id)),invalid);
  for (const number of numbers) {
    const standard=/^(INV|APR)-(\d{4})-(\d{1,9})$/.exec(number.toUpperCase());
    if (standard) {
      const key=standard[1]+'-'+standard[2];
      data.counters[key]=Math.max(data.counters[key]??0,Number(standard[3]));
    }
  }
  if (data.lastExport!==undefined) assert(iso(data.lastExport),invalid);
  return data;
}

document.addEventListener('click',event=>{
  const control=event.target.closest('button');
  if (!control||!state||working) return;
  try {
    if (control.dataset.page) {
      if (dirty&&!confirm('Discard unsaved changes?')) return;
      page=control.dataset.page;
      dirty=false;
      render();
    } else if (control.id==='theme') {
      const dark=document.documentElement.classList.toggle('dark');
      try { localStorage.setItem('invoice-studio-theme',dark?'dark':'light'); } catch {}
    } else if (control.dataset.action) onAction(control.dataset.action,control.dataset.id,control);
  } catch (error) {flash(error.message);}
});

document.addEventListener('input',event=>{
  if (event.target.closest('form')) dirty=true;
  if (event.target.closest('#project-form')) estimate();
  if (event.target.id==='search') updateResults();
});

document.addEventListener('change',async event=>{
  const target=event.target;
  if (['filter','sort','due-filter'].includes(target.id)) updateResults();
  if (target.id==='saved-client') {
    const client=state.clients.find(c=>c.id===target.value);
    if (client) for (const key of ['name','business','phone','email','address','city','region','pin']) target.form.elements[key].value=client[key]??'';
  }
  if (target.name==='package'&&target.form?.id==='project-form') {
    $('#custom-package').hidden=target.value!=='Custom';
    if (Object.hasOwn(packages,target.value)) $('#lines [name="price"]').value=packages[target.value].toFixed(2);
    estimate();
  }
  if (target.name==='kind'&&target.form?.id==='payment-form'&&!target.form.dataset.payment) {
    const t=totals(projectById(target.form.dataset.id));
    target.form.elements.amount.value=rupees(target.value==='Advance'?Math.min(t.balance,Math.max(0,Math.round(t.total/2)-t.advance)):t.balance);
  }
  if (target.id==='backup-file'&&target.files?.length) {
    try {
      const restored=validateBackup(JSON.parse(await target.files[0].text()));
      if (confirm('Replace all local data with this backup?')) await save(()=>restored,()=>flash('Backup restored.'));
    } catch (error) {flash(error.message);}
    target.value='';
  }
});

document.addEventListener('submit',async event=>{
  event.preventDefault();
  if (working) return;
  const form=event.target;
  try {
    const input=values(form);
    switch(form.id) {
      case 'project-form': submitProject(form,input); break;
      case 'payment-form': submitPayment(form,input); break;
      case 'settings-form': await submitSettings(input); break;
      case 'client-form': {
        const client=clientData(input,form.dataset.id||uid());
        save(data=>{
          const old=data.clients.find(c=>c.id===client.id);
          if (old) Object.assign(old,client);
          else data.clients.push(client);
        },()=>{modal.close();flash('Client saved.');});
        break;
      }
      case 'issue-form': {
        const {id,type}=form.dataset;
        save(data=>issue(data,projectById(id,data),type,input),()=>{previewDocument(id,type);flash('Document issued and saved.');});
        break;
      }
    }
  } catch (error) {flash(error.message);}
});

modal.addEventListener('cancel',event=>{event.preventDefault();close();});
window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
document.addEventListener('keydown',event=>{
  if (state&&!modal.open&&event.altKey&&event.key.toLowerCase()==='n') {
    event.preventDefault();
    if (!dirty||confirm('Discard unsaved changes?')) projectForm();
  }
});
try {document.documentElement.classList.toggle('dark',localStorage.getItem('invoice-studio-theme')==='dark');} catch {}
StudioDB.access(initial).then(data=>{state=data;render();}).catch(error=>{view.textContent='Could not open IndexedDB. '+error.message;});
