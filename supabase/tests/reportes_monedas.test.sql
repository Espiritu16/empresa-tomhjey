begin;
select plan(8);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_user_meta_data, created_at, updated_at
)
values (
  '72000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'reportes-moneda@test.local', '', now(),
  '{"nombre":"Administración reportes"}', now(), now()
);
update public.perfiles
set rol = 'administrador'
where id = '72000000-0000-4000-8000-000000000001';
insert into public.empresa (unica, nombre)
values (true, 'Empresa reportes')
on conflict (unica) do update set nombre = excluded.nombre;
insert into public.productos (id, sku, nombre, precio, creado_por)
values (
  '72100000-0000-4000-8000-000000000001',
  'REP-MONEDA-001', 'Producto reportes', 10,
  '72000000-0000-4000-8000-000000000001'
);
insert into public.clientes (id, nombre, creado_por)
values (
  '72300000-0000-4000-8000-000000000001', 'Cliente reportes',
  '72000000-0000-4000-8000-000000000001'
);
insert into public.ventas (
  id, cliente_id, cliente_nombre, estado, moneda, subtotal, total, creado_por, confirmado_por, confirmado_en
)
values
  (
    '72200000-0000-4000-8000-000000000001', '72300000-0000-4000-8000-000000000001', 'Cliente reportes', 'confirmada', 'PEN', 20, 20,
    '72000000-0000-4000-8000-000000000001',
    '72000000-0000-4000-8000-000000000001', '2999-01-01 00:00:00+00'
  ),
  (
    '72200000-0000-4000-8000-000000000002', '72300000-0000-4000-8000-000000000001', 'Cliente reportes', 'confirmada', 'USD', 30, 30,
    '72000000-0000-4000-8000-000000000001',
    '72000000-0000-4000-8000-000000000001', '2999-01-01 00:00:00+00'
  );
insert into public.lineas_venta (
  venta_id, producto_id, descripcion_congelada, sku_congelado,
  unidad_medida, cantidad, precio_unitario, subtotal, igv, total
)
values
  (
    '72200000-0000-4000-8000-000000000001',
    '72100000-0000-4000-8000-000000000001', 'Producto reportes', 'REP-MONEDA-001',
    'NIU', 2, 10, 20, 0, 20
  ),
  (
    '72200000-0000-4000-8000-000000000002',
    '72100000-0000-4000-8000-000000000001', 'Producto reportes', 'REP-MONEDA-001',
    'NIU', 3, 10, 30, 0, 30
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', '72000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (select count(*) from public.reporte_ventas('2999-01-01 00:00:00+00', '2999-01-02 00:00:00+00')),
  2::bigint,
  'separa la fila de un mismo producto por cada moneda'
);
select is(
  (select total from public.reporte_ventas('2999-01-01 00:00:00+00', '2999-01-02 00:00:00+00') where moneda = 'PEN'),
  20::numeric,
  'el total en soles no suma ventas en dólares'
);
select is(
  (select total from public.reporte_ventas('2999-01-01 00:00:00+00', '2999-01-02 00:00:00+00') where moneda = 'USD'),
  30::numeric,
  'el total en dólares conserva su moneda'
);
select is(
  (select unidades from public.reporte_ventas('2999-01-01 00:00:00+00', '2999-01-02 00:00:00+00') where moneda = 'USD'),
  3::numeric,
  'las unidades también se mantienen por moneda'
);
select is(
  public.asistente_resumen_ventas('2999-01-01 00:00:00+00', '2999-01-02 00:00:00+00') -> 'total',
  'null'::jsonb,
  'el asistente no presenta como un total los importes de monedas distintas'
);
select is(
  public.asistente_resumen_ventas('2999-01-01 00:00:00+00', '2999-01-02 00:00:00+00') -> 'totales_por_moneda',
  '{"PEN": 20, "USD": 30}'::jsonb,
  'el asistente conserva el importe de cada moneda por separado'
);
select is(
  public.resumen_inicio('2999-01-01 00:00:00+00', '2999-01-02 00:00:00+00') -> 'total_ventas',
  'null'::jsonb,
  'Inicio no suma ventas de monedas distintas en una cifra'
);
select is(
  public.resumen_inicio('2999-01-01 00:00:00+00', '2999-01-02 00:00:00+00') -> 'totales_por_moneda',
  '{"PEN": 20, "USD": 30}'::jsonb,
  'Inicio conserva un total separado para cada moneda'
);

select * from finish();
rollback;
