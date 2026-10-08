# Revisión diferencial de seguridad — emisión de facturas

**Fecha:** 7 de octubre de 2026

**Riesgo del cambio:** Alto — autenticación, privilegios de `service_role` y emisión fiscal externa.

**Base revisada:** `f57c9ea` (`docs(facturacion): delimitar emision inicial de facturas`).

**Alcance:** cambios locales de emisión de factura, configuración de serie, consultas RLS e interfaz; la migración permanece sin aplicar.

## Resultado

**Hallazgos confirmados: 0.** En el diff revisado no encontré una ruta explotable que permita a una sesión anónima o de vendedor configurar series o emitir comprobantes, ni una ruta que exponga credenciales de NubeFacT en el navegador.

La conclusión es de **confianza media**, no de alta: no se ejecutaron pruebas automatizadas y la nueva función SQL no se aplicó a una base local ni remota. Las comprobaciones de TypeScript, lint, build, Edge Functions y lint del esquema actual sí pasaron; ese lint no valida una migración pendiente.

## Evidencia revisada

- El historial previo (`78143ca`) ya reserva y congela el payload y el correlativo dentro de una transacción, evita duplicar una venta y asigna un lease de dos minutos. La nueva acción de verificar estado vuelve a pasar por esa misma RPC; si el lease sigue activo no reenvía, y si venció reconcilia con la serie y el número reservados.
- La Edge Function autentica el JWT y exige `administrador` antes de crear el cliente privilegiado (`supabase/functions/facturacion/index.ts:73-77`). Tanto la configuración de serie como la emisión usan el id derivado de la sesión, no uno enviado por el navegador (`:95-100`, `:148-152`).
- La RPC nueva verifica otra vez que el perfil sea administrador activo, valida el formato `F` más tres caracteres y prohíbe retroceder el correlativo (`supabase/migrations/20261008044658_facturacion_facturas.sql:17-35`, `:46-55`). Revoca `EXECUTE` a `public`, `anon` y `authenticated`, y lo concede solo a `service_role` (`:104-107`). `search_path` está vacío y las tablas y funciones usan nombres calificados (`:1-10`).
- El bloqueo exclusivo de `series_comprobante` serializa la configuración con las reservas que actualizan esa tabla (`:38-49`).
- La UI solo manda `{ ventaId, tipo: "factura" }`; la Edge Function rechaza los demás tipos (`supabase/functions/facturacion/index.ts:130-145`). La URL del PDF se limita a HTTPS y a `nubefact.com` o sus subdominios, y el enlace usa `noopener noreferrer` (`src/funcionalidades/facturacion/pagina-facturacion.tsx:370-376` y `:447-458`).
- Las lecturas del panel usan el cliente de servidor con sesión; las ventas candidatas se cotejan por sus ids exactos contra comprobantes, sin depender de paginar toda la tabla (`src/funcionalidades/facturacion/consultas.ts:42-76`, `:93-116`).
- Se encontraron 30 referencias a reserva/configuración/series en los archivos del alcance: dos llamadas de navegador a la Edge Function, una RPC nueva para serie y una RPC existente para reserva. No se encontró otro consumidor de la operación privilegiada nueva.

## Escenarios adversariales considerados

| Actor o fallo | Intento | Resultado observado en el código |
|---|---|---|
| Sesión anónima | Invocar la Edge Function | `autenticar()` requiere un bearer válido antes de continuar. |
| Usuario vendedor | Configurar serie o emitir | `exigirAdministrador()` responde 403; las RPC además revisan el rol activo. |
| Cliente autenticado directo | Llamar la RPC de configuración | La función no concede `EXECUTE` a `authenticated`; solo la Edge Function usa `service_role`. |
| Admin malicioso o error de captura | Reusar un correlativo anterior | La validación rechaza un valor menor al guardado; el bloqueo serializa cambios/reservas. |
| Doble clic o dos peticiones | Emitir dos veces una venta | La reserva existente y su lease evitan solicitudes simultáneas; el reintento conserva el número. |
| Timeout tras envío | Enviar otra factura con nuevo número | Al vencer el lease se consulta el comprobante existente y se compara con el payload reservado antes de reenviar. |
| Respuesta externa manipulada con URL | Abrir enlace PDF arbitrario | La UI descarta protocolos distintos de HTTPS y hosts fuera de NubeFacT. |

## Cobertura y límites

- **No hay cobertura automatizada nueva** para la RPC de serie, la nueva rama de la Edge Function ni la interacción de la pantalla. La suite no se ejecutó en esta solicitud.
- `npm run supabase:lint` validó el esquema local que ya estaba aplicado; no demuestra que la migración nueva compile o se comporte correctamente al aplicarse.
- No se llamó a NubeFacT ni se emitió un comprobante. Antes de usarlo con datos fiscales reales, falta aplicar la migración y validar en el entorno local desechable y luego en el sandbox autorizado.
- El panel depende de que la empresa ya tenga RUC y de que exista una venta confirmada con RUC de cliente. Las pantallas de Empresa y Ventas aún no están implementadas en este MVP.

## Recomendación

**Apto para revisión del usuario; todavía no para emisión real.** El siguiente control es probar la migración y el flujo completo en un entorno local/sandbox con credenciales autorizadas, incluyendo serie configurada, factura aceptada, timeout/reconciliación, rechazo y permisos de vendedor. La migración no fue aplicada y no se hizo ninguna llamada externa durante este trabajo.
