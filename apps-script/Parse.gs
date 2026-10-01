/**
 * Pure text-parsing helpers (no Google services), so they can be unit-tested
 * with Node: see tests/parse.test.js.
 */

var MESES_ = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7,
  agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
  ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8,
  sep: 9, sept: 9, set: 9, oct: 10, nov: 11, dic: 12
};

function pad2_(n) {
  return (n < 10 ? '0' : '') + n;
}

/** Strips accents and lowercases, so "Apartamento" / "AÑO" match simple regexes. */
function normalizarTexto_(text) {
  return String(text || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/**
 * Parses a Colombian peso amount: "$1.234.567", "1,234,567", "120000",
 * "120.000,00", "$ 530.000". Returns a number or null.
 */
function parseCOP_(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return isFinite(raw) ? raw : null;
  var s = String(raw).replace(/[$\s]/g, '').replace(/cop/i, '');
  if (!s) return null;
  var m;
  if ((m = s.match(/^(\d{1,3}(?:[.,]\d{3})+)(?:[.,]\d{1,2})?$/))) {
    return Number(m[1].replace(/[.,]/g, ''));
  }
  if ((m = s.match(/^(\d+)(?:[.,]\d{1,2})?$/))) {
    return Number(m[1]);
  }
  return null;
}

/** Finds the apartment number: "Apto 401", "apartamento #302", "Apt. 201", "#303". */
function parseApto_(text) {
  var t = normalizarTexto_(text);
  var m = t.match(/\b(?:apto|apartamento|apt|ap)\.?\s*(?:no\.?|n°|#)?\s*(\d{3,4})\b/) ||
          t.match(/#\s*(\d{3,4})\b/);
  return m ? m[1] : null;
}

/**
 * Finds the month being paid, as "YYYY-MM". Accepts "2026-02", "2026/2",
 * "02-2026", "febrero 2026", "feb 2026", "febrero de 2026".
 */
function parseMes_(text) {
  var t = normalizarTexto_(text);
  var m;
  if ((m = t.match(/\b(20\d{2})[-\/.](\d{1,2})\b/))) {
    return validarMes_(Number(m[1]), Number(m[2]));
  }
  if ((m = t.match(/\b(\d{1,2})[-\/.](20\d{2})\b/))) {
    return validarMes_(Number(m[2]), Number(m[1]));
  }
  var re = /\b([a-z]{3,10})\.?\s*(?:de|del)?\s*(20\d{2})\b/g;
  while ((m = re.exec(t)) !== null) {
    if (MESES_[m[1]]) return validarMes_(Number(m[2]), MESES_[m[1]]);
  }
  return null;
}

function validarMes_(year, month) {
  if (month < 1 || month > 12) return null;
  return year + '-' + pad2_(month);
}

/**
 * Finds the amount paid in a soporte subject/body. Ignores the apartment
 * number and the month, then takes the first amount >= 1.000 COP.
 */
function parseValorSoporte_(text) {
  var t = normalizarTexto_(text)
    .replace(/\b(?:apto|apartamento|apt|ap)\.?\s*(?:no\.?|n°|#)?\s*\d{3,4}\b/g, ' ')
    .replace(/#\s*\d{3,4}\b/g, ' ')
    .replace(/\b20\d{2}[-\/.]\d{1,2}\b/g, ' ')
    .replace(/\b\d{1,2}[-\/.]20\d{2}\b/g, ' ')
    .replace(/\b20\d{2}\b/g, ' ');
  var re = /\$?\s*\d[\d.,]*/g;
  var m;
  while ((m = re.exec(t)) !== null) {
    var v = parseCOP_(m[0].replace(/[.,]$/, ''));
    if (v !== null && v >= 1000) return v;
  }
  return null;
}

/**
 * Parses a payment email. The subject is checked first, then the body.
 * Recommended subject: "Soporte | Apto 401 | 2026-02 | 120000"
 */
function parseSoporte_(subject, body) {
  var s = String(subject || '');
  var b = String(body || '').slice(0, 2000);
  return {
    apto: parseApto_(s) || parseApto_(b),
    mes: parseMes_(s) || parseMes_(b),
    valor: parseValorSoporte_(s) || parseValorSoporte_(b)
  };
}

/**
 * Looks for the total on a utility invoice email ("Total a pagar $ 530.000").
 * Returns a number or null when no labelled amount is found.
 */
function parseMontoFactura_(text) {
  var t = normalizarTexto_(text);
  var re = /(?:total\s+a\s+pagar|valor\s+a\s+pagar|total\s+factura|valor\s+total|total\s+pagar|monto\s+a\s+pagar|valor\s+factura)\s*:?\s*(?:cop)?\s*(\$?\s*\d[\d.,]*)/g;
  var m;
  while ((m = re.exec(t)) !== null) {
    var v = parseCOP_(m[1].replace(/[.,]$/, ''));
    if (v !== null && v >= 1000) return v;
  }
  return null;
}

if (typeof module !== 'undefined') {
  module.exports = {
    parseCOP_: parseCOP_, parseApto_: parseApto_, parseMes_: parseMes_,
    parseValorSoporte_: parseValorSoporte_, parseSoporte_: parseSoporte_,
    parseMontoFactura_: parseMontoFactura_
  };
}
