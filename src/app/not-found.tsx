import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NaoEncontrado() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col justify-center px-4">
      <p className="tabular text-sm font-medium text-muted-foreground">Erro 404</p>
      <h1 className="mt-1 text-2xl leading-8 font-semibold">Página não encontrada</h1>
      <p className="mt-2 text-muted-foreground">O endereço pode ter mudado ou o registro não existe mais.</p>
      <div className="mt-6">
        <Button asChild>
          <Link href="/">Voltar ao início</Link>
        </Button>
      </div>
    </main>
  );
}
