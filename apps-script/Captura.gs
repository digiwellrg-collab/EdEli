/**
 * "Captura": a grid for recording past payments quickly (e.g. live in the
 * assembly). Mark a month with x (= that month's fee) or type an amount, add
 * a credit or a note, then EdEli ▸ Registrar captura. Each mark becomes a row
 * in Pagos (Declarado or Verificado), notes go to Apartamentos ▸ Notas, and
 * the grid is cleared. Months already covered are skipped (no duplicates).
 */

var CAPTURA_EXTRA = ['Crédito valor', 'Crédito mes (AAAA-MM)', 'Crédito descripción', 'Nota (se guarda en Apartamentos)'];

/** Creates or refreshes the grid (keeps nothing: run it before typing). */
function prepararCaptura() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(HOJAS.CAPTURA) || ss.insertSheet(HOJAS.CAPTURA);
  sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).breakApart();
  sh.clear();
  var cfg = getConfig_();
  var meses = listaMeses_(cfg.MES_INICIO, mesDe_(new Date()));
  var aptos = leerTabla_(HOJAS.APTOS).filas.filter(function (f) { return f['Apto'] !== ''; })
    .map(function (f) { return [String(f['Apto']), f['Propietario'] || '']; })
    .sort(function (a, b) { return a[0] < b[0] ? -1 : 1; });
  var enc = ['Apto', 'Propietario'].concat(meses).concat(CAPTURA_EXTRA);
  sh.getRange(1, 1, 1, enc.length).setNumberFormat('@').setValues([enc])
    .setFontWeight('bold').setBackground('#e8eaed').setWrap(true);
  sh.getRange(2, 1, aptos.length, 1).setNumberFormat('@');
  sh.getRange(2, 1, aptos.length, 2).setValues(aptos).setBackground('#f3f3f3');
  sh.getRange(2, 3, aptos.length, meses.length).setHorizontalAlignment('center').setBackground('#fffde7');
  sh.getRange(2, 3 + meses.length + 1, aptos.length, 1).setNumberFormat('@');
  sh.setColumnWidths(3, meses.length, 70);
  sh.setColumnWidth(3 + meses.length + 2, 220);
  sh.setColumnWidth(3 + meses.length + 3, 260);
  sh.setFrozenRows(1);
  sh.setFrozenColumns(2);
  var r = aptos.length + 3;
  sh.getRange(r, 1, 5, 1).setValues([
    ['Cómo usar: escriba x en cada mes pagado (= la cuota de ese mes) o el valor si fue distinto.'],
    ['Crédito: gasto del edificio pagado por el propietario (ej. factura de Acuacar). Se descuenta de lo que debe y se registra también en Gastos.'],
    ['Nota: queda guardada en Apartamentos ▸ Notas y aparece en el Historial.'],
    ['Luego: EdEli ▸ Registrar captura. Pregunta si es Declarado (sin soporte) o Verificado, y limpia esta hoja.'],
    ['Los meses que ya tienen pago registrado se omiten, para no duplicar.']
  ]).setFontStyle('italic');
  ss.setActiveSheet(sh);
}

