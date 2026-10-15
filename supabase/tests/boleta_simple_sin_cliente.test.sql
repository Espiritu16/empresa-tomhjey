begin;
select plan(11);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_user_meta_data, created_at, updated_at
) values (
  '11000000-0000-4000-8000-000000000021',
  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'boleta-simple@test.local', '', now(), '{"nombre":"Vendedor boleta simple"}', now(), now()
);
insert into public.empresa (
  unica, nombre, ruc, igv_activo, igv_porcentaje, precios_incluyen_igv
) values (true, 'Empresa boleta simple', '20100066603', false, 18, true)
on conflict (unica) do update set
  nombre = excluded.nombre,
  ruc = excluded.ruc,
  igv_activo = excluded.igv_activo,
  igv_porcentaje = excluded.igv_porcentaje,
  precios_incluyen_igv = excluded.precios_incluyen_igv;
insert into public.productos (id, sku, nombre, precio, existencias, creado_por)
values
  ('31000000-0000-4000-8000-000000000021', 'BS-10', 'Producto simple', 10, 8, '11000000-0000-4000-8000-000000000021'),
  ('31000000-0000-4000-8000-000000000022', 'BS-700', 'Producto límite', 700, 8, '11000000-0000-4000-8000-000000000021');
update public.series_comprobante set activa = false where tipo = 'boleta' and activa;
insert into public.series_comprobante (tipo, serie, siguiente_numero, actualizado_por)
values ('boleta', 'BSL1', 1, '11000000-0000-4000-8000-000000000021');

set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000021', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('test.venta_simple', public.crear_borrador_venta_con_comprobante(
  null,
  '[{"producto_id":"31000000-0000-4000-8000-000000000021","cantidad":2}]'::jsonb,
  'boleta'
)::text, true);
select is(
  (select cliente_id from public.ventas where id = current_setting('test.venta_simple')::uuid),
  null::uuid,
  'una boleta simple conserva la venta sin un cliente asignado'
);
select is(
  (select tipo_comprobante from public.ventas where id = current_setting('test.venta_simple')::uuid),
  'boleta',
  'la venta sin cliente queda limitada al tipo boleta'
);
select is(
  (select total from public.ventas where id = current_setting('test.venta_simple')::uuid),
  20::numeric,
  'el total de la boleta simple se calcula en Postgres'
);
select lives_ok(
  $$select public.confirmar_venta_con_comprobante(current_setting('test.venta_simple')::uuid, 'boleta')$$,
  'se puede confirmar la boleta simple sin cliente'
);
select is(
  (select existencias from public.productos where id = '31000000-0000-4000-8000-000000000021'),
  6::numeric,
  'la confirmación descuenta exactamente las unidades vendidas'
);
select is(
  (select count(*) from public.movimientos_inventario where venta_id = current_setting('test.venta_simple')::uuid),
  1::bigint,
  'la confirmación registra un movimiento de inventario'
);
reset role;
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('test.reserva_simple', public.reservar_comprobante(
  '11000000-0000-4000-8000-000000000021',
  current_setting('test.venta_simple')::uuid,
  'boleta'
)::text, true);
select is(
  current_setting('test.reserva_simple')::jsonb -> 'payload' ->> 'cliente_tipo_de_documento',
  '-',
  'NubeFacT recibe el tipo Varios para la boleta sin cliente'
);
select is(
  current_setting('test.reserva_simple')::jsonb -> 'payload' ->> 'cliente_denominacion',
  'CLIENTE VARIOS',
  'NubeFacT recibe la denominación de venta de mostrador'
);
select is(
  current_setting('test.reserva_simple')::jsonb -> 'payload' ->> 'cliente_numero_de_documento',
  '00000000',
  'NubeFacT recibe el valor técnico requerido sin pedir DNI'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000021', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select public.crear_borrador_venta_con_comprobante(
    null,
    '[{"producto_id":"31000000-0000-4000-8000-000000000021","cantidad":1}]'::jsonb,
    'factura'
  )$$,
  '22023', null,
  'una factura no permite guardar el borrador sin cliente'
);
select throws_ok(
  $$select public.crear_borrador_venta_con_comprobante(
    null,
    '[{"producto_id":"31000000-0000-4000-8000-000000000022","cantidad":1}]'::jsonb,
    'boleta'
  )$$,
  '22023', null,
  'una boleta simple de S/ 700 exactos requiere cliente'
);

select * from finish();
rollback;
