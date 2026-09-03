-- Extensões e configuração de busca textual.
-- Roda antes de qualquer tabela: a coluna vetorial e os índices de texto dependem disto.

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gin;

--> statement-breakpoint

-- Configuração de busca textual em português que ignora acento.
--
-- Sem isto, "acougue" não encontra "açougue" — e cliente digitando no celular não
-- coloca acento. O `unaccent` entra antes do stemmer português, então "não",
-- "nao", "NÃO" convergem para o mesmo lexema.
--
-- Precisa ser uma configuração nomeada, e não `unaccent()` aplicado na consulta:
-- `to_tsvector('pt_unaccent', ...)` é imutável e pode ser usado em coluna gerada
-- e em índice; `unaccent(...)` sozinho não é.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_ts_config WHERE cfgname = 'pt_unaccent') THEN
    CREATE TEXT SEARCH CONFIGURATION pt_unaccent (COPY = portuguese);

    ALTER TEXT SEARCH CONFIGURATION pt_unaccent
      ALTER MAPPING FOR hword, hword_part, word, asciiword, asciihword, hword_asciipart
      WITH unaccent, portuguese_stem;
  END IF;
END
$$;
