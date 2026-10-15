begin;
select plan(28);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
values
  ('11000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin-ops@test.local', '', now(), '{"nombre":"Admin operaciones"}', now(), now()),
  ('11000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'seller-ops@test.local', '', now(), '{"nombre":"Vendedor operaciones"}', now(), now());
update public.perfiles set rol = 'administrador' where id = '11000000-0000-4000-8000-000000000001';
insert into public.empresa (
  unica, nombre, ruc, igv_activo, igv_porcentaje, precios_incluyen_igv
)
values (true, 'Empresa operaciones', '20100066603', true, 18, false)
on conflict (unica) do update set
  nombre = excluded.nombre,
  ruc = excluded.ruc,
  igv_activo = excluded.igv_activo,
  igv_porcentaje = excluded.igv_porcentaje,
  precios_incluyen_igv = excluded.precios_incluyen_igv;
insert into public.productos (id, sku, nombre, precio, existencias, creado_por)
values ('31000000-0000-4000-8000-000000000001', 'OPS-001', 'Producto operaciones', 10, 8, '11000000-0000-4000-8000-000000000001');
insert into public.clientes (
  id, tipo_documento, numero_documento, nombre, creado_por
)
values (
  '32000000-0000-4000-8000-000000000001', 'dni', '12345678',
  'Cliente operaciones', '11000000-0000-4000-8000-000000000001'
);
update public.series_comprobante set activa = false where tipo = 'boleta' and activa;
insert into public.series_comprobante (tipo, serie, siguiente_numero)
values ('boleta', 'B001', 1)
on conflict (tipo, serie) do update set activa = true;
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
values ('11000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'metadata-ops@test.local', '', now(), '{"nombre":"Cuenta de metadatos","rol":"administrador"}', now(), now());
select is(
  (select rol from public.perfiles where id = '11000000-0000-4000-8000-000000000003'),
  'vendedor', 'Auth ignora cualquier rol enviado en user_metadata'
);
select is(
  (select correo from public.perfiles where id = '11000000-0000-4000-8000-000000000003'),
  'metadata-ops@test.local', 'el perfil conserva el correo de acceso'
);
update auth.users
set email = 'correo-actualizado-ops@test.local'
where id = '11000000-0000-4000-8000-000000000003';
select is(
  (select correo from public.perfiles where id = '11000000-0000-4000-8000-000000000003'),
  'correo-actualizado-ops@test.local', 'Auth sincroniza los cambios de correo al perfil'
);
select ok(
  not has_function_privilege(
    'authenticated', 'private.sincronizar_correo_auth()', 'EXECUTE'
  ), 'los usuarios no pueden invocar el trigger que sincroniza correos'
);
select ok(
  not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'invitar_vendedor'
  ), 'el MVP ya no ofrece una RPC para invitar usuarios'
);
select ok(
  not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'invitar_usuario'
  ), 'el MVP ya no ofrece la RPC de invitaciones por rol'
);
select ok(
  not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'aceptar_invitacion_confirmada'
  ), 'Auth ya no tiene trigger que procese invitaciones'
);
select ok(
  not exists (
    select 1 from pg_trigger where tgrelid = 'auth.users'::regclass
      and tgname = 'aceptar_invitacion_confirmada' and not tgisinternal
  ), 'no queda activo el trigger que aceptaba invitaciones'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select public.crear_borrador_venta(
    null,
    '[{"producto_id":"31000000-0000-4000-8000-000000000001","cantidad":1}]'::jsonb
  )$$,
  '42501', null, 'la RPC base no permite saltarse la validación de tipo de comprobante'
);
select set_config('test.venta_id', public.crear_borrador_venta_con_comprobante(
  '32000000-0000-4000-8000-000000000001',
  '[{"producto_id":"31000000-0000-4000-8000-000000000001","cantidad":2,"precio_unitario":0}]'::jsonb,
  'boleta'
)::text, true);
select is((select total from public.ventas where id = current_setting('test.venta_id')::uuid), 23.6::numeric, 'el servidor calcula el importe e ignora el precio cliente');
select is((select total from public.lineas_venta where venta_id = current_setting('test.venta_id')::uuid), 23.6::numeric, 'el total de línea incluye IGV para facturación y reportes');
select lives_ok($$select public.confirmar_venta_con_comprobante(current_setting('test.venta_id')::uuid, 'boleta')$$, 'el vendedor confirma su borrador');
select is((select existencias from public.productos where id = '31000000-0000-4000-8000-000000000001'), 6::numeric, 'confirmar descuenta existencias');
select is((select count(*) from public.movimientos_inventario where venta_id = current_setting('test.venta_id')::uuid), 1::bigint, 'confirmar registra un movimiento');
select lives_ok($$select public.confirmar_venta_con_comprobante(current_setting('test.venta_id')::uuid, 'boleta')$$, 'confirmar repetidamente es idempotente');
select is((select count(*) from public.movimientos_inventario where venta_id = current_setting('test.venta_id')::uuid), 1::bigint, 'la segunda confirmación no duplica movimientos');
select throws_ok(
  $$select public.ajustar_existencias('31000000-0000-4000-8000-000000000001', null, 1, 'ajuste vendedor')$$,
  '42501', null, 'el vendedor no puede ajustar existencias'
);
select throws_ok(
  $$update public.clientes set activo = false where id = '32000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'el vendedor no puede cambiar el estado del cliente directamente'
);
select throws_ok(
  $$select public.cambiar_estado_cliente('32000000-0000-4000-8000-000000000001', false)$$,
  '42501', null, 'el vendedor no puede cambiar el estado del cliente por RPC'
);

