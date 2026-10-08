# Revisión diferencial — boletas y consulta de aceptación

**Fecha:** 8 de octubre de 2026

**Riesgo:** Alto — emisión fiscal, autenticación, privilegios de `service_role` y consulta externa.

**Base:** `7e8c61b` (`feat(facturacion): habilitar emision de facturas`).

**Alcance:** nueva serie B, emisión de boletas, espera y consulta manual de aceptación; también se revisó el comportamiento de factura existente.

## Resultado

**Hallazgos confirmados: 0.** El diff mantiene la autorización de administrador, reserva correlativo y consulta de aceptación en Postgres, llama a NubeFacT solo desde la Edge Function y no muestra una boleta como aceptada por el booleano de la respuesta de emisión.

**Confianza media.** Formato, lint, TypeScript, compilación y `deno check` pasaron. No se ejecutaron pruebas automatizadas ni se aplicó la migración a una base: el esquema local no está confirmado como desechable. El lint local del esquema tampoco valida esta migración pendiente.

## Evidencia y escenarios revisados

- `supabase/functions/facturacion/index.ts:80-104`: `autenticar()` y `exigirAdministrador()` se ejecutan antes de cada operación. El id del usuario viene de la sesión y la consulta se limita a `comprobanteId`; Postgres vuelve a verificar administrador activo, tipo `boleta`, estado `emitido` y plazo/frecuencia antes de reservarla (`supabase/migrations/20261008050019_habilitar_boletas.sql:162-183`).
- `supabase/migrations/20261008050019_habilitar_boletas.sql:7-16`, `:25-35` y `:88-91`: las funciones `SECURITY DEFINER` usan `search_path = ''`, nombres calificados, revisan el rol y conceden `EXECUTE` únicamente a `service_role`. La configuración valida B/F, correlativo positivo no decreciente y serializa el cambio con las reservas (`:38-73`).
- La consulta se reserva con bloqueo de fila y lease de dos minutos antes de ir a NubeFacT (`:169-196`); el estado limita la siguiente consulta a 24 horas (`:174-186`). Un resultado código 24 («no encontrada») se guarda como consulta sin resultado (`supabase/functions/facturacion/index.ts:121-131`, `:141-147`) y mantiene la boleta pendiente. Otros fallos no alteran la aceptación; el lease expira en dos minutos.
- La respuesta consultada se compara con el payload reservado (serie, número, total y fecha QR) antes de guardarla (`supabase/functions/facturacion/index.ts:133-139`). La respuesta inmediata de emisión va a `respuesta_proveedor`; la consulta va a `respuesta_consulta_sunat` (`supabase/migrations/20261008050019_habilitar_boletas.sql:125-142`, `:218-229`). Para boletas, el panel solo lee el segundo campo al mostrar aceptación (`src/funcionalidades/facturacion/pagina-facturacion.tsx:622-627`).
- La Edge Function permite factura o boleta, y el RPC existente reserva el tipo y la serie activa correspondientes. La serie B y la serie F se configuran por separado; no hay credenciales fiscales ni acceso al proveedor en el cliente Next.js.
- El análisis de referencias encontró 17 usos de las nuevas operaciones/configuración en la aplicación y el esquema; las llamadas al proveedor siguen concentradas en `supabase/functions/facturacion/`.
- El historial (`78143ca`) confirma que la reserva y la reconciliación por número ya eran invariantes del flujo previo. La extensión mantiene esa lógica y añade una consulta fiscal de solo lectura con su propio lease.

| Intento                                             | Control observado                                                        |
| --------------------------------------------------- | ------------------------------------------------------------------------ |
| Sesión anónima o vendedor intenta emitir/consultar  | La Edge Function exige sesión válida y administrador activo.             |
| Consulta antes del plazo                            | La RPC rechaza hasta siete días después de registrar el envío.           |
| Dos consultas simultáneas                           | La primera reserva un lease; la siguiente se rechaza.                    |
| Consulta pendiente repetida                         | Postgres impone un intervalo de 24 horas desde la última consulta.       |
| El proveedor devuelve un número ajeno               | La comparación QR impide guardar esa respuesta como propia.              |
| NubeFacT responde que no encuentra la boleta        | Se registra como «sin resultado», no como rechazo ni aceptación.         |
| La respuesta de emisión de una boleta dice aceptada | El panel no la toma como aceptación; espera el resultado de la consulta. |

## Límites de verificación

- No se probó el SQL ejecutando la migración. El formatter instalado no tiene parser SQL y el lint del esquema aplicado no cubre archivos pendientes. La migración necesita aplicarse y verificarse en un Supabase local confirmado como descartable antes de probar el flujo.
- No se ejecutaron pruebas automatizadas, solicitudes a NubeFacT ni emisión de comprobantes.
- La validación final de consulta diferida requiere datos y credenciales autorizados de sandbox; todavía no se ha confirmado el comportamiento real del endpoint de consulta tras siete días.

## Recomendación

**Listo para revisión del usuario; falta validación local y sandbox antes de emitir en operación real.** Verificar la migración y probar factura aceptada inmediatamente, boleta pendiente, consulta sin resultado, aceptación posterior, denegación por rol y la frecuencia de 24 horas. No se hizo ninguna llamada externa durante este cambio.
