/**
 * One-time setup (safe to run again): creates the tabs, Drive folders,
 * Gmail labels and automatic triggers.
 */

function encabezados_(nombre) {
  var h = {};
  h[HOJAS.CONFIG] = ['Clave', 'Valor', 'Descripción'];
  h[HOJAS.APTOS] = ['Apto', 'Propietario', 'Emails', 'Coeficiente (%)', 'Saldo anterior', 'Activo', 'Nombre en banco'];
  h[HOJAS.CUOTAS] = ['Apto', 'Desde', 'Cuota mensual', 'Notas'];
  h[HOJAS.PAGOS] = ['Fecha registro', 'Fecha pago', 'Apto', 'Mes aplicado', 'Valor', 'Tipo',
    'Método', 'Soporte', 'Remitente', 'Estado', 'Notas', 'Gmail ID'];
  h[HOJAS.GASTOS] = ['Fecha registro', 'Mes', 'Categoría', 'Proveedor', 'Descripción', 'Valor',
    'Fecha pago', 'Soporte factura', 'Soporte pago', 'Estado', 'Notas', 'Gmail ID'];
  h[HOJAS.BANCO] = ['Fecha', 'Valor', 'Remitente (banco)', 'Apto sugerido', 'Estado', 'Pago vinculado',
    'Texto alerta', 'Gmail ID'];
  return h[nombre];
}

var CONFIG_INICIAL = [
  ['NOMBRE_EDIFICIO', 'Edificio Elizabeth', 'Nombre que aparece en los informes.'],
  ['EMAIL_SOPORTES', 'juglic.co@gmail.com', 'Correo al que los propietarios envían los soportes de pago.'],
  ['MES_INICIO', '2025-10', 'Primer mes que lleva el sistema (YYYY-MM).'],
  ['SALDO_INICIAL', 0, 'Dinero del edificio en caja/cuenta al empezar MES_INICIO.'],
  ['VALOR_ASEO', 0, 'Valor mensual fijo del servicio de aseo.'],
  ['PROVEEDOR_ASEO', '', 'Nombre de la empresa o persona de aseo.'],
  ['CONSULTA_SOPORTES', 'subject:soporte', 'Búsqueda de Gmail que identifica los correos con soportes de pago.'],
  ['CONSULTA_AFINIA', 'from:afinia has:attachment', 'Búsqueda de Gmail para las facturas de energía.'],
  ['CONSULTA_ACUACAR', 'from:acuacar has:attachment', 'Búsqueda de Gmail para las facturas de agua.'],
  ['ENVIAR_ACUSE', 'NO', 'SI = responder automáticamente al propietario cuando llega su soporte.'],
  ['CUENTA_PAGO', 'Bancolombia Ahorros No. ____ a nombre de ____', 'Cuenta donde los propietarios pagan (aparece en Instrucciones).'],
  ['DIAS_ANTES_FIN_MES', 5, 'La cuota de cada mes vence este número de días antes del último día del mes.'],
  ['MULTA_MORA', 0, 'Recargo por pago tardío, se cobra el mes siguiente. "10000" = valor fijo; "2%" = % de lo vencido. 0 = sin recargo.'],
  ['MULTA_DESDE', '', 'Primer mes (AAAA-MM) en que se aplica el recargo. Vacío = no se aplica.'],
  ['CONSULTA_BANCO', 'from:notificacionesbancolombia.com', 'Búsqueda de Gmail para las alertas de Bancolombia.'],
  ['DIAS_CONCILIACION', 5, 'Días de diferencia máximos entre el soporte y la alerta del banco para emparejarlos.'],
  ['DESTINATARIOS_INFORME', '', 'Correos (separados por coma) que reciben el informe mensual.'],
  ['CARPETA_DRIVE_ID', '', 'Lo llena la configuración inicial: carpeta raíz en Google Drive.']
];

var APTOS_CONOCIDOS = ['101', '201', '202', '203', '301', '302', '303', '401', '402'];

