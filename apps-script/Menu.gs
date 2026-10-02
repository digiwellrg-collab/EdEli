/**
 * "EdEli" menu in the spreadsheet, and the actions behind it.
 */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('EdEli')
    .addItem('Revisar correos ahora (soportes y facturas)', 'menuProcesarCorreos')
    .addItem('Actualizar resumen y estado de cuenta', 'menuActualizarResumen')
    .addSeparator()
    .addItem('Registrar aseo de un mes…', 'menuRegistrarAseo')
    .addItem('Generar informe de un mes…', 'menuGenerarInforme')
    .addItem('Enviar informe por correo…', 'menuEnviarInforme')
    .addSeparator()
    .addItem('Preparar hoja Captura (registrar pagos pasados)', 'prepararCaptura')
    .addItem('Registrar captura…', 'registrarCaptura')
    .addSeparator()
    .addItem('Calcular cuotas por coeficiente…', 'menuCalcularCuotas')
    .addItem('Actualizar instrucciones', 'actualizarInstrucciones')
    .addItem('Enlace del panel público', 'menuEnlacePanel')
    .addItem('Configuración inicial', 'configuracionInicial')
    .addToUi();
}

function menuProcesarCorreos() {
  var msg = procesarCorreos() || 'Otro proceso está revisando los correos; intente en un minuto.';
  actualizarResumen();
  SpreadsheetApp.getUi().alert(msg + '\n\nRevise las filas en rojo ("Revisar") en Pagos y Gastos.');
}

function menuActualizarResumen() {
  actualizarResumen();
  SpreadsheetApp.getActive().getSheetByName(HOJAS.RESUMEN).activate();
}

function menuEnlacePanel() {
  recordarHojaDashboard_();
  var datos = ScriptApp.getService().getUrl();
  SpreadsheetApp.getUi().alert('Panel público',
    'Enlace para los propietarios:\n' + panelUrl_() + '\n\n' +
    (datos ? 'Datos del panel (para la configuración de la página):\n' + datos + '?formato=json'
      : 'Los datos aún no están publicados. En el editor de Apps Script: Implementar ▸ Nueva implementación ▸ ' +
        'App web, ejecutar como "Yo", acceso "Cualquier persona".'),
    SpreadsheetApp.getUi().ButtonSet.OK);
}

function menuRegistrarAseo() {
  var mes = pedirMes_('Registrar aseo', mesDe_(new Date()));
  if (!mes) return;
  var ok = registrarAseo_(mes);
  SpreadsheetApp.getUi().alert(ok ? 'Aseo de ' + nombreMes_(mes) + ' registrado en Gastos.' : 'El aseo de ese mes ya estaba registrado.');
}

function menuGenerarInforme() {
  var mes = pedirMes_('Generar informe', sumarMeses_(mesDe_(new Date()), -1));
  if (!mes) return;
  var r = generarInforme_(mes);
  SpreadsheetApp.getUi().alert('Informe de ' + nombreMes_(mes) + ' listo:\n\nPDF: ' + r.url + '\n\nDocumento editable: ' + r.doc);
}

function menuEnviarInforme() {
  var ui = SpreadsheetApp.getUi();
  var cfg = getConfig_();
  var destinatarios = String(cfg.DESTINATARIOS_INFORME || '').trim();
  if (!destinatarios) {
    ui.alert('Escriba los correos en Config ▸ DESTINATARIOS_INFORME primero.');
    return;
  }
  var mes = pedirMes_('Enviar informe', sumarMeses_(mesDe_(new Date()), -1));
  if (!mes) return;
  var ok = ui.alert('Confirmar envío', 'Se enviará el informe de ' + nombreMes_(mes) + ' a:\n' + destinatarios, ui.ButtonSet.OK_CANCEL);
  if (ok !== ui.Button.OK) return;
  var r = generarInforme_(mes);
  GmailApp.sendEmail(destinatarios, (cfg.NOMBRE_EDIFICIO || 'Edificio') + ' - Informe financiero ' + nombreMes_(mes),
    'Buen día,\n\nAdjunto el informe financiero de ' + nombreMes_(mes) + '.\n\n' +
    'Recordatorio: envíe su soporte de pago a ' + cfg.EMAIL_SOPORTES +
    ' con el asunto "Soporte | Apto ### | AAAA-MM | valor".\n\nGracias,\nAdministración',
    { attachments: [r.pdf.getAs('application/pdf')] });
  ui.alert('Informe enviado.');
}

function pedirMes_(titulo, sugerido) {
  var ui = SpreadsheetApp.getUi();
  var r = ui.prompt(titulo, 'Mes (AAAA-MM). Deje vacío para usar ' + sugerido + ':', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return null;
  var txt = r.getResponseText().trim();
  var mes = txt ? parseMes_(txt) : sugerido;
  if (!mes) ui.alert('No entendí el mes "' + txt + '". Use el formato 2026-02.');
  return mes;
}
