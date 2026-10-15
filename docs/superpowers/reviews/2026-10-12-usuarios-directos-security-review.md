# Revisión de seguridad — creación directa de usuarios

Fecha: 12 de octubre de 2026  
Alcance: alta de usuarios por administrador, asignación de roles, sincronización del correo y retirada del flujo de invitaciones.

## Resultado

**Sin hallazgos nuevos abiertos. Riesgo residual: medio**, por el uso de Auth Admin y la clave privilegiada dentro de la Edge Function. La función verifica primero la sesión y el rol administrador; la clave privilegiada no llega al navegador.

El alta crea la cuenta con correo confirmado, sin enviar invitaciones ni correos. El administrador proporciona nombre, correo, contraseña inicial y rol (`administrador` o `vendedor`). Si falla guardar el perfil/rol, la función elimina la cuenta Auth recién creada. El perfil solo nace como vendedor por defecto; el rol enviado en `user_metadata` se ignora y el administrador lo asigna desde el servidor.

## Controles comprobados

- La Edge Function `crear-usuario` exige sesión y rol administrador antes de procesar datos, valida nombre, correo, contraseña y rol permitido.
- `crear_perfil_auth` no toma el rol desde metadatos de Auth. La asignación solicitada se realiza con el cliente privilegiado después de autenticar al administrador.
- `perfiles.correo` se completa desde Auth, tiene unicidad normalizada y se mantiene sincronizado cuando cambia el correo de la cuenta.
- La función del trigger de sincronización no es ejecutable por `PUBLIC`, `anon` ni `authenticated`.
- Las RPC y el trigger de aceptación de invitaciones se retiran. No se borran filas históricas de invitaciones.
- El recorrido E2E local crea cuentas de ambos roles, comprueba accesos distintos y confirma que no se envía correo por Mailpit.

## Verificación

- Supabase local reiniciado con todas las migraciones; **111 pruebas pgTAP pasan**.
- La revisión previa del cambio también completó lint de Supabase, comprobación de Edge Functions, pruebas de funciones, Playwright de usuarios, build, typecheck, lint, formato y `git diff --check`.
- La demo desplegada muestra el nuevo formulario y el usuario existente `prueba@test.com` como Administrador. No se creó ninguna cuenta de prueba en el entorno desplegado; la creación de usuarios se probó localmente.

## Límites y contexto

La revisión remota de Supabase ya había reportado advertencias en RPC `SECURITY DEFINER` preexistentes y la protección de contraseñas filtradas desactivada. No son introducidas por este cambio y no se modificaron en este alcance. La validación de creación se realizó en local; no se envió una solicitud de alta de prueba al entorno remoto.