function configuracionInicial() {
  var ss = SpreadsheetApp.getActive();
  ss.setSpreadsheetTimeZone(TZ);
  ss.setSpreadsheetLocale('es_CO');

  var nuevas = {};
  [HOJAS.CONFIG, HOJAS.APTOS, HOJAS.CUOTAS, HOJAS.PAGOS, HOJAS.GASTOS, HOJAS.BANCO].forEach(function (nombre) {
    var sh = ss.getSheetByName(nombre);
    if (!sh) {
      sh = ss.insertSheet(nombre);
      nuevas[nombre] = true;
    }
    var h = encabezados_(nombre);
    sh.getRange(1, 1, 1, h.length).setValues([h]).setFontWeight('bold').setBackground('#e8eaed');
    sh.setFrozenRows(1);
  });
  [HOJAS.INSTRUCCIONES, HOJAS.RESUMEN, HOJAS.ESTADO].forEach(function (nombre) {
    if (!ss.getSheetByName(nombre)) ss.insertSheet(nombre);
  });
  var hoja1 = ss.getSheetByName('Hoja 1') || ss.getSheetByName('Sheet1') || ss.getSheetByName('Hoja1');
  if (hoja1 && hoja1.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(hoja1);

  // Text formats must be set before writing "2025-10", or Sheets turns it into a date.
  aplicarFormatos_();

  if (nuevas[HOJAS.CONFIG]) {
    hoja_(HOJAS.CONFIG).getRange(2, 1, CONFIG_INICIAL.length, 3).setValues(CONFIG_INICIAL);
  } else {
    var existentes = getConfigClaves_();
    CONFIG_INICIAL.forEach(function (r) {
      if (!existentes[r[0]]) hoja_(HOJAS.CONFIG).appendRow(r);
    });
  }
  if (nuevas[HOJAS.APTOS]) {
    hoja_(HOJAS.APTOS).getRange(2, 1, APTOS_CONOCIDOS.length, 6).setValues(
      APTOS_CONOCIDOS.map(function (a) { return [a, '', '', '', 0, 'SI']; }));
  }
  if (nuevas[HOJAS.CUOTAS]) {
    hoja_(HOJAS.CUOTAS).getRange(2, 1, APTOS_CONOCIDOS.length, 4).setValues(
      APTOS_CONOCIDOS.map(function (a) { return [a, '2025-10', '', 'Llenar con la cuota vigente']; }));
  }

  crearCarpetas_();
  crearEtiquetas_();
  instalarDisparadores_();
  actualizarInstrucciones();

  SpreadsheetApp.getUi().alert(
    'EdEli configurado',
    'Siguientes pasos:\n' +
    '1. Hoja Apartamentos: propietarios, correos y nombre como aparece en Bancolombia.\n' +
    '2. Hoja Cuotas: valor de la cuota de cada apartamento desde 2025-10.\n' +
    '3. Hoja Config: CUENTA_PAGO, VALOR_ASEO y recargo por mora; luego EdEli ▸ Actualizar instrucciones.\n' +
    '4. Registre los pagos y gastos anteriores (octubre 2025 en adelante).\n' +
    'Los correos se revisan solos cada hora.',
    SpreadsheetApp.getUi().ButtonSet.OK);
}

function getConfigClaves_() {
  var sh = hoja_(HOJAS.CONFIG);
  var out = {};
  sh.getRange(1, 1, sh.getLastRow(), 1).getValues().forEach(function (r) { out[r[0]] = true; });
  return out;
}

function aplicarFormatos_() {
  var lista = function (valores) {
    return SpreadsheetApp.newDataValidation().requireValueInList(valores, true).setAllowInvalid(false).build();
  };
  hoja_(HOJAS.CONFIG).getRange('B:B').setNumberFormat('@');

  var aptos = hoja_(HOJAS.APTOS);
  aptos.getRange('A:A').setNumberFormat('@');
  aptos.getRange('E2:E').setNumberFormat('$#,##0');
  aptos.getRange('F2:F').setDataValidation(lista(['SI', 'NO']));

  var cuotas = hoja_(HOJAS.CUOTAS);
  cuotas.getRange('A:B').setNumberFormat('@');
  cuotas.getRange('C2:C').setNumberFormat('$#,##0');

  var pagos = hoja_(HOJAS.PAGOS);
  pagos.getRange('A2:B').setNumberFormat('yyyy-mm-dd');
  pagos.getRange('C:D').setNumberFormat('@');
  pagos.getRange('E2:E').setNumberFormat('$#,##0');
  pagos.getRange('F2:F').setDataValidation(lista(objValores_(TIPO_PAGO)));
  pagos.getRange('G2:G').setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(['Transferencia', 'Nequi', 'Efectivo', 'Consignación', 'Otro'], true)
      .setAllowInvalid(true).build());
  pagos.getRange('J2:J').setDataValidation(lista(objValores_(ESTADO_PAGO)));

  var gastos = hoja_(HOJAS.GASTOS);
  gastos.getRange('A2:A').setNumberFormat('yyyy-mm-dd');
  gastos.getRange('B:B').setNumberFormat('@');
  gastos.getRange('F2:F').setNumberFormat('$#,##0');
  gastos.getRange('G2:G').setNumberFormat('yyyy-mm-dd');
  gastos.getRange('C2:C').setDataValidation(lista(objValores_(CATEGORIA)));
  gastos.getRange('J2:J').setDataValidation(lista(objValores_(ESTADO_GASTO)));

  var banco = hoja_(HOJAS.BANCO);
  banco.getRange('A2:A').setNumberFormat('yyyy-mm-dd hh:mm');
  banco.getRange('B2:B').setNumberFormat('$#,##0');
  banco.getRange('D:D').setNumberFormat('@');
  banco.getRange('E2:E').setDataValidation(lista(objValores_(ESTADO_BANCO)));
  colorearEstado_(banco, 'E2:E', [
    [ESTADO_BANCO.CONCILIADO, '#d9ead3'], [ESTADO_BANCO.SIN_SOPORTE, '#fff2cc'], [ESTADO_BANCO.NO_EDIFICIO, '#cccccc']]);

  colorearEstado_(pagos, 'J2:J', [
    [ESTADO_PAGO.VERIFICADO, '#d9ead3'], [ESTADO_PAGO.PENDIENTE, '#fff2cc'],
    [ESTADO_PAGO.REVISAR, '#f4cccc'], [ESTADO_PAGO.RECHAZADO, '#cccccc']]);
  colorearEstado_(gastos, 'J2:J', [
    [ESTADO_GASTO.PAGADO, '#d9ead3'], [ESTADO_GASTO.POR_PAGAR, '#fff2cc'],
    [ESTADO_GASTO.REVISAR, '#f4cccc'], [ESTADO_GASTO.ANULADO, '#cccccc']]);
}