function registrarCaptura() {
  var ui = SpreadsheetApp.getUi();
  var sh = SpreadsheetApp.getActive().getSheetByName(HOJAS.CAPTURA);
  if (!sh) { prepararCaptura(); ui.alert('Hoja Captura creada. Márquela y vuelva a ejecutar Registrar captura.'); return; }
  var r = ui.prompt('Registrar captura',
    '¿Cómo quedan estos pagos?\n  D = Declarado (sin soporte)\n  V = Verificado (soporte revisado o aceptado en asamblea)',
    ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var resp = r.getResponseText().trim().toUpperCase();
  if (resp !== 'D' && resp !== 'V') { ui.alert('Escriba D o V.'); return; }
  var estado = resp === 'V' ? ESTADO_PAGO.VERIFICADO : ESTADO_PAGO.DECLARADO;

  var datos = sh.getDataRange().getValues();
  var enc = datos[0].map(String);
  var f = calcularFinanzas_();
  var hoyTxt = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  var res = registrosCaptura_(datos, f, estado, hoyTxt);

  res.pagos.forEach(function (p) { agregarFila_(HOJAS.PAGOS, p); });
  res.gastos.forEach(function (g) { agregarFila_(HOJAS.GASTOS, g); });
  var aptos = leerTabla_(HOJAS.APTOS);
  var colNotas = aptos.headers.indexOf('Notas') + 1;
  Object.keys(res.notas).forEach(function (apto) {
    var fila = aptos.filas.filter(function (x) { return String(x['Apto']) === apto; })[0];
    if (fila && colNotas) aptos.hoja.getRange(fila._fila, colNotas).setValue(res.notas[apto]);
  });

  // Clear the inputs (months + extra columns), keep apartments and help text.
  var n = datos.length - 1;
  var filasAptos = 0;
  for (var i = 1; i <= n && String(datos[i][0]).match(/^\d{3,4}$/); i++) filasAptos++;
  if (filasAptos) sh.getRange(2, 3, filasAptos, enc.length - 2).clearContent();
  actualizarResumen();
  ui.alert('Captura registrada',
    'Pagos creados: ' + res.pagos.length + ' (' + estado + ')\n' +
    'Gastos creados por créditos: ' + res.gastos.length + '\n' +
    'Notas guardadas: ' + Object.keys(res.notas).length +
    (res.omitidos.length ? '\n\nOmitidos (ya tenían pago registrado):\n' + res.omitidos.join('\n') : '') +
    (res.errores.length ? '\n\nNo entendidos:\n' + res.errores.join('\n') : ''),
    ui.ButtonSet.OK);
}

/**
 * Pure: turns the Captura grid (values incl. header row) into Pagos/Gastos
 * rows. f = calcularFinanzas_() result, used for fees and to skip months
 * already covered.
 */
function registrosCaptura_(datos, f, estado, hoyTxt) {
  var enc = datos[0].map(String);
  var colMes = [];
  enc.forEach(function (h, j) { var m = normalizarMes_(h); if (j >= 2 && m && /^\d{4}-\d{2}$/.test(h)) colMes.push({ j: j, mes: m }); });
  var iCredVal = enc.indexOf(CAPTURA_EXTRA[0]);
  var iCredMes = enc.indexOf(CAPTURA_EXTRA[1]);
  var iCredDesc = enc.indexOf(CAPTURA_EXTRA[2]);
  var iNota = enc.indexOf(CAPTURA_EXTRA[3]);
  var out = { pagos: [], gastos: [], notas: {}, omitidos: [], errores: [] };
  var nota = 'Registrado desde Captura ' + hoyTxt + '.';

  datos.slice(1).forEach(function (fila) {
    var apto = String(fila[0]).trim();
    if (!/^\d{3,4}$/.test(apto)) return;
    var cuenta = f.cuentas.filter(function (c) { return c.apto === apto; })[0];
    colMes.forEach(function (cm) {
      var v = String(fila[cm.j]).trim();
      if (!v) return;
      var celda = cuenta && cuenta.celdas.filter(function (c) { return c.mes === cm.mes; })[0];
      var cuota = celda ? celda.cuota : f.cuotaDe(apto, cm.mes);
      var valor = /^x$/i.test(v) || v === '✅' || v === '✓' ? cuota : parseCOP_(v);
      if (!valor) { out.errores.push('Apto ' + apto + ' ' + cm.mes + ': "' + v + '"'); return; }
      if (celda && celda.cuota > 0 && celda.pagado + celda.conSoporte + celda.declarado >= celda.cuota) {
        out.omitidos.push('Apto ' + apto + ' ' + cm.mes);
        return;
      }
      out.pagos.push({
        'Fecha registro': new Date(), 'Fecha pago': '', 'Apto': apto, 'Mes aplicado': cm.mes, 'Valor': valor,
        'Tipo': TIPO_PAGO.ORDINARIA, 'Método': 'No especificado', 'Soporte': '', 'Remitente': '',
        'Estado': estado, 'Notas': nota
      });
    });
    var cred = iCredVal >= 0 ? parseCOP_(String(fila[iCredVal]).trim()) : null;
    if (cred) {
      var mesCred = (iCredMes >= 0 && normalizarMes_(fila[iCredMes])) || hoyTxt.slice(0, 7);
      var desc = iCredDesc >= 0 ? String(fila[iCredDesc]).trim() : '';
      out.pagos.push({
        'Fecha registro': new Date(), 'Fecha pago': '', 'Apto': apto, 'Mes aplicado': mesCred, 'Valor': cred,
        'Tipo': TIPO_PAGO.CREDITO, 'Método': 'Pago directo de gasto', 'Soporte': '', 'Remitente': '',
        'Estado': estado, 'Notas': (desc ? desc + '. ' : '') + nota
      });
      var t = normalizarTexto_(desc);
      out.gastos.push({
        'Fecha registro': new Date(), 'Mes': mesCred,
        'Categoría': /acuacar|agua/.test(t) ? CATEGORIA.AGUA : /afinia|luz|energia/.test(t) ? CATEGORIA.ENERGIA : CATEGORIA.OTRO,
        'Proveedor': /acuacar/.test(t) ? 'Acuacar' : /afinia/.test(t) ? 'Afinia' : '',
        'Descripción': desc || 'Gasto pagado por el propietario del apto ' + apto, 'Valor': cred,
        'Estado': ESTADO_GASTO.PAGADO,
        'Notas': 'Pagado directamente por el propietario del apto ' + apto + ' (crédito a su cuenta). ' + nota
      });
    }
    var n = iNota >= 0 ? String(fila[iNota]).trim() : '';
    if (n) out.notas[apto] = n;
  });
  return out;
}
