# Guía del administrador – EdEli

Sistema de cuentas del Edificio Elizabeth: una Google Sheet + un script (Apps Script)
que lee el correo, guarda los soportes en Google Drive y genera el informe mensual.

```
Propietario ──correo con soporte──▶ Gmail (juglic.co → edificioelizabethctg)
                                      │  cada hora
Afinia / Acuacar ──factura por correo─┤
                                      ▼
                         Google Sheet "EdEli Cuentas"
              Pagos · Gastos · Resumen · Estado de cuenta
                                      │  día 1 de cada mes
                                      ▼
                 Drive/EdEli/Informes/AAAA/Informe AAAA-MM.pdf
```

## 1. Instalación (una sola vez, ~15 min)

Hágalo con la cuenta que recibe los soportes (al inicio **juglic.co@gmail.com**).

1. En Google Drive: **Nuevo ▸ Hojas de cálculo de Google**. Nómbrela `EdEli Cuentas`.
2. En la hoja: **Extensiones ▸ Apps Script**.
3. Borre el contenido de `Código.gs`. Cree un archivo por cada uno de la carpeta
   [`apps-script/`](../apps-script) (botón **+ ▸ Secuencia de comandos**, mismo nombre
   sin `.gs`) y pegue su contenido:
   `Parse`, `Util`, `Setup`, `Correos`, `Banco`, `Instrucciones`, `Informe`, `Menu`.
4. Muestre `appsscript.json`: **Configuración del proyecto ▸ Mostrar el archivo de manifiesto**,
   y pegue el contenido de [`apps-script/appsscript.json`](../apps-script/appsscript.json).
5. Guarde (Ctrl+S). Vuelva a la hoja y recárguela: aparece el menú **EdEli**.
6. **EdEli ▸ Configuración inicial**. Google pedirá permisos (Gmail, Drive, Docs):
   *Configuración avanzada ▸ Ir a EdEli (no seguro) ▸ Permitir*. Es normal en scripts propios.

Esto crea las pestañas, la carpeta `EdEli - Edificio Elizabeth` en Drive, las etiquetas
de Gmail `EdEli/...` y dos tareas automáticas:
- **cada hora**: revisa correos nuevos (soportes y facturas);
- **día 1 de cada mes**: registra el aseo del mes y genera el informe del mes anterior.

### Actualizar el código (cada vez que cambie algo en GitHub)

El repositorio ya está vinculado al proyecto de Apps Script (`.clasp.json`). En la carpeta
del repositorio, en la terminal:

```
git pull
clasp push -f
```

Luego recargue la hoja. Si el cambio agrega pestañas o ajustes nuevos, ejecute
**EdEli ▸ Configuración inicial** (no borra datos).