function colorearEstado_(sh, a1, pares) {
  var rango = sh.getRange(a1);
  var otras = sh.getConditionalFormatRules().filter(function (r) {
    return r.getRanges().every(function (x) { return x.getA1Notation() !== rango.getA1Notation(); });
  });
  var nuevas = pares.map(function (p) {
    return SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(p[0]).setBackground(p[1])
      .setRanges([rango]).build();
  });
  sh.setConditionalFormatRules(otras.concat(nuevas));
}

function objValores_(o) {
  return Object.keys(o).map(function (k) { return o[k]; });
}

function crearCarpetas_() {
  var cfg = getConfig_();
  var raiz = null;
  if (cfg.CARPETA_DRIVE_ID) {
    try { raiz = DriveApp.getFolderById(cfg.CARPETA_DRIVE_ID); } catch (e) { raiz = null; }
  }
  if (!raiz) {
    raiz = DriveApp.createFolder('EdEli - ' + (cfg.NOMBRE_EDIFICIO || 'Edificio'));
    setConfig_('CARPETA_DRIVE_ID', raiz.getId());
  }
  ['Soportes pagos', 'Facturas', 'Soportes gastos', 'Informes'].forEach(function (n) { subcarpeta_([n]); });
  ['Afinia', 'Acuacar', 'Aseo', 'Reparaciones'].forEach(function (n) { subcarpeta_(['Facturas', n]); });
}

function crearEtiquetas_() {
  Object.keys(LABELS).forEach(function (k) { etiqueta_(LABELS[k]); });
}

function instalarDisparadores_() {
  var funciones = ['procesarCorreos', 'tareaMensual'];
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (funciones.indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('procesarCorreos').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('tareaMensual').timeBased().onMonthDay(1).atHour(7).inTimezone(TZ).create();
}
