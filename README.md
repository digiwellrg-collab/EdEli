# EdEli

Cuentas e informes mensuales del Edificio Elizabeth (Cartagena): ingresos por cuotas
de administración, gastos (Afinia, Acuacar, aseo, reparaciones) y saldo que pasa de
mes a mes, desde octubre de 2025.

Funciona con una **Google Sheet + Google Apps Script**: no requiere servidor ni pagos.

- Los propietarios envían su soporte de pago por correo con un asunto estándar; el
  script lo guarda en Google Drive y lo registra en la hoja para verificación.
- Las facturas de Afinia y Acuacar que llegan por correo se archivan y registran solas.
- El aseo se registra cada mes; las reparaciones se agregan a mano.
- Cada mes se genera un informe PDF con el resumen, el detalle y el estado de cuenta
  por apartamento.

## Contenido

| Ruta | Qué es |
|---|---|
| [`apps-script/`](apps-script) | Código para pegar en Extensiones ▸ Apps Script de la hoja. |
| [`docs/GUIA_ADMINISTRADOR.md`](docs/GUIA_ADMINISTRADOR.md) | Instalación, flujo mensual y cambio de administrador/correo. |
| [`docs/INSTRUCCIONES_PROPIETARIOS.md`](docs/INSTRUCCIONES_PROPIETARIOS.md) | Mensaje para enviar a los propietarios. |
| [`tests/`](tests) | Pruebas (`node tests/run.js`). |
| `Administracion/` | Documentos de referencia del edificio. |
| [`Administracion/reglamento-1992.md`](Administracion/reglamento-1992.md) | Reglamento de copropiedad (transcripción OCR sin revisar; cotejar con el escaneo). |
