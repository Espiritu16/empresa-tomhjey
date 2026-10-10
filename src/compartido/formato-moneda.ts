export function formatearTotalesPorMoneda(
  totales: Partial<Record<"PEN" | "USD", number>>,
  monedaBase: string = "PEN",
): string {
  const entradas = (Object.entries(totales) as ["PEN" | "USD", number][])
    .filter(([, total]) => Number.isFinite(total))
    .sort(([monedaA], [monedaB]) => monedaA.localeCompare(monedaB));
  if (entradas.length === 0) {
    entradas.push([monedaBase === "USD" ? "USD" : "PEN", 0]);
  }

  return entradas
    .map(([moneda, total]) =>
      new Intl.NumberFormat("es-PE", {
        style: "currency",
        currency: moneda,
      }).format(total),
    )
    .join(" · ");
}

export function convertirTotalesPorMoneda(
  valor: unknown,
): Partial<Record<"PEN" | "USD", number>> {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return {};
  const totales = valor as Record<string, unknown>;
  return {
    ...(typeof totales.PEN === "number" ? { PEN: totales.PEN } : {}),
    ...(typeof totales.USD === "number" ? { USD: totales.USD } : {}),
  };
}
