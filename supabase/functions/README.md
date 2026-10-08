# Edge Functions

Las funciones del MVP son privadas y verifican JWT. El código valida también la sesión,
consulta el perfil activo y vuelve a comprobar el rol antes de ejecutar operaciones.

| Función            | Quién puede usarla       | Responsabilidad                                                             |
| ------------------ | ------------------------ | --------------------------------------------------------------------------- |
| `facturacion`      | Administrador            | Reserva correlativo, emite/reconcilia con NubeFacT y registra el resultado. |
| `invitar-vendedor` | Administrador            | Registra la invitación y envía el correo desde Auth Admin API.              |
| `asistente`        | Administrador y vendedor | Consulta datos permitidos y prepara borradores; nunca confirma ni factura.  |

El entorno local se inicia con:

```bash
npx supabase functions serve --env-file supabase/functions/.env.local
```

Antes de probar NubeFacT u OpenAI, copia `supabase/functions/.env.example` a
`supabase/functions/.env.local` y completa `NUBEFACT_RUTA`, `NUBEFACT_TOKEN` y
`OPENAI_API_KEY` con credenciales de prueba. `OPENAI_MODEL` ya usa el modelo por defecto
del proyecto y se puede cambiar localmente. El archivo `.env.local` está ignorado por Git.

Variables necesarias:

| Variable                    | Uso                                                                                           |
| --------------------------- | --------------------------------------------------------------------------------------------- |
| `NUBEFACT_RUTA`             | Ruta HTTPS de la cuenta sandbox de NubeFacT.                                                  |
| `NUBEFACT_TOKEN`            | Token de la misma cuenta.                                                                     |
| `OPENAI_API_KEY`            | Clave de servidor del proveedor de IA.                                                        |
| `OPENAI_MODEL`              | Modelo configurable; por defecto `gpt-5.6-luna`.                                              |
| `SUPABASE_URL`              | URL del proyecto local; la CLI la inyecta al servir funciones.                                |
| `SUPABASE_ANON_KEY`         | Clave pública de Supabase para preservar RLS al consultar.                                    |
| `SUPABASE_SERVICE_ROLE_KEY` | Solo la usa Auth Admin para invitar y la Edge Function para guardar respuestas del asistente. |

No copies secretos de producción a local ni incluyas secretos en archivos de ejemplo. Para un
proyecto remoto, configura secretos con `npx supabase secrets set --env-file <archivo-local>`
después de vincular el proyecto y revisar que el archivo no se vaya a versionar. Este
repositorio no se ha vinculado ni desplegado a un proyecto remoto.

## Pruebas

Las pruebas de contrato no llaman a proveedores reales:

```bash
deno test --allow-env supabase/functions/facturacion/nubefact_test.ts supabase/functions/asistente/asistente_test.ts
deno check supabase/functions/facturacion/index.ts supabase/functions/asistente/index.ts supabase/functions/invitar-vendedor/index.ts
```

No ejecutes pruebas reales con OpenAI ni emisiones de NubeFacT sin usar credenciales sandbox.
