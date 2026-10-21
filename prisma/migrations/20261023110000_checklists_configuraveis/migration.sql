-- Checklists de inspecao configuraveis pela TI: perguntas por categoria com versoes imutaveis.
-- Editar uma pergunta cria a proxima versao; respostas antigas apontam para a versao exibida.

-- CreateEnum
CREATE TYPE "AplicacaoPergunta" AS ENUM ('SEMPRE', 'EXCETO_ENTRADA_NOVO', 'APOS_CADASTRO');

-- AlterTable
ALTER TABLE "resposta_inspecao" ADD COLUMN     "versao_pergunta_id" TEXT;

-- CreateTable
CREATE TABLE "pergunta_inspecao" (
    "id" TEXT NOT NULL,
    "codigo" TEXT,
    "categoria_id" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criada_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criada_por_nome" TEXT NOT NULL,
    "atualizada_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pergunta_inspecao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "versao_pergunta_inspecao" (
    "id" TEXT NOT NULL,
    "pergunta_id" TEXT NOT NULL,
    "versao" INTEGER NOT NULL,
    "grupo" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "como_testar" TEXT NOT NULL,
    "resultado_esperado" TEXT NOT NULL,
    "sinais_problema" TEXT NOT NULL,
    "obrigatoria" BOOLEAN NOT NULL,
    "bloqueante" BOOLEAN NOT NULL,
    "aplicacao" "AplicacaoPergunta" NOT NULL,
    "partes" "ParteKit"[] NOT NULL DEFAULT '{}',
    "criada_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criada_por_nome" TEXT NOT NULL,

    CONSTRAINT "versao_pergunta_inspecao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pergunta_inspecao_codigo_key" ON "pergunta_inspecao"("codigo");

-- CreateIndex
CREATE INDEX "pergunta_inspecao_categoria_id_ordem_idx" ON "pergunta_inspecao"("categoria_id", "ordem");

-- CreateIndex
CREATE UNIQUE INDEX "versao_pergunta_inspecao_pergunta_id_versao_key" ON "versao_pergunta_inspecao"("pergunta_id", "versao");

-- AddForeignKey
ALTER TABLE "resposta_inspecao" ADD CONSTRAINT "resposta_inspecao_versao_pergunta_id_fkey" FOREIGN KEY ("versao_pergunta_id") REFERENCES "versao_pergunta_inspecao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pergunta_inspecao" ADD CONSTRAINT "pergunta_inspecao_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categoria_equipamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "versao_pergunta_inspecao" ADD CONSTRAINT "versao_pergunta_inspecao_pergunta_id_fkey" FOREIGN KEY ("pergunta_id") REFERENCES "pergunta_inspecao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pergunta_inspecao" ADD CONSTRAINT "pergunta_inspecao_ordem_positiva" CHECK ("ordem" >= 1);
ALTER TABLE "versao_pergunta_inspecao" ADD CONSTRAINT "versao_pergunta_inspecao_preenchida" CHECK (
  "versao" >= 1
  AND length(btrim("grupo")) > 0 AND length(btrim("texto")) > 0
  AND length(btrim("como_testar")) > 0 AND length(btrim("resultado_esperado")) > 0 AND length(btrim("sinais_problema")) > 0
);

-- Conteudo da versao nao muda (a exclusao de versao usada e barrada pela chave das respostas).
CREATE FUNCTION "versao_pergunta_inspecao_imutavel"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'A versao de uma pergunta de inspecao nao pode ser alterada; edite para criar a proxima versao.';
END;
$$;
CREATE TRIGGER "versao_pergunta_inspecao_imutavel"
  BEFORE UPDATE ON "versao_pergunta_inspecao"
  FOR EACH ROW EXECUTE FUNCTION "versao_pergunta_inspecao_imutavel"();

-- Inspecao concluida: o questionario fixo da primeira etapa deixa de ser exigido (as respostas
-- apontam para as versoes das perguntas).
ALTER TABLE "inspecao_tecnica" DROP CONSTRAINT "inspecao_tecnica_estado_coerente";
ALTER TABLE "inspecao_tecnica" ADD CONSTRAINT "inspecao_tecnica_estado_coerente" CHECK (
  ("estado" = 'PENDENTE' AND "pendente" IS TRUE AND "concluida_em" IS NULL AND "cancelada_em" IS NULL)
  OR ("estado" = 'CONCLUIDA' AND "pendente" IS NULL AND "concluida_em" IS NOT NULL AND "numero" IS NOT NULL
      AND "resultado" IS NOT NULL AND "categoria" IS NOT NULL
      AND "responsavel_nome" IS NOT NULL AND length(btrim("responsavel_nome")) > 0)
  OR ("estado" = 'CANCELADA' AND "pendente" IS NULL AND "cancelada_em" IS NOT NULL
      AND "motivo_cancelamento" IS NOT NULL AND length(btrim("motivo_cancelamento")) > 0)
);

-- Checklist inicial (configuravel pela TI depois): perguntas por categoria do catalogo inicial.
-- Notebook (NOTEBOOK)
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'NOTEBOOK:nb.identificacao', c."id", 1, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'NOTEBOOK'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Identificação', 'Etiqueta do portal e patrimônio conferem com o cadastro', 'Localize a etiqueta com o nome do equipamento no portal (ex.: NBI5001) e a plaqueta de patrimônio, na tampa ou na base. Compare as duas com a ficha do equipamento.', 'Etiquetas presentes, legíveis e iguais às da ficha.', 'Etiqueta ausente, ilegível, coberta ou com identificação diferente da ficha.', true, true, 'APOS_CADASTRO', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'NOTEBOOK:nb.serie', c."id", 2, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'NOTEBOOK'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Identificação', 'Número de série confere com a etiqueta do fabricante', 'Leia o número de série na etiqueta do fabricante (parte inferior ou sob a bateria) e, se possível, na tela de informações do BIOS/UEFI ou em Configurações > Sistema > Sobre. Compare com o número informado no cadastro.', 'O número da etiqueta é igual ao do cadastro.', 'Número diferente do cadastro, etiqueta raspada ou ausente, ou divergência entre a etiqueta e o sistema.', true, true, 'SEMPRE', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'NOTEBOOK:nb.carcaca', c."id", 3, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'NOTEBOOK'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Estado físico', 'Carcaça, tampa e base sem trincas, peças soltas ou marcas de líquido', 'Examine tampa, base, bordas e cantos com boa iluminação. Procure trincas, amassados, parafusos faltando, borrachas dos pés soltas e manchas ou oxidação de líquido perto do teclado e das portas.', 'Sem trincas, deformações, peças soltas ou sinais de líquido. Riscos leves de uso podem ir em observação.', 'Trincas, amassados, peças soltas, parafusos ausentes, manchas ou oxidação de líquido.', true, false, 'SEMPRE', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'NOTEBOOK:nb.dobradicas', c."id", 4, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'NOTEBOOK'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Estado físico', 'Dobradiças firmes: a tela abre, fecha e fica na posição escolhida', 'Abra a tela devagar até o limite e feche. Pare em três ângulos diferentes e observe se ela se mantém. Escute estalos e veja se a base das dobradiças abre ao mover a tela.', 'Movimento suave, tela firme em qualquer ângulo, sem estalos nem folga.', 'Tela que cai sozinha, estalos, rachaduras perto das dobradiças ou carcaça se abrindo ao mover a tela.', true, false, 'EXCETO_ENTRADA_NOVO', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'NOTEBOOK:nb.tela', c."id", 5, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'NOTEBOOK'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Tela', 'Tela sem pixels mortos, manchas, linhas ou falhas de brilho', 'Exiba em tela cheia fundos de cor única (branco, preto, vermelho, verde e azul). Varie o brilho do mínimo ao máximo e observe a tela de frente e em ângulo.', 'Imagem uniforme em todas as cores, sem pontos fixos, manchas ou linhas; o brilho responde ao ajuste.', 'Pixels mortos ou presos, manchas, linhas, tela trincada, piscando ou sem ajuste de brilho.', true, true, 'SEMPRE', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'NOTEBOOK:nb.teclado', c."id", 6, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'NOTEBOOK'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Teclado e touchpad', 'Todas as teclas respondem, sem travar nem repetir', 'Abra um editor de texto e pressione cada tecla, inclusive Shift, Ctrl, Alt, Fn, setas e teclado numérico. Com Fn, teste as teclas de volume e brilho. Se houver luz de fundo, ligue-a.', 'Cada tecla escreve uma única vez e volta à posição; atalhos de Fn funcionam.', 'Tecla que não responde, repete sozinha, fica presa, está solta ou faltando.', true, true, 'EXCETO_ENTRADA_NOVO', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'NOTEBOOK:nb.touchpad', c."id", 7, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'NOTEBOOK'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Teclado e touchpad', 'Touchpad move o cursor e os cliques funcionam', 'Mova o cursor de um canto a outro da tela. Faça clique simples, duplo clique, clique direito e rolagem com dois dedos em uma página longa.', 'Cursor acompanha o dedo sem saltos; cliques e rolagem respondem.', 'Cursor pulando ou parado, cliques que não respondem, botões afundados ou superfície descolando.', true, false, 'EXCETO_ENTRADA_NOVO', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'NOTEBOOK:nb.portas', c."id", 8, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'NOTEBOOK'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Portas e conectividade', 'Portas USB, saída de vídeo e entrada de áudio funcionam', 'Conecte um pen drive ou mouse em cada porta USB, um monitor na saída de vídeo (HDMI ou USB-C) e um fone na entrada de áudio. Confirme que o sistema reconhece cada um.', 'Todos os dispositivos são reconhecidos e os conectores ficam firmes nas portas.', 'Porta sem reconhecimento, conector frouxo, porta quebrada ou com resíduos.', true, false, 'EXCETO_ENTRADA_NOVO', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'NOTEBOOK:nb.rede', c."id", 9, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'NOTEBOOK'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Portas e conectividade', 'Rede cabeada conecta (porta própria ou adaptador da empresa)', 'Desative o Wi-Fi e conecte um cabo de rede ativo na porta do notebook ou no adaptador da empresa. Abra um site ou sistema interno.', 'O sistema mostra a rede cabeada conectada e navega normalmente.', 'Cabo não reconhecido, conexão que cai ou porta danificada.', false, false, 'EXCETO_ENTRADA_NOVO', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'NOTEBOOK:nb.wifi', c."id", 10, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'NOTEBOOK'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Portas e conectividade', 'Wi-Fi encontra redes e mantém a conexão', 'Conecte-se à rede Wi-Fi corporativa ou de testes e navegue por alguns minutos. Afaste-se alguns metros do roteador e veja se a conexão se mantém.', 'Redes encontradas, conexão estável e navegação normal.', 'Nenhuma rede encontrada, quedas frequentes ou sinal fraco mesmo perto do roteador.', true, false, 'EXCETO_ENTRADA_NOVO', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'NOTEBOOK:nb.audio', c."id", 11, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'NOTEBOOK'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Áudio e câmera', 'Alto-falantes reproduzem som limpo nos dois lados', 'Use o teste de alto-falantes nas configurações de som (esquerdo e direito) e reproduza um áudio em volume baixo, médio e alto.', 'Som limpo nos dois lados e controle de volume funcionando.', 'Sem som, chiado, distorção em volume alto ou só um lado funcionando.', true, false, 'EXCETO_ENTRADA_NOVO', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'NOTEBOOK:nb.microfone', c."id", 12, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'NOTEBOOK'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Áudio e câmera', 'Microfone capta a voz com clareza', 'Abra o gravador de voz ou o teste de microfone das configurações de som, fale a cerca de 50 cm do notebook e ouça a gravação.', 'O indicador de nível se move e a gravação sai clara.', 'Nenhuma captação, som muito baixo, chiado ou cortes.', true, false, 'EXCETO_ENTRADA_NOVO', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'NOTEBOOK:nb.camera', c."id", 13, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'NOTEBOOK'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Áudio e câmera', 'Câmera reconhecida e com imagem nítida', 'Abra o aplicativo de câmera com a luz do ambiente acesa e observe a imagem por alguns segundos. Confira a luz indicadora e, se houver, o obturador físico.', 'Imagem nítida, cores normais, sem travar; a luz indicadora acende.', 'Câmera não encontrada, imagem escura, borrada, com listras ou travando.', true, false, 'EXCETO_ENTRADA_NOVO', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'NOTEBOOK:nb.inicializacao', c."id", 14, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'NOTEBOOK'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Sistema e hardware', 'Liga e inicializa o sistema sem erros', 'Ligue o notebook conectado ao carregador e acompanhe até a tela de login. Observe mensagens na tela, bipes e reinicializações.', 'Chega à tela de login sem mensagens de erro, bipes ou reinícios.', 'Não liga, reinicia sozinho, tela azul, bipes ou mensagens de erro de hardware.', true, true, 'SEMPRE', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'NOTEBOOK:nb.sistema', c."id", 15, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'NOTEBOOK'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Sistema e hardware', 'Sistema operacional ativado e igual ao do cadastro', 'Em Configurações > Sistema > Sobre (ou equivalente), confira a edição do sistema e o estado da ativação. Compare com o sistema operacional registrado na ficha.', 'Edição igual à do cadastro, sistema ativado e sem avisos de licença.', 'Edição diferente do cadastro, sistema não ativado ou avisos de licença.', true, false, 'SEMPRE', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'NOTEBOOK:nb.memoria', c."id", 16, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'NOTEBOOK'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Sistema e hardware', 'Memória RAM reconhecida conforme o cadastro', 'No Gerenciador de Tarefas > Desempenho > Memória (ou em Sobre do sistema), veja a memória total instalada e compare com a configuração registrada na ficha.', 'Toda a memória registrada aparece instalada (uma pequena parte reservada ao vídeo é normal).', 'Total menor que o registrado, módulo não reconhecido, travamentos ou erros de memória.', true, true, 'SEMPRE', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'NOTEBOOK:nb.armazenamento', c."id", 17, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'NOTEBOOK'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Sistema e hardware', 'SSD/HD reconhecido, com a capacidade do cadastro e saúde normal', 'No Gerenciamento de Disco (ou no Gerenciador de Tarefas > Desempenho), confira cada SSD/HD e a capacidade. Se houver diagnóstico do fabricante ou leitura SMART, consulte o estado de saúde.', 'Capacidade igual à registrada e saúde normal, sem alertas.', 'Disco ausente, capacidade diferente, alerta de saúde (SMART), lentidão extrema ou ruídos.', true, true, 'SEMPRE', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'NOTEBOOK:nb.dados', c."id", 18, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'NOTEBOOK'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Sistema e hardware', 'Sem contas, arquivos ou sessões do usuário anterior', 'Na tela de login e em Configurações > Contas, veja se restam perfis de outra pessoa. Confira área de trabalho, pastas pessoais e navegadores (senhas e sessões abertas).', 'Só as contas padrão da TI; nenhum arquivo, senha salva ou sessão de outra pessoa.', 'Perfil, arquivos, senhas salvas ou sessões abertas de outra pessoa.', true, true, 'EXCETO_ENTRADA_NOVO', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'NOTEBOOK:nb.bateria_integridade', c."id", 19, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'NOTEBOOK'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Energia', 'Bateria sem sinais de inchaço', 'Sem abrir o equipamento, apoie o notebook fechado em uma mesa plana e observe se balança. Veja se a base está estufada, o touchpad levantado ou a tampa sem fechar por igual.', 'Notebook assentado na mesa, base plana e tampa fechando por igual.', 'Base estufada, touchpad levantado, carcaça abrindo ou cheiro químico. Não carregue nem perfure: separe o equipamento e encaminhe para manutenção especializada.', true, true, 'SEMPRE', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'NOTEBOOK:nb.bateria_saude', c."id", 20, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'NOTEBOOK'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Energia', 'Bateria mantém carga com saúde aceitável', 'Gere o relatório de bateria do sistema (no Windows, "powercfg /batteryreport") e compare a capacidade atual com a de projeto. Retire o carregador e acompanhe a porcentagem por alguns minutos.', 'Capacidade atual de pelo menos 70% da de projeto; o notebook continua ligado sem o carregador.', 'Capacidade abaixo de 70%, desligamento ao retirar o carregador ou porcentagem caindo muito rápido.', true, false, 'EXCETO_ENTRADA_NOVO', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'NOTEBOOK:nb.carregamento', c."id", 21, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'NOTEBOOK'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Energia', 'Carrega a bateria com o carregador vinculado', 'Conecte o carregador vinculado (ex.: NBI5001C1) com o notebook ligado. Confira o ícone de carregamento e se a porcentagem sobe depois de alguns minutos.', 'O sistema indica carregamento e a porcentagem aumenta.', 'Não indica carregamento, carga que liga e desliga ao mexer no conector ou conector esquentando.', true, true, 'SEMPRE', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'NOTEBOOK:nb.acessorios', c."id", 22, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'NOTEBOOK'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Acessórios', 'Carregador e acessórios previstos acompanham o notebook', 'Confira se o carregador vinculado e os itens previstos (bolsa, adaptadores, cabos) estão presentes e se a etiqueta do carregador corresponde a este notebook.', 'Todos os acessórios previstos presentes e identificados para este notebook.', 'Carregador ausente ou de outro notebook, acessórios faltando ou trocados.', true, false, 'SEMPRE', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
-- Desktop (DESKTOP)
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'DESKTOP:dk.identificacao', c."id", 1, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'DESKTOP'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Identificação', 'Etiqueta do portal e patrimônio conferem com o cadastro', 'Localize a etiqueta com o nome do equipamento no portal (ex.: DSK001 ou o patrimônio) e a plaqueta de patrimônio, na lateral ou na frente do gabinete. Compare as duas com a ficha do equipamento.', 'Etiquetas presentes, legíveis e iguais às da ficha.', 'Etiqueta ausente, ilegível, coberta ou com identificação diferente da ficha.', true, true, 'APOS_CADASTRO', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'DESKTOP:dk.serie', c."id", 2, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'DESKTOP'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Identificação', 'Número de série confere com a etiqueta do fabricante', 'Leia o número de série na etiqueta do fabricante (na traseira ou na lateral do gabinete) e, se possível, na tela de informações do BIOS/UEFI. Compare com o número informado no cadastro.', 'O número da etiqueta é igual ao do cadastro.', 'Número diferente do cadastro, etiqueta raspada ou ausente, ou divergência entre a etiqueta e o sistema.', true, true, 'SEMPRE', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'DESKTOP:dk.gabinete', c."id", 3, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'DESKTOP'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Estado físico', 'Gabinete sem amassados, trincas ou peças soltas', 'Examine o gabinete por todos os lados, a tampa lateral e o painel frontal. Confira se os parafusos da tampa estão no lugar e se os botões de ligar e reiniciar voltam à posição.', 'Gabinete inteiro, tampa lateral fixa e botões firmes.', 'Amassados, trincas, tampa solta, parafusos faltando ou botões afundados.', true, false, 'SEMPRE', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'DESKTOP:dk.ventilacao', c."id", 4, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'DESKTOP'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Estado físico', 'Ventoinhas sem ruído anormal e grades sem poeira acumulada', 'Com o desktop ligado, escute as ventoinhas por um minuto e observe pelas grades (sem abrir o gabinete) se há poeira acumulada. Toque a saída de ar traseira.', 'Ruído baixo e constante, ar quente saindo pela traseira e grades limpas.', 'Ventoinha raspando, zumbido alto, ventoinha parada, poeira entupindo as grades ou desligamentos por aquecimento.', true, false, 'EXCETO_ENTRADA_NOVO', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'DESKTOP:dk.inicializacao', c."id", 5, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'DESKTOP'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Sistema e hardware', 'Liga e inicializa o sistema sem erros', 'Ligue o desktop com monitor, teclado e mouse conectados e acompanhe até a tela de login. Observe mensagens, bipes e reinicializações.', 'Chega à tela de login sem mensagens de erro, bipes ou reinícios.', 'Não liga, reinicia sozinho, tela azul, bipes ou mensagens de erro de hardware.', true, true, 'SEMPRE', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'DESKTOP:dk.sistema', c."id", 6, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'DESKTOP'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Sistema e hardware', 'Sistema operacional ativado e igual ao do cadastro', 'Em Configurações > Sistema > Sobre (ou equivalente), confira a edição do sistema e o estado da ativação. Compare com a ficha.', 'Edição igual à do cadastro, sistema ativado e sem avisos de licença.', 'Edição diferente do cadastro, sistema não ativado ou avisos de licença.', true, false, 'SEMPRE', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'DESKTOP:dk.memoria', c."id", 7, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'DESKTOP'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Sistema e hardware', 'Memória RAM reconhecida conforme o cadastro', 'No Gerenciador de Tarefas > Desempenho > Memória, veja a memória total e os slots em uso. Compare com a memória registrada na ficha.', 'Toda a memória registrada aparece instalada.', 'Total menor que o registrado, módulo não reconhecido, travamentos ou erros de memória.', true, true, 'SEMPRE', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'DESKTOP:dk.armazenamento', c."id", 8, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'DESKTOP'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Sistema e hardware', 'SSD/HD reconhecido, com a capacidade do cadastro e saúde normal', 'No Gerenciamento de Disco, confira cada SSD/HD e a capacidade. Se houver diagnóstico do fabricante ou leitura SMART, consulte o estado de saúde.', 'Capacidade igual à registrada e saúde normal, sem alertas.', 'Disco ausente, capacidade diferente, alerta de saúde (SMART), lentidão extrema ou ruídos.', true, true, 'SEMPRE', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'DESKTOP:dk.video', c."id", 9, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'DESKTOP'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Portas e conectividade', 'Saídas de vídeo exibem imagem no monitor', 'Conecte o monitor em cada saída de vídeo usada pela TI (HDMI, DisplayPort ou VGA) e confira a imagem na resolução nativa.', 'Imagem estável em todas as saídas testadas.', 'Saída sem sinal, imagem piscando, cores erradas ou conector frouxo.', true, true, 'SEMPRE', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'DESKTOP:dk.portas', c."id", 10, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'DESKTOP'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Portas e conectividade', 'Portas USB frontais e traseiras funcionam', 'Conecte um pen drive ou mouse em cada porta USB da frente e de trás e confirme o reconhecimento.', 'Todas as portas reconhecem o dispositivo e seguram o conector.', 'Porta sem reconhecimento, conector frouxo ou porta quebrada.', true, false, 'EXCETO_ENTRADA_NOVO', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'DESKTOP:dk.rede', c."id", 11, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'DESKTOP'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Portas e conectividade', 'Rede cabeada conecta', 'Conecte um cabo de rede ativo e abra um site ou sistema interno. Observe as luzes da porta de rede.', 'Rede conectada, luzes da porta acesas e navegação normal.', 'Cabo não reconhecido, conexão que cai ou porta danificada.', true, false, 'EXCETO_ENTRADA_NOVO', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'DESKTOP:dk.wifi', c."id", 12, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'DESKTOP'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Portas e conectividade', 'Wi-Fi encontra redes e mantém a conexão', 'Se o desktop tiver Wi-Fi, conecte-se à rede corporativa ou de testes e navegue por alguns minutos.', 'Redes encontradas e conexão estável.', 'Nenhuma rede encontrada ou quedas frequentes.', false, false, 'EXCETO_ENTRADA_NOVO', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'DESKTOP:dk.audio', c."id", 13, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'DESKTOP'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Portas e conectividade', 'Saída de áudio reproduz som', 'Conecte um fone na saída de áudio (frontal e traseira) e reproduza um áudio de teste nos dois lados.', 'Som limpo nos dois lados, nas saídas testadas.', 'Sem som, chiado ou só um lado funcionando.', false, false, 'EXCETO_ENTRADA_NOVO', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'DESKTOP:dk.dados', c."id", 14, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'DESKTOP'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Sistema e hardware', 'Sem contas, arquivos ou sessões do usuário anterior', 'Na tela de login e em Configurações > Contas, veja se restam perfis de outra pessoa. Confira área de trabalho, pastas pessoais e navegadores.', 'Só as contas padrão da TI; nenhum arquivo, senha salva ou sessão de outra pessoa.', 'Perfil, arquivos, senhas salvas ou sessões abertas de outra pessoa.', true, true, 'EXCETO_ENTRADA_NOVO', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'DESKTOP:dk.energia', c."id", 15, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'DESKTOP'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Acessórios', 'Cabo de energia íntegro e acessórios previstos presentes', 'Com o desktop desligado da tomada, passe os dedos pelo cabo de energia e observe os plugues. Confira os acessórios previstos (cabos de vídeo, adaptadores).', 'Cabo sem cortes nem emendas, plugues firmes e acessórios presentes.', 'Cabo cortado, emendado, com fita isolante ou plugue danificado; acessórios faltando.', true, true, 'SEMPRE', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
-- Carregador (CARREGADOR)
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'CARREGADOR:cr.identificacao', c."id", 1, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'CARREGADOR'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Identificação', 'Etiqueta do carregador confere com o notebook vinculado', 'Leia a etiqueta do portal no carregador (ex.: NBI5001C1) e confira se o nome antes do C é o do notebook a que ele está vinculado na ficha.', 'Etiqueta presente, legível e do notebook correto.', 'Etiqueta ausente, ilegível ou de outro notebook.', true, true, 'APOS_CADASTRO', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'CARREGADOR:cr.compatibilidade', c."id", 2, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'CARREGADOR'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Especificação', 'Compatível com o notebook: conector, tensão e potência', 'Leia na etiqueta do carregador a tensão de saída (V), a corrente (A) ou potência (W) e o tipo de conector. Compare com o exigido na etiqueta inferior do notebook ou no manual do fabricante.', 'Mesmo conector e mesma tensão de saída; potência igual ou maior que a exigida pelo notebook.', 'Tensão diferente, potência menor que a exigida, conector que não encaixa ou adaptado.', true, true, 'SEMPRE', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'CARREGADOR:cr.especificacao', c."id", 3, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'CARREGADOR'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Especificação', 'Etiqueta elétrica legível, com entrada bivolt e certificação', 'Na etiqueta da fonte, localize a entrada (ex.: 100–240 V ~ 50/60 Hz), a saída (V e A ou W), o fabricante e o selo de certificação (INMETRO).', 'Informações legíveis, entrada bivolt compatível com a rede e selo de certificação presente.', 'Etiqueta ilegível ou ausente, sem certificação ou entrada que não atende a rede local.', true, true, 'SEMPRE', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'CARREGADOR:cr.cabos', c."id", 4, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'CARREGADOR'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Estado físico', 'Cabos sem cortes, emendas, fios expostos ou dobras rígidas', 'Com o carregador fora da tomada, passe os dedos pelos dois cabos (da tomada e do notebook), com atenção às pontas junto aos conectores e à fonte.', 'Capa inteira em todo o comprimento, sem emendas, fita isolante ou dobras permanentes.', 'Cortes, fios aparecendo, emendas, fita isolante, capa derretida ou rachada. Não use o carregador: encaminhe para manutenção especializada.', true, true, 'SEMPRE', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'CARREGADOR:cr.carcaca', c."id", 5, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'CARREGADOR'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Estado físico', 'Fonte sem trincas, deformações ou marcas de aquecimento', 'Com o carregador fora da tomada, examine o bloco da fonte por todos os lados e balance-o levemente perto do ouvido. Não abra a carcaça.', 'Carcaça inteira, sem rachaduras, partes soltas, barulho interno ou marcas de derretimento.', 'Trincas, partes soltas, barulho de peça solta, manchas escuras ou cheiro de queimado. Não abra a fonte: encaminhe para manutenção especializada.', true, true, 'SEMPRE', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'CARREGADOR:cr.conectores', c."id", 6, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'CARREGADOR'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Estado físico', 'Conectores firmes, sem pinos tortos, oxidação ou folga', 'Observe o plugue da tomada e o conector do notebook com boa luz. Encaixe o conector no notebook e veja se fica firme sem precisar segurar.', 'Pinos retos e limpos; o conector encaixa firme e sem folga.', 'Pinos tortos ou escurecidos, oxidação, conector frouxo ou que só funciona em certa posição.', true, true, 'SEMPRE', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'CARREGADOR:cr.carga', c."id", 7, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'CARREGADOR'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Funcionamento', 'Carrega o notebook de forma estável, sem aquecimento anormal', 'Ligue o carregador na tomada e no notebook e acompanhe por 10 a 15 minutos: o notebook deve indicar carregamento. Toque o bloco da fonte por fora.', 'Carregamento contínuo; a fonte fica morna, sem ficar quente demais para segurar. A luz indicadora acende, quando houver.', 'Carga intermitente, notebook sem reconhecer o carregador, fonte muito quente, chiado, cheiro de queimado ou faíscas. Desligue da tomada na hora e encaminhe para manutenção especializada.', true, true, 'SEMPRE', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
-- Monitor (MONITOR)
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'MONITOR:mn.identificacao', c."id", 1, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'MONITOR'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Identificação', 'Etiqueta do portal e patrimônio conferem com o cadastro', 'Localize a etiqueta com o nome do equipamento no portal (ex.: MNT001) e a plaqueta de patrimônio, na traseira do monitor. Compare as duas com a ficha do equipamento.', 'Etiquetas presentes, legíveis e iguais às da ficha.', 'Etiqueta ausente, ilegível, coberta ou com identificação diferente da ficha.', true, true, 'APOS_CADASTRO', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'MONITOR:mn.serie', c."id", 2, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'MONITOR'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Identificação', 'Número de série confere com a etiqueta do fabricante', 'Leia o número de série na etiqueta do fabricante (na traseira do monitor) e, se possível, no menu de informações (OSD). Compare com o número informado no cadastro.', 'O número da etiqueta é igual ao do cadastro.', 'Número diferente do cadastro, etiqueta raspada ou ausente, ou divergência entre a etiqueta e o sistema.', true, true, 'SEMPRE', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'MONITOR:mn.carcaca', c."id", 3, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'MONITOR'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Estado físico', 'Moldura, traseira e base sem trincas; base firme', 'Examine a moldura da tela, a traseira e a base. Apoie o monitor na mesa e empurre levemente o topo para ver se a base balança.', 'Sem trincas ou peças soltas; o monitor fica firme na base.', 'Moldura descolando, traseira trincada, base quebrada ou monitor balançando.', true, false, 'SEMPRE', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'MONITOR:mn.imagem', c."id", 4, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'MONITOR'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Funcionamento', 'Liga e exibe imagem pela entrada principal', 'Ligue o monitor e conecte-o a um computador pela entrada usada no dia a dia (HDMI ou DisplayPort). Aguarde a imagem na resolução nativa.', 'Imagem estável, nítida e na resolução nativa.', 'Não liga, fica sem sinal, imagem piscando ou só funciona mexendo no cabo.', true, true, 'SEMPRE', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'MONITOR:mn.tela', c."id", 5, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'MONITOR'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Funcionamento', 'Tela sem pixels defeituosos, linhas, manchas ou falhas de brilho', 'Exiba em tela cheia fundos de cor única (branco, preto, vermelho, verde e azul), varie o brilho do mínimo ao máximo pelo menu e observe a tela de frente e de lado.', 'Cores uniformes, brilho respondendo ao ajuste, sem pontos fixos, manchas ou linhas.', 'Pixels mortos ou presos, linhas, manchas, áreas escuras, brilho que não muda ou tela trincada.', true, true, 'SEMPRE', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'MONITOR:mn.entradas', c."id", 6, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'MONITOR'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Funcionamento', 'Demais entradas de vídeo exibem imagem', 'Conecte o computador em cada entrada de vídeo do monitor (HDMI, DisplayPort, VGA ou USB-C) e troque a entrada pelo menu.', 'Todas as entradas exibem imagem.', 'Entrada sem sinal ou conector frouxo.', true, false, 'EXCETO_ENTRADA_NOVO', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'MONITOR:mn.controles', c."id", 7, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'MONITOR'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Funcionamento', 'Botões e menu na tela (OSD) respondem', 'Abra o menu pelos botões do monitor, ajuste brilho e contraste e volte ao padrão.', 'Menu abre e os ajustes têm efeito na imagem.', 'Botão que não responde, menu travado ou ajustes sem efeito.', true, false, 'EXCETO_ENTRADA_NOVO', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'MONITOR:mn.ajustes', c."id", 8, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'MONITOR'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Estado físico', 'Ajustes de altura e inclinação travam na posição', 'Suba, desça e incline a tela até os limites e solte em posições intermediárias.', 'Movimento suave e a tela fica na posição escolhida.', 'Tela que desce sozinha, travamentos ou estalos na base.', false, false, 'EXCETO_ENTRADA_NOVO', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'MONITOR:mn.cabos', c."id", 9, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'MONITOR'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Acessórios', 'Cabo de energia e cabo de vídeo presentes e íntegros', 'Com o monitor fora da tomada, passe os dedos pelo cabo de energia (ou da fonte externa) e pelo cabo de vídeo, observando os plugues.', 'Cabos presentes, sem cortes ou emendas, plugues firmes.', 'Cabo faltando, cortado, emendado, com fita isolante ou plugue danificado.', true, true, 'SEMPRE', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
-- Teclado (TECLADO)
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'TECLADO:tc.identificacao', c."id", 1, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'TECLADO'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Identificação', 'Etiqueta do portal e patrimônio conferem com o cadastro', 'Localize a etiqueta com o nome do equipamento no portal (ex.: TCL001) e a plaqueta de patrimônio, embaixo do teclado. Compare as duas com a ficha do equipamento.', 'Etiquetas presentes, legíveis e iguais às da ficha.', 'Etiqueta ausente, ilegível, coberta ou com identificação diferente da ficha.', true, true, 'APOS_CADASTRO', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'TECLADO:tc.estado', c."id", 2, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'TECLADO'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Estado físico', 'Corpo sem quebras e nenhuma tecla faltando ou solta', 'Observe o teclado de cima e de lado com boa luz. Passe a mão pelas teclas e confira os pés de apoio.', 'Todas as teclas no lugar e niveladas, corpo inteiro e pés de apoio presentes.', 'Tecla faltando, solta ou afundada, corpo trincado, pés quebrados ou sujeira acumulada entre as teclas.', true, false, 'SEMPRE', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'TECLADO:tc.conexao', c."id", 3, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'TECLADO'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Funcionamento', 'Reconhecido pelo computador ao conectar', 'Conecte o teclado em um computador (cabo USB ou receptor sem fio) e digite algumas letras em um editor de texto.', 'O teclado é reconhecido em poucos segundos e escreve normalmente.', 'Não é reconhecido, desconecta sozinho ou só funciona mexendo no cabo.', true, true, 'SEMPRE', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'TECLADO:tc.teclas', c."id", 4, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'TECLADO'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Funcionamento', 'Todas as teclas respondem, sem travar nem repetir', 'Em um editor de texto, pressione cada tecla, inclusive Shift, Ctrl, Alt, setas, teclas de função e o teclado numérico com Num Lock ligado.', 'Cada tecla escreve uma única vez e volta à posição.', 'Tecla que não responde, repete sozinha ou fica presa.', true, true, 'EXCETO_ENTRADA_NOVO', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'TECLADO:tc.indicadores', c."id", 5, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'TECLADO'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Funcionamento', 'Indicadores (Caps Lock e Num Lock) acendem', 'Pressione Caps Lock e Num Lock e observe as luzes correspondentes.', 'Cada luz acende e apaga junto com a tecla.', 'Luz que não acende ou não acompanha a tecla.', false, false, 'EXCETO_ENTRADA_NOVO', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'TECLADO:tc.cabo', c."id", 6, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'TECLADO'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Estado físico', 'Cabo e conector USB sem danos', 'Passe os dedos pelo cabo, com atenção às pontas, e observe o conector USB.', 'Cabo inteiro, sem emendas, e conector firme.', 'Cabo cortado, descascado ou emendado; conector torto ou frouxo.', false, false, 'SEMPRE', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
-- Mouse (MOUSE)
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'MOUSE:ms.identificacao', c."id", 1, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'MOUSE'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Identificação', 'Etiqueta do portal e patrimônio conferem com o cadastro', 'Localize a etiqueta com o nome do equipamento no portal (ex.: MSC001) e a plaqueta de patrimônio, embaixo do mouse. Compare as duas com a ficha do equipamento.', 'Etiquetas presentes, legíveis e iguais às da ficha.', 'Etiqueta ausente, ilegível, coberta ou com identificação diferente da ficha.', true, true, 'APOS_CADASTRO', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'MOUSE:ms.estado', c."id", 2, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'MOUSE'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Estado físico', 'Corpo sem trincas e pés deslizantes presentes', 'Observe o mouse por cima e por baixo e deslize-o sobre a mesa.', 'Corpo inteiro, botões alinhados e pés deslizantes no lugar.', 'Corpo trincado, botões soltos, pés faltando ou mouse arranhando a mesa.', true, false, 'SEMPRE', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'MOUSE:ms.conexao', c."id", 3, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'MOUSE'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Funcionamento', 'Reconhecido pelo computador ao conectar', 'Conecte o mouse em um computador (cabo USB ou receptor sem fio) e mova o cursor.', 'O mouse é reconhecido em poucos segundos e o cursor se move.', 'Não é reconhecido, desconecta sozinho ou só funciona mexendo no cabo.', true, true, 'SEMPRE', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'MOUSE:ms.cliques', c."id", 4, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'MOUSE'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Funcionamento', 'Botões esquerdo, direito e central respondem sem clique duplo involuntário', 'Clique em pastas e arquivos com o botão esquerdo, abra menus com o direito e clique a roda em um link. Clique devagar uma vez e veja se não abre como duplo clique.', 'Cada clique é registrado uma única vez.', 'Botão que falha, clique duplo sozinho ou botão afundado.', true, true, 'EXCETO_ENTRADA_NOVO', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'MOUSE:ms.rolagem', c."id", 5, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'MOUSE'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Funcionamento', 'Roda de rolagem funciona nos dois sentidos', 'Role uma página longa para cima e para baixo devagar e depois rápido.', 'A página rola suavemente nos dois sentidos.', 'Rolagem que pula, volta sozinha ou não responde.', true, false, 'EXCETO_ENTRADA_NOVO', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'MOUSE:ms.sensor', c."id", 6, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'MOUSE'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Funcionamento', 'Cursor se move sem saltos', 'Mova o mouse devagar em linhas retas e círculos sobre um mousepad ou mesa clara.', 'Cursor acompanha o movimento com precisão, sem saltos.', 'Cursor pulando, tremendo ou parado em partes do movimento.', true, true, 'EXCETO_ENTRADA_NOVO', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'MOUSE:ms.cabo', c."id", 7, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'MOUSE'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Estado físico', 'Cabo e conector USB sem danos', 'Passe os dedos pelo cabo, com atenção à saída do mouse, e observe o conector USB.', 'Cabo inteiro, sem emendas, e conector firme.', 'Cabo cortado, descascado ou emendado; conector torto ou frouxo.', false, false, 'SEMPRE', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
-- Hub (HUB)
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'HUB:hb.identificacao', c."id", 1, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'HUB'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Identificação', 'Etiqueta do portal e patrimônio conferem com o cadastro', 'Localize a etiqueta com o nome do equipamento no portal (ex.: HUB001) e a plaqueta de patrimônio, no corpo do hub. Compare as duas com a ficha do equipamento.', 'Etiquetas presentes, legíveis e iguais às da ficha.', 'Etiqueta ausente, ilegível, coberta ou com identificação diferente da ficha.', true, true, 'APOS_CADASTRO', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'HUB:hb.estado', c."id", 2, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'HUB'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Estado físico', 'Corpo e cabo sem trincas, emendas ou fios expostos', 'Observe o corpo do hub e passe os dedos pelo cabo, com atenção à saída do cabo e ao conector.', 'Corpo inteiro, cabo sem danos e conector firme.', 'Trincas, cabo descascado ou emendado, fios aparecendo ou conector torto.', true, true, 'SEMPRE', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'HUB:hb.reconhecimento', c."id", 3, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'HUB'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Funcionamento', 'Reconhecido pelo computador e com conexão estável', 'Conecte o hub em um computador e confirme que ele aparece sem mensagens de erro no Gerenciador de Dispositivos. Copie um arquivo grande para um pen drive ligado ao hub e acompanhe por alguns minutos.', 'O hub é reconhecido sem erros e a cópia termina sem desconexões.', 'Não é reconhecido, mensagem de dispositivo com falha, desconexões ou cópia interrompida.', true, true, 'SEMPRE', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'HUB:hb.portas', c."id", 4, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'HUB'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Funcionamento', 'Todas as portas USB reconhecem dispositivos', 'Conecte um pen drive ou mouse em cada porta do hub, uma de cada vez.', 'Todas as portas reconhecem o dispositivo.', 'Porta sem reconhecimento ou conector frouxo.', true, false, 'EXCETO_ENTRADA_NOVO', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'HUB:hb.video_rede', c."id", 5, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'HUB'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Funcionamento', 'Saídas de vídeo e porta de rede funcionam', 'Se o hub tiver HDMI ou porta de rede, conecte um monitor e um cabo de rede ativo e confira imagem e navegação.', 'Imagem estável e rede conectada.', 'Sem imagem, imagem piscando ou rede sem conexão.', false, false, 'EXCETO_ENTRADA_NOVO', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'HUB:hb.carga', c."id", 6, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'HUB'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Funcionamento', 'Passagem de carga (USB-C PD) ou fonte própria funciona', 'Se o hub tiver entrada de energia, ligue o carregador nele e conecte o hub ao notebook. Confira se o notebook indica carregamento.', 'O notebook carrega pelo hub, sem aquecimento anormal.', 'Notebook sem carregar, carga intermitente ou hub muito quente.', false, false, 'EXCETO_ENTRADA_NOVO', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
-- Kit teclado e mouse (KIT_TECLADO_MOUSE)
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'KIT_TECLADO_MOUSE:kt.identificacao', c."id", 1, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'KIT_TECLADO_MOUSE'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Identificação', 'Etiqueta da peça confere (ex.: KTM01.T, KTM01.M ou KTM01.H)', 'Leia a etiqueta do portal embaixo da peça e confira o código do kit e a letra da peça (T = teclado, M = mouse, H = hub/receptor) com a ficha.', 'Etiqueta presente, legível e igual à ficha.', 'Etiqueta ausente, ilegível ou de outro kit.', true, true, 'APOS_CADASTRO', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'KIT_TECLADO_MOUSE:kt.teclado_estado', c."id", 2, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'KIT_TECLADO_MOUSE'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Teclado', 'Teclado sem quebras e nenhuma tecla faltando ou solta', 'Observe o teclado de cima e de lado com boa luz e passe a mão pelas teclas.', 'Teclas no lugar e niveladas, corpo inteiro.', 'Tecla faltando, solta ou afundada, ou corpo trincado.', true, false, 'SEMPRE', ARRAY['TECLADO']::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'KIT_TECLADO_MOUSE:kt.teclado_teclas', c."id", 3, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'KIT_TECLADO_MOUSE'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Teclado', 'Todas as teclas respondem, sem travar nem repetir', 'Com o teclado pareado, pressione cada tecla em um editor de texto, inclusive Shift, Ctrl, Alt, setas e teclado numérico.', 'Cada tecla escreve uma única vez.', 'Tecla que não responde, repete sozinha ou fica presa.', true, true, 'EXCETO_ENTRADA_NOVO', ARRAY['TECLADO']::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'KIT_TECLADO_MOUSE:kt.mouse_estado', c."id", 4, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'KIT_TECLADO_MOUSE'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Mouse', 'Mouse sem trincas e com pés deslizantes', 'Observe o mouse por cima e por baixo e deslize-o sobre a mesa.', 'Corpo inteiro, botões alinhados e pés no lugar.', 'Corpo trincado, botões soltos ou pés faltando.', true, false, 'SEMPRE', ARRAY['MOUSE']::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'KIT_TECLADO_MOUSE:kt.mouse_funcoes', c."id", 5, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'KIT_TECLADO_MOUSE'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Mouse', 'Cliques, rolagem e cursor funcionam', 'Com o mouse pareado, clique com os botões esquerdo e direito, role uma página longa e mova o cursor em linhas retas.', 'Cada clique é registrado uma vez, a rolagem é suave e o cursor não salta.', 'Clique duplo sozinho, botão falhando, rolagem pulando ou cursor tremendo.', true, true, 'EXCETO_ENTRADA_NOVO', ARRAY['MOUSE']::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'KIT_TECLADO_MOUSE:kt.receptor', c."id", 6, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'KIT_TECLADO_MOUSE'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Hub/receptor', 'Receptor USB inteiro e reconhecido pelo computador', 'Observe o conector do receptor e conecte-o a um computador. Confirme que ele é reconhecido sem mensagens de erro.', 'Conector reto e firme; receptor reconhecido.', 'Conector torto ou solto, receptor não reconhecido.', true, true, 'SEMPRE', ARRAY['RECEPTOR']::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'KIT_TECLADO_MOUSE:kt.pareamento', c."id", 7, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'KIT_TECLADO_MOUSE'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Conjunto', 'Teclado e mouse pareiam com o receptor do kit', 'Ligue teclado e mouse com o receptor do kit conectado ao computador. Digite e mova o cursor a cerca de 1 metro de distância.', 'As duas peças respondem pelo receptor do kit, sem atrasos ou quedas.', 'Peça que não pareia, atraso perceptível ou quedas de conexão.', true, true, 'SEMPRE', ARRAY['TECLADO', 'MOUSE', 'RECEPTOR']::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'KIT_TECLADO_MOUSE:kt.energia', c."id", 8, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'KIT_TECLADO_MOUSE'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Conjunto', 'Pilhas ou bateria com carga e compartimento sem oxidação', 'Abra a tampa das pilhas do teclado e do mouse (ou confira o indicador de bateria) e observe os contatos metálicos.', 'Pilhas com carga e contatos limpos, sem pó branco ou esverdeado.', 'Pilhas vazando, contatos oxidados ou peça que desliga logo após ligar.', true, false, 'SEMPRE', ARRAY['TECLADO', 'MOUSE']::"ParteKit"[], 'Checklist inicial' FROM p;
-- Headset (HEADSET)
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'HEADSET:hs.identificacao', c."id", 1, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'HEADSET'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Identificação', 'Etiqueta do portal e patrimônio conferem com o cadastro', 'Localize a etiqueta com o nome do equipamento no portal (ex.: o patrimônio) e a plaqueta de patrimônio, no arco ou no cabo do headset. Compare as duas com a ficha do equipamento.', 'Etiquetas presentes, legíveis e iguais às da ficha.', 'Etiqueta ausente, ilegível, coberta ou com identificação diferente da ficha.', true, true, 'APOS_CADASTRO', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'HEADSET:hs.estado', c."id", 2, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'HEADSET'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Estado físico', 'Arco, almofadas e cabo sem rasgos, trincas ou fios expostos', 'Abra e feche o arco com cuidado, observe as almofadas e passe os dedos pelo cabo, com atenção às pontas.', 'Arco firme, almofadas inteiras e cabo sem danos.', 'Arco trincado, almofadas rasgadas ou descascando, cabo cortado ou emendado.', true, false, 'SEMPRE', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'HEADSET:hs.reconhecimento', c."id", 3, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'HEADSET'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Funcionamento', 'Reconhecido pelo computador', 'Conecte o headset (USB, P2 ou Bluetooth) e confira se ele aparece nas configurações de som como saída e entrada.', 'Aparece como dispositivo de saída e de entrada de áudio.', 'Não é reconhecido ou desconecta sozinho.', true, true, 'SEMPRE', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'HEADSET:hs.audio', c."id", 4, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'HEADSET'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Funcionamento', 'Som limpo nos dois lados', 'Reproduza um áudio de teste com canais esquerdo e direito e mexa no cabo durante a reprodução.', 'Som limpo nos dois lados, sem cortes ao mexer no cabo.', 'Um lado mudo, chiado ou som cortando ao mexer no cabo.', true, true, 'EXCETO_ENTRADA_NOVO', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'HEADSET:hs.microfone', c."id", 5, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'HEADSET'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Funcionamento', 'Microfone capta a voz com clareza', 'Grave alguns segundos de fala pelo teste de microfone do sistema ou do Teams e ouça a gravação.', 'Voz clara, sem chiado nem cortes.', 'Nenhuma captação, voz baixa, chiado ou cortes.', true, true, 'EXCETO_ENTRADA_NOVO', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'HEADSET:hs.higiene', c."id", 6, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'HEADSET'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Estado físico', 'Almofadas e microfone higienizados', 'Limpe almofadas, arco e microfone com pano levemente umedecido em álcool 70% (sem encharcar) e confira se não restou sujeira.', 'Peças limpas e secas antes da entrega.', 'Sujeira ou resíduos que não saem, almofadas degradadas.', true, false, 'EXCETO_ENTRADA_NOVO', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
-- Celular (CELULAR)
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'CELULAR:cl.identificacao', c."id", 1, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'CELULAR'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Identificação', 'Etiqueta do portal e patrimônio conferem com o cadastro', 'Localize a etiqueta com o nome do equipamento no portal (ex.: o patrimônio) e a plaqueta de patrimônio, na capa ou no corpo do aparelho. Compare as duas com a ficha do equipamento.', 'Etiquetas presentes, legíveis e iguais às da ficha.', 'Etiqueta ausente, ilegível, coberta ou com identificação diferente da ficha.', true, true, 'APOS_CADASTRO', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'CELULAR:cl.imei', c."id", 2, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'CELULAR'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Identificação', 'IMEI e número de série conferem com o cadastro', 'Disque *#06# (ou veja em Configurações > Sobre o telefone) e compare o IMEI e o número de série com o cadastro e com a caixa, quando houver.', 'IMEI e número de série iguais ao cadastro.', 'IMEI ou número de série diferentes, ou aparelho sem IMEI.', true, true, 'SEMPRE', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'CELULAR:cl.tela', c."id", 3, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'CELULAR'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Tela', 'Tela sem trincas e com o toque respondendo em toda a área', 'Observe a tela desligada contra a luz. Ligada, arraste um ícone por toda a tela e abra o teclado digitando nos quatro cantos.', 'Tela inteira e toque respondendo em toda a área.', 'Trincas, manchas, áreas sem resposta ao toque ou toques fantasmas.', true, true, 'SEMPRE', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'CELULAR:cl.carcaca', c."id", 4, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'CELULAR'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Estado físico', 'Carcaça, botões e bandeja do chip sem danos', 'Examine laterais e traseira, pressione os botões de volume e de ligar e retire e recoloque a bandeja do chip.', 'Carcaça inteira, botões com clique firme e bandeja encaixando bem.', 'Traseira trincada, botões afundados ou sem resposta, bandeja faltando ou empenada.', true, false, 'SEMPRE', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'CELULAR:cl.bateria_integridade', c."id", 5, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'CELULAR'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Energia', 'Bateria sem sinais de inchaço', 'Apoie o aparelho em uma mesa plana e veja se ele balança. Observe se a tela ou a traseira estão levantando nas bordas.', 'Aparelho assentado na mesa e sem frestas nas bordas.', 'Traseira ou tela levantando, aparelho balançando na mesa. Não carregue: separe e encaminhe para manutenção especializada.', true, true, 'SEMPRE', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'CELULAR:cl.bateria_saude', c."id", 6, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'CELULAR'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Energia', 'Saúde da bateria aceitável', 'Veja a saúde da bateria em Configurações > Bateria (iPhone) ou no aplicativo de diagnóstico do fabricante (Android).', 'Capacidade de pelo menos 80% ou estado indicado como bom.', 'Capacidade abaixo de 80%, alerta de manutenção ou descarga muito rápida.', true, false, 'EXCETO_ENTRADA_NOVO', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'CELULAR:cl.carregamento', c."id", 7, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'CELULAR'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Energia', 'Carrega com o carregador e o cabo da empresa', 'Conecte o carregador e o cabo da empresa e confira o indicador de carregamento por alguns minutos.', 'Carregamento contínuo e porcentagem subindo.', 'Não carrega, carga intermitente ao mexer no cabo ou aquecimento anormal.', true, true, 'SEMPRE', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'CELULAR:cl.conectividade', c."id", 8, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'CELULAR'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Funcionamento', 'Chamadas, dados móveis e Wi-Fi funcionam', 'Com um chip de testes ou o da linha, faça uma chamada curta, navegue com dados móveis e depois pelo Wi-Fi.', 'Chamada completa com áudio nos dois sentidos e navegação pelas duas redes.', 'Sem sinal, chamada sem áudio, dados ou Wi-Fi sem conexão.', true, false, 'EXCETO_ENTRADA_NOVO', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'CELULAR:cl.audio_cameras', c."id", 9, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'CELULAR'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Funcionamento', 'Alto-falante, microfone e câmeras funcionam', 'Grave um vídeo curto com cada câmera falando próximo ao aparelho e reproduza no alto-falante.', 'Imagens nítidas e áudio claro na gravação e no alto-falante.', 'Câmera sem imagem ou borrada, áudio mudo ou com chiado.', true, false, 'EXCETO_ENTRADA_NOVO', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'CELULAR:cl.dados', c."id", 10, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'CELULAR'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Funcionamento', 'Restaurado e sem conta do usuário anterior', 'Confirme que o aparelho foi restaurado aos padrões e que não pede a conta Google ou Apple anterior ao iniciar (bloqueio de ativação).', 'Aparelho inicia na configuração inicial ou com a conta da empresa, sem bloqueio de ativação.', 'Conta, fotos ou aplicativos de outra pessoa; bloqueio de ativação pedindo a conta anterior.', true, true, 'EXCETO_ENTRADA_NOVO', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'CELULAR:cl.acessorios', c."id", 11, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'CELULAR'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Acessórios', 'Carregador, cabo e capa previstos acompanham o aparelho', 'Confira os acessórios previstos para este aparelho e o estado do cabo e do carregador.', 'Acessórios previstos presentes e sem danos.', 'Acessórios faltando, cabo danificado ou carregador de outro modelo.', true, false, 'SEMPRE', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
-- Impressora (IMPRESSORA)
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'IMPRESSORA:im.identificacao', c."id", 1, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'IMPRESSORA'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Identificação', 'Etiqueta do portal e patrimônio conferem com o cadastro', 'Localize a etiqueta com o nome do equipamento no portal (ex.: o patrimônio) e a plaqueta de patrimônio, na lateral ou na traseira da impressora. Compare as duas com a ficha do equipamento.', 'Etiquetas presentes, legíveis e iguais às da ficha.', 'Etiqueta ausente, ilegível, coberta ou com identificação diferente da ficha.', true, true, 'APOS_CADASTRO', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'IMPRESSORA:im.serie', c."id", 2, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'IMPRESSORA'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Identificação', 'Número de série confere com a etiqueta do fabricante', 'Leia o número de série na etiqueta do fabricante (na traseira ou embaixo da impressora) e, se possível, na página de configuração impressa pelo painel. Compare com o número informado no cadastro.', 'O número da etiqueta é igual ao do cadastro.', 'Número diferente do cadastro, etiqueta raspada ou ausente, ou divergência entre a etiqueta e o sistema.', true, true, 'SEMPRE', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'IMPRESSORA:im.carcaca', c."id", 3, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'IMPRESSORA'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Estado físico', 'Carcaça, bandejas e tampas inteiras', 'Abra e feche as tampas e bandejas e observe travas e dobradiças.', 'Peças inteiras, travas firmes e bandejas deslizando bem.', 'Tampas trincadas, travas quebradas ou bandejas faltando.', true, false, 'SEMPRE', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'IMPRESSORA:im.liga', c."id", 4, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'IMPRESSORA'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Funcionamento', 'Liga e fica pronta sem mensagens de erro', 'Ligue a impressora e aguarde o fim da inicialização. Observe o painel e as luzes de alerta.', 'Painel indica pronta, sem alertas.', 'Não liga, fica em erro, luzes de alerta piscando ou ruídos anormais.', true, true, 'SEMPRE', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'IMPRESSORA:im.impressao', c."id", 5, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'IMPRESSORA'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Funcionamento', 'Imprime a página de teste sem falhas, manchas ou atolamentos', 'Imprima a página de teste ou de configuração pelo painel e observe texto, cores e margens.', 'Página limpa, sem listras, manchas, falhas de cor ou atolamento.', 'Listras, manchas, cores faltando, papel amassado ou atolando.', true, true, 'SEMPRE', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'IMPRESSORA:im.conexao', c."id", 6, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'IMPRESSORA'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Funcionamento', 'Recebe impressão do computador por USB ou rede', 'Envie um documento de um computador pela conexão que será usada (USB, rede cabeada ou Wi-Fi).', 'O documento sai impresso sem erro de comunicação.', 'Impressora não encontrada, fila travada ou conexão que cai.', true, false, 'EXCETO_ENTRADA_NOVO', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'IMPRESSORA:im.suprimentos', c."id", 7, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'IMPRESSORA'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Funcionamento', 'Toner ou cartuchos instalados e reconhecidos', 'Confira no painel ou na página de configuração o nível e o reconhecimento de cada suprimento.', 'Todos os suprimentos reconhecidos e com nível para uso.', 'Suprimento não reconhecido, vazio ou vazando.', true, false, 'SEMPRE', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'IMPRESSORA:im.cabos', c."id", 8, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'IMPRESSORA'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Acessórios', 'Cabos de energia e de dados presentes e íntegros', 'Com a impressora fora da tomada, passe os dedos pelo cabo de energia e pelo cabo de dados, observando os plugues.', 'Cabos presentes, sem cortes ou emendas, plugues firmes.', 'Cabo faltando, cortado, emendado ou plugue danificado.', true, true, 'SEMPRE', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
-- Suporte para monitor (SUPORTE_MONITOR)
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'SUPORTE_MONITOR:sp.identificacao', c."id", 1, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'SUPORTE_MONITOR'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Identificação', 'Etiqueta do portal e patrimônio conferem com o cadastro', 'Localize a etiqueta com o nome do equipamento no portal (ex.: SMN001) e a plaqueta de patrimônio, na base ou na coluna do suporte. Compare as duas com a ficha do equipamento.', 'Etiquetas presentes, legíveis e iguais às da ficha.', 'Etiqueta ausente, ilegível, coberta ou com identificação diferente da ficha.', true, true, 'APOS_CADASTRO', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'SUPORTE_MONITOR:sp.estrutura', c."id", 2, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'SUPORTE_MONITOR'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Estado físico', 'Estrutura sem trincas, empenos ou solda rompida', 'Examine base, coluna, braços e articulações com boa luz, com atenção às soldas e aos pontos de apoio.', 'Estrutura reta e inteira, sem trincas nem soldas rompidas.', 'Peças empenadas, trincadas ou com solda rompida.', true, true, 'SEMPRE', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'SUPORTE_MONITOR:sp.fixacao', c."id", 3, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'SUPORTE_MONITOR'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Estado físico', 'Parafusos, presilhas e placa VESA completos', 'Confira o kit de fixação: placa VESA, parafusos do monitor, presilha ou grampo de mesa e chaves que acompanham o suporte.', 'Todas as peças de fixação presentes e com rosca em bom estado.', 'Peças faltando, roscas espanadas ou presilha quebrada.', true, true, 'SEMPRE', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'SUPORTE_MONITOR:sp.ajustes', c."id", 4, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'SUPORTE_MONITOR'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Funcionamento', 'Ajustes de altura e inclinação travam na posição', 'Com um monitor fixado, ajuste altura, inclinação e giro e solte em posições intermediárias.', 'O monitor fica na posição escolhida, sem descer sozinho.', 'Braço que desce sozinho, articulação frouxa ou travamento.', true, false, 'EXCETO_ENTRADA_NOVO', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
-- Cabo (CABO_HDMI)
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'CABO_HDMI:cb.identificacao', c."id", 1, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'CABO_HDMI'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Identificação', 'Etiqueta do portal e patrimônio conferem com o cadastro', 'Localize a etiqueta com o nome do equipamento no portal (ex.: CHD001) e a plaqueta de patrimônio, na etiqueta junto a um dos conectores. Compare as duas com a ficha do equipamento.', 'Etiquetas presentes, legíveis e iguais às da ficha.', 'Etiqueta ausente, ilegível, coberta ou com identificação diferente da ficha.', true, true, 'APOS_CADASTRO', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'CABO_HDMI:cb.estado', c."id", 2, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'CABO_HDMI'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Estado físico', 'Capa sem cortes, dobras rígidas ou fios expostos', 'Passe os dedos por todo o comprimento do cabo, com atenção às pontas junto aos conectores.', 'Capa inteira, sem emendas nem dobras permanentes.', 'Cortes, fios aparecendo, emendas ou fita isolante.', true, true, 'SEMPRE', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'CABO_HDMI:cb.conectores', c."id", 3, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'CABO_HDMI'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Estado físico', 'Conectores firmes, sem pinos tortos ou oxidação', 'Observe os dois conectores com boa luz e encaixe cada um em uma porta, verificando se fica firme.', 'Conectores retos, limpos e firmes ao encaixar.', 'Conector torto, frouxo, com pinos escurecidos ou capa solta.', true, true, 'SEMPRE', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'CABO_HDMI:cb.sinal', c."id", 4, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'CABO_HDMI'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Funcionamento', 'Transmite imagem e som sem falhas', 'Ligue um computador a um monitor ou TV com o cabo e reproduza um vídeo com som por um minuto, mexendo levemente o cabo.', 'Imagem e som estáveis, sem cortes ao mexer no cabo.', 'Sem sinal, imagem piscando, chuvisco ou som cortando.', true, true, 'EXCETO_ENTRADA_NOVO', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
-- Microfone (MICROFONE)
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'MICROFONE:mc.identificacao', c."id", 1, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'MICROFONE'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Identificação', 'Etiqueta do portal e patrimônio conferem com o cadastro', 'Localize a etiqueta com o nome do equipamento no portal (ex.: MCP001) e a plaqueta de patrimônio, na base ou no corpo do microfone. Compare as duas com a ficha do equipamento.', 'Etiquetas presentes, legíveis e iguais às da ficha.', 'Etiqueta ausente, ilegível, coberta ou com identificação diferente da ficha.', true, true, 'APOS_CADASTRO', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'MICROFONE:mc.estado', c."id", 2, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'MICROFONE'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Estado físico', 'Corpo, grade e cabo sem danos', 'Observe a grade, o corpo e a base e passe os dedos pelo cabo, com atenção às pontas.', 'Grade sem amassados, corpo inteiro e cabo sem danos.', 'Grade amassada, peças soltas, cabo cortado ou emendado.', true, false, 'SEMPRE', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'MICROFONE:mc.reconhecimento', c."id", 3, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'MICROFONE'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Funcionamento', 'Reconhecido pelo computador', 'Conecte o microfone e confira se ele aparece como dispositivo de entrada nas configurações de som.', 'Aparece como entrada de áudio, sem erros.', 'Não é reconhecido ou desconecta sozinho.', true, true, 'SEMPRE', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'MICROFONE:mc.captacao', c."id", 4, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'MICROFONE'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Funcionamento', 'Capta a voz com clareza', 'Grave alguns segundos de fala a cerca de 20 cm e ouça a gravação com fone.', 'Voz clara, sem chiado nem cortes.', 'Nenhuma captação, voz baixa, chiado, zumbido ou cortes.', true, true, 'EXCETO_ENTRADA_NOVO', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
-- Memória RAM (MEMORIA_RAM)
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'MEMORIA_RAM:rm.identificacao', c."id", 1, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'MEMORIA_RAM'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Identificação', 'Etiqueta do portal e patrimônio conferem com o cadastro', 'Localize a etiqueta com o nome do equipamento no portal (ex.: RAM001) e a plaqueta de patrimônio, no módulo ou no saco antiestático. Compare as duas com a ficha do equipamento.', 'Etiquetas presentes, legíveis e iguais às da ficha.', 'Etiqueta ausente, ilegível, coberta ou com identificação diferente da ficha.', true, true, 'APOS_CADASTRO', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'MEMORIA_RAM:rm.etiqueta', c."id", 2, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'MEMORIA_RAM'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Identificação', 'Etiqueta do módulo confere com capacidade, tecnologia e frequência cadastradas', 'Leia a etiqueta do fabricante no módulo (ex.: 16GB DDR4 3200) e compare com a capacidade, a tecnologia e a frequência informadas.', 'Capacidade, tecnologia e frequência iguais às do cadastro.', 'Etiqueta ilegível ou com dados diferentes do cadastro.', true, true, 'SEMPRE', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'MEMORIA_RAM:rm.contatos', c."id", 3, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'MEMORIA_RAM'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Estado físico', 'Placa sem trincas e contatos dourados limpos', 'Segure o módulo pelas bordas, com pulseira antiestática quando houver, e observe a placa, os chips e os contatos dourados com boa luz.', 'Placa inteira, chips no lugar e contatos limpos e brilhantes.', 'Trincas, chips soltos, contatos riscados fundo, escurecidos ou oxidados.', true, true, 'SEMPRE', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'MEMORIA_RAM:rm.reconhecimento', c."id", 4, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'MEMORIA_RAM'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Funcionamento', 'Reconhecida com a capacidade correta em um equipamento de teste', 'Com o equipamento de teste desligado e fora da tomada (e com a bateria desconectada quando o fabricante orientar), instale o módulo, ligue e confira a memória total no sistema ou no BIOS/UEFI.', 'O equipamento liga e reconhece a capacidade do módulo.', 'Equipamento não liga com o módulo, bipes de erro ou capacidade menor que a etiqueta.', true, true, 'EXCETO_ENTRADA_NOVO', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'MEMORIA_RAM:rm.compatibilidade', c."id", 5, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'MEMORIA_RAM'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Identificação', 'Formato e geração compatíveis com os equipamentos de destino', 'Confira na etiqueta o formato (SODIMM para notebook, DIMM para desktop), a geração (DDR4, DDR5...) e a frequência, e compare com o que os equipamentos de destino aceitam (manual ou site do fabricante).', 'Formato, geração e frequência aceitos pelos equipamentos em que o módulo será usado.', 'Formato ou geração diferentes do aceito, ou frequência não suportada pelos equipamentos de destino.', true, false, 'SEMPRE', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'MEMORIA_RAM:rm.teste', c."id", 6, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'MEMORIA_RAM'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Funcionamento', 'Teste de memória sem erros', 'Com o módulo instalado no equipamento de teste, rode o Diagnóstico de Memória do Windows (mdsched) ou o MemTest86 por pelo menos uma passagem completa.', 'Teste concluído sem erros.', 'Erros apontados pelo teste, travamentos ou reinicializações durante o teste.', true, true, 'EXCETO_ENTRADA_NOVO', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
-- SSD / HD (SSD)
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'SSD:ar.identificacao', c."id", 1, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'SSD'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Identificação', 'Etiqueta do portal e patrimônio conferem com o cadastro', 'Localize a etiqueta com o nome do equipamento no portal (ex.: SSD001 ou HDD001) e a plaqueta de patrimônio, no corpo da peça ou no saco antiestático. Compare as duas com a ficha do equipamento.', 'Etiquetas presentes, legíveis e iguais às da ficha.', 'Etiqueta ausente, ilegível, coberta ou com identificação diferente da ficha.', true, true, 'APOS_CADASTRO', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'SSD:ar.etiqueta', c."id", 2, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'SSD'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Identificação', 'Etiqueta confere com a capacidade e a interface cadastradas', 'Leia a etiqueta do fabricante (capacidade, interface como SATA ou NVMe e formato) e compare com o cadastro.', 'Capacidade, interface e formato iguais aos do cadastro.', 'Etiqueta ilegível ou com dados diferentes do cadastro.', true, true, 'SEMPRE', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'SSD:ar.fisico', c."id", 3, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'SSD'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Estado físico', 'Sem danos físicos e com o conector íntegro', 'Segure a peça pelas bordas e observe o corpo, os chips (no SSD M.2) e os contatos do conector com boa luz.', 'Corpo inteiro, chips no lugar e conector limpo e reto.', 'Amassados, trincas, chips soltos, conector quebrado ou oxidado.', true, true, 'SEMPRE', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'SSD:ar.saude', c."id", 4, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'SSD'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Funcionamento', 'Reconhecido e com saúde normal (SMART)', 'Com o equipamento de teste desligado e fora da tomada, conecte a peça (ou use um adaptador USB). Ligue e confira o reconhecimento e o estado SMART com a ferramenta do fabricante ou um leitor de SMART.', 'Peça reconhecida, capacidade correta e saúde normal.', 'Não reconhecido, capacidade errada, alertas SMART, setores realocados ou ruídos (HD).', true, true, 'EXCETO_ENTRADA_NOVO', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'SSD:ar.leitura_gravacao', c."id", 5, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'SSD'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Funcionamento', 'Leitura e gravação sem erros (quando testado)', 'No equipamento de teste, copie para a peça uma pasta de alguns GB, copie de volta e, se houver, rode o teste de superfície ou o diagnóstico do fabricante.', 'Cópia concluída nos dois sentidos, sem erros, e diagnóstico sem falhas.', 'Erros de leitura ou gravação, cópia travando, velocidade muito abaixo do normal ou falhas no diagnóstico.', true, true, 'EXCETO_ENTRADA_NOVO', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'SSD:ar.dados', c."id", 6, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'SSD'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Funcionamento', 'Dados anteriores apagados por método seguro', 'Confirme que a peça passou pelo apagamento seguro adotado pela TI (Secure Erase ou formatação completa com sobrescrita) e que não restam partições com dados.', 'Peça sem partições com dados de uso anterior.', 'Partições ou arquivos de uso anterior ainda presentes.', true, true, 'EXCETO_ENTRADA_NOVO', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
-- SSD / HD (HD)
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'HD:ar.identificacao', c."id", 1, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'HD'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Identificação', 'Etiqueta do portal e patrimônio conferem com o cadastro', 'Localize a etiqueta com o nome do equipamento no portal (ex.: SSD001 ou HDD001) e a plaqueta de patrimônio, no corpo da peça ou no saco antiestático. Compare as duas com a ficha do equipamento.', 'Etiquetas presentes, legíveis e iguais às da ficha.', 'Etiqueta ausente, ilegível, coberta ou com identificação diferente da ficha.', true, true, 'APOS_CADASTRO', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'HD:ar.etiqueta', c."id", 2, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'HD'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Identificação', 'Etiqueta confere com a capacidade e a interface cadastradas', 'Leia a etiqueta do fabricante (capacidade, interface como SATA ou NVMe e formato) e compare com o cadastro.', 'Capacidade, interface e formato iguais aos do cadastro.', 'Etiqueta ilegível ou com dados diferentes do cadastro.', true, true, 'SEMPRE', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'HD:ar.fisico', c."id", 3, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'HD'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Estado físico', 'Sem danos físicos e com o conector íntegro', 'Segure a peça pelas bordas e observe o corpo, os chips (no SSD M.2) e os contatos do conector com boa luz.', 'Corpo inteiro, chips no lugar e conector limpo e reto.', 'Amassados, trincas, chips soltos, conector quebrado ou oxidado.', true, true, 'SEMPRE', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'HD:ar.saude', c."id", 4, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'HD'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Funcionamento', 'Reconhecido e com saúde normal (SMART)', 'Com o equipamento de teste desligado e fora da tomada, conecte a peça (ou use um adaptador USB). Ligue e confira o reconhecimento e o estado SMART com a ferramenta do fabricante ou um leitor de SMART.', 'Peça reconhecida, capacidade correta e saúde normal.', 'Não reconhecido, capacidade errada, alertas SMART, setores realocados ou ruídos (HD).', true, true, 'EXCETO_ENTRADA_NOVO', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'HD:ar.leitura_gravacao', c."id", 5, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'HD'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Funcionamento', 'Leitura e gravação sem erros (quando testado)', 'No equipamento de teste, copie para a peça uma pasta de alguns GB, copie de volta e, se houver, rode o teste de superfície ou o diagnóstico do fabricante.', 'Cópia concluída nos dois sentidos, sem erros, e diagnóstico sem falhas.', 'Erros de leitura ou gravação, cópia travando, velocidade muito abaixo do normal ou falhas no diagnóstico.', true, true, 'EXCETO_ENTRADA_NOVO', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'HD:ar.dados', c."id", 6, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'HD'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Funcionamento', 'Dados anteriores apagados por método seguro', 'Confirme que a peça passou pelo apagamento seguro adotado pela TI (Secure Erase ou formatação completa com sobrescrita) e que não restam partições com dados.', 'Peça sem partições com dados de uso anterior.', 'Partições ou arquivos de uso anterior ainda presentes.', true, true, 'EXCETO_ENTRADA_NOVO', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
-- Outros equipamentos (OUTRO)
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'OUTRO:gn.identificacao', c."id", 1, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'OUTRO'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Identificação', 'Etiqueta do portal e patrimônio conferem com o cadastro', 'Localize a etiqueta com o nome do equipamento no portal (ex.: o nome do dispositivo ou o patrimônio) e a plaqueta de patrimônio, no corpo do equipamento. Compare as duas com a ficha do equipamento.', 'Etiquetas presentes, legíveis e iguais às da ficha.', 'Etiqueta ausente, ilegível, coberta ou com identificação diferente da ficha.', true, true, 'APOS_CADASTRO', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'OUTRO:gn.serie', c."id", 2, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'OUTRO'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Identificação', 'Número de série confere com a etiqueta do fabricante', 'Se o equipamento tiver número de série, leia-o na etiqueta do fabricante e compare com o cadastro.', 'O número da etiqueta é igual ao do cadastro.', 'Número diferente do cadastro ou etiqueta raspada.', false, false, 'SEMPRE', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'OUTRO:gn.estado', c."id", 3, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'OUTRO'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Estado físico', 'Sem danos que comprometam o uso ou a segurança', 'Examine o equipamento por todos os lados e, se tiver cabo de energia, passe os dedos por ele com o equipamento fora da tomada.', 'Corpo inteiro, sem peças soltas; cabos sem cortes ou emendas.', 'Trincas, peças soltas, cabo cortado, emendado ou plugue danificado.', true, true, 'SEMPRE', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'OUTRO:gn.funcionamento', c."id", 4, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'OUTRO'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Funcionamento', 'Funciona conforme a finalidade', 'Ligue ou conecte o equipamento e execute a função principal dele (por exemplo, exibir, reproduzir, conectar ou carregar).', 'A função principal é executada sem falhas nem mensagens de erro.', 'Não liga, não é reconhecido, falha na função principal ou aquece demais.', true, true, 'SEMPRE', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
WITH p AS (
  INSERT INTO "pergunta_inspecao" ("id", "codigo", "categoria_id", "ordem", "criada_por_nome")
  SELECT gen_random_uuid()::text, 'OUTRO:gn.acessorios', c."id", 5, 'Checklist inicial' FROM "categoria_equipamento" c WHERE c."codigo" = 'OUTRO'
  RETURNING "id"
)
INSERT INTO "versao_pergunta_inspecao" ("id", "pergunta_id", "versao", "grupo", "texto", "como_testar", "resultado_esperado", "sinais_problema", "obrigatoria", "bloqueante", "aplicacao", "partes", "criada_por_nome")
SELECT gen_random_uuid()::text, p."id", 1, 'Acessórios', 'Acessórios e cabos previstos presentes', 'Confira se os acessórios e cabos que acompanham o equipamento estão presentes.', 'Acessórios previstos presentes e sem danos.', 'Acessórios faltando ou danificados.', false, false, 'SEMPRE', '{}'::"ParteKit"[], 'Checklist inicial' FROM p;
