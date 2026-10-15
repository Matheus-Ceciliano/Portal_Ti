import { redirect } from "next/navigation";
import { destinoInicial } from "@/server/auth/sessao";

export default async function Raiz() {
  redirect(await destinoInicial());
}
