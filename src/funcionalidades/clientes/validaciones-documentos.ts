export type TipoDocumentoConsultable = "dni" | "ruc";

export function documentoConsultable(
  tipoDocumento: string,
  numeroDocumento: string,
): tipoDocumento is TipoDocumentoConsultable {
  if (tipoDocumento === "dni") return /^[0-9]{8}$/.test(numeroDocumento);
  if (tipoDocumento !== "ruc" || !/^[0-9]{11}$/.test(numeroDocumento)) {
    return false;
  }

  if (!["10", "15", "17", "20"].includes(numeroDocumento.slice(0, 2))) {
    return false;
  }

  const factores = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = factores.reduce(
    (acumulado, factor, indice) =>
      acumulado + Number(numeroDocumento[indice]) * factor,
    0,
  );
  const resto = 11 - (suma % 11);
  const digitoVerificador = resto === 10 ? 0 : resto === 11 ? 1 : resto;

  return digitoVerificador === Number(numeroDocumento[10]);
}
