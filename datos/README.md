# Archivos para importar a la hoja

Se importan con Archivo ▸ Importar ▸ Subir ▸ **Agregar a la hoja actual**, con la pestaña indicada abierta. Ninguno tiene fila de encabezados.

| Archivo | Pestaña | Contenido |
|---|---|---|
| `gastos_edeli_2026.csv` | Gastos | Luz, agua y aseo ene–sep 2026 (ya importado el 2-oct-2026). |
| `pagos_declarados_admin.csv` | Pagos | Pagos de oct-2025 a abr-2026 según la presentación de la administración (estado de cuenta a 31/03/2026) y el chat con Andrés: "Declarado (sin soporte)", salvo los pagos del 24/02/2026 de 301, 303 y 401 (soporte enviado por WhatsApp), que van "Verificado". Incluye abonos al saldo anterior a oct-2025 (tipo "Abono a saldo anterior"). Los totales cuadran peso a peso con el estado de cuenta de la administración a 31/03/2026 (cuota de $120.000). El 301 se registra según Alejandro Gómez (pagado hasta dic-2025 y feb-2026; ene-2026 no); la administración aplicó esos mismos pagos a deuda anterior a oct-2025, por eso el total no cambia. |
| `gastos_admin_feb_abr_2026.csv` | Gastos | Extintor, candado y copia de llave (feb–abr 2026, según la misma presentación). |
| `pagos_solo_nuevas_filas.csv` | Pagos | Solo las 20 filas agregadas el 7-oct-2026 (301, 303, 401 y abonos a saldo anterior). Úselo si ya importó la primera versión de `pagos_declarados_admin.csv` (33 filas), para no duplicar. |
| `pagos_301_correccion.csv` | Pagos | Corrección del 301 (oct, nov, dic 2025 y feb 2026 pagados; ene 2026 no). Úselo solo si ya había importado las filas del 301 tipo "Abono a saldo anterior": bórrelas primero. |
