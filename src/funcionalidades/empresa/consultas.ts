import { crearClienteSupabaseServidor } from "@/compartido/supabase/servidor";

export type DatosEmpresa = {
  nombre: string;
  ruc: string;
  direccion: string;
  telefono: string;
  correo: string;
  moneda: "PEN" | "USD";
  igvActivo: boolean;
  igvPorcentaje: string;
  preciosIncluyenIgv: boolean;
};

export async function cargarEmpresa() {
  const supabase = await crearClienteSupabaseServidor();
  const { data, error } = await supabase
    .from("empresa")
    .select(
      "nombre, ruc, direccion, telefono, correo, moneda, igv_activo, igv_porcentaje, precios_incluyen_igv",
    )
    .eq("unica", true)
    .maybeSingle();
  if (error)
    return {
      empresa: null,
      error: "No se pudo cargar la configuración de empresa.",
    };
  return {
    empresa: data
      ? {
          nombre: data.nombre,
          ruc: data.ruc ?? "",
          direccion: data.direccion ?? "",
          telefono: data.telefono ?? "",
          correo: data.correo ?? "",
          moneda: data.moneda,
          igvActivo: data.igv_activo,
          igvPorcentaje: String(data.igv_porcentaje),
          preciosIncluyenIgv: data.precios_incluyen_igv,
        }
      : null,
    error: null,
  };
}
