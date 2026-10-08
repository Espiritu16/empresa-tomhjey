begin;
select plan(12);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
values
  ('11000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin-ops@test.local', '', now(), '{"nombre":"Admin operaciones"}', now(), now()),
  ('11000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'seller-ops@test.local', '', now(), '{"nombre":"Vendedor operaciones"}', now(), now());
update public.perfiles set rol = 'administrador' where id = '11000000-0000-4000-8000-000000000001';
insert into public.empresa (nombre, igv_activo, igv_porcentaje, precios_incluyen_igv)
values ('Empresa operaciones', true, 18, false);
insert into public.productos (id, sku, nombre, precio, existencias, creado_por)
values ('31000000-0000-4000-8000-000000000001', 'OPS-001', 'Producto operaciones', 10, 8, '11000000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('test.venta_id', public.crear_borrador_venta(
  null,
  '[{"producto_id":"31000000-0000-4000-8000-000000000001","cantidad":2,"precio_unitario":0}]'::jsonb
)::text, true);
select is((select total from public.ventas where id = current_setting('test.venta_id')::uuid), 23.6::numeric, 'el servidor calcula el importe e ignora el precio cliente');
select is((select total from public.lineas_venta where venta_id = current_setting('test.venta_id')::uuid), 23.6::numeric, 'el total de línea incluye IGV para facturación y reportes');
select lives_ok($$select public.confirmar_venta(current_setting('test.venta_id')::uuid)$$, 'el vendedor confirma su borrador');
select is((select existencias from public.productos where id = '31000000-0000-4000-8000-000000000001'), 6::numeric, 'confirmar descuenta existencias');
select is((select count(*) from public.movimientos_inventario where venta_id = current_setting('test.venta_id')::uuid), 1::bigint, 'confirmar registra un movimiento');
select lives_ok($$select public.confirmar_venta(current_setting('test.venta_id')::uuid)$$, 'confirmar repetidamente es idempotente');
select is((select count(*) from public.movimientos_inventario where venta_id = current_setting('test.venta_id')::uuid), 1::bigint, 'la segunda confirmación no duplica movimientos');
select throws_ok(
  $$select public.ajustar_existencias('31000000-0000-4000-8000-000000000001', null, 1, 'ajuste vendedor')$$,
  '42501', null, 'el vendedor no puede ajustar existencias'
);

select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000001', true);
select set_config('test.borrador_precio_cambio', public.crear_borrador_venta(
  null,
  '[{"producto_id":"31000000-0000-4000-8000-000000000001","cantidad":1}]'::jsonb
)::text, true);
update public.productos set precio = 12 where id = '31000000-0000-4000-8000-000000000001';
select throws_ok(
  $$select public.confirmar_venta(current_setting('test.borrador_precio_cambio')::uuid)$$,
  '55000', null, 'no confirma un borrador con un precio que ya cambió'
);
select is((select total from public.ventas where id = current_setting('test.venta_id')::uuid), 23.6::numeric, 'el total de venta incluye IGV cuando los precios son netos');
select set_config('test.borrador_sin_stock', public.crear_borrador_venta(
  null,
  '[{"producto_id":"31000000-0000-4000-8000-000000000001","cantidad":99}]'::jsonb
)::text, true);
select throws_ok(
  $$select public.confirmar_venta(current_setting('test.borrador_sin_stock')::uuid)$$,
  '23514', null, 'la venta sin stock suficiente falla'
);
select is((select existencias from public.productos where id = '31000000-0000-4000-8000-000000000001'), 6::numeric, 'la venta fallida no altera existencias');

select * from finish();
rollback;
