/**
 * Bank reconciliation with Bancolombia email alerts.
 *
 * Every incoming-money alert becomes a row in the Banco tab. Each soporte in
 * Pagos that is "Pendiente verificación" is matched to an unlinked bank row
 * with the same amount within DIAS_CONCILIACION days; when found, the payment
 * becomes "Verificado" automatically. A deposit whose amount is exactly an
 * apartment's fee (each fee ends in the apartment's payment code) creates the
 * payment by itself. Anything else stays "Sin soporte" for the admin.
 */

function procesarBanco_() {
  var cfg = getConfig_();
  var res = { movimientos: 0, verificados: 0 };
  if (!cfg.CONSULTA_BANCO) return res;
  var lbl = etiqueta_(LABELS.BANCO_OK);
  var vistos = idsRegistrados_(HOJAS.BANCO);
  var aptoPorNombre = mapaNombreBancoApto_();
  var cuotas = listaCuotas_();
  var desde = cfg.BANCO_DESDE ? Utilities.formatDate(cfg.BANCO_DESDE, TZ, 'yyyy/MM/dd') : cfg.MES_INICIO.replace('-', '/') + '/01';
  var q = cfg.CONSULTA_BANCO + ' -label:"' + LABELS.BANCO_OK + '" after:' + desde;

  GmailApp.search(q, 0, 100).forEach(function (thread) {
    thread.getMessages().forEach(function (msg) {
      if (vistos[msg.getId()]) return;
      var a = parseAlertaBancolombia_(msg.getSubject() + ' ' + msg.getPlainBody());
      if (!a.ingreso || !a.valor) return;
      if (cfg.BANCO_DESDE && msg.getDate() < cfg.BANCO_DESDE) return;
      if (cfg.BANCO_MONTO_MAX && a.valor > cfg.BANCO_MONTO_MAX) return;
      agregarFila_(HOJAS.BANCO, {
        'Fecha': msg.getDate(),
        'Valor': a.valor,
        'Remitente (banco)': a.remitente,
        'Apto sugerido': aptoPorValor_(a.valor, cuotas) || aptoPorNombre[normalizarTexto_(a.remitente)] || '',
        'Estado': ESTADO_BANCO.SIN_SOPORTE,
        'Pago vinculado': '',
        'Texto alerta': textoAlerta_(msg.getPlainBody()),
        'Gmail ID': msg.getId()
      });
      vistos[msg.getId()] = true;
      res.movimientos++;
    });
    thread.addLabel(lbl);
  });
  res.verificados = conciliar_();
  return res;
}

/** The meaningful sentence of an alert ("Bancolombia: Recibiste ..."), without image links. */
function textoAlerta_(cuerpo) {
  var t = String(cuerpo || '').replace(/\[[^\]]*\]/g, ' ').replace(/https?:\/\/\S+/g, ' ').replace(/\s+/g, ' ');
  var i = t.search(/Bancolombia:|Recibiste|Te transfirieron|Consignaci/i);
  return (i >= 0 ? t.slice(i) : t).trim().slice(0, 250);
}

var NOTA_BANCO = 'Creado desde alerta Bancolombia';

/**
 * 1) Pending soportes + deposit with the same amount -> Verificado.
 * 2) Deposits left whose amount is exactly an apartment's fee (it ends in the
 *    apartment's payment code) -> a Verificado payment is created, applied to
 *    that apartment's oldest unpaid month.
 * 3) A soporte arriving after (2) is attached to that payment instead of
 *    becoming a duplicate.
 * Returns how many payments were verified or created.
 */
