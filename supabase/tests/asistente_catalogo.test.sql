begin;
select plan(4);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
values ('60000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'asistente-catalogo@test.local', '', now(), '{"nombre":"Administración"}', now(), now());
update public.perfiles set rol = 'administrador' where id = '60000000-0000-4000-8000-000000000001';
insert into public.productos (id, sku, nombre, precio, existencias, stock_minimo, activo, creado_por)
values
  ('61000000-0000-4000-8000-000000000001', 'CAT-001', 'Producto con stock', 10, 10, 2, true, '60000000-0000-4000-8000-000000000001'),
  ('61000000-0000-4000-8000-000000000002', 'CAT-002', 'Producto bajo', 20, 1, 2, true, '60000000-0000-4000-8000-000000000001'),
  ('61000000-0000-4000-8000-000000000003', 'CAT-003', 'Producto inactivo', 30, 0, 0, false, '60000000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is((public.asistente_resumen_catalogo() ->> 'productos_activos')::bigint, (select count(*) from public.productos where activo), 'cuenta solo los productos activos');
select is((public.asistente_resumen_catalogo() ->> 'productos_con_stock_bajo')::bigint, (
  select count(*) from public.productos p
  where p.activo and (
    (not p.usa_combinaciones and p.existencias <= p.stock_minimo)
    or (p.usa_combinaciones and exists (
      select 1 from public.combinaciones c
      where c.producto_id = p.id and c.activa and c.existencias <= c.stock_minimo
    ))
  )
), 'cuenta productos que requieren reposición');
select ok(
  public.asistente_resumen_catalogo() -> 'detalle_reposicion' @> '[{"producto":"Producto bajo","sku":"CAT-002","existencias":1,"stock_minimo":2}]'::jsonb,
  'incluye nombre, SKU y existencias de los productos por reponer'
);
reset role;
select ok(not has_function_privilege('anon', 'public.asistente_resumen_catalogo()', 'execute'), 'anon no puede invocar el resumen del catálogo');

select * from finish();
rollback;
