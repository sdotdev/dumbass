/* Shared client: all visible behavior is driven by the current fixture route. */
const $ = selector => document.querySelector(selector);
const caseId = location.pathname.split('/').pop();
let attempt = 0;
const delivery = $('#delivery-form');
if (delivery) delivery.addEventListener('submit', async event => {
  event.preventDefault();
  const button = $('#place-order');
  button.disabled = true;
  try {
    const input = Object.fromEntries(new FormData(delivery));
    const response = await fetch(`/api/${caseId}/order`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({...input, attempt:++attempt})});
    const data = await response.json();
    $('#form-status').textContent = data.message || data.error;
    if (data.clearFields) delivery.reset();
    button.textContent = response.ok ? 'Place another sample order' : 'Retry sample order';
  } catch { $('#form-status').textContent = 'Could not reach the sample service. Retry your order.'; }
  finally { button.disabled = false; }
});

const period = $('#period');
if (period) period.addEventListener('change', async () => {
  const response = await fetch(`/api/${caseId}/dashboard?period=${encodeURIComponent(period.value)}`);
  const data = await response.json();
  $('#revenue').textContent = `$${data.revenue.toLocaleString('en-US')}`;
  $('#scope').textContent = data.scope;
  $('#daily-rows').replaceChildren(...data.rows.map(row => {
    const tr = document.createElement('tr');
    const th = document.createElement('th');
    th.scope = 'row'; th.textContent = row.day;
    const td = document.createElement('td');
    td.textContent = `$${row.revenue.toLocaleString('en-US')}`;
    tr.append(th, td); return tr;
  }));
});

$('#remove-trip')?.addEventListener('click', () => {
  $('#trip-row').hidden = true;
  $('#mobile-status').textContent = 'Coastal walk removed.';
  $('#undo-trip').hidden = false;
  $('#undo-trip').focus();
});
$('#undo-trip')?.addEventListener('click', () => {
  $('#trip-row').hidden = false;
  $('#undo-trip').hidden = true;
  $('#mobile-status').textContent = 'Coastal walk restored.';
  $('#remove-trip').focus();
});
$('#open-keyboard')?.addEventListener('click', () => {
  $('#keyboard').hidden = false;
  document.body.classList.add('keyboard-open');
});
$('#close-keyboard')?.addEventListener('click', () => {
  $('#keyboard').hidden = true;
  document.body.classList.remove('keyboard-open');
  $('#trip-name').focus();
});
$('#save-trip')?.addEventListener('click', () => {
  $('#mobile-status').textContent = 'Trip saved.';
});