function conciliar_() {
  var cfg = getConfig_();
  var pagos = leerTabla_(HOJAS.PAGOS);
  var banco = leerTabla_(HOJAS.BANCO);
  var colP = columnas_(pagos.headers);
  var colB = columnas_(banco.headers);
  var total = 0;

  emparejar_(pagos.filas, banco.filas, cfg.DIAS_CONCILIACION).forEach(function (p) {
    var fecha = Utilities.formatDate(aFecha_(p.mov['Fecha']), TZ, 'yyyy-MM-dd');
    pagos.hoja.getRange(p.pago._fila, colP['Estado']).setValue(ESTADO_PAGO.VERIFICADO);
    pagos.hoja.getRange(p.pago._fila, colP['Notas']).setValue(
      ((p.pago['Notas'] ? p.pago['Notas'] + ' ' : '') + 'Verificado automático con Bancolombia ' + fecha +
        (p.mov['Remitente (banco)'] ? ' (' + p.mov['Remitente (banco)'] + ')' : '') + '.').trim());
    p.mov['Estado'] = ESTADO_BANCO.CONCILIADO;
    banco.hoja.getRange(p.mov._fila, colB['Estado']).setValue(ESTADO_BANCO.CONCILIADO);
    banco.hoja.getRange(p.mov._fila, colB['Pago vinculado']).setValue(
      'Pagos fila ' + p.pago._fila + ' - Apto ' + p.pago['Apto'] + ' ' + normalizarMes_(p.pago['Mes aplicado']));
    p.pago['Estado'] = ESTADO_PAGO.VERIFICADO;
    total++;
  });

  emparejarDuplicados_(pagos.filas, cfg.DIAS_CONCILIACION).forEach(function (d) {
    pagos.hoja.getRange(d.pago._fila, colP['Soporte']).setValue(d.soporte['Soporte']);
    pagos.hoja.getRange(d.soporte._fila, colP['Estado']).setValue(ESTADO_PAGO.RECHAZADO);
    pagos.hoja.getRange(d.soporte._fila, colP['Notas']).setValue(
      'Duplicado: soporte adjuntado al pago de la fila ' + d.pago._fila + ' (ya verificado por el banco).');
  });

  var cuotas = listaCuotas_();
  var libres = banco.filas.filter(function (m) {
    return m['Estado'] === ESTADO_BANCO.SIN_SOPORTE && !m['Pago vinculado'] && aptoPorValor_(parseCOP_(m['Valor']), cuotas);
  });
  if (!libres.length) return total;
  var f = calcularFinanzas_();
  var asignado = {};
  libres.forEach(function (m) {
    var valor = parseCOP_(m['Valor']);
    var apto = aptoPorValor_(valor, cuotas);
    var fecha = aFecha_(m['Fecha']);
    var cuenta = f.cuentas.filter(function (c) { return c.apto === apto; })[0];
    if (!cuenta || !fecha) return;
    var mes = mesPendiente_(cuenta, mesDe_(fecha), asignado[apto] || {});
    asignado[apto] = asignado[apto] || {};
    asignado[apto][mes] = (asignado[apto][mes] || 0) + valor;
    agregarFila_(HOJAS.PAGOS, {
      'Fecha registro': new Date(),
      'Fecha pago': fecha,
      'Apto': apto,
      'Mes aplicado': mes,
      'Valor': valor,
      'Tipo': TIPO_PAGO.ORDINARIA,
      'Método': 'Transferencia',
      'Soporte': 'Alerta Bancolombia',
      'Remitente': m['Remitente (banco)'] || '',
      'Estado': ESTADO_PAGO.VERIFICADO,
      'Notas': NOTA_BANCO + ' (valor termina en el código del apto).'
    });
    var fila = hoja_(HOJAS.PAGOS).getLastRow();
    banco.hoja.getRange(m._fila, colB['Estado']).setValue(ESTADO_BANCO.CONCILIADO);
    banco.hoja.getRange(m._fila, colB['Pago vinculado']).setValue('Pagos fila ' + fila + ' - Apto ' + apto + ' ' + mes);
    total++;
  });
  return total;
}

/** All fee amounts by apartment (every period), for identifying deposits. */
function listaCuotas_() {
  return leerTabla_(HOJAS.CUOTAS).filas.map(function (f) {
    return { apto: String(f['Apto']), valor: parseCOP_(f['Cuota mensual']) || 0 };
  }).filter(function (c) { return c.valor; });
}

