import { crearClienteSupabaseServidor } from "@/compartido/supabase/servidor";

export type Cliente = {
  id: string;
  tipoDocumento: string;
  numeroDocumento: string | null;
  nombre: string;
  direccion: string | null;
  telefono: string | null;
  correo: string | null;
  notas: string | null;
  activo: boolean;
};

export type VentaCliente = {
  id: string;
  estado: string;
  total: number;
  moneda: string;
  creadoEn: string;
  confirmadoEn: string | null;
};

export async function cargarClientes() {
  const supabase = await crearClienteSupabaseServidor();
  const [clientes, ventas] = await Promise.all([
    supabase
      .from("clientes")
      .select(
        "id, tipo_documento, numero_documento, nombre, direccion, telefono, correo, notas, activo",
      )
      .order("nombre"),
    supabase
      .from("ventas")
      .select("id, cliente_id, estado, total, moneda, creado_en, confirmado_en")
      .not("cliente_id", "is", null)
      .order("creado_en", { ascending: false })
      .limit(500),
  ]);

  if (clientes.error || ventas.error) {
    return {
      clientes: [],
      ventasPorCliente: {},
      error: "No se pudo cargar el directorio de clientes.",
    };
  }

  const ventasPorCliente: Record<string, VentaCliente[]> = {};
  for (const venta of ventas.data ?? []) {
    if (!venta.cliente_id) continue;
    ventasPorCliente[venta.cliente_id] ??= [];
    ventasPorCliente[venta.cliente_id].push({
      id: venta.id,
      estado: venta.estado,
      total: Number(venta.total),
      moneda: venta.moneda,
      creadoEn: venta.creado_en,
      confirmadoEn: venta.confirmado_en,
    });
  }

  return {
    clientes: (clientes.data ?? []).map((cliente) => ({
      id: cliente.id,
      tipoDocumento: cliente.tipo_documento,
      numeroDocumento: cliente.numero_documento,
      nombre: cliente.nombre,
      direccion: cliente.direccion,
      telefono: cliente.telefono,
      correo: cliente.correo,
      notas: cliente.notas,
      activo: cliente.activo,
    })) as Cliente[],
    ventasPorCliente,
    error: null,
  };
}
