/**
 * Reads Gmail: payment proofs from owners (-> Pagos) and utility invoices
 * from Afinia / Acuacar (-> Gastos). Attachments are filed in Drive.
 * Runs every hour from a trigger, or from the EdEli menu.
 */

function procesarCorreos() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;
  try {
    var r1 = procesarSoportes_();
    var r2 = procesarFacturas_();
    return 'Soportes nuevos: ' + r1.nuevos + ' (por revisar: ' + r1.revisar + '). ' +
      'Facturas nuevas: ' + r2.nuevas + ' (sin valor detectado: ' + r2.sinValor + ').';
  } finally {
    lock.releaseLock();
  }
}

function procesarSoportes_() {
  var cfg = getConfig_();
  var lblOk = etiqueta_(LABELS.SOPORTE_OK);
  var lblRev = etiqueta_(LABELS.SOPORTE_REVISAR);
  var consulta = (cfg.CONSULTA_SOPORTES || 'subject:soporte') +
    ' -label:"' + LABELS.SOPORTE_OK + '" -label:"' + LABELS.SOPORTE_REVISAR + '"' +
    ' after:' + cfg.MES_INICIO.replace('-', '/') + '/01';
  var propio = Session.getEffectiveUser().getEmail().toLowerCase();
  var aptoPorEmail = mapaEmailApto_();
  var vistos = idsRegistrados_(HOJAS.PAGOS);
  var res = { nuevos: 0, revisar: 0 };

  GmailApp.search(consulta, 0, 50).forEach(function (thread) {
    var hayRevisar = false;
    thread.getMessages().forEach(function (msg) {
      if (vistos[msg.getId()]) return;
      var remitente = emailDe_(msg.getFrom());
      if (remitente === propio) return; // our own replies / acknowledgements

      var p = parseSoporte_(msg.getSubject(), msg.getPlainBody());
      var apto = p.apto || aptoPorEmail[remitente] || '';
      var mes = p.mes || mesDe_(msg.getDate());
      var adjuntos = adjuntosUtiles_(msg);
      var links = guardarAdjuntos_(adjuntos, ['Soportes pagos', mes],
        mes + '_Apto' + (apto || 'SIN') + '_' + Utilities.formatDate(msg.getDate(), TZ, 'yyyyMMdd'));

      var problemas = [];
      if (!apto) problemas.push('sin apartamento');
      if (!p.valor) problemas.push('sin valor');
      if (!adjuntos.length) problemas.push('sin adjunto');
      var estado = problemas.length ? ESTADO_PAGO.REVISAR : ESTADO_PAGO.PENDIENTE;

      agregarFila_(HOJAS.PAGOS, {
        'Fecha registro': new Date(),
        'Fecha pago': msg.getDate(),
        'Apto': apto,
        'Mes aplicado': mes,
        'Valor': p.valor || '',
        'Tipo': TIPO_PAGO.ORDINARIA,
        'Método': 'Transferencia',
        'Soporte': links.join('\n'),
        'Remitente': remitente,
        'Estado': estado,
        'Notas': problemas.length ? 'Revisar: ' + problemas.join(', ') + '. Asunto: ' + msg.getSubject() : '',
        'Gmail ID': msg.getId()
      });
      vistos[msg.getId()] = true;
      res.nuevos++;
      if (problemas.length) { res.revisar++; hayRevisar = true; }

      if (String(cfg.ENVIAR_ACUSE).toUpperCase() === 'SI' && !problemas.length) {
        msg.reply('Hola, recibimos su soporte de pago del apartamento ' + apto + ' para ' +
          nombreMes_(mes) + ' por ' + formatoCOP_(p.valor) + '. Queda pendiente de verificación ' +
          'por la administración.\n\n' + (cfg.NOMBRE_EDIFICIO || '') + ' - mensaje automático');
      }
    });
    thread.addLabel(hayRevisar ? lblRev : lblOk);
  });
  return res;
}

