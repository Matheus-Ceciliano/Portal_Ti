-- CreateEnum
CREATE TYPE "SituacaoColaborador" AS ENUM ('PRE_CADASTRO', 'ATIVO', 'AFASTADO', 'DESLIGADO');

-- CreateEnum
CREATE TYPE "SituacaoConta" AS ENUM ('ATIVA', 'BLOQUEADA', 'DESATIVADA');

-- CreateEnum
CREATE TYPE "Perfil" AS ENUM ('ESTAGIARIO_TI', 'SUPERVISOR_TI', 'GESTOR_ADM');

-- CreateEnum
CREATE TYPE "VisaoPainel" AS ENUM ('OPERACIONAL', 'GERENCIAL');

-- CreateEnum
CREATE TYPE "ResultadoAuditoria" AS ENUM ('SUCESSO', 'NEGADO', 'FALHA');

-- CreateTable
CREATE TABLE "instalacao" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "ambiente" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "instalacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "empresa" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "sigla" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "cidade" TEXT NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "empresa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "colaborador" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email_corporativo" TEXT NOT NULL,
    "cargo" TEXT NOT NULL,
    "departamento" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "situacao" "SituacaoColaborador" NOT NULL DEFAULT 'ATIVO',
    "entra_object_id" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "colaborador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "perfil_atribuido" (
    "id" TEXT NOT NULL,
    "colaborador_id" TEXT NOT NULL,
    "perfil" "Perfil" NOT NULL,
    "justificativa" TEXT NOT NULL,
    "atribuido_por" TEXT,
    "atribuido_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revogado_por" TEXT,
    "revogado_em" TIMESTAMP(3),

    CONSTRAINT "perfil_atribuido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissao_individual" (
    "id" TEXT NOT NULL,
    "colaborador_id" TEXT NOT NULL,
    "permissao" TEXT NOT NULL,
    "justificativa" TEXT NOT NULL,
    "concedida_por" TEXT NOT NULL,
    "concedida_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valida_ate" TIMESTAMP(3),
    "revogada_por" TEXT,
    "revogada_em" TIMESTAMP(3),

    CONSTRAINT "permissao_individual_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conta_acesso" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,
    "mfa_habilitado" BOOLEAN DEFAULT false,
    "colaborador_id" TEXT NOT NULL,
    "situacao" "SituacaoConta" NOT NULL DEFAULT 'ATIVA',
    "senha_pessoal_definida_em" TIMESTAMP(3),
    "ativacao_ti_codigo_validado_em" TIMESTAMP(3),
    "ativacao_ti_concluida_em" TIMESTAMP(3),
    "visao_painel" "VisaoPainel",
    "ultimo_acesso_em" TIMESTAMP(3),

    CONSTRAINT "conta_acesso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessao" (
    "id" TEXT NOT NULL,
    "expira_em" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "criada_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizada_em" TIMESTAMP(3) NOT NULL,
    "ip" TEXT,
    "user_agent" TEXT,
    "conta_id" TEXT NOT NULL,
    "mfa_verificado_em" TIMESTAMP(3),
    "ultimo_uso_em" TIMESTAMP(3),

    CONSTRAINT "sessao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credencial_conta" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "conta_id" TEXT NOT NULL,
    "access_token" TEXT,
    "refresh_token" TEXT,
    "id_token" TEXT,
    "access_token_expira_em" TIMESTAMP(3),
    "refresh_token_expira_em" TIMESTAMP(3),
    "scope" TEXT,
    "hash_senha" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credencial_conta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verificacao" (
    "id" TEXT NOT NULL,
    "identificador" TEXT NOT NULL,
    "valor" TEXT NOT NULL,
    "expira_em" TIMESTAMP(3) NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verificacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fator_mfa" (
    "id" TEXT NOT NULL,
    "segredo_cifrado" TEXT NOT NULL,
    "codigos_recuperacao_cifrados" TEXT NOT NULL,
    "conta_id" TEXT NOT NULL,
    "verificado" BOOLEAN DEFAULT true,
    "falhas_verificacao" INTEGER DEFAULT 0,
    "bloqueado_ate" TIMESTAMP(3),

    CONSTRAINT "fator_mfa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "codigo_ativacao" (
    "id" TEXT NOT NULL,
    "conta_id" TEXT NOT NULL,
    "hash_codigo" TEXT NOT NULL,
    "criado_por" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expira_em" TIMESTAMP(3) NOT NULL,
    "usado_em" TIMESTAMP(3),
    "invalidado_em" TIMESTAMP(3),
    "tentativas" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "codigo_ativacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "codigo_totp_usado" (
    "conta_id" TEXT NOT NULL,
    "hash_codigo" TEXT NOT NULL,
    "usado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "codigo_totp_usado_pkey" PRIMARY KEY ("conta_id","hash_codigo")
);

-- CreateTable
CREATE TABLE "limite_tentativa" (
    "chave" TEXT NOT NULL,
    "falhas" INTEGER NOT NULL DEFAULT 0,
    "janela_inicio" TIMESTAMP(3) NOT NULL,
    "bloqueado_ate" TIMESTAMP(3),

    CONSTRAINT "limite_tentativa_pkey" PRIMARY KEY ("chave")
);

-- CreateTable
CREATE TABLE "evento_auditoria" (
    "id" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ambiente" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "resultado" "ResultadoAuditoria" NOT NULL,
    "ator_conta_id" TEXT,
    "ator_nome" TEXT,
    "alvo_tipo" TEXT,
    "alvo_id" TEXT,
    "alvo_descricao" TEXT,
    "origem_permissao" TEXT,
    "detalhe" JSONB,
    "simulado" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "evento_auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "empresa_nome_key" ON "empresa"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "empresa_sigla_key" ON "empresa"("sigla");

-- CreateIndex
CREATE UNIQUE INDEX "empresa_cnpj_key" ON "empresa"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "colaborador_email_corporativo_key" ON "colaborador"("email_corporativo");

-- CreateIndex
CREATE UNIQUE INDEX "colaborador_entra_object_id_key" ON "colaborador"("entra_object_id");

-- CreateIndex
CREATE INDEX "colaborador_empresa_id_idx" ON "colaborador"("empresa_id");

-- CreateIndex
CREATE INDEX "perfil_atribuido_colaborador_id_idx" ON "perfil_atribuido"("colaborador_id");

-- CreateIndex
CREATE INDEX "permissao_individual_colaborador_id_idx" ON "permissao_individual"("colaborador_id");

-- CreateIndex
CREATE UNIQUE INDEX "conta_acesso_email_key" ON "conta_acesso"("email");

-- CreateIndex
CREATE UNIQUE INDEX "conta_acesso_colaborador_id_key" ON "conta_acesso"("colaborador_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessao_token_key" ON "sessao"("token");

-- CreateIndex
CREATE INDEX "sessao_conta_id_idx" ON "sessao"("conta_id");

-- CreateIndex
CREATE INDEX "credencial_conta_conta_id_idx" ON "credencial_conta"("conta_id");

-- CreateIndex
CREATE INDEX "verificacao_identificador_idx" ON "verificacao"("identificador");

-- CreateIndex
CREATE INDEX "fator_mfa_segredo_cifrado_idx" ON "fator_mfa"("segredo_cifrado");

-- CreateIndex
CREATE INDEX "fator_mfa_conta_id_idx" ON "fator_mfa"("conta_id");

-- CreateIndex
CREATE UNIQUE INDEX "codigo_ativacao_hash_codigo_key" ON "codigo_ativacao"("hash_codigo");

-- CreateIndex
CREATE INDEX "codigo_ativacao_conta_id_idx" ON "codigo_ativacao"("conta_id");

-- CreateIndex
CREATE INDEX "evento_auditoria_criado_em_idx" ON "evento_auditoria"("criado_em");

-- CreateIndex
CREATE INDEX "evento_auditoria_acao_idx" ON "evento_auditoria"("acao");

-- AddForeignKey
ALTER TABLE "colaborador" ADD CONSTRAINT "colaborador_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "perfil_atribuido" ADD CONSTRAINT "perfil_atribuido_colaborador_id_fkey" FOREIGN KEY ("colaborador_id") REFERENCES "colaborador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permissao_individual" ADD CONSTRAINT "permissao_individual_colaborador_id_fkey" FOREIGN KEY ("colaborador_id") REFERENCES "colaborador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conta_acesso" ADD CONSTRAINT "conta_acesso_colaborador_id_fkey" FOREIGN KEY ("colaborador_id") REFERENCES "colaborador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessao" ADD CONSTRAINT "sessao_conta_id_fkey" FOREIGN KEY ("conta_id") REFERENCES "conta_acesso"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credencial_conta" ADD CONSTRAINT "credencial_conta_conta_id_fkey" FOREIGN KEY ("conta_id") REFERENCES "conta_acesso"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fator_mfa" ADD CONSTRAINT "fator_mfa_conta_id_fkey" FOREIGN KEY ("conta_id") REFERENCES "conta_acesso"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "codigo_ativacao" ADD CONSTRAINT "codigo_ativacao_conta_id_fkey" FOREIGN KEY ("conta_id") REFERENCES "conta_acesso"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "codigo_totp_usado" ADD CONSTRAINT "codigo_totp_usado_conta_id_fkey" FOREIGN KEY ("conta_id") REFERENCES "conta_acesso"("id") ON DELETE CASCADE ON UPDATE CASCADE;
