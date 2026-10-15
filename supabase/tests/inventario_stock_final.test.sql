begin;
select plan(6);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
values
  ('11000000-0000-4000-8000-000000000081', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin-stock-final@test.local', '', now(), '{"nombre":"Admin stock final"}', now(), now()),
  ('11000000-0000-4000-8000-000000000082', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vendedor-stock-final@test.local', '', now(), '{"nombre":"Vendedor stock final"}', now(), now());
update public.perfiles set rol = 'administrador' where id = '11000000-0000-4000-8000-000000000081';
insert into public.productos (id, sku, nombre, precio, existencias, creado_por)
values ('31000000-0000-4000-8000-000000000081', 'STOCK-FINAL-001', 'Producto stock final', 10, 8, '11000000-0000-4000-8000-000000000081');

set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000082', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select public.establecer_stock_final('31000000-0000-4000-8000-000000000081'::uuid, null::uuid, 3::numeric, 'conteo'::text)$$,
  '42501', null, 'un vendedor no puede establecer el stock final'
);

select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000081', true);
select set_config('test.movimiento_stock_final', public.establecer_stock_final(
  '31000000-0000-4000-8000-000000000081'::uuid, null::uuid, 3::numeric, 'conteo físico'::text
)::text, true);
select is((select existencias from public.productos where id = '31000000-0000-4000-8000-000000000081'), 3::numeric, 'establece el saldo final solicitado');
select is((select cantidad from public.movimientos_inventario where id = current_setting('test.movimiento_stock_final')::uuid), -5::numeric, 'registra la diferencia respecto al saldo anterior');
select is((select existencias_resultantes from public.movimientos_inventario where id = current_setting('test.movimiento_stock_final')::uuid), 3::numeric, 'el movimiento conserva el saldo final');
select throws_ok(
  $$select public.establecer_stock_final('31000000-0000-4000-8000-000000000081'::uuid, null::uuid, 3::numeric, 'sin cambio'::text)$$,
  '22023', null, 'rechaza el ajuste si el nuevo saldo coincide con el actual'
);
select throws_ok(
  $$select public.establecer_stock_final('31000000-0000-4000-8000-000000000081'::uuid, null::uuid, -1::numeric, 'saldo negativo'::text)$$,
  '22023', null, 'rechaza un stock final negativo'
);

select * from finish();
rollback;
