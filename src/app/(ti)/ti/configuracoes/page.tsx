import { ShieldCheck } from "lucide-react";
import { CabecalhoPagina, Secao, formatarData } from "@/components/comum/pagina";
import { StatusBadge } from "@/components/comum/status-badge";
import { exigirPaginaTi } from "@/server/auth/pagina";
import { CATALOGO, ROTULO_PERFIL, TODAS_PERMISSOES, ehConcedivel } from "@/server/authz/catalogo";
import { pode } from "@/server/authz/exigir";
import { listarCandidatosPerfil, listarEquipeTi } from "@/server/modulos/perfis";
import { FormularioAtribuirPerfil, FormularioConceder, AcoesMembro } from "./gestao-perfis";

export const metadata = { title: "Configurações" };

const POLITICA = [
  ["Senha", "Mínimo de 12 caracteres, sem a parte local do e-mail e fora da lista de senhas comuns (provisório até Q-39)"],
  ["Primeiro acesso", "A senha definida pela TI só abre a ativação; o titular define a própria senha"],
  ["Perfil de TI", "Código de ativação de uso único (48 h, 5 tentativas) e aplicativo autenticador obrigatório"],
  ["Sessão", "12 h no máximo; inatividade de 30 min para a TI e 8 h para colaboradores (Q-15)"],
  ["Tentativas de entrada", "5 falhas por e-mail ou 30 por IP em 15 min geram bloqueio temporário de 15 min"],
];

/** Data mínima de validade de uma concessão (amanhã), no formato do campo de data. */
function amanhaIso() {
  return new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
}

export default async function PaginaConfiguracoes() {
  const ator = await exigirPaginaTi("perfil.ver");
  const [equipe, candidatos] = await Promise.all([listarEquipeTi(ator), listarCandidatosPerfil(ator)]);
  const alvoQualquer = { colaboradorId: "alvo-hipotetico", temPerfilTiAtivo: true };
  const podeGerirPerfis = pode(ator, "perfil.atribuir", alvoQualquer);
  const podeGerirPermissoes = pode(ator, "permissao_individual.gerenciar", alvoQualquer);
  const concediveis = TODAS_PERMISSOES.filter(ehConcedivel).map((p) => ({ valor: p, rotulo: CATALOGO[p].descricao }));

  return (
    <>
      <CabecalhoPagina
        titulo="Configurações"
        descricao="Perfis da equipe de TI, permissões individuais e regras de segurança do portal."
      />
      <div className="flex flex-col gap-6">
        {!podeGerirPerfis ? (
          <div role="note" className="flex gap-3 rounded-lg border border-info/25 bg-info-fundo px-4 py-3 text-sm text-info">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
            Somente Supervisor TI e Gestor ADM alteram perfis e permissões. Você pode consultar a equipe e as concessões.
          </div>
        ) : null}

        <Secao titulo="Equipe de TI" descricao="Perfis só valem depois que o titular conclui a ativação com o autenticador.">
          <ul className="divide-y">
            {equipe.map((m) => (
              <li key={m.colaboradorId} className="flex flex-col gap-3 px-4 py-4 sm:px-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <p className="font-semibold text-titulo">{m.nome}</p>
                  <p className="text-[13px] text-muted-foreground">{m.cargo} · {m.email}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {m.perfis.map((p) => (
                      <StatusBadge key={p.id} tom="info">{ROTULO_PERFIL[p.perfil]}</StatusBadge>
                    ))}
                    {m.ativacaoConcluida ? (
                      <StatusBadge tom="sucesso">Ativação concluída</StatusBadge>
                    ) : (
                      <StatusBadge tom="atencao">Ativação pendente</StatusBadge>
                    )}
                  </div>
                  {m.permissoes.length ? (
                    <ul className="mt-2 flex flex-col gap-1 text-[13px]">
                      {m.permissoes.map((pi) => (
                        <li key={pi.id} className="text-muted-foreground">
                          Permissão individual: <span className="font-medium text-titulo">{CATALOGO[pi.permissao as keyof typeof CATALOGO]?.descricao ?? pi.permissao}</span>
                          {pi.validaAte ? ` até ${formatarData(pi.validaAte)}` : ""}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                {podeGerirPerfis ? (
                  <AcoesMembro
                    colaboradorId={m.colaboradorId}
                    nome={m.nome}
                    perfis={m.perfis.map((p) => ({ id: p.id, rotulo: ROTULO_PERFIL[p.perfil] }))}
                    permissoes={m.permissoes.map((p) => ({ id: p.id, rotulo: CATALOGO[p.permissao as keyof typeof CATALOGO]?.descricao ?? p.permissao }))}
                    ativacaoPendente={!m.ativacaoConcluida}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        </Secao>

        {podeGerirPerfis || podeGerirPermissoes ? (
          <div className="grid gap-6 lg:grid-cols-2">
            {podeGerirPerfis ? (
              <Secao titulo="Atribuir perfil de TI" descricao="Encerra as sessões da pessoa e gera um código de ativação de uso único.">
                <FormularioAtribuirPerfil pessoas={candidatos.map((c) => ({ id: c.id, rotulo: `${c.nome} (${c.emailCorporativo})` }))} />
              </Secao>
            ) : null}
            {podeGerirPermissoes ? (
              <Secao titulo="Conceder permissão individual" descricao="Somente a quem tem perfil de TI. Provisionamento exige validade.">
                <FormularioConceder
                  pessoas={equipe.map((m) => ({ id: m.colaboradorId, rotulo: m.nome }))}
                  permissoes={concediveis}
                  dataMinima={amanhaIso()}
                />
              </Secao>
            ) : null}
          </div>
        ) : null}

        <Secao titulo="Regras de segurança em vigor" descricao="Valores provisórios até as decisões da TI. Alteração exclusiva de perfis administrativos.">
          <dl className="divide-y">
            {POLITICA.map(([rotulo, valor]) => (
              <div key={rotulo} className="grid gap-1 px-5 py-3 sm:grid-cols-[200px_1fr]">
                <dt className="font-medium text-titulo">{rotulo}</dt>
                <dd className="text-muted-foreground">{valor}</dd>
              </div>
            ))}
          </dl>
        </Secao>
      </div>
    </>
  );
}
