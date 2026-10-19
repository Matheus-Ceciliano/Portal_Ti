-- Valores novos de enum ficam numa migração própria: o PostgreSQL não permite usá-los na mesma transação em que são criados.
-- CreateEnum
CREATE TYPE "TipoComponente" AS ENUM ('MEMORIA_RAM', 'SSD', 'HD');

-- CreateEnum
CREATE TYPE "TipoIntervencao" AS ENUM ('CONFIGURACAO_ORIGINAL', 'INSTALACAO', 'REMOCAO', 'SUBSTITUICAO');

-- AlterEnum


ALTER TYPE "CategoriaAtivo" ADD VALUE 'MEMORIA_RAM';
ALTER TYPE "CategoriaAtivo" ADD VALUE 'SSD';
ALTER TYPE "CategoriaAtivo" ADD VALUE 'HD';

-- AlterEnum
ALTER TYPE "SituacaoAtivo" ADD VALUE 'INSTALADO';

-- AlterEnum


ALTER TYPE "TipoMovimentacao" ADD VALUE 'CONFIGURACAO_ORIGINAL';
ALTER TYPE "TipoMovimentacao" ADD VALUE 'COMPONENTE_INSTALADO';
ALTER TYPE "TipoMovimentacao" ADD VALUE 'COMPONENTE_REMOVIDO';

