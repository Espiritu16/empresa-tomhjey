begin;
select plan(6);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
values
  ('11000000-0000-4000-8000-000000000091', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vendedor-codigos@test.local', '', now(), '{"nombre":"Vendedor códigos"}', now(), now());

select has_column('public', 'productos', 'codigo_barras', 'productos guarda el código de barras');

set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000091', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$insert into public.productos (sku, nombre, unidad_medida, precio, stock_minimo, creado_por, codigo_barras)
    values ('COD-001', 'Producto con código', 'NIU', 10, 0, '11000000-0000-4000-8000-000000000091', '7750000000017')$$,
  'el vendedor puede crear un producto con código de barras'
);

select throws_ok(
  $$insert into public.productos (sku, nombre, unidad_medida, precio, stock_minimo, creado_por, codigo_barras)
    values ('COD-002', 'Producto repetido', 'NIU', 10, 0, '11000000-0000-4000-8000-000000000091', '7750000000017')$$,
  '23505', null, 'rechaza un código de barras repetido'
);

select throws_ok(
  $$insert into public.productos (sku, nombre, unidad_medida, precio, stock_minimo, creado_por, codigo_barras)
    values ('COD-003', 'Producto inválido', 'NIU', 10, 0, '11000000-0000-4000-8000-000000000091', '12 34')$$,
  '23514', null, 'rechaza códigos con espacios o demasiado cortos'
);

select lives_ok(
  $$insert into public.productos (sku, nombre, unidad_medida, precio, stock_minimo, creado_por)
    values ('COD-004', 'Producto sin código', 'NIU', 10, 0, '11000000-0000-4000-8000-000000000091'),
           ('COD-005', 'Otro producto sin código', 'NIU', 10, 0, '11000000-0000-4000-8000-000000000091')$$,
  'varios productos pueden quedar sin código'
);

update public.productos set codigo_barras = '7750000000024' where sku = 'COD-004';
select is(
  (select codigo_barras from public.productos where sku = 'COD-004'),
  '7750000000024',
  'el vendedor puede asignar un código al editar'
);

select * from finish();
rollback;
