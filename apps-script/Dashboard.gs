/**
 * Public dashboard data. The page itself is a static site on GitHub Pages
 * (repo edeli-ctg/edeli-ctg.github.io, source in web/ of this repo) that reads
 * this web app as JSON: ?formato=json. Serving the page from outside Google
 * avoids Google's multi-account bug ("unable to open the file") and the
 * Apps Script banner. Deploy: Implementar ▸ Nueva implementación ▸ App web,
 * ejecutar como "Yo", acceso "Cualquier persona".
 *
 * Privacy (Ley 1581 de 2012, habeas data): the data never includes owners'
 * names, emails, notes, individual debts, the Banco tab or the PDF reports.
 * Building totals only. The per-apartment colour grid is OFF unless Config
 * DASHBOARD_POR_APTO = SI, and even then carries states, not amounts.
 */

var CACHE_DASHBOARD = 'dashboard-v1';
var PANEL_URL_DEFECTO = 'https://edeli-ctg.github.io/';

function doGet(e) {
  var formato = e && e.parameter && e.parameter.formato;
  if (formato === 'json') {
    return ContentService.createTextOutput(jsonDashboard_()).setMimeType(ContentService.MimeType.JSON);
  }
  // Old links: point people to the public page.
  var url = panelUrl_();
  return HtmlService.createHtmlOutput(
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<div style="font:16px system-ui,sans-serif;max-width:480px;margin:48px auto;padding:0 16px;text-align:center">' +
    '<p>El panel de finanzas del edificio se mudó a:</p>' +
    '<p><a href="' + url + '" target="_top" style="font-size:18px">' + url + '</a></p></div>')
    .setTitle('Finanzas del edificio');
}

function jsonDashboard_() {
  var json = CacheService.getScriptCache().get(CACHE_DASHBOARD);
  if (!json) {
    var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
    if (id) SpreadsheetApp.setActiveSpreadsheet(SpreadsheetApp.openById(id));
    var f = calcularFinanzas_();
    json = JSON.stringify(datosDashboard_(f, mesDe_(new Date()), new Date()));
    CacheService.getScriptCache().put(CACHE_DASHBOARD, json, 600);
  }
  return json;
}

function panelUrl_() {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (id && !SpreadsheetApp.getActive()) SpreadsheetApp.setActiveSpreadsheet(SpreadsheetApp.openById(id));
  var url = '';
  try { url = String(getConfig_().PANEL_URL || ''); } catch (err) { url = ''; }
  return url || PANEL_URL_DEFECTO;
}

/** Remembers the spreadsheet (the web app has no "active" one) and refreshes the page data. */
function recordarHojaDashboard_() {
  var ss = SpreadsheetApp.getActive();
  if (ss) PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', ss.getId());
  CacheService.getScriptCache().remove(CACHE_DASHBOARD);
}

/**
 * Each month's expenses by category, in a fixed order so every category keeps
 * its colour on the page. Unknown categories fold into "Otro gasto".
 */
function composicionGastos_(meses, etiqueta) {
  var orden = [CATEGORIA.AGUA, CATEGORIA.ENERGIA, CATEGORIA.ASEO, CATEGORIA.REPARACION, CATEGORIA.OTRO];
  return {
    categorias: orden,
    meses: meses.map(function (m) {
      var valores = orden.map(function () { return 0; });
      Object.keys(m.porCategoria).forEach(function (k) {
        var i = orden.indexOf(k);
        valores[i >= 0 ? i : orden.length - 1] += m.porCategoria[k] || 0;
      });
      return { etiqueta: etiqueta(m.mes), total: m.gastos, valores: valores };
    })
  };
}

/**
 * Months already due (from MES_INICIO) with no payment reported at all for an
 * apartment: no verified payment, soporte or declared payment. A month paid
 * for less than the fee is not counted, so the count does not depend on the
 * fee basis (coefficient vs. flat) still to be settled by the assembly.
 */
function mesesSinPago_(c, cfg, hoy, ahora) {
  return c.celdas.filter(function (x) {
    return x.mes <= hoy && x.cuota > 0 && vencido_(x.mes, cfg, ahora) &&
      x.pagado + x.conSoporte + x.declarado <= 0;
  }).map(function (x) { return x.mes; });
}

var TRAMOS_MORA = [
  { hasta: 0, etiqueta: 'Al día' },
  { hasta: 1, etiqueta: '1 mes' },
  { hasta: 3, etiqueta: '2 a 3 meses' },
  { hasta: Infinity, etiqueta: '4 meses o más' }
];

function tramoMora_(n) {
  for (var i = 0; i < TRAMOS_MORA.length; i++) if (n <= TRAMOS_MORA[i].hasta) return i;
  return TRAMOS_MORA.length - 1;
}

/**
 * Pure: everything the page shows, from calcularFinanzas_(). Only aggregates;
 * no names or per-apartment amounts leave this function.
 */
