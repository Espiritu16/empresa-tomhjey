# Facturación

Emisión y seguimiento de facturas y boletas mediante NubeFacT. Al armar una
venta, la persona elige el tipo de comprobante y queda guardado en el borrador;
al confirmarla, el sistema lo envía de inmediato. Administración configura las series y consulta la aceptación de
boletas; un vendedor puede emitir y reintentar solo comprobantes de sus propias
ventas.

## Antes de emitir

- La empresa debe tener un RUC válido.
- Configura por separado la serie F para facturas y B para boletas, con el
  siguiente correlativo que NubeFacT tiene habilitado. El sistema no permite
  retroceder un correlativo y conserva las series anteriores como inactivas.
- La venta se prepara desde Ventas o desde el asistente y se le asigna un único
  tipo de comprobante antes de confirmarla. Facturación no presenta ventas para
  emisión manual; muestra el estado, permite recuperar envíos y descargar el
  PDF.
- La factura
  requiere RUC válido del cliente; la boleta puede emitirse sin documento hasta
  el límite fiscal aplicado por la reserva.
- `NUBEFACT_RUTA`, `NUBEFACT_TOKEN`, `NUBEFACT_AMBIENTE` y
  `NUBEFACT_RUC_EMISOR` viven en el `.env.local` raíz para desarrollo local.
  El host de NubeFacT no identifica el ambiente: confirma con el proveedor que
  la ruta y el token son de pruebas antes de declarar `NUBEFACT_AMBIENTE=pruebas`.
- La emisión se bloquea si falta el ambiente, el RUC emisor o si ese RUC no
  coincide con el RUC de Empresa. Producción requiere además
  `NUBEFACT_PERMITIR_PRODUCCION=true`.
- Nunca expongas esas variables en `NEXT_PUBLIC_*`.

La Edge Function reserva el correlativo y persiste el payload antes de llamar a
NubeFacT. Si una respuesta es incierta, el reintento consulta el mismo número y
lo compara con los datos reservados antes de considerarlo propio. La factura
puede reflejar la aceptación informada durante el envío. Una boleta siempre
queda pendiente al enviarse: la consulta manual de aceptación se habilita
después de siete días y, si sigue pendiente, una vez al día. El panel presenta
el PDF solo cuando el proveedor devuelve un enlace HTTPS de NubeFacT.

Si falla la llamada después de confirmar la venta, el inventario no se vuelve a
descontar. La persona puede reintentar desde Facturación; la reserva conserva el
mismo correlativo y reconcilia una respuesta incierta antes de volver a emitir.

Esta entrega no habilita notas de crédito ni anulaciones fiscales.
