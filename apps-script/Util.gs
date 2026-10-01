/**
 * Shared constants and helpers for sheets, months, Drive and Gmail.
 */

var TZ = 'America/Bogota';

var HOJAS = {
  CONFIG: 'Config',
  APTOS: 'Apartamentos',
  CUOTAS: 'Cuotas',
  PAGOS: 'Pagos',
  GASTOS: 'Gastos',
  RESUMEN: 'Resumen',
  ESTADO: 'Estado de cuenta',
  HISTORIAL: 'Historial de pagos',
  BANCO: 'Banco',
  INSTRUCCIONES: 'Instrucciones'
};

var ESTADO_PAGO = {
  PENDIENTE: 'Pendiente verificación',
  REVISAR: 'Revisar',
  VERIFICADO: 'Verificado',
  DECLARADO: 'Declarado (sin soporte)',
  RECHAZADO: 'Rechazado'
};

var ESTADO_GASTO = {
  REVISAR: 'Revisar valor',
  POR_PAGAR: 'Por pagar',
  PAGADO: 'Pagado',
  ANULADO: 'Anulado'
};

var TIPO_PAGO = {
  ORDINARIA: 'Cuota ordinaria',
  EXTRAORDINARIA: 'Cuota extraordinaria',
  APORTE: 'Aporte voluntario',
  MULTA: 'Multa / interés de mora',
  PARQUEADERO: 'Arriendo parqueadero',
  OTRO: 'Otro ingreso'
};

var ESTADO_BANCO = {
  CONCILIADO: 'Conciliado',
  SIN_SOPORTE: 'Sin soporte',
  NO_EDIFICIO: 'No es del edificio'
};

var CATEGORIA = {
  ENERGIA: 'Energía (Afinia)',
  AGUA: 'Agua (Acuacar)',
  ASEO: 'Aseo',
  REPARACION: 'Reparación',
  OTRO: 'Otro gasto'
};

var LABELS = {
  SOPORTE_OK: 'EdEli/Soporte procesado',
  SOPORTE_REVISAR: 'EdEli/Soporte revisar',
  FACTURA_OK: 'EdEli/Factura procesada',
  BANCO_OK: 'EdEli/Banco procesado'
};

/** Reads the Config sheet (columns A=clave, B=valor) into an object. */
function getConfig_() {
  var sh = hoja_(HOJAS.CONFIG);
  var values = sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), 2).getValues();
  var cfg = {};
  values.forEach(function (r) {
    if (r[0]) cfg[String(r[0]).trim()] = r[1];
  });
  cfg.MES_INICIO = normalizarMes_(cfg.MES_INICIO) || '2025-10';
  cfg.SALDO_INICIAL = parseCOP_(cfg.SALDO_INICIAL) || 0;
  cfg.VALOR_ASEO = parseCOP_(cfg.VALOR_ASEO) || 0;
  cfg.DIAS_ANTES_FIN_MES = Number(cfg.DIAS_ANTES_FIN_MES) || 0;
  cfg.DIAS_CONCILIACION = Number(cfg.DIAS_CONCILIACION) || 5;
  cfg.BANCO_DESDE = aFecha_(cfg.BANCO_DESDE);
  cfg.BANCO_MONTO_MAX = parseCOP_(cfg.BANCO_MONTO_MAX) || 0;
  cfg.MULTA_DESDE = normalizarMes_(cfg.MULTA_DESDE) || '';
  cfg.MULTA_MORA = String(cfg.MULTA_MORA || '').trim();
  return cfg;
}

function setConfig_(clave, valor) {
  var sh = hoja_(HOJAS.CONFIG);
  var claves = sh.getRange(1, 1, sh.getLastRow(), 1).getValues();
  for (var i = 0; i < claves.length; i++) {
    if (claves[i][0] === clave) {
      sh.getRange(i + 1, 2).setValue(valor);
      return;
    }
  }
  sh.appendRow([clave, valor, '']);
}

