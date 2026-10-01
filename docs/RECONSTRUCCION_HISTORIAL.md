# Reconstruir el historial de pagos (octubre 2025 → hoy)

No existe una relación de pagos de este periodo. El objetivo es que cada pago quede
con **evidencia**, y que la asamblea vea con claridad qué está probado y qué no.

La pestaña **Historial de pagos** muestra cada apartamento × mes con el nivel de evidencia:

| Símbolo | Significa | Estado en Pagos |
|---|---|---|
| ✅ | Verificado: confirmado en el banco o soporte aceptado | `Verificado` |
| 📎 | El propietario envió soporte; falta revisarlo | `Pendiente verificación` / `Revisar` |
| 🗣 | Alguien dice que se pagó, sin soporte | `Declarado (sin soporte)` |
| ✗ | Nada reportado | — |

Y al final de cada fila dos saldos: **Debe (solo verificado)** y **Debe (si se acepta todo
lo reportado)**. La diferencia entre los dos es exactamente lo que hay que aclarar en la reunión.

## Paso 1 – Pedir los soportes a los propietarios

Mensaje sugerido (WhatsApp o correo):

> Buenos días, vecinos. Estamos organizando las cuentas del edificio desde octubre de 2025
> para presentarlas en la próxima asamblea. Como no contamos con una relación de pagos
> de este periodo, le pedimos a cada propietario enviar el soporte de **cada mes pagado desde
> octubre de 2025** (transferencia, Nequi, consignación o recibo de efectivo) a
> **juglic.co@gmail.com**, un correo por mes, con el asunto:
>
> `Soporte | Apto ### | AAAA-MM | valor`
>
> Ejemplo: `Soporte | Apto 302 | 2025-11 | 120000`
>
> Los pagos que no tengan soporte se revisarán en la asamblea. Muchas gracias.

Cada correo entra solo en **Pagos** como `Pendiente verificación` (📎).

## Paso 2 – Pedir la relación a la administración

La Ley 675 de 2001 (art. 51) le asigna al administrador llevar la contabilidad del edificio
y rendir cuentas documentadas de su gestión. Mensaje sugerido:

> Hola Andrés, buen día. Para la próxima asamblea estamos consolidando las cuentas desde
> octubre de 2025. ¿Nos puede compartir la relación de pagos de administración recibidos
> por apartamento y mes (valor, fecha y medio de pago), y los soportes de los gastos pagados?
> Con eso cruzamos la información con los soportes de los propietarios. Muchas gracias.

Cada pago que reporte se registra a mano en **Pagos** con `Estado = Declarado (sin soporte)`
(🗣) y en Notas `Según relación de administración, fecha ___`. Si viene con soporte
(extracto, comprobante), se pasa a `Verificado`.

## Paso 3 – Revisar

- Soporte que muestra la transferencia a la cuenta o Nequi del administrador de ese
  momento, o recibo firmado → cambiar a **Verificado**.
- Pagos repetidos (el propietario y la administración reportan el mismo pago) → deje uno y
  marque el otro **Rechazado** con la nota "duplicado de fila N".
- **EdEli ▸ Actualizar resumen y estado de cuenta** refresca el Historial.

## Paso 4 – En la asamblea

Proyecte o comparta la pestaña **Historial de pagos**:
1. Celdas naranja (🗣) y rojas (✗): cada propietario confirma o presenta su soporte.
2. Lo que se acepte sin soporte se deja `Declarado` o se pasa a `Verificado`, según lo que
   decida la asamblea, y se deja constancia en el acta.
3. El saldo **Debe (solo verificado)** de cada apartamento al cierre de la reunión queda
   como punto de partida oficial.
