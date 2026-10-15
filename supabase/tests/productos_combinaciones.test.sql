begin;
select plan(9);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
values
  ('11000000-0000-4000-8000-000000000071', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin-combinaciones@test.local', '', now(), '{"nombre":"Admin combinaciones"}', now(), now()),
  ('11000000-0000-4000-8000-000000000072', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vendedor-combinaciones@test.local', '', now(), '{"nombre":"Vendedor combinaciones"}', now(), now());
update public.perfiles set rol = 'administrador' where id = '11000000-0000-4000-8000-000000000071';

set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000071', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('test.producto_id', public.crear_producto_con_combinaciones(
  'COMB-001', 'Polera', null, 'NIU', 35.50, 2,
  '[{"nombre":"Talla","valores":["S","M"]},{"nombre":"Color","valores":["Negro","Blanco"]}]'::jsonb
)::text, true);

select is((select count(*) from public.combinaciones where producto_id = current_setting('test.producto_id')::uuid), 4::bigint, 'genera la combinación cartesiana de las opciones');
select is((select count(*) from public.opciones_producto where producto_id = current_setting('test.producto_id')::uuid), 2::bigint, 'guarda los dos ejes de opciones');
select is((select count(*) from public.combinaciones where producto_id = current_setting('test.producto_id')::uuid and precio = 35.50 and existencias = 0), 4::bigint, 'aplica el precio base y deja el stock para Inventario');
select throws_ok($$select public.crear_producto_con_combinaciones('COMB-INVALIDO', 'Mal', null, 'NIU', 1, 0, '[]'::jsonb)$$, '22023', null, 'rechaza productos sin opciones');
select is((select count(*) from public.productos where sku = 'COMB-INVALIDO'), 0::bigint, 'la validación fallida no deja un producto parcial');
select throws_ok($$select public.crear_producto_con_combinaciones('COMB-NULL', 'Mal', null, 'NIU', 1, 0, null)$$, '22023', null, 'rechaza una lista de opciones nula');
select is((select count(*) from public.productos where sku = 'COMB-NULL'), 0::bigint, 'una lista nula no deja un producto parcial');

select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000072', true);
select set_config('request.jwt.claims', '{"sub":"11000000-0000-4000-8000-000000000072","role":"authenticated"}', true);
select lives_ok(
  $$select public.crear_producto_con_combinaciones(
    'COMB-VENDEDOR', 'Producto del vendedor', null, 'NIU', 15, 0,
    '[{"nombre":"Talla","valores":["S"]}]'::jsonb
  )$$,
  'el vendedor puede crear productos con combinaciones'
);
select is(
  (select count(*) from public.combinaciones c join public.productos p on p.id = c.producto_id where p.sku = 'COMB-VENDEDOR'),
  1::bigint, 'el alta de combinaciones del vendedor conserva todas sus filas'
);

select * from finish();
rollback;
