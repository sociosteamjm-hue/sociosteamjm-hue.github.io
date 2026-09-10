import { readFileSync } from 'node:fs';

export async function testPreview(source) {
  const js = source.replace(/^import .*;\r?\n/gm, '');
  const assert = (ok, message) => { if (!ok) throw Error(message); };
  const pending = [];
  const model = () => new Promise((resolve, reject) => pending.push({ resolve, reject }));
  const window = { PDFLib: {} };
  const element = {
    markup: '', attributes: {},
    setAttribute(key, value) { this.attributes[key] = value; },
    set textContent(value) { this.markup = value; },
    set innerHTML(value) { this.markup = value; },
  };
  new Function('window', 'createReceiptDocument', 'receiptLogo', js)(window, model, 'test-logo');
  const first = window.TeamJMReceipt.render(element, { receipt_number: 1 });
  pending[0].resolve({ pages: ['<svg>saved receipt 1</svg>'] });
  assert(await first, 'Initial render');
  assert(await window.TeamJMReceipt.render(element, { receipt_number: 1 }), 'Cached render');
  assert(pending.length === 1, 'Identical saved receipt reuses document');
  const old = window.TeamJMReceipt.render(element, { receipt_number: 2 });
  const latest = window.TeamJMReceipt.render(element, { receipt_number: 3 });
  pending[2].resolve({ pages: ['<svg>saved receipt 3</svg>'] });
  assert(await latest, 'Latest render');
  pending[1].resolve({ pages: ['<svg>stale receipt 2</svg>'] });
  assert(!await old && element.markup.includes('receipt 3'), 'Outdated result must not replace the current receipt');
  const failed = window.TeamJMReceipt.render(element, { receipt_number: 4 });
  pending[3].reject(Error('PDF library failure'));
  assert(!await failed && !element.markup.includes('<svg>'), 'Failure must remove stale printable content');
  assert(element.attributes['aria-busy'] === 'false', 'Busy state cleared');
  return 'Preview tests passed: saved document cache, rapid updates, stale output and error handling.';
}

console.log(await testPreview(readFileSync(new URL('./receipt-preview.js', import.meta.url), 'utf8')));
