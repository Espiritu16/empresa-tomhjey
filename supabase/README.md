# Backend Supabase

El backend del MVP se ejecuta sobre Supabase local para desarrollo y pruebas. La fuente de
verdad del esquema son las migraciones; no se modifica el esquema con cambios manuales en
Studio.

## Servicios y módulos

- Auth administra acceso por correo. El registro público está deshabilitado; una invitación
  crea usuarios con rol `vendedor`.
- `perfiles` guarda nombre, rol y estado. Los roles posibles son `administrador` y `vendedor`.
- `empresa` guarda los datos comerciales, moneda y cálculo de IGV de una sola empresa.
- Catálogo guarda productos, categorías, opciones, valores y combinaciones textiles.
- Inventario usa existencias con movimientos obligatorios; el cliente no puede escribir
  saldos directamente.
- Ventas se crean como borrador. `confirmar_venta` calcula y valida dentro de una transacción,
  descuenta existencias y deja movimientos; repetir la confirmación no repite el descuento.
- Facturación emite boletas y facturas por NubeFacT desde una Edge Function privada.
- El asistente consulta con herramientas acotadas y puede crear borradores. No confirma ventas,
  emite comprobantes ni ajusta existencias.

## Desarrollo local

Requiere Docker Desktop. Desde la raíz del repo:

```bash
npm run supabase:start
npm run supabase:reset
npm run supabase:test
npm run supabase:lint
```

`supabase:reset` recrea la base local y vuelve a aplicar todas las migraciones y seeds. Solo
debe usarse contra el stack local desechable.

Las funciones se sirven localmente con `npx supabase functions serve --env-file supabase/functions/.env.local`.
Ese archivo está ignorado por Git. Usa valores de prueba y guarda ahí `NUBEFACT_RUTA`,
`NUBEFACT_TOKEN`, `OPENAI_API_KEY` y, si el entorno local no los inyecta, las variables
`SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY`. Para probar el envío de
invitaciones, los correos locales se consultan en Mailpit.

Las pruebas unitarias de las funciones son simuladas y no consumen servicios externos:

```bash
deno test --allow-env supabase/functions/facturacion/nubefact_test.ts supabase/functions/asistente/asistente_test.ts
deno check supabase/functions/facturacion/index.ts supabase/functions/asistente/index.ts supabase/functions/invitar-vendedor/index.ts
```

## Primer administrador

El trigger de Auth crea un perfil como vendedor y no lee el rol de `user_metadata`. Para
preparar el primer administrador en el entorno de la empresa:

1. Crear/invitar la cuenta inicial desde el panel de Auth o con la Admin API.
2. Obtener el UUID de esa cuenta desde Auth.
3. Invocar `public.inicializar_administrador(usuario_id)` con una sesión de `service_role`.
   Solo se permite mientras no exista ningún administrador.
4. Iniciar sesión con esa cuenta y completar Empresa, serie de boleta/factura y usuarios.

No pegues la clave service role en el SQL Editor ni la guardes en archivos versionados. La
primera configuración de Empresa se guarda mediante `public.guardar_empresa`; el RUC se
valida con formato, prefijo y dígito verificador.

## Seguridad

- Toda tabla en `public` tiene RLS activado. La identidad se toma de Auth; las políticas
  consultan `perfiles` y verifican que la cuenta siga activa.
- Los vendedores ven su propio historial de ventas; administración ve el historial general.
- Los precios, impuestos, importes, existencias, roles y correlativos se validan en Postgres.
- Los roles no se actualizan desde el navegador. `inicializar_administrador` solo asigna el
  primer rol administrador; `cambiar_estado_vendedor` permite activar o desactivar vendedores.
- Las claves de NubeFacT, OpenAI y service role se limitan a Edge Functions y nunca se pasan
  al modelo.
- NubeFacT se prueba con una cuenta sandbox. No se han desplegado funciones ni migraciones a
  un proyecto remoto.

## Convenciones de migraciones

Cada cambio estructural se agrega como una migración nueva. Toda tabla expuesta incluye RLS,
políticas y grants mínimos en la migración que la crea. Las pruebas pgTAP se guardan en
`supabase/tests/` y se ejecutan antes de compartir una migración.
