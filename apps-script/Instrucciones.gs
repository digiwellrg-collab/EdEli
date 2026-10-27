/**
 * Builds the "Instrucciones" tab for owners (and a short admin section) from
 * the current Config, fees and apartments. Run again after changing Config:
 * EdEli ▸ Actualizar instrucciones.
 */

function actualizarInstrucciones() {
  var cfg = getConfig_();
  var sh = hoja_(HOJAS.INSTRUCCIONES);
  sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).breakApart();
  sh.clear();
  sh.setColumnWidth(1, 160);
  sh.setColumnWidth(2, 420);
  sh.setColumnWidth(3, 160);

  var mes = mesDe_(new Date());
  var cuotas = cuotasVigentes_(mes);
  var limites = [0, 1, 2].map(function (i) {
    var m = sumarMeses_(mes, i);
    return nombreMes_(m) + ': ' + Utilities.formatDate(fechaLimite_(m, cfg.DIAS_ANTES_FIN_MES), TZ, 'dd/MM/yyyy');
  }).join('   ·   ');
  var recargo = cfg.MULTA_MORA && cfg.MULTA_DESDE && cfg.MULTA_MORA !== '0'
    ? (/%$/.test(cfg.MULTA_MORA) ? 'un recargo del ' + cfg.MULTA_MORA + ' sobre el valor no pagado'
      : 'un recargo de ' + formatoCOP_(parseCOP_(cfg.MULTA_MORA)))
    : null;

  var filas = [];
  var estilos = [];
  function titulo(t) { filas.push([t, '', '']); estilos.push('titulo'); }
  function seccion(t) { filas.push(['', '', '']); estilos.push(''); filas.push([t, '', '']); estilos.push('seccion'); }
  function linea(a, b, c) { filas.push([a || '', b || '', c || '']); estilos.push(''); }
  function encabezado(a, b, c) { filas.push([a, b, c]); estilos.push('encabezado'); }

  titulo((cfg.NOMBRE_EDIFICIO || 'Edificio') + ' - Cómo pagar la administración');
  linea('Actualizado', Utilities.formatDate(new Date(), TZ, 'dd/MM/yyyy'));

  seccion('1. Fecha límite');
  linea('Vence', 'La cuota de cada mes se paga a más tardar ' + cfg.DIAS_ANTES_FIN_MES +
    ' días antes de terminar el mes.');
  linea('Próximas', limites);
  linea('Pago tardío', recargo
    ? 'Si el pago no está completo en la fecha límite, se cobra ' + recargo + ' en la cuota del mes siguiente.'
    : 'Sin recargo por ahora.');

  seccion('2. Cómo pagar (en efectivo)');
  linea('Pago', 'Entregue el valor de su cuota en efectivo a la administración.');
  linea('Recibo', 'Pida siempre un recibo de pago firmado, con apartamento, mes, valor y fecha.');
  if (cfg.CUENTA_PAGO && !/_{2,}/.test(String(cfg.CUENTA_PAGO))) linea('Otra opción', String(cfg.CUENTA_PAGO));

  seccion('3. Enviar el recibo (obligatorio)');
  linea('Para', String(cfg.EMAIL_SOPORTES || ''));
  linea('Asunto', 'Soporte | Apto ### | AAAA-MM | valor   (valor sin puntos ni signo $)');
  linea('Adjunto', 'Foto o PDF del recibo firmado.');
  linea('Importante', 'Un correo por cada mes pagado. Si paga dos meses, envíe dos correos (puede adjuntar el mismo recibo).');

  seccion('Su cuota de ' + nombreMes_(mes));
  encabezado('Apto', 'Cuota del mes', 'Asunto del correo');
  cuotas.forEach(function (c) {
    linea(c.apto, c.valor ? formatoCOP_(c.valor) : 'por definir', 'Soporte | Apto ' + c.apto + ' | ' + mes + ' | ' + (c.valor || 'valor'));
  });

  seccion('4. Qué pasa después');
  linea('1', 'El sistema lee su correo (cada hora), guarda el recibo en la carpeta del edificio y registra el pago como "por verificar".');
  linea('2', 'Al revisar el recibo, el pago queda Verificado.');
  linea('3', 'Puede ver el estado de las cuentas del edificio en el panel público y en la pestaña "Estado de cuenta".');
  linea('4', 'Cada mes se publica el informe con ingresos, gastos y saldo del edificio.');

  seccion('Para el administrador');
  linea('Diario', 'Nada: los correos con recibos y las facturas de servicios se procesan solos cada hora.');
  linea('Revisar', 'Pagos en rojo ("Revisar"): faltó apartamento, mes, valor o adjunto. Complételos a mano.');
  linea('Recibos', 'Pagos "Pendiente verificación": revise el recibo firmado (columna Soporte), ponga Método = Efectivo y cambie el estado a Verificado.');
  linea('Sin correo', 'Si alguien pagó y no envió el recibo: agregue la fila en Pagos a mano, con la foto del recibo en Soporte.');
  linea('Gastos', 'Al pagar una factura: ponga Fecha pago y cambie el estado a Pagado.');
  linea('Día 1', 'Se registra el aseo y se genera el informe PDF del mes anterior (carpeta Informes en Drive).');

  sh.getRange(1, 1, filas.length, 3).setValues(filas).setWrap(true).setVerticalAlignment('top');
  sh.getRange(1, 1, filas.length, 1).setFontWeight('bold');
  estilos.forEach(function (e, i) {
    var r = sh.getRange(i + 1, 1, 1, 3);
    if (e === 'titulo') { r.merge().setFontSize(16).setFontWeight('bold').setBackground('#1f4e79').setFontColor('#ffffff'); }
    if (e === 'seccion') { r.merge().setFontSize(12).setFontWeight('bold').setBackground('#dde8f3'); }
    if (e === 'encabezado') { r.setFontWeight('bold').setBackground('#e8eaed'); }
  });
  sh.setHiddenGridlines(true);
  SpreadsheetApp.getActive().setActiveSheet(sh);
  SpreadsheetApp.getActive().moveActiveSheet(1);
}

/** Fee in force for each active apartment in a month. */
function cuotasVigentes_(mes) {
  var cuotas = leerTabla_(HOJAS.CUOTAS).filas.map(function (f) {
    return { apto: String(f['Apto']), desde: normalizarMes_(f['Desde']) || '', valor: parseCOP_(f['Cuota mensual']) || 0 };
  }).sort(function (a, b) { return a.desde < b.desde ? -1 : 1; });
  return leerTabla_(HOJAS.APTOS).filas
    .filter(function (f) { return f['Apto'] !== '' && String(f['Activo']).toUpperCase() !== 'NO'; })
    .map(function (f) {
      var apto = String(f['Apto']);
      var v = 0;
      cuotas.forEach(function (c) { if (c.apto === apto && c.desde <= mes) v = c.valor; });
      return { apto: apto, valor: v };
    })
    .sort(function (a, b) { return a.apto < b.apto ? -1 : 1; });
}
