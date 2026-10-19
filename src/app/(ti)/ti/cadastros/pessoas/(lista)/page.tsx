import { texto, type Parametros } from "@/components/comum/tabela";
import { GestaoPessoas } from "@/components/pessoas/gestao-pessoas";
import { exigirPaginaTi } from "@/server/auth/pagina";
import { pode } from "@/server/authz/exigir";
import { listarEmpresas } from "@/server/modulos/empresas";
import { listarGruposLicenca } from "@/server/modulos/grupos-licenca";
import { listarPessoas, podeEditarPessoa, SITUACOES_PESSOA, type FiltroPessoas } from "@/server/modulos/pessoas";

export const metadata = { title: "Pessoas" };

const ORDENACOES = ["nome", "empresa", "cargo", "situacao"] as const;

export default async function PaginaPessoas({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ator = await exigirPaginaTi("colaborador.ver", { escopoGrupo: true });
  const sp = await searchParams;
  const parametros: Parametros = {
    busca: texto(sp.busca),
    empresa: texto(sp.empresa),
    situacao: texto(sp.situacao),
    departamento: texto(sp.departamento),
    grupo: texto(sp.grupo),
    ordenar: texto(sp.ordenar),
    direcao: texto(sp.direcao),
    pagina: texto(sp.pagina),
  };
  const filtro: FiltroPessoas = {
    busca: parametros.busca,
    empresaId: parametros.empresa,
    situacao: SITUACOES_PESSOA.find((s) => s === parametros.situacao),
    departamento: parametros.departamento,
    grupoLicencaId: parametros.grupo,
    ordenar: ORDENACOES.find((o) => o === parametros.ordenar),
    direcao: parametros.direcao === "desc" ? "desc" : "asc",
    pagina: Number(parametros.pagina) || 1,
  };

  // Pessoa nova não tem perfil de TI nem é o próprio ator: a restrição dependente do alvo não se aplica.
  const alvoNovo = { colaboradorId: "nova-pessoa", temPerfilTiAtivo: false };
  const podeGerenciarCatalogo = pode(ator, "catalogo.gerenciar");
  const [resultado, empresas, grupos] = await Promise.all([
    listarPessoas(ator, filtro),
    listarEmpresas(ator),
    listarGruposLicenca(ator, { incluirInativos: podeGerenciarCatalogo }),
  ]);

  return (
    <GestaoPessoas
      resultado={resultado}
      editaveis={resultado.linhas.filter((l) => podeEditarPessoa(ator, { colaboradorId: l.id, temPerfilTiAtivo: l.temPerfilTi })).map((l) => l.id)}
      parametros={parametros}
      filtrando={Boolean(parametros.busca || parametros.empresa || parametros.situacao || parametros.departamento || parametros.grupo)}
      empresas={empresas.map((e) => ({ id: e.id, nome: e.nome, sigla: e.sigla, nomeCurtoSenha: e.nomeCurtoSenha, ativa: e.ativa }))}
      grupos={grupos}
      podeCadastrar={pode(ator, "colaborador.criar") && pode(ator, "conta_acesso.criar", alvoNovo)}
      podeProvisionar={pode(ator, "provisionamento.executar", alvoNovo)}
      podeGerenciarCatalogo={podeGerenciarCatalogo}
    />
  );
}