/**
 * Oldest month up to `hasta` whose fee is not yet covered (verified, soporte
 * pending, or already assigned in this run). If all are covered, the next
 * uncovered month after it (a prepayment).
 */
function mesPendiente_(cuenta, hasta, asignado) {
  var celdas = cuenta.celdas;
  for (var i = 0; i < celdas.length; i++) {
    var c = celdas[i];
    var cubierto = c.pagado + (c.conSoporte || 0) + (asignado[c.mes] || 0);
    if (c.cuota > 0 && cubierto < c.cuota && c.mes <= hasta) return c.mes;
  }
  var mes = sumarMeses_(hasta, 1);
  while (asignado[mes]) mes = sumarMeses_(mes, 1);
  return mes;
}

/**
 * Pure: pending soportes that duplicate a payment already created from a
 * bank alert (same apartment and amount, dates within `dias`).
 */
function emparejarDuplicados_(pagos, dias) {
  var usados = {};
  var out = [];
  var delBanco = pagos.filter(function (p) {
    return p['Estado'] === ESTADO_PAGO.VERIFICADO && String(p['Notas'] || '').indexOf(NOTA_BANCO) === 0 &&
      p['Soporte'] === 'Alerta Bancolombia';
  });
  pagos.filter(function (p) { return p['Estado'] === ESTADO_PAGO.PENDIENTE; }).forEach(function (s) {
    var fs = aFecha_(s['Fecha pago']);
    var match = delBanco.filter(function (b) {
      var fb = aFecha_(b['Fecha pago']);
      return !usados[b._fila] && String(b['Apto']) === String(s['Apto']) &&
        parseCOP_(b['Valor']) === parseCOP_(s['Valor']) && fs && fb && Math.abs(fs - fb) / 86400000 <= dias;
    })[0];
    if (match) { usados[match._fila] = true; out.push({ soporte: s, pago: match }); }
  });
  return out;
}

/**
 * Pure matching: pending payments x unlinked deposits with the same amount and
 * dates within `dias`. Prefers the deposit whose suggested apartment matches,
 * then the closest date. Each deposit is used once.
 */
function emparejar_(pagos, movimientos, dias) {
  var libres = movimientos.filter(function (m) {
    return m['Estado'] === ESTADO_BANCO.SIN_SOPORTE && !m['Pago vinculado'];
  });
  var usados = {};
  var pares = [];
  pagos.filter(function (p) { return p['Estado'] === ESTADO_PAGO.PENDIENTE; })
    .forEach(function (p) {
      var fp = aFecha_(p['Fecha pago']);
      var valor = parseCOP_(p['Valor']);
      if (!fp || !valor) return;
      var mejor = null;
      var mejorPuntaje = Infinity;
      libres.forEach(function (m) {
        if (usados[m._fila] || parseCOP_(m['Valor']) !== valor) return;
        var fm = aFecha_(m['Fecha']);
        if (!fm) return;
        var diff = Math.abs(fm - fp) / 86400000;
        if (diff > dias) return;
        var puntaje = diff - (String(m['Apto sugerido']) === String(p['Apto']) ? 100 : 0);
        if (puntaje < mejorPuntaje) { mejor = m; mejorPuntaje = puntaje; }
      });
      if (mejor) {
        usados[mejor._fila] = true;
        pares.push({ pago: p, mov: mejor });
      }
    });
  return pares;
}

/** Normalised "Nombre en banco" (Apartamentos) -> apartment. Several names: comma-separated. */
function mapaNombreBancoApto_() {
  var map = {};
  leerTabla_(HOJAS.APTOS).filas.forEach(function (f) {
    String(f['Nombre en banco'] || '').split(',').forEach(function (n) {
      if (n.trim()) map[normalizarTexto_(n.trim())] = String(f['Apto']);
    });
  });
  return map;
}

/** header -> 1-based column number */
function columnas_(headers) {
  var c = {};
  headers.forEach(function (h, i) { c[h] = i + 1; });
  return c;
}
