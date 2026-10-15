import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

export const instant = false;

export default async function RedirigirComprobanteImpresion({
  params,
}: {
  params: Promise<{ comprobanteId: string }>;
}) {
  await connection();
  const { comprobanteId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(comprobanteId)) notFound();

  redirect(`/api/comprobantes/${comprobanteId}/pdf`);
}
