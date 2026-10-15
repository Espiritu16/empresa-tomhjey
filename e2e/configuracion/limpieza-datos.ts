import type { SupabaseClient } from "@supabase/supabase-js";

export async function limpiarDatosE2E(
  supabase: SupabaseClient,
  usuarioIds: string[],
  empresaCreada: boolean,
  identificadorE2E: string,
): Promise<void> {
  const errores: string[] = [];
  const prefijosCuenta = [
    `e2e-vendedor-${identificadorE2E}-`,
    `e2e-admin-${identificadorE2E}-`,
  ];
  const prefijoCategoria = `E2E-${identificadorE2E}-`;
  const cuentasE2E = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (cuentasE2E.error) {
    throw new Error("No se pudieron revisar las cuentas E2E.");
  }
  const usuariosE2E = cuentasE2E.data.users.filter((usuario) =>
    prefijosCuenta.some((prefijo) => usuario.email?.startsWith(prefijo)),
  );
  const idsUsuariosE2E = [
    ...new Set([...usuarioIds, ...usuariosE2E.map((usuario) => usuario.id)]),
  ];
  const ventas = idsUsuariosE2E.length
    ? await supabase
        .from("ventas")
        .select("id")
        .in("creado_por", idsUsuariosE2E)
    : { data: [], error: null };
  const productos = idsUsuariosE2E.length
    ? await supabase
        .from("productos")
        .select("id")
        .in("creado_por", idsUsuariosE2E)
    : { data: [], error: null };
  const clientes = idsUsuariosE2E.length
    ? await supabase
        .from("clientes")
        .select("id")
        .in("creado_por", idsUsuariosE2E)
    : { data: [], error: null };
  if (ventas.error || productos.error || clientes.error) {
    throw new Error("No se pudieron ubicar los datos temporales E2E.");
  }

  const ventaIds = (ventas.data ?? []).map((venta) => venta.id);
  const productoIds = (productos.data ?? []).map((producto) => producto.id);
  const clienteIds = (clientes.data ?? []).map((cliente) => cliente.id);

  if (ventaIds.length) {
    const { error } = await supabase
      .from("comprobantes")
      .delete()
      .in("venta_id", ventaIds);
    if (error) errores.push("comprobantes");
  }
  if (idsUsuariosE2E.length) {
    const { error } = await supabase
      .from("movimientos_inventario")
      .delete()
      .in("usuario_id", idsUsuariosE2E);
    if (error) errores.push("movimientos");
    const { error: errorConversaciones } = await supabase
      .from("conversaciones")
      .delete()
      .in("usuario_id", idsUsuariosE2E);
    if (errorConversaciones) errores.push("conversaciones");
    const { error: errorAuditoria } = await supabase
      .from("auditoria")
      .delete()
      .in("usuario_id", idsUsuariosE2E);
    if (errorAuditoria) errores.push("auditoría");
  }
  if (productoIds.length) {
    const { error } = await supabase
      .from("movimientos_inventario")
      .delete()
      .in("producto_id", productoIds);
    if (error) errores.push("movimientos de productos");
  }
  if (ventaIds.length) {
    const { error } = await supabase.from("ventas").delete().in("id", ventaIds);
    if (error) errores.push("ventas");
  }
  if (productoIds.length) {
    const { error } = await supabase
      .from("productos")
      .delete()
      .in("id", productoIds);
    if (error) errores.push("productos");
  }
  if (clienteIds.length) {
    const { error } = await supabase
      .from("clientes")
      .delete()
      .in("id", clienteIds);
    if (error) errores.push("clientes");
  }
  const { error: errorCategorias } = await supabase
    .from("categorias")
    .delete()
    .like("nombre", `${prefijoCategoria}%`);
  if (errorCategorias) errores.push("categorías");

  if (empresaCreada) {
    const { error } = await supabase.from("empresa").delete().eq("unica", true);
    if (error) errores.push("empresa de pruebas");
  }
  for (const usuario of usuariosE2E) {
    const { error: errorPerfil } = await supabase
      .from("perfiles")
      .delete()
      .eq("id", usuario.id);
    if (errorPerfil) errores.push("perfil de usuario");
    const { error: errorUsuario } = await supabase.auth.admin.deleteUser(
      usuario.id,
    );
    if (errorUsuario) errores.push("cuenta de usuario");
  }
  if (errores.length) {
    throw new Error(
      "No se pudieron limpiar estos datos E2E: " + errores.join(", ") + ".",
    );
  }
}
