/**
 * Monthly finances: running balance (cash basis), per-apartment account
 * status, and the monthly PDF report saved in Drive.
 *
 * Cash basis: a payment counts in the month of its "Fecha pago" once it is
 * Verificado; an expense counts in the month of its "Fecha pago" once it is
 * Pagado. Each month's closing balance is the next month's opening balance.
 */

function calcularFinanzas_(mesFin) {
  var cfg = getConfig_();
  var hoy = mesDe_(new Date());
  mesFin = mesFin || hoy;
  var meses = listaMeses_(cfg.MES_INICIO, mesFin > hoy ? mesFin : hoy);

  var aptos = leerTabla_(HOJAS.APTOS).filas
    .filter(function (f) { return String(f['Activo']).toUpperCase() !== 'NO' && f['Apto'] !== ''; })
    .map(function (f) {
      return {
        apto: String(f['Apto']), propietario: f['Propietario'] || '', notas: f['Notas'] || '',
        saldoAnterior: parseCOP_(f['Saldo anterior']) || 0
      };
    });

  var cuotas = leerTabla_(HOJAS.CUOTAS).filas.map(function (f) {
    return { apto: String(f['Apto']), desde: normalizarMes_(f['Desde']) || cfg.MES_INICIO, valor: parseCOP_(f['Cuota mensual']) || 0 };
  }).sort(function (a, b) { return a.desde < b.desde ? -1 : 1; });

  var pagos = leerTabla_(HOJAS.PAGOS).filas.map(function (f) {
    return {
      apto: String(f['Apto'] || ''),
      mesAplicado: normalizarMes_(f['Mes aplicado']),
      mesCaja: normalizarMes_(f['Fecha pago']) || normalizarMes_(f['Mes aplicado']),
      fecha: f['Fecha pago'],
      valor: parseCOP_(f['Valor']) || 0,
      tipo: f['Tipo'] || TIPO_PAGO.ORDINARIA,
      metodo: f['Método'] || '',
      estado: f['Estado']
    };
  });

  var gastos = leerTabla_(HOJAS.GASTOS).filas.map(function (f) {
    return {
      mes: normalizarMes_(f['Mes']),
      mesCaja: normalizarMes_(f['Fecha pago']) || normalizarMes_(f['Mes']),
      categoria: f['Categoría'] || CATEGORIA.OTRO,
      proveedor: f['Proveedor'] || '',
      descripcion: f['Descripción'] || '',
      valor: parseCOP_(f['Valor']) || 0,
      soporte: String(f['Soporte factura'] || '').split('\n')[0],
      estado: f['Estado']
    };
  });

  function cuotaDe(apto, mes) {
    var v = 0;
    cuotas.forEach(function (c) { if (c.apto === apto && c.desde <= mes) v = c.valor; });
    return v;
  }

  // Month-by-month cash flow.
  var saldo = cfg.SALDO_INICIAL;
  var porMes = meses.map(function (mes) {
    var ing = pagos.filter(function (p) { return p.estado === ESTADO_PAGO.VERIFICADO && p.mesCaja === mes; });
    var gas = gastos.filter(function (g) { return g.estado === ESTADO_GASTO.PAGADO && g.mesCaja === mes; });
    var porCategoria = {};
    objValores_(CATEGORIA).forEach(function (c) { porCategoria[c] = 0; });
    gas.forEach(function (g) { porCategoria[g.categoria] = (porCategoria[g.categoria] || 0) + g.valor; });
    var ingCuotas = suma_(ing.filter(function (p) { return p.tipo === TIPO_PAGO.ORDINARIA; }));
    var ingOtros = suma_(ing) - ingCuotas;
    var totalGastos = suma_(gas);
    var fila = {
      mes: mes,
      saldoInicial: saldo,
      ingresosCuotas: ingCuotas,
      ingresosOtros: ingOtros,
      ingresos: ingCuotas + ingOtros,
      porCategoria: porCategoria,
      gastos: totalGastos,
      saldoFinal: saldo + ingCuotas + ingOtros - totalGastos,
      porVerificar: suma_(pagos.filter(function (p) {
        return porVerificar_(p.estado) && p.mesCaja === mes;
      })),
      porPagar: suma_(gastos.filter(function (g) {
        return (g.estado === ESTADO_GASTO.POR_PAGAR || g.estado === ESTADO_GASTO.REVISAR) && g.mes === mes;
      })),
      detalleIngresos: ing,
      detalleGastos: gas
    };
    saldo = fila.saldoFinal;
    return fila;
  });

  // Per-apartment dues: what each unit owed vs. paid, by month applied.
  var cuentas = aptos.map(function (a) {
    var celdas = meses.map(function (mes) {
      var pagado = suma_(pagos.filter(function (p) {
        return p.apto === a.apto && p.mesAplicado === mes && esCuota_(p.tipo) &&
          p.estado === ESTADO_PAGO.VERIFICADO;
      }));
      var pagadoMulta = suma_(pagos.filter(function (p) {
        return p.apto === a.apto && p.mesAplicado === mes && p.tipo === TIPO_PAGO.MULTA &&
          p.estado === ESTADO_PAGO.VERIFICADO;
      }));
      var delMes = function (estados) {
        return suma_(pagos.filter(function (p) {
          return p.apto === a.apto && p.mesAplicado === mes && esCuota_(p.tipo) &&
            estados.indexOf(p.estado) >= 0;
        }));
      };
      return {
        mes: mes, cuota: cuotaDe(a.apto, mes), pagado: pagado, multa: 0, pagadoMulta: pagadoMulta,
        conSoporte: delMes([ESTADO_PAGO.PENDIENTE, ESTADO_PAGO.REVISAR]),
        declarado: delMes([ESTADO_PAGO.DECLARADO])
      };
    });
    // Late fee: dues for a month not fully paid (verified) by its deadline are
    // charged a fee on the following month.
    if (cfg.MULTA_MORA && cfg.MULTA_DESDE) {
      var ahora = new Date();
      celdas.forEach(function (c, i) {
        if (c.cuota <= 0 || c.mes < cfg.MULTA_DESDE || !celdas[i + 1]) return;
        var limite = fechaLimite_(c.mes, cfg.DIAS_ANTES_FIN_MES);
        if (ahora <= limite) return;
        var aTiempo = suma_(pagos.filter(function (p) {
          var f = aFecha_(p.fecha);
          return p.apto === a.apto && p.mesAplicado === c.mes && esCuota_(p.tipo) &&
            p.estado === ESTADO_PAGO.VERIFICADO && f && f <= limite;
        }));
        celdas[i + 1].multa += calcularMulta_(cfg.MULTA_MORA, c.cuota - aTiempo);
      });
    }
    var otros = suma_(pagos.filter(function (p) {
      return p.apto === a.apto && !esCuota_(p.tipo) && p.tipo !== TIPO_PAGO.MULTA &&
        p.estado === ESTADO_PAGO.VERIFICADO;
    }));
    var creditos = suma_(pagos.filter(function (p) {
      return p.apto === a.apto && p.tipo === TIPO_PAGO.CREDITO && p.estado !== ESTADO_PAGO.RECHAZADO;
    }));
    var pendiente = suma_(pagos.filter(function (p) {
      return p.apto === a.apto && porVerificar_(p.estado);
    }));
    return {
      apto: a.apto, propietario: a.propietario, notas: a.notas, saldoAnterior: a.saldoAnterior,
      celdas: celdas, otros: otros, pendiente: pendiente, creditos: creditos
    };
  });

  return { cfg: cfg, meses: meses, porMes: porMes, cuentas: cuentas, cuotaDe: cuotaDe, pagos: pagos, gastos: gastos };
}

