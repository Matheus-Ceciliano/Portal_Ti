-- Unicidade dos identificadores de acesso (aditiva: nenhum registro é apagado ou alterado
-- além da nova coluna de chave).

-- Usuário do servidor/PC: chave sem maiúsculas, sem acentos e com espaços simples.
ALTER TABLE "colaborador" ADD COLUMN "chave_servidor_pc" TEXT;

-- Cadastros existentes: a chave fica só no mais antigo de cada nome repetido; os demais
-- continuam sem chave (sem perder dados) e a aplicação ainda os encontra pelo mais antigo.
UPDATE "colaborador" c
SET "chave_servidor_pc" = t.chave
FROM (
  SELECT id, chave, row_number() OVER (PARTITION BY chave ORDER BY criado_em, id) AS ordem
  FROM (
    SELECT id, criado_em,
      lower(translate(regexp_replace(btrim(nome_servidor_pc), '\s+', ' ', 'g'),
        'áàâãäåéèêëíìîïóòôõöúùûüçñýÿÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑÝ',
        'aaaaaaeeeeiiiiooooouuuucnyyAAAAAAEEEEIIIIOOOOOUUUUCNY')) AS chave
    FROM "colaborador"
    WHERE nome_servidor_pc IS NOT NULL AND btrim(nome_servidor_pc) <> ''
  ) s
) t
WHERE c.id = t.id AND t.ordem = 1;

CREATE UNIQUE INDEX "colaborador_chave_servidor_pc_key" ON "colaborador"("chave_servidor_pc");

-- Logins sempre gravados na forma normalizada de cada sistema: assim os índices únicos já
-- existentes valem sem diferenciar maiúsculas. NOT VALID: não revalida linhas antigas.
ALTER TABLE "colaborador" ADD CONSTRAINT "colaborador_login_uau_maiusculo" CHECK ("login_uau" = upper("login_uau")) NOT VALID;
ALTER TABLE "colaborador" ADD CONSTRAINT "colaborador_login_microsoft_minusculo" CHECK ("login_microsoft" = lower("login_microsoft")) NOT VALID;
ALTER TABLE "colaborador" ADD CONSTRAINT "colaborador_email_corporativo_minusculo" CHECK ("email_corporativo" = lower("email_corporativo")) NOT VALID;
ALTER TABLE "colaborador" ADD CONSTRAINT "colaborador_chave_servidor_pc_minuscula" CHECK ("chave_servidor_pc" = lower("chave_servidor_pc")) NOT VALID;
