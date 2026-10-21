import { redirect } from "next/navigation";

/** Endereço anterior: os termos e documentos do colaborador ficam em Meus Termos de Responsabilidade. */
export default function MeusDocumentos() {
  redirect("/portal/termos");
}