/** Money reported but not yet verified: soporte pending/to review, or declared without proof. */
function porVerificar_(estado) {
  return estado === ESTADO_PAGO.PENDIENTE || estado === ESTADO_PAGO.REVISAR || estado === ESTADO_PAGO.DECLARADO;
}

function suma_(lista) {
  return lista.reduce(function (s, x) { return s + (x.valor || 0); }, 0);
}

/**
 * Owed today: prior balance + fees and late fees of months already due -
 * verified payments (including prepaid months). Negative = credit in favour.
 */
function deudaVencida_(cuenta, cfg, ahora) {
  return cuenta.saldoAnterior + cuenta.celdas.reduce(function (s, c) {
    var cargo = vencido_(c.mes, cfg, ahora) ? c.cuota + c.multa : 0;
    return s + cargo - c.pagado - c.pagadoMulta;
  }, 0);
}

/** Owed through a month: prior balance + dues + late fees up to mes - verified payments of both. */
function deudaHasta_(cuenta, mes) {
  return cuenta.saldoAnterior + cuenta.celdas.reduce(function (s, c) {
    return c.mes <= mes ? s + c.cuota + c.multa - c.pagado - c.pagadoMulta : s;
  }, 0);
}

/** Rewrites the Resumen and Estado de cuenta tabs. */
function actualizarResumen() {
  var f = calcularFinanzas_();
  var cats = [CATEGORIA.ENERGIA, CATEGORIA.AGUA, CATEGORIA.ASEO, CATEGORIA.REPARACION, CATEGORIA.OTRO];
  var informes = linksInformes_();

  var res = hoja_(HOJAS.RESUMEN);
  res.clear();
  var enc = ['Mes', 'Saldo inicial', 'Cuotas', 'Otros ingresos', 'Total ingresos']
    .concat(cats).concat(['Total gastos', 'Saldo final', 'Ingresos por verificar', 'Gastos por pagar', 'Informe PDF']);
  var filas = f.porMes.map(function (m) {
    return [m.mes, m.saldoInicial, m.ingresosCuotas, m.ingresosOtros, m.ingresos]
      .concat(cats.map(function (c) { return m.porCategoria[c] || 0; }))
      .concat([m.gastos, m.saldoFinal, m.porVerificar, m.porPagar, informes[m.mes] || '']);
  });
  res.getRange(1, 1, 1, enc.length).setValues([enc]).setFontWeight('bold').setBackground('#e8eaed').setWrap(true);
  res.getRange(2, 1, filas.length, 1).setNumberFormat('@');
  res.getRange(2, 1, filas.length, enc.length).setValues(filas);
  res.getRange(2, 2, filas.length, enc.length - 2).setNumberFormat('$#,##0;[Red]-$#,##0');
  res.getRange(2, 5, filas.length, 1).setFontWeight('bold');
  res.getRange(2, 6 + cats.length, filas.length, 2).setFontWeight('bold');
  res.setFrozenRows(1);
  res.setFrozenColumns(1);
  res.getRange(filas.length + 3, 1).setValue('Actualizado: ' + Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm') +
    '. Ingresos y gastos se cuentan en el mes en que se recibieron/pagaron (solo Verificado / Pagado).');

  var est = hoja_(HOJAS.ESTADO);
  est.getRange(1, 1, est.getMaxRows(), est.getMaxColumns()).clearNote();
  est.clear();
  est.clearConditionalFormatRules();
  var hoy = mesDe_(new Date());
  var meses = f.meses.filter(function (m) { return m <= hoy; });
  var enc2 = ['Apto', 'Propietario', 'Debía antes de ' + f.cfg.MES_INICIO].concat(meses)
    .concat(['Cuotas vencidas', 'Recargos mora', 'Pagado (verificado)', 'Por verificar (📎 + 🗣)',
      'Debe a hoy', 'Debe si se acepta lo reportado', 'Otros aportes', 'Notas']);
  var filas2 = [], fondos = [], notas = [];
  f.cuentas.forEach(function (c) {
    var r = filaEstado_(c, f.cfg, hoy);
    filas2.push([c.apto, c.propietario, c.saldoAnterior].concat(r.celdas)
      .concat([r.cuotas, r.multas, r.pagado, r.porVerificar, r.debe, r.debe - r.porVerificar, c.otros, c.notas || '']));
    fondos.push(r.colores);
    notas.push(r.notas);
  });
  est.getRange(1, 1, 1, enc2.length).setValues([enc2]).setFontWeight('bold').setBackground('#e8eaed')
    .setWrap(true).setVerticalAlignment('middle');
  est.getRange(1, 4, 1, meses.length).setNumberFormat('@').setValues([meses]);
  if (filas2.length) {
    est.getRange(2, 1, filas2.length, 1).setNumberFormat('@');
    est.getRange(2, 1, filas2.length, enc2.length).setValues(filas2);
    est.getRange(2, 3, filas2.length, enc2.length - 3).setNumberFormat('$#,##0;[Red]-$#,##0');
    est.getRange(2, 4, filas2.length, meses.length).setBackgrounds(fondos).setNotes(notas);
    est.getRange(2, enc2.length - 3, filas2.length, 2).setFontWeight('bold');
    est.getRange(2, enc2.length, filas2.length, 1).setWrap(true).setFontSize(9);
  }
  est.setColumnWidth(enc2.length, 220);
  est.setFrozenRows(1);
  est.setFrozenColumns(2);

  var ley = filas2.length + 3;
  est.getRange(ley, 1, 6, 2).setValues([
    ['Cómo leerlo', 'Cada mes muestra lo pagado para ese mes (pase el cursor sobre la celda para ver el detalle). Se genera sola: no escriba aquí.'],
    ['Verde', 'Pagado y verificado (banco o soporte aceptado).'],
    ['Azul', 'Completo con soporte enviado; falta verificarlo (📎).'],
    ['Naranja', 'Completo solo con lo declarado, sin soporte (🗣).'],
    ['Amarillo / Rojo', 'Amarillo = pago parcial. Rojo = cuota vencida sin ningún pago reportado. Blanco = aún no vence.'],
    ['Saldos', '"Debe a hoy" cuenta solo lo verificado. "Debe si se acepta lo reportado" descuenta también lo enviado o declarado. ' +
      'Una cuota vence ' + f.cfg.DIAS_ANTES_FIN_MES + ' días antes de fin de mes. Actualizado: ' +
      Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm') + '.']
  ]);
  est.getRange(ley, 1, 6, 1).setFontWeight('bold');
  return f;
}

/**
 * Pure: one apartment's row in Estado de cuenta, months up to hoy. Each cell is
 * everything reported for that month, coloured by its weakest evidence:
 * green verified, blue soporte pending, orange declared only, yellow partial,
 * red due with nothing reported.
 */
function filaEstado_(c, cfg, hoy, ahora) {
  var r = { celdas: [], colores: [], notas: [], cuotas: 0, multas: 0, pagado: 0, porVerificar: c.pendiente };
  c.celdas.forEach(function (x) {
    if (x.mes > hoy) return;
    var vence = vencido_(x.mes, cfg, ahora);
    if (vence) { r.cuotas += x.cuota; r.multas += x.multa; }
    r.pagado += x.pagado + x.pagadoMulta;
    var total = x.pagado + x.conSoporte + x.declarado;
    var color = null;
    if (x.cuota > 0) {
      if (x.pagado >= x.cuota) color = '#d9ead3';
      else if (x.pagado + x.conSoporte >= x.cuota) color = '#cfe2f3';
      else if (total >= x.cuota) color = '#fce5cd';
      else if (total > 0) color = '#fff2cc';
      else if (vence) color = '#f4cccc';
    }
    var partes = [];
    if (x.pagado) partes.push('✅ Verificado ' + formatoCOP_(x.pagado));
    if (x.conSoporte) partes.push('📎 Soporte por verificar ' + formatoCOP_(x.conSoporte));
    if (x.declarado) partes.push('🗣 Declarado sin soporte ' + formatoCOP_(x.declarado));
    if (x.cuota > 0) partes.push('Cuota: ' + formatoCOP_(x.cuota));
    r.celdas.push(total);
    r.colores.push(color);
    r.notas.push(total ? partes.join('\n') : '');
  });
  r.debe = deudaVencida_(c, cfg, ahora);
  return r;
}

/** Builds the report for one month as a Google Doc + PDF in Drive/Informes/<año>. */
function generarInforme_(mes) {
  var f = actualizarResumen();
  var m = f.porMes.filter(function (x) { return x.mes === mes; })[0];
  if (!m) throw new Error('El mes ' + mes + ' está fuera del rango (desde ' + f.cfg.MES_INICIO + ').');
  var nombre = (f.cfg.NOMBRE_EDIFICIO || 'Edificio') + ' - Informe ' + mes;
  var carpeta = subcarpeta_(['Informes', mes.slice(0, 4)]);

  [nombre, nombre + '.pdf'].forEach(function (n) {
    var it = carpeta.getFilesByName(n);
    while (it.hasNext()) it.next().setTrashed(true);
  });

  var doc = DocumentApp.create(nombre);
  var body = doc.getBody();
  body.setMarginTop(40).setMarginBottom(40).setMarginLeft(50).setMarginRight(50);
  body.appendParagraph(f.cfg.NOMBRE_EDIFICIO || 'Edificio').setHeading(DocumentApp.ParagraphHeading.TITLE);
  body.appendParagraph('Informe financiero - ' + nombreMes_(mes)).setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph('Generado el ' + Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd') + '.').editAsText().setItalic(true);

  body.appendParagraph('1. Resumen del mes').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  tabla_(body, [
    ['Concepto', 'Valor'],
    ['Saldo inicial', formatoCOP_(m.saldoInicial)],
    ['(+) Cuotas de administración', formatoCOP_(m.ingresosCuotas)],
    ['(+) Otros ingresos', formatoCOP_(m.ingresosOtros)],
    ['(-) Gastos', formatoCOP_(m.gastos)],
    ['Saldo final (pasa al mes siguiente)', formatoCOP_(m.saldoFinal)]
  ], [5]);

  body.appendParagraph('2. Ingresos recibidos').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  if (m.detalleIngresos.length) {
    tabla_(body, [['Apto', 'Fecha', 'Concepto', 'Mes aplicado', 'Método', 'Valor']].concat(
      m.detalleIngresos.map(function (p) {
        return [p.apto, fechaCorta_(p.fecha), p.tipo, p.mesAplicado || '', p.metodo, formatoCOP_(p.valor)];
      })).concat([['Total', '', '', '', '', formatoCOP_(m.ingresos)]]), [-1]);
  } else {
    body.appendParagraph('No se registraron ingresos verificados este mes.');
  }

  body.appendParagraph('3. Gastos pagados').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  if (m.detalleGastos.length) {
    var t = tabla_(body, [['Categoría', 'Proveedor', 'Descripción', 'Valor']].concat(
      m.detalleGastos.map(function (g) {
        return [g.categoria, g.proveedor, g.descripcion, formatoCOP_(g.valor)];
      })).concat([['Total', '', '', formatoCOP_(m.gastos)]]), [-1]);
    m.detalleGastos.forEach(function (g, i) {
      if (g.soporte && g.descripcion) t.getCell(i + 1, 2).editAsText().setLinkUrl(g.soporte);
    });
  } else {
    body.appendParagraph('No se registraron gastos pagados este mes.');
  }

  body.appendParagraph('4. Estado de cuenta por apartamento').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  tabla_(body, [['Apto', 'Cuota ' + mes, 'Recargo mora', 'Pagado para ' + mes, 'Saldo pendiente acumulado']].concat(
    f.cuentas.map(function (c) {
      var celda = c.celdas.filter(function (x) { return x.mes === mes; })[0] || { cuota: 0, pagado: 0, multa: 0, pagadoMulta: 0 };
      return [c.apto, formatoCOP_(celda.cuota), formatoCOP_(celda.multa), formatoCOP_(celda.pagado + celda.pagadoMulta),
        formatoCOP_(deudaHasta_(c, mes))];
    })), []);

  body.appendParagraph('5. Pendientes').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph('Soportes recibidos por verificar: ' + formatoCOP_(m.porVerificar));
  body.appendParagraph('Facturas del mes por pagar: ' + formatoCOP_(m.porPagar));

  body.appendParagraph('Notas: los ingresos y gastos se cuentan en el mes en que se recibieron o pagaron. ' +
    'Los soportes de cada movimiento están en la carpeta de Google Drive del edificio.').editAsText().setItalic(true);
  doc.saveAndClose();

  var archivo = DriveApp.getFileById(doc.getId());
  archivo.moveTo(carpeta);
  var pdf = carpeta.createFile(archivo.getAs('application/pdf').setName(nombre + '.pdf'));
  guardarLinkInforme_(mes, pdf.getUrl());
  actualizarResumen();
  return { doc: archivo.getUrl(), pdf: pdf, url: pdf.getUrl() };
}

/** Appends a table; rows listed in negritas (negative = from the end) are bold. */
function tabla_(body, filas, negritas) {
  var t = body.appendTable(filas.map(function (r) {
    return r.map(function (c) { return c === null || c === undefined ? '' : String(c); });
  }));
  t.setBorderColor('#bbbbbb');
  var enc = t.getRow(0);
  for (var j = 0; j < enc.getNumCells(); j++) {
    enc.getCell(j).setBackgroundColor('#e8eaed').editAsText().setBold(true);
  }
  (negritas || []).forEach(function (i) {
    var fila = t.getRow(i < 0 ? filas.length + i : i);
    for (var k = 0; k < fila.getNumCells(); k++) fila.getCell(k).editAsText().setBold(true);
  });
  return t;
}

function fechaCorta_(v) {
  return Object.prototype.toString.call(v) === '[object Date]' ? Utilities.formatDate(v, TZ, 'yyyy-MM-dd') : String(v || '');
}

function linksInformes_() {
  var raw = PropertiesService.getDocumentProperties().getProperty('INFORMES');
  return raw ? JSON.parse(raw) : {};
}

function guardarLinkInforme_(mes, url) {
  var links = linksInformes_();
  links[mes] = url;
  PropertiesService.getDocumentProperties().setProperty('INFORMES', JSON.stringify(links));
}

/** Monthly trigger (day 1): adds this month's cleaning cost and the report for last month. */
function tareaMensual() {
  var hoy = mesDe_(new Date());
  registrarAseo_(hoy);
  procesarCorreos();
  generarInforme_(sumarMeses_(hoy, -1));
}
