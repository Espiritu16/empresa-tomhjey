begin;
select plan(6);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
values
  ('11000000-0000-4000-8000-000000000093', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vendedor-modelo@test.local', '', now(), '{"nombre":"Vendedor modelo"}', now(), now());

select has_column('public', 'productos', 'modelo_producto', 'productos guarda el producto del modelo');

set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000093', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$insert into public.productos (sku, nombre, unidad_medida, precio, stock_minimo, creado_por, modelo_producto, modelo_talla)
    values ('MOD-001', 'Pantalón stretch T28', 'NIU', 40, 2, '11000000-0000-4000-8000-000000000093', 'P02', '28')$$,
  'el vendedor puede vincular un producto al modelo'
);

select throws_ok(
  $$insert into public.productos (sku, nombre, unidad_medida, precio, stock_minimo, creado_por, modelo_producto, modelo_talla)
    values ('MOD-002', 'Otro stretch T28', 'NIU', 40, 2, '11000000-0000-4000-8000-000000000093', 'P02', '28')$$,
  '23505', null, 'una talla del modelo solo la representa un producto'
);

select throws_ok(
  $$insert into public.productos (sku, nombre, unidad_medida, precio, stock_minimo, creado_por, modelo_producto)
    values ('MOD-003', 'Sin talla', 'NIU', 40, 2, '11000000-0000-4000-8000-000000000093', 'P02')$$,
  '23514', null, 'el vínculo exige producto y talla juntos'
);

select throws_ok(
  $$insert into public.productos (sku, nombre, unidad_medida, precio, stock_minimo, creado_por, modelo_producto, modelo_talla)
    values ('MOD-004', 'Código raro', 'NIU', 40, 2, '11000000-0000-4000-8000-000000000093', 'pantalon', '28')$$,
  '23514', null, 'rechaza códigos de modelo con formato inválido'
);

update public.productos set modelo_producto = null, modelo_talla = null where sku = 'MOD-001';
select is(
  (select modelo_producto from public.productos where sku = 'MOD-001'),
  null,
  'se puede quitar el vínculo al editar'
);

select * from finish();
rollback;