function procesarFacturas_() {
  var cfg = getConfig_();
  var lbl = etiqueta_(LABELS.FACTURA_OK);
  var vistos = idsRegistrados_(HOJAS.GASTOS);
  var res = { nuevas: 0, sinValor: 0 };
  var fuentes = [
    { consulta: cfg.CONSULTA_AFINIA, categoria: CATEGORIA.ENERGIA, proveedor: 'Afinia' },
    { consulta: cfg.CONSULTA_ACUACAR, categoria: CATEGORIA.AGUA, proveedor: 'Acuacar' }
  ];
  fuentes.forEach(function (f) {
    if (!f.consulta) return;
    var q = f.consulta + ' -label:"' + LABELS.FACTURA_OK + '" after:' + cfg.MES_INICIO.replace('-', '/') + '/01';
    GmailApp.search(q, 0, 20).forEach(function (thread) {
      thread.getMessages().forEach(function (msg) {
        if (vistos[msg.getId()]) return;
        var mes = mesDe_(msg.getDate());
        var monto = parseMontoFactura_(msg.getSubject() + '\n' + msg.getPlainBody());
        var links = guardarAdjuntos_(adjuntosUtiles_(msg), ['Facturas', f.proveedor],
          mes + '_' + f.proveedor);
        agregarFila_(HOJAS.GASTOS, {
          'Fecha registro': new Date(),
          'Mes': mes,
          'Categoría': f.categoria,
          'Proveedor': f.proveedor,
          'Descripción': msg.getSubject(),
          'Valor': monto || '',
          'Soporte factura': links.join('\n'),
          'Estado': monto ? ESTADO_GASTO.POR_PAGAR : ESTADO_GASTO.REVISAR,
          'Notas': monto ? 'Valor leído del correo; confirmar con la factura.' : 'Escriba el valor según la factura adjunta.',
          'Gmail ID': msg.getId()
        });
        vistos[msg.getId()] = true;
        res.nuevas++;
        if (!monto) res.sinValor++;
      });
      thread.addLabel(lbl);
    });
  });
  return res;
}

/** Saves blobs to a Drive subfolder and returns their URLs. */
function guardarAdjuntos_(adjuntos, ruta, base) {
  if (!adjuntos.length) return [];
  var carpeta = subcarpeta_(ruta);
  return adjuntos.map(function (a, i) {
    var nombre = base + (adjuntos.length > 1 ? '_' + (i + 1) : '') + '.' + extension_(a);
    return carpeta.createFile(a.copyBlob().setName(nombre)).getUrl();
  });
}

/** owner email -> apartment, from the Emails column of Apartamentos. */
function mapaEmailApto_() {
  var map = {};
  leerTabla_(HOJAS.APTOS).filas.forEach(function (f) {
    String(f['Emails'] || '').split(/[,;\s]+/).forEach(function (e) {
      if (e) map[e.trim().toLowerCase()] = String(f['Apto']);
    });
  });
  return map;
}

/** Adds this month's cleaning cost once (called by tareaMensual or the menu). */
function registrarAseo_(mes) {
  var cfg = getConfig_();
  var ya = leerTabla_(HOJAS.GASTOS).filas.some(function (f) {
    return f['Categoría'] === CATEGORIA.ASEO && normalizarMes_(f['Mes']) === mes &&
      f['Estado'] !== ESTADO_GASTO.ANULADO;
  });
  if (ya) return false;
  agregarFila_(HOJAS.GASTOS, {
    'Fecha registro': new Date(),
    'Mes': mes,
    'Categoría': CATEGORIA.ASEO,
    'Proveedor': cfg.PROVEEDOR_ASEO || '',
    'Descripción': 'Servicio de aseo ' + nombreMes_(mes),
    'Valor': cfg.VALOR_ASEO || '',
    'Estado': cfg.VALOR_ASEO ? ESTADO_GASTO.POR_PAGAR : ESTADO_GASTO.REVISAR,
    'Notas': 'Registro automático mensual.'
  });
  return true;
}
