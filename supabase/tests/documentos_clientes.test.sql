begin;
select plan(5);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
values ('99000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'documentos-clientes@test.local', '', now(), '{"nombre":"Pruebas documentos"}', now(), now());

select lives_ok(
  $$insert into public.clientes (tipo_documento, numero_documento, nombre, creado_por)
    values ('dni', '12345678', 'Cliente DNI válido', '99000000-0000-4000-8000-000000000001')$$,
  'acepta DNI de ocho dígitos'
);
select throws_ok(
  $$insert into public.clientes (tipo_documento, numero_documento, nombre, creado_por)
    values ('dni', '1234A678', 'Cliente DNI inválido', '99000000-0000-4000-8000-000000000001')$$,
  '23514', null, 'rechaza DNI con caracteres no numéricos'
);
select lives_ok(
  $$insert into public.clientes (tipo_documento, numero_documento, nombre, creado_por)
    values ('ruc', '10123456781', 'Persona natural con RUC válido', '99000000-0000-4000-8000-000000000001')$$,
  'acepta RUC con prefijo 10 de persona natural'
);
select lives_ok(
  $$insert into public.clientes (tipo_documento, numero_documento, nombre, creado_por)
    values ('ruc', '20100130204', 'Empresa RUC válida', '99000000-0000-4000-8000-000000000001')$$,
  'acepta RUC con prefijo 20 de persona jurídica'
);
select throws_ok(
  $$insert into public.clientes (tipo_documento, numero_documento, nombre, creado_por)
    values ('ruc', '20100130203', 'Empresa RUC inválida', '99000000-0000-4000-8000-000000000001')$$,
  '23514', null, 'rechaza RUC con dígito verificador incorrecto'
);

select * from finish();
rollback;