select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$select public.cambiar_estado_cliente('32000000-0000-4000-8000-000000000001', false)$$,
  'el administrador puede inactivar clientes'
);
select is(
  (select activo from public.clientes where id = '32000000-0000-4000-8000-000000000001'),
  false, 'el cliente queda inactivo'
);
select throws_ok(
  $$select public.crear_borrador_venta_con_comprobante(
    '32000000-0000-4000-8000-000000000001',
    '[{"producto_id":"31000000-0000-4000-8000-000000000001","cantidad":1}]'::jsonb,
    'boleta'
  )$$,
  'P0002', null, 'no se puede usar un cliente inactivo en una venta'
);
select lives_ok(
  $$select public.cambiar_estado_cliente('32000000-0000-4000-8000-000000000001', true)$$,
  'el administrador puede reactivar clientes'
);
select is(
  (select activo from public.clientes where id = '32000000-0000-4000-8000-000000000001'),
  true, 'el cliente vuelve a quedar activo'
);
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"11000000-0000-4000-8000-000000000001","role":"authenticated","email":"admin-ops@test.local"}', true);
select set_config('test.borrador_precio_cambio', public.crear_borrador_venta_con_comprobante(
  '32000000-0000-4000-8000-000000000001',
  '[{"producto_id":"31000000-0000-4000-8000-000000000001","cantidad":1}]'::jsonb,
  'boleta'
)::text, true);
update public.productos set precio = 12 where id = '31000000-0000-4000-8000-000000000001';
select throws_ok(
  $$select public.confirmar_venta_con_comprobante(current_setting('test.borrador_precio_cambio')::uuid, 'boleta')$$,
  '55000', null, 'no confirma un borrador con un precio que ya cambió'
);
select is((select total from public.ventas where id = current_setting('test.venta_id')::uuid), 23.6::numeric, 'el total de venta incluye IGV cuando los precios son netos');
select throws_ok(
  $$select public.crear_borrador_venta_con_comprobante(
    '32000000-0000-4000-8000-000000000001',
    '[{"producto_id":"31000000-0000-4000-8000-000000000001","cantidad":99}]'::jsonb,
    'boleta'
  )$$,
  '23514', null, 'no crea un borrador cuando la cantidad supera las existencias'
);
select is((select existencias from public.productos where id = '31000000-0000-4000-8000-000000000001'), 6::numeric, 'el borrador rechazado no altera existencias');

select * from finish();
rollback;
