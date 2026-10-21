-- AlterTable
ALTER TABLE "versao_ter" ADD COLUMN     "documento_teste" BOOLEAN NOT NULL DEFAULT false;

-- A marca de documento de teste tambem fica imutavel depois da emissao.
CREATE OR REPLACE FUNCTION "versao_ter_preservada"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'A versao de um TER nao pode ser excluida.';
  END IF;
  IF OLD."estado" IN ('GERANDO', 'ERRO_GERACAO') THEN
    RETURN NEW;
  END IF;
  IF OLD."estado" = 'EMITIDO' AND NEW."estado" IN ('SUBSTITUIDO', 'CANCELADO')
    AND (NEW."termo_id", NEW."versao", NEW."motivo", NEW."dados", NEW."modelo_codigo", NEW."modelo_revisao", NEW."arquivo_chave",
         NEW."sha256", NEW."tamanho", NEW."paginas", NEW."nome_arquivo", NEW."emitida_em", NEW."emitida_por_nome", NEW."criada_em",
         NEW."documento_teste")
      IS NOT DISTINCT FROM
        (OLD."termo_id", OLD."versao", OLD."motivo", OLD."dados", OLD."modelo_codigo", OLD."modelo_revisao", OLD."arquivo_chave",
         OLD."sha256", OLD."tamanho", OLD."paginas", OLD."nome_arquivo", OLD."emitida_em", OLD."emitida_por_nome", OLD."criada_em",
         OLD."documento_teste") THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'A versao emitida de um TER nao pode ser alterada.';
END;
$$;
