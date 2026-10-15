begin;
select plan(12);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_user_meta_data, created_at, updated_at
) values (
  '11000000-0000-4000-8000-000000000031',
  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'consulta-factura@test.local', '', now(), '{"nombre":"Administración consulta"}', now(), now()
), (
  '11000000-0000-4000-8000-000000000032',
  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'consulta-factura-vendedor@test.local', '', now(), '{"nombre":"Vendedor consulta"}', now(), now()
);
update public.perfiles
set rol = 'administrador'
where id = '11000000-0000-4000-8000-000000000031';
insert into public.clientes (
  id, tipo_documento, numero_documento, nombre, creado_por
) values (
  '32000000-0000-4000-8000-000000000031', 'ruc', '20100066603',
  'Cliente consulta factura', '11000000-0000-4000-8000-000000000031'
);
insert into public.ventas (
  id, cliente_id, cliente_nombre, cliente_tipo_documento,
  cliente_numero_documento, estado, moneda, subtotal, igv, total,
  creado_por, confirmado_por, confirmado_en, tipo_comprobante
) values (
  '42000000-0000-4000-8000-000000000031',
  '32000000-0000-4000-8000-000000000031', 'Cliente consulta factura',
  'ruc', '20100066603', 'confirmada', 'PEN', 100, 0, 100,
  '11000000-0000-4000-8000-000000000031',
  '11000000-0000-4000-8000-000000000031', now(), 'factura'
);
insert into public.comprobantes (
  id, venta_id, tipo, serie, numero, estado, payload, respuesta_proveedor,
  solicitado_por, intentos, consultado_sunat_en
) values (
  '52000000-0000-4000-8000-000000000031',
  '42000000-0000-4000-8000-000000000031', 'factura', 'FQ31', 31,
  'emitido', '{"tipo_de_comprobante":1,"serie":"FQ31","numero":31,"total":100}'::jsonb,
  '{"aceptada_por_sunat":false}'::jsonb,
  '11000000-0000-4000-8000-000000000031', 1, now()
);

select ok(
  not has_function_privilege(
    'authenticated', 'public.reservar_consulta_factura(uuid,uuid)', 'EXECUTE'
  ),
  'la aplicación no puede reservar directamente una consulta fiscal'
);
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select throws_ok(
  $$select public.reservar_consulta_factura(
    '11000000-0000-4000-8000-000000000032',
    '52000000-0000-4000-8000-000000000031'
  )$$,
  '42501', null,
  'el vendedor no puede reservar una consulta fiscal'
);
select set_config('test.reserva_factura', public.reservar_consulta_factura(
  '11000000-0000-4000-8000-000000000031',
  '52000000-0000-4000-8000-000000000031'
)::text, true);
select is(
  current_setting('test.reserva_factura')::jsonb ->> 'serie',
  'FQ31',
  'la reserva devuelve la serie ya emitida'
);
select is(
  (select estado from public.comprobantes where id = '52000000-0000-4000-8000-000000000031'),
  'emitido',
  'consultar no cambia el estado de emisión'
);
select throws_ok(
  $$select public.reservar_consulta_factura(
    '11000000-0000-4000-8000-000000000031',
    '52000000-0000-4000-8000-000000000031'
  )$$,
  '55P03', null,
  'una segunda consulta concurrente no reserva el mismo comprobante'
);
select lives_ok(
  $$select public.registrar_consulta_factura(
    '11000000-0000-4000-8000-000000000031',
    '52000000-0000-4000-8000-000000000031',
    '{"aceptada_por_sunat":false}'::jsonb
  )$$,
  'guarda la respuesta pendiente de la consulta fiscal'
);
select is(
  (select respuesta_consulta_sunat ->> 'aceptada_por_sunat' from public.comprobantes where id = '52000000-0000-4000-8000-000000000031'),
  'false',
  'el resultado pendiente queda persistido'
);
select is(
  (select estado from public.comprobantes where id = '52000000-0000-4000-8000-000000000031'),
  'emitido',
  'persistir una consulta no reemite ni altera el comprobante'
);
select ok(
  (select consultado_sunat_en is not null and consulta_en_proceso_hasta is null from public.comprobantes where id = '52000000-0000-4000-8000-000000000031'),
  'guarda la hora de consulta y libera la reserva'
);
select lives_ok(
  $$select public.reservar_consulta_factura(
    '11000000-0000-4000-8000-000000000031',
    '52000000-0000-4000-8000-000000000031'
  )$$,
  'permite volver a consultar inmediatamente una factura pendiente'
);
select lives_ok(
  $$select public.registrar_consulta_factura(
    '11000000-0000-4000-8000-000000000031',
    '52000000-0000-4000-8000-000000000031',
    '{"aceptada_por_sunat":true,"enlace_del_pdf":"https://example.test/factura.pdf"}'::jsonb
  )$$,
  'guarda la aceptación obtenida en la consulta siguiente'
);
select throws_ok(
  $$select public.reservar_consulta_factura(
    '11000000-0000-4000-8000-000000000031',
    '52000000-0000-4000-8000-000000000031'
  )$$,
  '22023', null,
  'una factura aceptada no permite otra consulta'
);

select * from finish();
rollback;
