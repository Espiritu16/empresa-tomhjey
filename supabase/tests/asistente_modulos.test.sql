begin;
select plan(13);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_user_meta_data, created_at, updated_at
) values
  ('70000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'asistente-admin@test.local', '', now(), '{"nombre":"Admin IA"}', now(), now()),
  ('70000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'asistente-vendedor@test.local', '', now(), '{"nombre":"Vendedor IA"}', now(), now());
update public.perfiles set rol = 'administrador' where id = '70000000-0000-4000-8000-000000000001';

insert into public.productos (
  id, sku, nombre, precio, existencias, stock_minimo, creado_por
) values (
  '71000000-0000-4000-8000-000000000001', 'IA-POLO-01', 'Polo de consulta IA', 25, 7, 2,
  '70000000-0000-4000-8000-000000000001'
);
insert into public.clientes (
  id, tipo_documento, numero_documento, nombre, telefono, correo, creado_por
) values (
  '72000000-0000-4000-8000-000000000001', 'dni', '12345678', 'Cliente consulta IA',
  '999888777', 'cliente-ia@test.local', '70000000-0000-4000-8000-000000000001'
);
insert into public.ventas (
  id, cliente_id, cliente_nombre, estado, moneda, subtotal, total,
  creado_por, confirmado_por, confirmado_en
) values
  ('73000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000001', 'Cliente consulta IA', 'confirmada', 'PEN', 25, 25,
    '70000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001', now()),
  ('73000000-0000-4000-8000-000000000002', '72000000-0000-4000-8000-000000000001', 'Cliente consulta IA', 'confirmada', 'PEN', 25, 25,
    '70000000-0000-4000-8000-000000000002', '70000000-0000-4000-8000-000000000002', now());
insert into public.lineas_venta (
  venta_id, producto_id, descripcion_congelada, sku_congelado, unidad_medida,
  cantidad, precio_unitario, subtotal, igv, total
) values
  ('73000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000001', 'Polo de consulta IA', 'IA-POLO-01', 'NIU', 1, 25, 25, 0, 25),
  ('73000000-0000-4000-8000-000000000002', '71000000-0000-4000-8000-000000000001', 'Polo de consulta IA', 'IA-POLO-01', 'NIU', 1, 25, 25, 0, 25);
insert into public.movimientos_inventario (
  producto_id, tipo, cantidad, existencias_resultantes, motivo, usuario_id
) values (
  '71000000-0000-4000-8000-000000000001', 'ajuste', 2, 7, 'Ingreso de prueba IA',
  '70000000-0000-4000-8000-000000000001'
);
insert into public.comprobantes (
  venta_id, tipo, serie, numero, estado, payload, solicitado_por
) values (
  '73000000-0000-4000-8000-000000000001', 'factura', 'F888', 777,
  'emitido', '{}'::jsonb, '70000000-0000-4000-8000-000000000001'
);
insert into public.empresa (unica, nombre, actualizado_por)
values (true, 'Empresa consulta IA', '70000000-0000-4000-8000-000000000001')
on conflict (unica) do nothing;

set local role authenticated;
select set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select ok(
  public.asistente_consultar_modulo('productos') -> 'productos'
    @> '[{"producto_id":"71000000-0000-4000-8000-000000000001","nombre":"Polo de consulta IA","sku":"IA-POLO-01"}]'::jsonb,
  'la consulta de productos devuelve el nombre y SKU para resolver seguimientos'
);
select ok(
  public.asistente_consultar_modulo('inventario', 'Polo de consulta IA') -> 'movimientos'
    @> '[{"producto":"Polo de consulta IA","motivo":"Ingreso de prueba IA","existencias":7}]'::jsonb,
  'la consulta de inventario devuelve movimientos y saldo resultante'
);
select ok(
  public.asistente_consultar_modulo('clientes', 'Cliente consulta IA') -> 'clientes'
    @> '[{"nombre":"Cliente consulta IA"}]'::jsonb
    and not (public.asistente_consultar_modulo('clientes', 'Cliente consulta IA')::text like '%12345678%')
    and not (public.asistente_consultar_modulo('clientes', 'Cliente consulta IA')::text like '%999888777%')
    and not (public.asistente_consultar_modulo('clientes', 'Cliente consulta IA')::text like '%cliente-ia@test.local%'),
  'la búsqueda de clientes devuelve su nombre y omite documento y contacto'
);
select ok(
  public.asistente_consultar_modulo('facturacion') -> 'comprobantes'
    @> '[{"tipo":"factura","serie":"F888","numero":777,"estado":"emitido"}]'::jsonb,
  'la consulta de facturación muestra tipo, serie, número y estado'
);
select ok(
  public.asistente_consultar_modulo('inicio') ->> 'modulo' = 'inicio'
    and (public.asistente_consultar_modulo('inicio') -> 'catalogo') ? 'productos_activos',
  'inicio devuelve el resumen de catálogo y ventas'
);
select ok(
  public.asistente_consultar_modulo('reportes', null, '2000-01-01', '2100-01-01') ->> 'modulo' = 'reportes'
    and public.asistente_consultar_modulo('reportes', null, '2000-01-01', '2100-01-01') -> 'productos_vendidos'
      @> '[{"producto":"Polo de consulta IA","moneda":"PEN","unidades":2,"total":50}]'::jsonb,
  'reportes devuelve el resumen de ventas y productos vendidos'
);
select ok(
  public.asistente_consultar_modulo('empresa') -> 'empresa' ->> 'nombre' is not null,
  'administración puede consultar la configuración básica de la empresa'
);
select ok(
  public.asistente_consultar_modulo('usuarios') -> 'usuarios'
    @> '[{"nombre":"Admin IA","rol":"administrador","activo":true}]'::jsonb,
  'administración puede consultar el equipo sin datos de contacto'
);

select set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-000000000002', true);
select ok(
  public.asistente_consultar_modulo('ventas') -> 'ventas'
    @> '[{"venta_id":"73000000-0000-4000-8000-000000000002"}]'::jsonb
    and not (public.asistente_consultar_modulo('ventas')::text like '%73000000-0000-4000-8000-000000000001%'),
  'las consultas del vendedor solo incluyen sus ventas'
);
select throws_ok(
  $$select public.asistente_consultar_modulo('empresa')$$,
  '42501', null,
  'un vendedor no consulta la configuración fiscal de la empresa'
);
select throws_ok(
  $$select public.asistente_consultar_modulo('usuarios')$$,
  '42501', null,
  'un vendedor no consulta el equipo'
);
select throws_ok(
  $$select public.asistente_consultar_modulo('tecnologia_interna')$$,
  '22023', null,
  'no hay consultas de tecnología interna'
);

reset role;
select ok(
  not has_function_privilege('anon', 'public.asistente_consultar_modulo(text,text,timestamp with time zone,timestamp with time zone)', 'execute'),
  'anon no puede consultar módulos'
);
select * from finish();
rollback;