function datosDashboard_(f, hoy, ahora) {
  var cfg = f.cfg;
  var meses = f.porMes.filter(function (m) { return m.mes <= hoy; });
  var etiqueta = function (mes) {
    var n = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    return n[Number(mes.slice(5, 7)) - 1] + ' ' + mes.slice(2, 4);
  };

  // Fees per month across apartments, split by evidence. Each apartment counts
  // at most its fee, so an overpayment doesn't hide someone else's gap.
  var recaudo = meses.map(function (m) {
    var r = { mes: m.mes, etiqueta: etiqueta(m.mes), esperado: 0, verificado: 0, soporte: 0, declarado: 0 };
    f.cuentas.forEach(function (c) {
      var x = c.celdas.filter(function (y) { return y.mes === m.mes; })[0];
      if (!x || x.cuota <= 0) return;
      var resto = x.cuota;
      var ver = Math.min(x.pagado, resto); resto -= ver;
      var sop = Math.min(x.conSoporte, resto); resto -= sop;
      var dec = Math.min(x.declarado, resto);
      r.esperado += x.cuota; r.verificado += ver; r.soporte += sop; r.declarado += dec;
    });
    r.pendiente = r.esperado - r.verificado - r.soporte - r.declarado;
    return r;
  });

  var deudas = f.cuentas.map(function (c) { return deudaVencida_(c, cfg, ahora); });
  var actual = recaudo[recaudo.length - 1] || { esperado: 0, verificado: 0 };
  var ultimo = meses[meses.length - 1] || { saldoFinal: cfg.SALDO_INICIAL };

  // Expenses: by category over the last 12 months, and the latest month with any.
  var ult12 = meses.slice(-12);
  var porCat = {};
  ult12.forEach(function (m) {
    Object.keys(m.porCategoria).forEach(function (k) { porCat[k] = (porCat[k] || 0) + m.porCategoria[k]; });
  });
  var categorias = Object.keys(porCat).filter(function (k) { return porCat[k] > 0; })
    .map(function (k) { return { nombre: k, valor: porCat[k] }; })
    .sort(function (a, b) { return b.valor - a.valor; });
  var conGasto = meses.filter(function (m) { return m.gastos > 0; });
  var mesGasto = conGasto.length ? conGasto[conGasto.length - 1] : null;
  var ult3 = conGasto.slice(-3);

  var aviso = cfg.DASHBOARD_AVISO === undefined
    ? 'Cuentas en reconstrucción desde octubre de 2025: las cifras son preliminares hasta que se registren todos los pagos y soportes.'
    : String(cfg.DASHBOARD_AVISO || '');

  var out = {
    edificio: cfg.NOMBRE_EDIFICIO || 'Edificio',
    actualizado: Utilities.formatDate(ahora, TZ, 'dd/MM/yyyy HH:mm'),
    aviso: aviso,
    kpis: {
      saldo: ultimo.saldoFinal,
      cobradoMes: actual.verificado,
      esperadoMes: actual.esperado,
      mesActual: actual.mes ? nombreMes_(actual.mes) : '',
      aptosAlDia: deudas.filter(function (d) { return d <= 0; }).length,
      aptosTotal: deudas.length,
      carteraTotal: deudas.reduce(function (s, d) { return s + Math.max(d, 0); }, 0),
      porVerificar: f.cuentas.reduce(function (s, c) { return s + c.pendiente; }, 0),
      gastoPromedio: ult3.length ? Math.round(ult3.reduce(function (s, m) { return s + m.gastos; }, 0) / ult3.length) : 0
    },
    flujo: meses.map(function (m) {
      return { etiqueta: etiqueta(m.mes), ingresos: m.ingresos, gastos: m.gastos, saldo: m.saldoFinal };
    }),
    recaudo: recaudo,
    categorias: categorias,
    composicion: composicionGastos_(meses, etiqueta),
    gastosMes: mesGasto ? {
      mes: nombreMes_(mesGasto.mes),
      filas: mesGasto.detalleGastos.map(function (g) {
        return { categoria: g.categoria, proveedor: g.proveedor, descripcion: g.descripcion, valor: g.valor };
      })
    } : null,
    aptos: null,
    mora: null,
    moraAptos: null
  };

  var sinPago = f.cuentas.map(function (c) { return mesesSinPago_(c, cfg, hoy, ahora); });
  out.mora = TRAMOS_MORA.map(function (t, i) {
    return { etiqueta: t.etiqueta, n: sinPago.filter(function (l) { return tramoMora_(l.length) === i; }).length };
  });

  if (String(cfg.DASHBOARD_POR_APTO || '').toUpperCase() === 'SI') {
    out.moraAptos = f.cuentas.map(function (c, i) {
      return { apto: c.apto, meses: sinPago[i].length, tramo: tramoMora_(sinPago[i].length), lista: sinPago[i].map(etiqueta) };
    });
    out.aptos = {
      meses: recaudo.map(function (r) { return r.etiqueta; }),
      filas: f.cuentas.map(function (c) {
        return {
          apto: c.apto,
          estados: c.celdas.filter(function (x) { return x.mes <= hoy; }).map(function (x) {
            var total = x.pagado + x.conSoporte + x.declarado;
            if (x.cuota <= 0) return '';
            if (x.pagado >= x.cuota) return 'ok';
            if (x.pagado + x.conSoporte >= x.cuota) return 'soporte';
            if (total >= x.cuota) return 'declarado';
            if (total > 0) return 'parcial';
            return vencido_(x.mes, cfg, ahora) ? 'pendiente' : 'futuro';
          })
        };
      })
    };
  }
  return out;
}
