begin;
select plan(7);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
values
  ('11000000-0000-4000-8000-000000000095', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin-entrada@test.local', '', now(), '{"nombre":"Admin entrada"}', now(), now()),
  ('11000000-0000-4000-8000-000000000096', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vendedor-entrada@test.local', '', now(), '{"nombre":"Vendedor entrada"}', now(), now());
update public.perfiles set rol = 'administrador' where id = '11000000-0000-4000-8000-000000000095';
insert into public.productos (id, sku, nombre, precio, existencias, creado_por)
values ('31000000-0000-4000-8000-000000000095', 'ENTRADA-001', 'Producto entrada', 10, 4, '11000000-0000-4000-8000-000000000095');

set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000096', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$select public.registrar_entrada('31000000-0000-4000-8000-000000000095'::uuid, null::uuid, 6::numeric, 'compra'::text)$$,
  '42501', null, 'un vendedor no puede registrar entradas'
);

select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000095', true);
select set_config('test.movimiento_entrada', public.registrar_entrada(
  '31000000-0000-4000-8000-000000000095'::uuid, null::uuid, 6::numeric, 'Compra al proveedor'::text
)::text, true);
select is((select existencias from public.productos where id = '31000000-0000-4000-8000-000000000095'), 10::numeric, 'suma las unidades al stock actual');
select is((select tipo from public.movimientos_inventario where id = current_setting('test.movimiento_entrada')::uuid), 'entrada', 'el movimiento queda como entrada');
select is((select cantidad from public.movimientos_inventario where id = current_setting('test.movimiento_entrada')::uuid), 6::numeric, 'registra las unidades que entraron');
select is((select existencias_resultantes from public.movimientos_inventario where id = current_setting('test.movimiento_entrada')::uuid), 10::numeric, 'conserva el saldo resultante');
select throws_ok(
  $$select public.registrar_entrada('31000000-0000-4000-8000-000000000095'::uuid, null::uuid, 0::numeric, 'nada'::text)$$,
  '22023', null, 'rechaza una entrada sin unidades'
);
select throws_ok(
  $$select public.registrar_entrada('31000000-0000-4000-8000-000000000095'::uuid, null::uuid, 2::numeric, '  '::text)$$,
  '22023', null, 'exige el motivo de la entrada'
);

select * from finish();
rollback;
