begin;
select plan(13);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
values ('12000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin-fiscal@test.local', '', now(), '{"nombre":"Admin fiscal"}', now(), now());
update public.perfiles set rol = 'administrador' where id = '12000000-0000-4000-8000-000000000001';
insert into public.empresa (nombre, ruc, igv_activo, igv_porcentaje, precios_incluyen_igv)
values ('Empresa fiscal', '20100066603', true, 18, true);
insert into public.productos (id, sku, nombre, precio, creado_por)
values ('30000000-0000-4000-8000-000000000001', 'VEST-01', 'Vestido', 118, '12000000-0000-4000-8000-000000000001');
insert into public.series_comprobante (tipo, serie, siguiente_numero)
values ('boleta', 'B001', 1);
insert into public.ventas (
  id, estado, subtotal, igv, total, creado_por, confirmado_por, confirmado_en
) values (
  '42000000-0000-4000-8000-000000000001', 'confirmada', 100, 18, 118,
  '12000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000001', now()
);
insert into public.lineas_venta (
  venta_id, producto_id, descripcion_congelada, sku_congelado, unidad_medida,
  cantidad, precio_unitario, subtotal, igv, total
) values (
  '42000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  'Vestido congelado talla M', 'VEST-01', 'NIU', 1, 118, 100, 18, 118
);
insert into public.ventas (
  id, estado, subtotal, igv, total, creado_por, confirmado_por, confirmado_en
) values (
  '42000000-0000-4000-8000-000000000002', 'confirmada', 700, 126, 826,
  '12000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000001', now()
);
insert into public.lineas_venta (
  venta_id, producto_id, descripcion_congelada, sku_congelado, unidad_medida,
  cantidad, precio_unitario, subtotal, igv, total
) values (
  '42000000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000001',
  'Venta alta sin documento', 'VEST-01', 'NIU', 7, 118, 700, 126, 826
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '12000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is((public.guardar_empresa('Empresa fiscal actualizada', '20100066603', null, null, null, 'PEN', true, 18, true)).nombre, 'Empresa fiscal actualizada', 'el administrador guarda la configuración de empresa');
select throws_ok(
  $$select public.guardar_empresa('Empresa fiscal', '20100066604', null, null, null, 'PEN', true, 18, true)$$,
  '22023', null, 'rechaza un RUC cuyo dígito verificador no coincide'
);
select throws_ok(
  $$select public.reservar_comprobante('12000000-0000-4000-8000-000000000001', '42000000-0000-4000-8000-000000000001', 'boleta')$$,
  '42501', null, 'el navegador no puede reservar correlativos fiscales'
);
select throws_ok(
  $$select public.registrar_resultado_comprobante('12000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'emitido', '{}'::jsonb, null)$$,
  '42501', null, 'el navegador no puede falsificar el resultado de emisión'
);
reset role;
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('test.reserva', public.reservar_comprobante('12000000-0000-4000-8000-000000000001', '42000000-0000-4000-8000-000000000001', 'boleta')::text, true);
select is(current_setting('test.reserva')::jsonb ->> 'serie', 'B001', 'reserva la serie activa');
select is(current_setting('test.reserva')::jsonb ->> 'numero', '1', 'reserva el correlativo antes de llamar al proveedor');
select is(current_setting('test.reserva')::jsonb -> 'payload' -> 'items' -> 0 ->> 'descripcion', 'Vestido congelado talla M', 'congela la descripción para el comprobante');
select is(current_setting('test.reserva')::jsonb ->> 'puede_emitir', 'true', 'permite el primer intento de emisión');
select is((public.reservar_comprobante('12000000-0000-4000-8000-000000000001', '42000000-0000-4000-8000-000000000001', 'boleta') ->> 'puede_emitir'), 'false', 'un intento concurrente no reemite mientras existe un lease');
select lives_ok(
  $$select public.registrar_resultado_comprobante(
    '12000000-0000-4000-8000-000000000001',
    (current_setting('test.reserva')::jsonb ->> 'comprobante_id')::uuid,
    'emitido', '{"enlace_del_pdf":"https://example.test/documento.pdf"}'::jsonb, null
  )$$,
  'guarda el resultado del proveedor'
);
select is((select estado from public.comprobantes where venta_id = '42000000-0000-4000-8000-000000000001'), 'emitido', 'el comprobante queda emitido');
select throws_ok(
  $$select public.reservar_comprobante('12000000-0000-4000-8000-000000000001', '42000000-0000-4000-8000-000000000002', 'boleta')$$,
  '22023', null, 'bloquea boleta mayor de S/ 700 sin identificar al cliente'
);
select is((select siguiente_numero from public.series_comprobante where tipo = 'boleta'), 2::bigint, 'una validación fallida no consume correlativo');

select * from finish();
rollback;
