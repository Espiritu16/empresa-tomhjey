# Revisión de seguridad diferencial — Backend MVP

Fecha: 7 de octubre de 2026
Base: `bf3666e` (`chore(repo): ignorar worktrees locales`)
Alcance revisado: cambios locales de backend, migraciones, Edge Functions, configuración y pruebas.

## Resumen ejecutivo

| Estado                               | Hallazgos |
| ------------------------------------ | --------: |
| Críticos abiertos                    |         0 |
| Altos abiertos                       |         0 |
| Medios pendientes de validación      |         2 |
| Altos corregidos durante la revisión |         1 |

**Riesgo actual: medio. Recomendación: condicional.** La base sirve para continuar con la integración del frontend en local. La emisión fiscal y la asistencia no deben considerarse validadas en producción hasta ejecutar pruebas con credenciales y cuentas de sandbox reales.

**Métricas y alcance:** 19 entradas de archivos modificados o nuevos, incluido este informe; se leyeron las migraciones, funciones y pruebas del backend, además de los documentos de arquitectura e instrucciones. La base `bf3666e` contiene el scaffold del proyecto y no tenía implementación backend previa que comparar. No se encontró código de seguridad retirado ni una regresión histórica identificable.

## Cambios revisados

| Área                                | Riesgo |                    Entradas de ejecución relevantes |
| ----------------------------------- | ------ | --------------------------------------------------: |
| RLS, roles y escritura de datos     | Alto   |              RPC autenticadas y políticas de tablas |
| Inventario y confirmación de ventas | Alto   |            3 RPC operativas llamadas por el cliente |
| Correlativos y emisión NubeFacT     | Alto   | 1 Edge Function; 2 RPC exclusivas de `service_role` |
| Herramientas de IA                  | Alto   |           1 Edge Function; 5 herramientas allowlist |
| Invitación de usuarios              | Medio  |                1 Edge Function y RPC administrativa |
| Documentación y comandos            | Bajo   |                            Sin ejecución de negocio |

Las operaciones con impacto en ventas, existencias y comprobantes quedan en Postgres o en Edge Functions. Los secretos no se incorporan al cliente. Las tablas de `public` habilitan RLS y la capa de venta no acepta el precio del navegador como autoridad.

## Hallazgo alto corregido durante la revisión

### La reserva y el resultado fiscal podían ser falsificados desde una sesión autenticada

**Archivos:** `supabase/migrations/20261007000300_facturacion_asistente.sql:236` y `:281`
**Cobertura:** prueba directa de denegación para usuarios autenticados en `supabase/tests/integraciones_mvp.test.sql`.
**Estado:** corregido antes de cerrar la implementación.

En la primera versión de estas funciones, `reservar_comprobante` y `registrar_resultado_comprobante` se concedían a `authenticated`. Un usuario con sesión podía reservar correlativos sin pasar por la Edge Function y llamar al registro de resultado para marcar una emisión como exitosa con una respuesta fabricada. Eso podía dejar números fiscales consumidos o mostrar un comprobante que el proveedor no había emitido.

Se revocó su ejecución a `PUBLIC`, `anon` y `authenticated`; ahora solo `service_role` puede llamarlas. La Edge Function valida la sesión y el rol de administrador y pasa el perfil activo a las funciones internas. Las pruebas verifican que la llamada directa desde `authenticated` falle y que el flujo de servicio conserve reserva e idempotencia.

## Cobertura de pruebas

| Capa                  | Resultado                              | Cobertura observada                                                                    |
| --------------------- | -------------------------------------- | -------------------------------------------------------------------------------------- |
| PostgreSQL / pgTAP    | 58 pruebas en 4 archivos, todas pasan  | Esquema, RLS, ventas, existencias, impuestos, permisos e integración fiscal simulada   |
| Edge Functions / Deno | 9 pruebas en 2 archivos, todas pasan   | Herramientas de IA, argumentos, propuesta de borrador, HTTP y reconciliación simulados |
| Supabase DB lint      | Pasa                                   | Sin errores en `extensions`, `private` y `public`                                      |
| Deno check            | Pasa                                   | Las tres Edge Functions compilan por tipo                                              |
| Next.js               | Lint, typecheck, formato y build pasan | Build local del scaffold web incluido                                                  |

No se generó un porcentaje de cobertura de líneas. No hay pruebas end-to-end HTTP de las Edge Functions con JWT Auth real. Los recorridos de invitación, Responses API contra OpenAI y emisión contra NubeFacT no se probaron con servicios externos.

## Revisión adversarial y blast radius

- **Usuario autenticado no administrador:** puede invocar `confirmar_venta` y crear borradores, pero la base limita la venta a sus propios registros y comprueba precio, impuestos, estado de producto y existencias. Un precio cambiado o producto inactivo hace que la confirmación falle y exige actualizar el borrador.
- **Usuario autenticado que intenta facturar sin la Edge Function:** no tiene privilegio para reservar correlativos ni alterar el resultado del comprobante. La denegación está cubierta con pgTAP.
- **Respuesta externa alterada o ambigua:** NubeFacT se consulta por HTTPS contra el host permitido. El número, serie, total y fecha del QR se comparan con la reserva antes de aceptar una respuesta; un número ocupado por otra venta no se registra como propio.
- **Instrucción del modelo que solicita una acción o datos arbitrarios:** las herramientas son allowlist; los argumentos se limitan y se validan; el modelo no recibe herramienta de confirmación, emisión ni ajuste de stock. El RPC de borrador calcula importes y exige la sesión del usuario.
- **Blast radius fiscal:** una Edge Function invoca las dos RPC de servicio; las operaciones se afectan a un comprobante y su venta. No hay otros llamadores runtime en el repositorio.
- **Blast radius de ventas:** una RPC de confirmación modifica una venta, los saldos implicados y sus movimientos dentro de una transacción; se prueba la repetición idempotente y el fallo por stock insuficiente.

## Pendientes antes de producción

1. Probar autenticación, autorización y respuestas HTTP de las Edge Functions desplegadas en un proyecto de sandbox.
2. Validar el payload y los estados contra credenciales reales de sandbox de NubeFacT; las pruebas presentes simulan el HTTP y no garantizan aceptación fiscal del proveedor.
3. Probar la llamada a Responses API, límites, latencia, errores y consumo con la configuración de OpenAI que se elija.
4. Completar la conexión del frontend y verificar que el usuario revise el total actualizado cuando un borrador se invalida por cambios en precios o impuestos.

## Contexto histórico y metodología

Se revisó el historial local hasta `bf3666e` y el contrato aprobado en `docs/superpowers/specs/2026-10-06-empresa-tomhjey-design.md`. El baseline del backend era el scaffold; por eso no había implementación anterior ni llamadas existentes que pudieran revelar una regresión. La revisión cubrió todos los archivos backend nuevos/modificados, buscó los callers de las RPC sensibles y aplicó escenarios adversariales sobre RLS, rol, emisión, stock y herramientas del modelo.

La validación fue local y no constituye una auditoría formal. No se consultó una instancia remota ni se usaron secretos. Confianza: alta para los privilegios y flujos cubiertos por pruebas locales; media para la integración externa y para recorridos HTTP aún no ejercitados.
