# Estado del proyecto EdEli (para continuar en una nueva sesión)

Actualizado: 27-oct-2026. Rama de trabajo: `claude/affectionate-mendel-9txgko`.

## Qué es
Cuentas del Edificio Elizabeth (Cartagena, 9 aptos: 101, 201, 202, 203, 301, 302, 303, 401, 402).
- **Hoja "EdEli Cuentas"** (Google Sheet, dueña juglic.co@gmail.com) + **Apps Script** (`apps-script/`, se sube con `clasp push -f` desde la raíz del repo).
- **Panel público:** https://edeli-ctg.github.io — página estática en el repo público `edeli-ctg/edeli-ctg.github.io` (fuente: `web/index.html` de este repo; se publica copiando el archivo). Pide los datos a la app web de Apps Script (`…/exec?formato=json`, implementación "EdEli Webpage 2"; actualizar siempre con *Gestionar implementaciones ▸ lápiz ▸ Nueva versión*, nunca una implementación nueva).
- Guías: `docs/GUIA_ADMINISTRADOR.md`, `docs/INSTRUCCIONES_PROPIETARIOS.md`, `docs/RECONSTRUCCION_HISTORIAL.md`. Archivos de importación: `datos/` (ver `datos/README.md`). Pruebas: `node tests/run.js`.
- El usuario (Alejandro Gómez, responde por 301, 303 y 401) trabaja en Windows/PowerShell en `C:\Projects\Asuntos CTG\EdEli`, interfaz de Google en inglés. Responderle en inglés; todo lo que ven los propietarios va en español.

## Decisiones tomadas
- **Pagos en efectivo** a la administración, siempre con recibo firmado; el propietario envía la foto del recibo a juglic.co@gmail.com (`Soporte | Apto ### | AAAA-MM | valor`). El edificio no usa cuenta bancaria: `CONSULTA_BANCO` y `CUENTA_PAGO` vacíos en Config; pestaña Banco vacía.
- **Cuotas por coeficiente** (Reglamento art. 19.11): $120.000 × 9 × coeficiente, **redondeadas hacia arriba al siguiente $100**, desde oct-2025: 101 $139.900 · 201 $136.100 · 202 $116.400 · 203 $100.800 · 301 $136.100 · 302 $116.400 · 303 $100.800 · 401 $100.800 · 402 $133.200. Se eliminó el "código de pago" 1–9. La administración (Andrés, apto 402) cobra $120.000 fijos sin aprobación de asamblea: el tema se discute en asamblea; tono neutral.
- En el panel se dice **"pendiente"**, no "atrasado" (sin recibo de caja del edificio no se puede afirmar mora). Un mes con cualquier pago reportado cuenta como pagado (no depende de cuota fija vs coeficiente).
- **Privacidad (Ley 1581):** el panel no muestra nombres, correos, notas ni saldos individuales; la cuadrícula por apartamento (`DASHBOARD_POR_APTO` = SI) muestra solo puntos de estado.
- Notas al pie del panel (fijas en `web/index.html`): ¹ aseo asumido en $170.000/mes desde ene-2026; ² el agua de sep-2026 ($336.792) la pagó el 303 (crédito a sus cuotas); ³ fuente de los pagos.

## Datos cargados
- Gastos ene–oct 2026 (Afinia y Acuacar del medidor del edificio, aseo asumido, extintor/candado/llave; oct: Afinia $67.300 pagado, Acuacar $336.765 por pagar, aseo por pagar).
- Pagos oct-2025 → sep-2026 según la presentación de la administración (abr-2026), su relación de pagos (oct-2026) y el chat con Andrés. Casi todo "Declarado (sin soporte)"; "Verificado" solo los pagos del 24/02/2026 de 301/303/401 (soportes por WhatsApp).
- 301: pagados oct–dic 2025 (Freddy Cova, $360.000 el 22/02/2026) y feb-2026; **ene-2026 no**; mar-2026 en adelante pendiente; conserva $480.000 de saldo anterior a oct-2025.
- 401: abr–ago 2026 pagados por Rodrigo López y Stella Robles; pendientes mar, sep, oct.
- 101: ene-2026 en adelante pendiente (fila del 16/04 marcada Rechazado).

## Pendiente para el usuario (al 27-oct-2026)
1. `git pull` + `clasp push -f`.
2. Hoja: **EdEli ▸ Configuración inicial** (borra la columna "Código pago" de Apartamentos).
3. **EdEli ▸ Calcular cuotas por coeficiente…** con `2025-10` (reemplaza las 9 cuotas por las redondeadas).
4. Importar `datos/pagos_303_credito_acuacar_sep2026.csv` en **Pagos** (con la pestaña Pagos abierta): Pagos debe terminar en la fila 85.
5. Verificar en el panel: saldo −$4.689.326 y 303 con mar–jun pagados.

## Ideas abiertas
- Pagos posteriores a oct-2026: recibos de los propietarios → Pagos (Pendiente → Verificado al revisar el recibo).
- Deuda de agua: convenio de pago con Acuacar ($6.386.298, 44 cuotas, aviso de suspensión mar-2026) — no aparece en el panel; se podría agregar una línea "Deudas del edificio".
- Confirmar con la administración los pagos de aseo mes a mes.
- Migrar el correo del sistema a edificioelizabethctg@gmail.com.
