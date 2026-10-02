# EdEli

Cuentas e informes mensuales del Edificio Elizabeth (Cartagena): ingresos por cuotas
de administración, gastos (Afinia, Acuacar, aseo, reparaciones) y saldo que pasa de
mes a mes, desde octubre de 2025.

Funciona con una **Google Sheet + Google Apps Script**: no requiere servidor ni pagos.

- Los propietarios transfieren el valor exacto de su cuota; la alerta de Bancolombia
  registra el pago solo. Solo los pagos en efectivo (o por otro valor) requieren enviar
  el soporte por correo, que el script guarda en Google Drive y registra en la hoja.
- Las facturas de Afinia y Acuacar que llegan por correo se archivan y registran solas.
- El aseo se registra cada mes; las reparaciones se agregan a mano.
- Cada mes se genera un informe PDF con el resumen, el detalle y el estado de cuenta
  por apartamento.

## Contenido

| Ruta | Qué es |
|---|---|
| [`apps-script/`](apps-script) | Código para pegar en Extensiones ▸ Apps Script de la hoja. |
| [`docs/GUIA_ADMINISTRADOR.md`](docs/GUIA_ADMINISTRADOR.md) | Instalación, flujo mensual y cambio de administrador/correo. |
| [`docs/RECONSTRUCCION_HISTORIAL.md`](docs/RECONSTRUCCION_HISTORIAL.md) | Cómo reconstruir los pagos desde octubre 2025 para la asamblea. |
| [`docs/INSTRUCCIONES_PROPIETARIOS.md`](docs/INSTRUCCIONES_PROPIETARIOS.md) | Mensaje para enviar a los propietarios. |
| [`tests/`](tests) | Pruebas (`node tests/run.js`). |
| `Administracion/` | Documentos de referencia del edificio. |
