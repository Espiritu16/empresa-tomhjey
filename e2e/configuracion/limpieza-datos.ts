import type { SupabaseClient } from "@supabase/supabase-js";

export async function limpiarDatosE2E(
  supabase: SupabaseClient,
  usuarioIds: string[],
  empresaCreada: boolean,
): Promise<void> {
  const errores: string[] = [];
  const usuariosInvitados = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (usuariosInvitados.error) {
    throw new Error("No se pudieron revisar las cuentas invitadas E2E.");
  }
  const invitadosE2E = usuariosInvitados.data.users.filter((usuario) =>
    usuario.email?.startsWith("e2e-invitado-"),
  );
  const ventas = usuarioIds.length
    ? await supabase.from("ventas").select("id").in("creado_por", usuarioIds)
    : { data: [], error: null };
  const productos = usuarioIds.length
    ? await supabase.from("productos").select("id").in("creado_por", usuarioIds)
    : { data: [], error: null };
  const clientes = usuarioIds.length
    ? await supabase.from("clientes").select("id").in("creado_por", usuarioIds)
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
  if (usuarioIds.length) {
    const { error } = await supabase
      .from("movimientos_inventario")
      .delete()
      .in("usuario_id", usuarioIds);
    if (error) errores.push("movimientos");
    const { error: errorInvitaciones } = await supabase
      .from("invitaciones")
      .delete()
      .in("invitado_por", usuarioIds);
    if (errorInvitaciones) errores.push("invitaciones");
    const { error: errorConversaciones } = await supabase
      .from("conversaciones")
      .delete()
      .in("usuario_id", usuarioIds);
    if (errorConversaciones) errores.push("conversaciones");
    const { error: errorAuditoria } = await supabase
      .from("auditoria")
      .delete()
      .in("usuario_id", usuarioIds);
    if (errorAuditoria) errores.push("auditoría");
  }
  const { error: errorInvitacionesTemporales } = await supabase
    .from("invitaciones")
    .delete()
    .like("correo", "e2e-invitado-%@example.com");
  if (errorInvitacionesTemporales) errores.push("invitaciones temporales");
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
    .like("nombre", "E2E-%");
  if (errorCategorias) errores.push("categorías");

  if (empresaCreada) {
    const { error } = await supabase.from("empresa").delete().eq("unica", true);
    if (error) errores.push("empresa de pruebas");
  }
  for (const invitado of invitadosE2E) {
    const { error: errorPerfil } = await supabase
      .from("perfiles")
      .delete()
      .eq("id", invitado.id);
    if (errorPerfil) errores.push("perfil invitado");
    const { error: errorUsuario } = await supabase.auth.admin.deleteUser(
      invitado.id,
    );
    if (errorUsuario) errores.push("cuenta invitada");
  }
  if (errores.length) {
    throw new Error(
      "No se pudieron limpiar estos datos E2E: " + errores.join(", ") + ".",
    );
  }
}