function hoja_(nombre) {
  var sh = SpreadsheetApp.getActive().getSheetByName(nombre);
  if (!sh) throw new Error('No existe la hoja "' + nombre + '". Ejecute EdEli ▸ Configuración inicial.');
  return sh;
}

/** "YYYY-MM" for a Date in Bogotá time. */
function mesDe_(date) {
  return Utilities.formatDate(date, TZ, 'yyyy-MM');
}

/** Accepts a Date, "2026-02", "2026/2" or "febrero 2026" and returns "YYYY-MM" or null. */
function normalizarMes_(v) {
  if (!v) return null;
  if (Object.prototype.toString.call(v) === '[object Date]') return mesDe_(v);
  return parseMes_(String(v));
}

/** Payment deadline for a month: last day minus diasAntes, at 23:59:59 (script time zone). */
function fechaLimite_(mes, diasAntes) {
  var y = Number(mes.slice(0, 4));
  var m = Number(mes.slice(5, 7));
  return new Date(y, m, 0 - (diasAntes || 0), 23, 59, 59);
}

/** Accepts a Date or "yyyy-mm-dd" text; returns a Date or null. */
function aFecha_(v) {
  if (Object.prototype.toString.call(v) === '[object Date]') return isNaN(v) ? null : v;
  var m = String(v || '').match(/(20\d{2})-(\d{1,2})-(\d{1,2})/);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12) : null;
}

/**
 * Fees by coefficient (Reglamento art. 19.11): the monthly budget is
 * base x number of apartments, split by each apartment's coefficient (%).
 * aptos: [{apto, coef, codigo}] with coef like 12.95. When an apartment has a
 * payment code (1-9), its fee's last digit is replaced by that code so a bank
 * deposit identifies the apartment by amount alone. Returns [{apto, valor, nota}].
 */
function calcularCuotas_(base, aptos) {
  var n = aptos.length;
  var presupuesto = base * n;
  return aptos.map(function (a) {
    var exacto = Math.round(presupuesto * a.coef / 100);
    var valor = a.codigo ? Math.floor(exacto / 10) * 10 + Number(a.codigo) : exacto;
    return {
      apto: a.apto,
      valor: valor,
      nota: formatoCOP_(base) + ' × ' + n + ' = ' + formatoCOP_(presupuesto) + ' × ' +
        String(a.coef).replace('.', ',') + '% = ' + formatoCOP_(exacto) +
        (a.codigo ? ' → termina en ' + a.codigo + ' (código del apto): ' + formatoCOP_(valor) : '')
    };
  });
}

/** Apartment whose fee (any period) is exactly this amount, or '' if none / ambiguous. */
function aptoPorValor_(valor, cuotas) {
  var aptos = {};
  cuotas.forEach(function (c) { if (c.valor === valor) aptos[c.apto] = true; });
  var lista = Object.keys(aptos);
  return lista.length === 1 ? lista[0] : '';
}

/** Coefficient cell -> number: 12.95, "12,95", "12,95%" or 0.1295 (a % formatted cell). */
function parseCoef_(v) {
  if (v === '' || v === null || v === undefined) return null;
  var n = typeof v === 'number' ? v : Number(String(v).replace('%', '').replace(',', '.').trim());
  if (!isFinite(n) || n <= 0) return null;
  return n < 1 ? Math.round(n * 10000) / 100 : n;
}

/** Late fee: "10000" = fixed amount; "2%" = percent of the unpaid amount. */
function calcularMulta_(regla, saldoVencido) {
  if (!regla || saldoVencido <= 0) return 0;
  var r = String(regla).trim();
  if (/%$/.test(r)) {
    var pct = Number(r.replace('%', '').replace(',', '.'));
    return isFinite(pct) ? Math.round(saldoVencido * pct / 100) : 0;
  }
  return parseCOP_(r) || 0;
}

