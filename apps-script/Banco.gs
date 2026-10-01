/**
 * Bank reconciliation with Bancolombia email alerts.
 *
 * Every incoming-money alert becomes a row in the Banco tab. Each soporte in
 * Pagos that is "Pendiente verificación" is matched to an unlinked bank row
 * with the same amount within DIAS_CONCILIACION days; when found, the payment
 * becomes "Verificado" automatically. Bank money with no soporte stays in
 * Banco as "Sin soporte" so the admin can see who paid without reporting it.
 */

function procesarBanco_() {
  var cfg = getConfig_();
  var res = { movimientos: 0, verificados: 0 };
  if (!cfg.CONSULTA_BANCO) return res;
  var lbl = etiqueta_(LABELS.BANCO_OK);
  var vistos = idsRegistrados_(HOJAS.BANCO);
  var aptoPorNombre = mapaNombreBancoApto_();
  var q = cfg.CONSULTA_BANCO + ' -label:"' + LABELS.BANCO_OK + '" after:' + cfg.MES_INICIO.replace('-', '/') + '/01';

  GmailApp.search(q, 0, 100).forEach(function (thread) {
    thread.getMessages().forEach(function (msg) {
      if (vistos[msg.getId()]) return;
      var a = parseAlertaBancolombia_(msg.getSubject() + ' ' + msg.getPlainBody());
      if (!a.ingreso || !a.valor) return;
      agregarFila_(HOJAS.BANCO, {
        'Fecha': msg.getDate(),
        'Valor': a.valor,
        'Remitente (banco)': a.remitente,
        'Apto sugerido': aptoPorNombre[normalizarTexto_(a.remitente)] || '',
        'Estado': ESTADO_BANCO.SIN_SOPORTE,
        'Pago vinculado': '',
        'Texto alerta': (msg.getSubject() + ' | ' + msg.getPlainBody()).replace(/\s+/g, ' ').slice(0, 300),
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

/** Links pending soportes to bank deposits; returns how many were verified. */
function conciliar_() {
  var cfg = getConfig_();
  var pagos = leerTabla_(HOJAS.PAGOS);
  var banco = leerTabla_(HOJAS.BANCO);
  var pares = emparejar_(pagos.filas, banco.filas, cfg.DIAS_CONCILIACION);
  var colP = columnas_(pagos.headers);
  var colB = columnas_(banco.headers);
  pares.forEach(function (p) {
    var fecha = Utilities.formatDate(aFecha_(p.mov['Fecha']), TZ, 'yyyy-MM-dd');
    pagos.hoja.getRange(p.pago._fila, colP['Estado']).setValue(ESTADO_PAGO.VERIFICADO);
    pagos.hoja.getRange(p.pago._fila, colP['Notas']).setValue(
      ((p.pago['Notas'] ? p.pago['Notas'] + ' ' : '') + 'Verificado automático con Bancolombia ' + fecha +
        (p.mov['Remitente (banco)'] ? ' (' + p.mov['Remitente (banco)'] + ')' : '') + '.').trim());
    banco.hoja.getRange(p.mov._fila, colB['Estado']).setValue(ESTADO_BANCO.CONCILIADO);
    banco.hoja.getRange(p.mov._fila, colB['Pago vinculado']).setValue(
      'Pagos fila ' + p.pago._fila + ' - Apto ' + p.pago['Apto'] + ' ' + normalizarMes_(p.pago['Mes aplicado']));
  });
  return pares.length;
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
