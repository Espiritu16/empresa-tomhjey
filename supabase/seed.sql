-- Datos de demostración para el stack local de Empresa Tomhjay.
-- Esta semilla no crea usuarios, no modifica la empresa y no confirma ventas.
-- Los saldos de stock se cargan por la RPC ajustar_existencias.
do $seed$
declare
  usuario_demo uuid;
  categoria_polos uuid;
  categoria_denim uuid;
  producto_polo uuid := 'e0000000-0000-4000-8000-000000000001';
  producto_jean uuid := 'e0000000-0000-4000-8000-000000000002';
  producto_casaca uuid := 'e0000000-0000-4000-8000-000000000003';
  cliente_mostrador uuid := 'e1000000-0000-4000-8000-000000000001';
  cliente_dni uuid := 'e1000000-0000-4000-8000-000000000002';
  cliente_ruc uuid := 'e1000000-0000-4000-8000-000000000003';
  venta_simple uuid;
  venta_boleta uuid;
  venta_factura uuid;
  estado_venta text;
  motivo_stock text := 'Semilla local Empresa Tomhjay';
begin
  select p.id into usuario_demo
  from public.perfiles p
  where p.rol = 'administrador' and p.activo
  order by p.creado_en
  limit 1;

  if usuario_demo is null then
    raise notice 'Semilla omitida: crea o conserva una cuenta administradora local antes de aplicarla.';
    return;
  end if;

  -- Las RPC de negocio validan el rol usando auth.uid(). Simulamos el usuario
  -- administrador solo dentro de esta transacción de semilla local.
  perform set_config('request.jwt.claim.sub', usuario_demo::text, true);

  insert into public.categorias (nombre)
  values ('Demostración · Polos'), ('Demostración · Denim')
  on conflict (nombre) do nothing;

  select c.id into strict categoria_polos
  from public.categorias c where c.nombre = 'Demostración · Polos';
  select c.id into strict categoria_denim
  from public.categorias c where c.nombre = 'Demostración · Denim';

  insert into public.productos (
    id, categoria_id, sku, nombre, descripcion, unidad_medida,
    usa_combinaciones, precio, existencias, stock_minimo, activo, creado_por
  ) values
    (
      producto_polo, categoria_polos, 'DEMO-POLO-001', 'Polo básico Tomhjay',
      'Polo de algodón para mostrar el catálogo y las ventas.', 'NIU', false,
      49.90, 0, 3, true, usuario_demo
    ),
    (
      producto_jean, categoria_denim, 'DEMO-JEAN-001', 'Jean clásico azul',
      'Jean de demostración con existencias bajo el mínimo.', 'NIU', false,
      89.90, 0, 4, true, usuario_demo
    ),
    (
      producto_casaca, categoria_denim, 'DEMO-CASACA-001', 'Casaca denim',
      'Casaca de demostración sin existencias.', 'NIU', false,
      159.90, 0, 1, true, usuario_demo
    )
  on conflict (id) do nothing;

  insert into public.clientes (
    id, tipo_documento, numero_documento, nombre, direccion,
    telefono, correo, notas, creado_por
  ) values
    (
      cliente_mostrador, 'sin_documento', null, 'Cliente de mostrador demo',
      null, null, null, 'Registro ficticio para pruebas locales.', usuario_demo
    ),
    (
      cliente_dni, 'dni', '99999999', 'María Fernanda Paredes (demo)',
      'Dirección de demostración', '900000001', 'maria.demo@example.test',
      'Datos ficticios para pruebas locales.', usuario_demo
    ),
    (
      cliente_ruc, 'ruc', '20987654326', 'Comercial de demostración S.A.C.',
      'Dirección de demostración', '900000002', 'comercial.demo@example.test',
      'RUC sintético para probar formularios locales; no usar para emisión real.',
      usuario_demo
    )
  on conflict (id) do nothing;

  -- Las marcas de motivo hacen que volver a aplicar la semilla no duplique stock.
  if not exists (
    select 1 from public.movimientos_inventario m
    where m.producto_id = producto_polo and m.motivo = motivo_stock
  ) then
    perform public.ajustar_existencias(
      producto_polo, null, 12, motivo_stock
    );
  end if;

  if not exists (
    select 1 from public.movimientos_inventario m
    where m.producto_id = producto_jean and m.motivo = motivo_stock
  ) then
    perform public.ajustar_existencias(
      producto_jean, null, 2, motivo_stock
    );
  end if;

  if not exists (
    select 1 from public.movimientos_inventario m
    where m.producto_id = producto_casaca and m.motivo = motivo_stock
  ) then
    perform public.ajustar_existencias(
      producto_casaca, null, 1, motivo_stock
    );
    perform public.ajustar_existencias(
      producto_casaca, null, -1, motivo_stock
    );
  end if;

  -- Borradores de muestra: no descuentan existencias ni llaman a NubeFacT.
  select v.id, v.estado into venta_simple, estado_venta
  from public.ventas v where v.nota = '[DEMO LOCAL] Boleta simple'
  order by v.creado_en limit 1;
  if venta_simple is null then
    venta_simple := public.crear_borrador_venta_con_comprobante(
      null,
      jsonb_build_array(jsonb_build_object(
        'producto_id', producto_polo,
        'combinacion_id', null,
        'cantidad', 1
      )),
      'boleta',
      null
    );
    update public.ventas
    set nota = '[DEMO LOCAL] Boleta simple'
    where id = venta_simple;
  elsif estado_venta = 'borrador' then
    perform public.crear_borrador_venta_con_comprobante(
      null,
      jsonb_build_array(jsonb_build_object(
        'producto_id', producto_polo,
        'combinacion_id', null,
        'cantidad', 1
      )),
      'boleta',
      venta_simple
    );
  end if;

  select v.id, v.estado into venta_boleta, estado_venta
  from public.ventas v where v.nota = '[DEMO LOCAL] Boleta identificada'
  order by v.creado_en limit 1;
  if venta_boleta is null then
    venta_boleta := public.crear_borrador_venta_con_comprobante(
      cliente_dni,
      jsonb_build_array(jsonb_build_object(
        'producto_id', producto_jean,
        'combinacion_id', null,
        'cantidad', 1
      )),
      'boleta',
      null
    );
    update public.ventas
    set nota = '[DEMO LOCAL] Boleta identificada'
    where id = venta_boleta;
  elsif estado_venta = 'borrador' then
    perform public.crear_borrador_venta_con_comprobante(
      cliente_dni,
      jsonb_build_array(jsonb_build_object(
        'producto_id', producto_jean,
        'combinacion_id', null,
        'cantidad', 1
      )),
      'boleta',
      venta_boleta
    );
  end if;

  select v.id, v.estado into venta_factura, estado_venta
  from public.ventas v where v.nota = '[DEMO LOCAL] Factura identificada'
  order by v.creado_en limit 1;
  if venta_factura is null then
    venta_factura := public.crear_borrador_venta_con_comprobante(
      cliente_ruc,
      jsonb_build_array(jsonb_build_object(
        'producto_id', producto_casaca,
        'combinacion_id', null,
        'cantidad', 1
      )),
      'factura',
      null
    );
    update public.ventas
    set nota = '[DEMO LOCAL] Factura identificada'
    where id = venta_factura;
  elsif estado_venta = 'borrador' then
    perform public.crear_borrador_venta_con_comprobante(
      cliente_ruc,
      jsonb_build_array(jsonb_build_object(
        'producto_id', producto_casaca,
        'combinacion_id', null,
        'cantidad', 1
      )),
      'factura',
      venta_factura
    );
  end if;
end;
$seed$;