Preparación única en un computador nuevo: instalar [Node.js](https://nodejs.org) (LTS),
`npm install -g @google/clasp`, activar la API en https://script.google.com/home/usersettings
y `clasp login` con la cuenta dueña de la hoja. Si PowerShell bloquea `clasp`:
`Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.

## 2. Datos iniciales

| Pestaña | Qué llenar |
|---|---|
| **Apartamentos** | Los 9 apartamentos (101, 201, 202, 203, 301, 302, 303, 401, 402), propietario, correo(s) desde los que envía soportes, coeficiente, y **Saldo anterior** (lo que debía al 1 de octubre de 2025; negativo si tenía saldo a favor). |
| **Cuotas** | La cuota mensual de cada apartamento y desde qué mes aplica. Si la asamblea cambia la cuota, **agregue una fila nueva** con el nuevo valor y el mes `Desde`; no borre la anterior, así el histórico queda correcto. |
| **Config** | `SALDO_INICIAL` (dinero del edificio al 1 de octubre de 2025), `VALOR_ASEO`, `PROVEEDOR_ASEO`, `DESTINATARIOS_INFORME`. |
| **Pagos** | Pagos de octubre 2025 a hoy que ya ocurrieron (a mano, ver abajo). |
| **Gastos** | Facturas de luz, agua, aseo y reparaciones de octubre 2025 a hoy. |

## 3. Flujo mensual

### Ingresos (cuotas)
1. El propietario paga y envía el soporte a **juglic.co@gmail.com** con el asunto
   `Soporte | Apto 401 | 2026-02 | 120000` (ver [instrucciones para propietarios](INSTRUCCIONES_PROPIETARIOS.md)).
2. En máximo una hora aparece una fila en **Pagos**:
   - amarilla `Pendiente verificación`: se leyó todo bien;
   - roja `Revisar`: faltó apartamento, valor o adjunto. Complete los datos a mano.
   El soporte queda en `Drive/EdEli/Soportes pagos/AAAA-MM/`.
3. Verifique contra el extracto bancario (o el dinero recibido) y cambie el estado a
   **Verificado**. Solo lo verificado cuenta en los informes.
4. **Pagos en efectivo**: agregue la fila a mano con `Método = Efectivo`, y en `Soporte`
   el link a la foto del recibo firmado.
5. Si un pago cubre varios meses, divídalo en una fila por mes (`Mes aplicado`).
6. **Arriendo de parqueadero** (p. ej. Sr. César): fila en Pagos con `Tipo = Arriendo parqueadero`
   y en `Apto` escriba `PARQ`. Cuenta como ingreso del edificio, no en el estado de cuenta.
7. Cuotas extraordinarias o aportes: cambie `Tipo` (no cuentan como cuota ordinaria en el
   estado de cuenta, pero sí como ingreso del edificio).

### Gastos
| Gasto | Cómo entra |
|---|---|
| **Energía – Afinia** | Automático si la factura llega al correo (ver sección 5). Se guarda el PDF y se intenta leer el "Total a pagar". |
| **Agua – Acuacar** | Igual que Afinia. |
| **Aseo** | Automático el día 1 con `VALOR_ASEO` (o menú **EdEli ▸ Registrar aseo de un mes**). |
| **Reparaciones / otros** | A mano en **Gastos**, con `Categoría = Reparación` y el link de la cuenta de cobro o factura. |

Cuando pague un gasto, ponga **Fecha pago** y cambie el estado a **Pagado** (y si quiere,
el link del comprobante en `Soporte pago`). Solo lo pagado cuenta en el saldo.

### Informe
- **Resumen**: una fila por mes: saldo inicial, ingresos, gastos por categoría, saldo final
  (que pasa al mes siguiente) y pendientes.
- **Estado de cuenta**: cuadrícula apartamento × mes (verde pagado, amarillo parcial,
  rojo sin pago) y lo que debe cada uno a hoy.
- El día 1 se genera solo el PDF del mes anterior en `Drive/EdEli/Informes/`. Para
  rehacerlo después de corregir datos: **EdEli ▸ Generar informe de un mes**.
- **EdEli ▸ Enviar informe por correo** lo envía a `DESTINATARIOS_INFORME` (pide confirmación).

### Transparencia con los propietarios
Comparta la hoja como **Lector** (solo ver) con los propietarios, o comparta solo la
carpeta `Informes`. No les dé permiso de edición.

### Conciliación automática con Bancolombia
1. En la app de Bancolombia active las **alertas y notificaciones por correo** para la
   cuenta que recibe los pagos, con destino al correo del sistema (juglic.co@gmail.com).
2. Cada alerta de dinero recibido se registra en la pestaña **Banco**.
3. Cada hora, cada soporte `Pendiente verificación` se empareja con un movimiento del
   banco del **mismo valor** y fecha cercana (`DIAS_CONCILIACION`). Si lo encuentra, el pago
   pasa solo a **Verificado** y el movimiento a **Conciliado**.
4. Movimientos `Sin soporte` = alguien pagó y no envió el correo. Si en Apartamentos llena
   **Nombre en banco** (como aparece en la alerta), el sistema sugiere el apartamento.
5. Movimientos que no son del edificio: márquelos `No es del edificio`.

> Si las alertas no se reconocen (la pestaña Banco queda vacía), reenvíe una alerta de
> ejemplo para ajustar `CONSULTA_BANCO` o el lector de alertas.

### Fecha límite y recargo por mora
- La cuota vence `DIAS_ANTES_FIN_MES` días antes del fin de mes (5 → 23 de febrero, 26 de marzo...).
- Si al vencimiento la cuota no está pagada y verificada completa, se cobra `MULTA_MORA` en el
  mes siguiente (`10000` = fijo; `2%` = porcentaje de lo no pagado), a partir de `MULTA_DESDE`.
- Por Ley 675 de 2001 (art. 30) el cobro por mora es interés de hasta 1,5 veces el interés
  bancario corriente, y debe estar aprobado por el reglamento o la asamblea. Active el recargo
  solo cuando esté aprobado.
- Los pagos de recargos se registran con `Tipo = Multa / interés de mora`.

### Instrucciones para propietarios
La pestaña **Instrucciones** se genera con los datos de Config (cuenta, fechas límite,
asunto listo para copiar por apartamento). Después de cambiar Config o Cuotas:
**EdEli ▸ Actualizar instrucciones**.

## 4. Cómo se calculan los números

- **Base de caja**: un ingreso cuenta en el mes de su `Fecha pago` y solo si está
  `Verificado`; un gasto cuenta en el mes de su `Fecha pago` (o su `Mes` si no tiene
  fecha) y solo si está `Pagado`.
- **Saldo final del mes = saldo inicial + ingresos − gastos**, y es el saldo inicial del
  mes siguiente. El primer saldo inicial es `SALDO_INICIAL`.
- **Debe a hoy** (por apartamento) = saldo anterior + cuotas de cada mes hasta hoy −
  pagos de cuota ordinaria verificados.

## 5. Facturas de Afinia y Acuacar

Los portales de Afinia y Acuacar piden usuario, contraseña y captcha, y no tienen un
servicio público para consultarlos. Un script que "raspe" la página se rompería con
cualquier cambio. Es más confiable que **las facturas lleguen por correo**:

1. Inscriba el correo del edificio para recibir la factura electrónica/digital en cada
   empresa (en su página web, en la oficina, o por la línea de atención), con el número
   de contrato/NIC del edificio.
2. Cuando llegue la primera, revise el remitente. Si no contiene `afinia` / `acuacar`,
   ajuste `CONSULTA_AFINIA` / `CONSULTA_ACUACAR` en Config (es una búsqueda de Gmail,
   p. ej. `from:facturacion@ejemplo.com has:attachment`).
3. Si el valor no se detecta (fila roja `Revisar valor`), ábralo desde `Soporte factura`
   y escríbalo a mano.

Si en algún momento quieren intentar la consulta automática en la web, se puede evaluar
aparte; requiere un servidor con navegador y se puede romper.

## 6. Pasar al correo del edificio (edificioelizabethctg@gmail.com)

Las tareas automáticas corren con la cuenta que hizo la configuración inicial. Para
cambiar de cuenta:

1. Con juglic.co: comparta la hoja y la carpeta `EdEli - Edificio Elizabeth` con
   edificioelizabethctg@gmail.com como **Editor**, y luego **transfiera la propiedad**.
2. En juglic.co: Gmail ▸ Configuración ▸ Reenvío: reenviar a edificioelizabethctg
   (para que lo que todavía llegue al correo viejo no se pierda).
3. Con edificioelizabethctg: abra la hoja, cambie `EMAIL_SOPORTES` en Config y ejecute
   **EdEli ▸ Configuración inicial** (crea las etiquetas y tareas en la cuenta nueva;
   no borra datos).
4. Con juglic.co: Apps Script ▸ **Activadores** ▸ borre los activadores viejos.
5. Avise a los propietarios del nuevo correo.

Lo mismo sirve cuando cambie el administrador del edificio.

## 7. Problemas frecuentes

| Síntoma | Solución |
|---|---|
| No aparece el menú EdEli | Recargue la hoja. Revise que pegó todos los archivos. |
| Un soporte no entró | El asunto debe contener "soporte". Revise que el correo no tenga la etiqueta `EdEli/Soporte procesado`; si la tiene, quítela y use **Revisar correos ahora**. |
| Fila duplicada | Bórrela, o márquela `Rechazado` (pagos) / `Anulado` (gastos). |
| "2025-10" se volvió fecha | Escriba el mes con un apóstrofe: `'2025-10`. El sistema también entiende fechas. |
| Error de permisos | Ejecute de nuevo **Configuración inicial** y acepte los permisos. |
