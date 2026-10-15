# Edge Functions

Las funciones del MVP son privadas y verifican JWT. El código valida también la sesión,
consulta el perfil activo y vuelve a comprobar el rol antes de ejecutar operaciones.

| Función         | Quién puede usarla       | Responsabilidad                                                               |
| --------------- | ------------------------ | ----------------------------------------------------------------------------- |
| `facturacion`   | Administrador            | Reserva correlativo, emite/reconcilia con NubeFacT y registra el resultado.   |
| `crear-usuario` | Administrador            | Crea directamente una cuenta confirmada con el rol elegido; no envía correos. |
| `asistente`     | Administrador y vendedor | Consulta datos permitidos y prepara borradores; nunca confirma ni factura.    |

El entorno local se inicia con:

```bash
npm run supabase:functions:serve
```

Las Edge Functions locales cargan sus credenciales desde el `.env.local` de la raíz,
el mismo archivo que usa Next.js. Completa `NUBEFACT_RUTA`, `NUBEFACT_TOKEN`,
`NUBEFACT_AMBIENTE` y `NUBEFACT_RUC_EMISOR` solo después de confirmar en NubeFacT que
la cuenta corresponde al ambiente elegido. El mismo host de API puede servir cuentas
de prueba o producción; la URL por sí sola no confirma el ambiente. `OPENAI_API_KEY`
configura el asistente y `OPENAI_MODEL` permite cambiar su modelo. Ese archivo está
ignorado por Git.

Variables necesarias:

| Variable                       | Uso                                                                                                 |
| ------------------------------ | --------------------------------------------------------------------------------------------------- |
| `NUBEFACT_RUTA`                | Ruta HTTPS de la cuenta NubeFacT.                                                                   |
| `NUBEFACT_TOKEN`               | Token de la misma cuenta.                                                                           |
| `NUBEFACT_AMBIENTE`            | `pruebas` o `produccion`, según lo confirmado para esa cuenta.                                      |
| `NUBEFACT_RUC_EMISOR`          | RUC asociado a NubeFacT; debe coincidir con el RUC guardado en Empresa.                             |
| `NUBEFACT_PERMITIR_PRODUCCION` | Debe ser `true` además de `NUBEFACT_AMBIENTE=produccion` para permitir emisiones reales.            |
| `OPENAI_API_KEY`               | Clave de servidor del proveedor de IA.                                                              |
| `OPENAI_MODEL`                 | Modelo configurable; por defecto `gpt-6-luna`.                                                      |
| `SUPABASE_URL`                 | URL del proyecto local; la CLI la inyecta al servir funciones.                                      |
| `SUPABASE_ANON_KEY`            | Clave pública de Supabase para preservar RLS al consultar.                                          |
| `SUPABASE_SERVICE_ROLE_KEY`    | Solo la usa Auth Admin para crear cuentas y la Edge Function para guardar respuestas del asistente. |

No copies secretos de producción a local ni incluyas secretos en archivos de ejemplo. La
emisión requiere ambiente y RUC emisor declarados; producción también requiere el permiso
explícito anterior. Para un proyecto remoto, configura secretos con `npx supabase secrets set --env-file <archivo-local>`
después de vincular el proyecto y revisar que el archivo no se vaya a versionar. Este
Estado de la demo universitaria (12-10-2026): las migraciones del MVP se aplicaron al
proyecto remoto `proyecto-universidad` y las funciones están desplegadas con
verificación JWT activa. Las credenciales de OpenAI y NubeFacT todavía no están
configuradas en el proyecto remoto. Al configurarlas, mantener
`NUBEFACT_PERMITIR_PRODUCCION=false`; usar únicamente credenciales de sandbox. El archivo
`.env.local` no se versiona y no debe copiarse completo a Supabase.

## Pruebas

Las pruebas de contrato no llaman a proveedores reales:

```bash
deno test --allow-env supabase/functions/facturacion/nubefact_test.ts supabase/functions/asistente/asistente_test.ts
deno check supabase/functions/facturacion/index.ts supabase/functions/asistente/index.ts supabase/functions/crear-usuario/index.ts
```

No ejecutes pruebas reales con OpenAI ni emisiones de NubeFacT sin usar credenciales sandbox.
