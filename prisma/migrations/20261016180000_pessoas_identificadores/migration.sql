-- Cadastro de pessoas: composição de nomes, identificadores de acesso, foto e
-- catálogo local de grupos de licença Microsoft. Somente acréscimos (colunas anuláveis e
-- nova tabela); nenhum dado existente é alterado ou apagado.

-- AlterTable
ALTER TABLE "colaborador" ADD COLUMN     "foto_chave" TEXT,
ADD COLUMN     "foto_tipo" TEXT,
ADD COLUMN     "grupo_licenca_id" TEXT,
ADD COLUMN     "login_microsoft" TEXT,
ADD COLUMN     "login_uau" TEXT,
ADD COLUMN     "nome_servidor_pc" TEXT,
ADD COLUMN     "segundo_nome" TEXT,
ADD COLUMN     "sobrenome_utilizado" TEXT;

-- CreateTable
CREATE TABLE "grupo_licenca" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "dominio_login" TEXT NOT NULL,
    "dominio_email" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grupo_licenca_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "grupo_licenca_nome_key" ON "grupo_licenca"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "colaborador_login_uau_key" ON "colaborador"("login_uau");

-- CreateIndex
CREATE UNIQUE INDEX "colaborador_login_microsoft_key" ON "colaborador"("login_microsoft");

-- CreateIndex
CREATE INDEX "colaborador_grupo_licenca_id_idx" ON "colaborador"("grupo_licenca_id");

-- AddForeignKey
ALTER TABLE "colaborador" ADD CONSTRAINT "colaborador_grupo_licenca_id_fkey" FOREIGN KEY ("grupo_licenca_id") REFERENCES "grupo_licenca"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Catálogo inicial (referência da planilha IAM - CAT). É configuração local: não comprova
-- licença atribuída nem domínio verificado no tenant Microsoft 365.
INSERT INTO "grupo_licenca" ("id", "nome", "dominio_login", "dominio_email") VALUES
  (gen_random_uuid()::text, 'ARVOS - F1', 'virtaeng.onmicrosoft.com', 'arvosconstrutora.com.br'),
  (gen_random_uuid()::text, 'PRESERVE - F1', 'virtaeng.onmicrosoft.com', 'preserveurbanismo.com.br'),
  (gen_random_uuid()::text, 'PRESERVE - BASIC+', 'preserveurbanismo.com.br', 'preserveurbanismo.com.br'),
  (gen_random_uuid()::text, 'VIRTA - BASIC+', 'virta.eng.br', 'virta.eng.br'),
  (gen_random_uuid()::text, 'VIRTA - F1', 'virtaeng.onmicrosoft.com', 'virta.eng.br')
ON CONFLICT ("nome") DO NOTHING;
