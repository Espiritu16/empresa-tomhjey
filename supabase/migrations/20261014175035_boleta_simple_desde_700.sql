do $$
declare
  firma text;
  definicion text;
  definicion_actualizada text;
begin
  foreach firma in array array[
    'public.crear_borrador_venta_con_comprobante(uuid,jsonb,text,uuid)',
    'public.confirmar_venta_con_comprobante(uuid,text)',
    'public.reservar_comprobante(uuid,uuid,text)'
  ] loop
    definicion := pg_get_functiondef(to_regprocedure(firma));
    definicion_actualizada := replace(
      definicion,
      'venta_actual.total > 700',
      'venta_actual.total >= 700'
    );
    definicion_actualizada := replace(
      definicion_actualizada,
      'Las boletas mayores a S/ 700 requieren identificar al cliente.',
      'Las boletas desde S/ 700 requieren identificar al cliente.'
    );

    if definicion_actualizada = definicion
      or position('venta_actual.total >= 700' in definicion_actualizada) = 0 then
      raise exception 'No se pudo actualizar el umbral en %.', firma;
    end if;

    execute definicion_actualizada;
  end loop;
end;
$$;