function sumarMeses_(mes, n) {
  var y = Number(mes.slice(0, 4));
  var m = Number(mes.slice(5, 7)) - 1 + n;
  y += Math.floor(m / 12);
  m = ((m % 12) + 12) % 12;
  return y + '-' + pad2_(m + 1);
}

/** Inclusive list of months from inicio to fin, both "YYYY-MM". */
function listaMeses_(inicio, fin) {
  var out = [];
  for (var m = inicio; m <= fin; m = sumarMeses_(m, 1)) out.push(m);
  return out;
}

var NOMBRES_MES_ = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** "2026-02" -> "Febrero 2026" */
function nombreMes_(mes) {
  var n = NOMBRES_MES_[Number(mes.slice(5, 7)) - 1];
  return n.charAt(0).toUpperCase() + n.slice(1) + ' ' + mes.slice(0, 4);
}

function formatoCOP_(n) {
  var v = Math.round(Number(n) || 0);
  var s = String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (v < 0 ? '-$' : '$') + s;
}

/** Reads a sheet with a header row into objects keyed by header; each has _fila. */
function leerTabla_(nombre) {
  var sh = hoja_(nombre);
  var data = sh.getDataRange().getValues();
  var headers = data.shift() || [];
  var filas = data.map(function (r, i) {
    var o = { _fila: i + 2 };
    headers.forEach(function (h, j) { o[h] = r[j]; });
    return o;
  }).filter(function (o) {
    return headers.some(function (h) { return o[h] !== '' && o[h] !== null; });
  });
  return { headers: headers, filas: filas, hoja: sh };
}

/** Appends an object as a row, matching keys to the header row. */
function agregarFila_(nombre, obj) {
  var sh = hoja_(nombre);
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  sh.appendRow(headers.map(function (h) {
    return obj[h] === undefined ? '' : obj[h];
  }));
}

function carpetaRaiz_() {
  var cfg = getConfig_();
  if (!cfg.CARPETA_DRIVE_ID) throw new Error('Falta CARPETA_DRIVE_ID en Config. Ejecute Configuración inicial.');
  return DriveApp.getFolderById(cfg.CARPETA_DRIVE_ID);
}

/** Gets or creates nested subfolders: subcarpeta_(['Soportes pagos', '2026-02']). */
function subcarpeta_(ruta) {
  var f = carpetaRaiz_();
  ruta.forEach(function (nombre) {
    var it = f.getFoldersByName(nombre);
    f = it.hasNext() ? it.next() : f.createFolder(nombre);
  });
  return f;
}

function etiqueta_(nombre) {
  return GmailApp.getUserLabelByName(nombre) || GmailApp.createLabel(nombre);
}

/** Pulls the bare address out of "Name <a@b.com>". */
function emailDe_(from) {
  var m = String(from || '').match(/<([^>]+)>/);
  return (m ? m[1] : String(from || '')).trim().toLowerCase();
}

function extension_(blob) {
  var name = blob.getName() || '';
  var dot = name.lastIndexOf('.');
  if (dot > 0) return name.slice(dot + 1).toLowerCase();
  var tipo = blob.getContentType() || '';
  if (tipo.indexOf('pdf') >= 0) return 'pdf';
  if (tipo.indexOf('png') >= 0) return 'png';
  return 'jpg';
}

/** Attachments that look like proof: images and PDFs, including inline images. */
function adjuntosUtiles_(message) {
  return message.getAttachments({ includeInlineImages: true }).filter(function (a) {
    var t = a.getContentType() || '';
    return (t.indexOf('image/') === 0 || t.indexOf('pdf') >= 0) && a.getSize() > 5000;
  });
}

/** Gmail message ids already recorded in a sheet's "Gmail ID" column. */
function idsRegistrados_(nombre) {
  var set = {};
  leerTabla_(nombre).filas.forEach(function (f) {
    if (f['Gmail ID']) set[f['Gmail ID']] = true;
  });
  return set;
}
