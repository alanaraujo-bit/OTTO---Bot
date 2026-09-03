-- Integridade referencial, busca e isolamento entre empresas.
--
-- Este arquivo é escrito à mão de propósito. Chaves estrangeiras com semântica de
-- exclusão pensada caso a caso, índices de busca e políticas de RLS são exatamente
-- o SQL que queremos ler e revisar — não gerar às cegas.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Chaves estrangeiras
--
-- A regra de exclusão diz o que o negócio considera descartável. Apagar uma
-- empresa leva tudo dela junto. Apagar um usuário nunca apaga histórico de
-- atendimento — a conversa aconteceu, e continua tendo acontecido.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "tenant_locations" ADD CONSTRAINT "tenant_locations_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "location_hours" ADD CONSTRAINT "location_hours_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "location_hours" ADD CONSTRAINT "location_hours_location_fk" FOREIGN KEY ("location_id") REFERENCES "tenant_locations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "location_exceptions" ADD CONSTRAINT "location_exceptions_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "location_exceptions" ADD CONSTRAINT "location_exceptions_location_fk" FOREIGN KEY ("location_id") REFERENCES "tenant_locations"("id") ON DELETE CASCADE;--> statement-breakpoint

ALTER TABLE "memberships" ADD CONSTRAINT "memberships_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_invited_by_fk" FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_fk" FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint

ALTER TABLE "channels" ADD CONSTRAINT "channels_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_channel_fk" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE SET NULL;--> statement-breakpoint

ALTER TABLE "contacts" ADD CONSTRAINT "contacts_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "contact_identities" ADD CONSTRAINT "contact_identities_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "contact_identities" ADD CONSTRAINT "contact_identities_contact_fk" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_created_by_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "contact_tags" ADD CONSTRAINT "contact_tags_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "contact_tags" ADD CONSTRAINT "contact_tags_contact_fk" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "contact_tags" ADD CONSTRAINT "contact_tags_tag_fk" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE;--> statement-breakpoint

ALTER TABLE "conversations" ADD CONSTRAINT "conversations_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_contact_fk" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE;--> statement-breakpoint
-- Canal desconectado não apaga o histórico: RESTRICT obriga a arquivar antes.
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_channel_fk" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_assigned_user_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint

ALTER TABLE "messages" ADD CONSTRAINT "messages_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_fk" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_author_user_fk" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_ai_run_fk" FOREIGN KEY ("ai_run_id") REFERENCES "ai_runs"("id") ON DELETE SET NULL;--> statement-breakpoint

ALTER TABLE "conversation_events" ADD CONSTRAINT "conversation_events_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_events" ADD CONSTRAINT "conversation_events_conversation_fk" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_events" ADD CONSTRAINT "conversation_events_actor_fk" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "conversation_notes" ADD CONSTRAINT "conversation_notes_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_notes" ADD CONSTRAINT "conversation_notes_conversation_fk" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_notes" ADD CONSTRAINT "conversation_notes_author_fk" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_tags" ADD CONSTRAINT "conversation_tags_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_tags" ADD CONSTRAINT "conversation_tags_conversation_fk" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_tags" ADD CONSTRAINT "conversation_tags_tag_fk" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE;--> statement-breakpoint

ALTER TABLE "knowledge_categories" ADD CONSTRAINT "knowledge_categories_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "knowledge_items" ADD CONSTRAINT "knowledge_items_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "knowledge_items" ADD CONSTRAINT "knowledge_items_category_fk" FOREIGN KEY ("category_id") REFERENCES "knowledge_categories"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "knowledge_items" ADD CONSTRAINT "knowledge_items_created_by_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "knowledge_items" ADD CONSTRAINT "knowledge_items_updated_by_fk" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "knowledge_items" ADD CONSTRAINT "knowledge_items_published_by_fk" FOREIGN KEY ("published_by") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "knowledge_items" ADD CONSTRAINT "knowledge_items_source_conversation_fk" FOREIGN KEY ("source_conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "knowledge_versions" ADD CONSTRAINT "knowledge_versions_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "knowledge_versions" ADD CONSTRAINT "knowledge_versions_item_fk" FOREIGN KEY ("item_id") REFERENCES "knowledge_items"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "knowledge_versions" ADD CONSTRAINT "knowledge_versions_author_fk" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_item_fk" FOREIGN KEY ("item_id") REFERENCES "knowledge_items"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "knowledge_signals" ADD CONSTRAINT "knowledge_signals_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "knowledge_signals" ADD CONSTRAINT "knowledge_signals_conversation_fk" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "knowledge_signals" ADD CONSTRAINT "knowledge_signals_message_fk" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "knowledge_suggestions" ADD CONSTRAINT "knowledge_suggestions_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "knowledge_suggestions" ADD CONSTRAINT "knowledge_suggestions_related_item_fk" FOREIGN KEY ("related_item_id") REFERENCES "knowledge_items"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "knowledge_suggestions" ADD CONSTRAINT "knowledge_suggestions_resulting_item_fk" FOREIGN KEY ("resulting_item_id") REFERENCES "knowledge_items"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "knowledge_suggestions" ADD CONSTRAINT "knowledge_suggestions_reviewer_fk" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint

ALTER TABLE "agents" ADD CONSTRAINT "agents_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "agent_versions" ADD CONSTRAINT "agent_versions_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "agent_versions" ADD CONSTRAINT "agent_versions_agent_fk" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "agent_versions" ADD CONSTRAINT "agent_versions_published_by_fk" FOREIGN KEY ("published_by") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_active_version_fk" FOREIGN KEY ("active_version_id") REFERENCES "agent_versions"("id") ON DELETE SET NULL;--> statement-breakpoint

ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_conversation_fk" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_trigger_message_fk" FOREIGN KEY ("trigger_message_id") REFERENCES "messages"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_agent_version_fk" FOREIGN KEY ("agent_version_id") REFERENCES "agent_versions"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "ai_tool_calls" ADD CONSTRAINT "ai_tool_calls_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "ai_tool_calls" ADD CONSTRAINT "ai_tool_calls_run_fk" FOREIGN KEY ("run_id") REFERENCES "ai_runs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;--> statement-breakpoint

ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_target_tenant_fk" FOREIGN KEY ("target_tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_fk" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. updated_at automático
--
-- No banco, não na aplicação: um UPDATE feito por script de manutenção ou por
-- migração também precisa carimbar a data, senão o histórico mente.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND a.attname = 'updated_at'
      AND NOT a.attisdropped
  LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      t || '_set_updated_at', t
    );
  END LOOP;
END
$$;--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Busca
--
-- Dois caminhos independentes sobre o mesmo fragmento: texto e vetor. Se a
-- geração de embedding falhar ou o provedor sair do ar, a busca textual continua
-- respondendo — a recuperação degrada, não para.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "knowledge_chunks"
  ADD COLUMN "content_tsv" tsvector
  GENERATED ALWAYS AS (to_tsvector('pt_unaccent', "content")) STORED;--> statement-breakpoint

CREATE INDEX "knowledge_chunks_tsv_idx" ON "knowledge_chunks"
  USING gin ("tenant_id", "content_tsv");--> statement-breakpoint

-- HNSW com distância de cosseno: os embeddings são normalizados, e cosseno é a
-- métrica em que os modelos de embedding são treinados.
CREATE INDEX "knowledge_chunks_embedding_idx" ON "knowledge_chunks"
  USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint

-- Busca por nome de contato tolerando erro de digitação, na Inbox.
CREATE INDEX "contacts_name_trgm_idx" ON "contacts"
  USING gin ("display_name" gin_trgm_ops);--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Isolamento entre empresas (RLS)
--
-- As políticas leem o contexto por `app_tenant_id()`, e não por `current_setting`
-- direto. A diferença importa: `set_config(..., true)` é local à transação, mas ao
-- terminar a transação o parâmetro não volta a ser inexistente — ele volta a ser
-- string vazia. `''::uuid` levanta erro de sintaxe, então uma consulta sem contexto
-- explodiria em vez de simplesmente não encontrar nada.
--
-- Com `nullif`, o contexto ausente vira NULL, a comparação vira NULL, e a consulta
-- retorna zero linhas. É por isso que esquecer o isolamento produz "não encontrei"
-- em vez de vazar dados de outra empresa.
--
-- FORCE ROW LEVEL SECURITY faz a política valer inclusive para o dono da tabela.
-- O papel `otto_platform`, usado só pelo backoffice, tem BYPASSRLS e é a única
-- forma de enxergar todas as empresas — em uma conexão separada, de propósito.
--
-- Ficam fora deste bloco, deliberadamente:
--   users, sessions, invitations — identidade, consultadas antes de existir
--     qualquer empresa no contexto (login, aceite de convite). O acesso a elas
--     vive apenas em `@otto/core/auth`.
--   webhook_events — quando o evento chega, ainda não se sabe de quem ele é.
-- ─────────────────────────────────────────────────────────────────────────────

-- STABLE e não STRICT: o planejador consegue embutir a chamada na política, o que
-- mantém o índice por `tenant_id` utilizável.
CREATE OR REPLACE FUNCTION app_tenant_id() RETURNS uuid
  LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.tenant_id', true), '')::uuid
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION app_user_id() RETURNS uuid
  LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.user_id', true), '')::uuid
$$;--> statement-breakpoint

DO $$
DECLARE
  t text;
  tabelas text[] := ARRAY[
    'tenant_locations','location_hours','location_exceptions',
    'channels',
    'contacts','contact_identities','tags','contact_tags',
    'conversations','messages','conversation_events','conversation_notes','conversation_tags',
    'knowledge_categories','knowledge_items','knowledge_versions','knowledge_chunks',
    'knowledge_signals','knowledge_suggestions',
    'agents','agent_versions',
    'ai_runs','ai_tool_calls','usage_events',
    'audit_log'
  ];
BEGIN
  FOREACH t IN ARRAY tabelas LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY isolamento_tenant ON %I '
      'USING (tenant_id = app_tenant_id()) '
      'WITH CHECK (tenant_id = app_tenant_id())',
      t
    );
  END LOOP;
END
$$;--> statement-breakpoint

-- `tenants` e `memberships` precisam de uma política a mais.
--
-- Ao entrar, o usuário ainda não escolheu empresa — e o seletor de empresas
-- precisa listar aquelas às quais ele pertence. Por isso a leitura também aceita
-- o contexto `app.user_id`. A escrita, não: alterar o próprio vínculo continua
-- exigindo contexto de empresa, senão um usuário poderia promover a si mesmo.

ALTER TABLE "tenants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tenants" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenants_leitura" ON "tenants" FOR SELECT USING (
  "id" = app_tenant_id()
  OR "id" IN (
    SELECT "tenant_id" FROM "memberships"
    WHERE "user_id" = app_user_id()
      AND "is_active"
  )
);--> statement-breakpoint
CREATE POLICY "tenants_escrita" ON "tenants" FOR UPDATE
  USING ("id" = app_tenant_id())
  WITH CHECK ("id" = app_tenant_id());--> statement-breakpoint

ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "memberships" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "memberships_leitura" ON "memberships" FOR SELECT USING (
  "tenant_id" = app_tenant_id()
  OR "user_id" = app_user_id()
);--> statement-breakpoint
CREATE POLICY "memberships_escrita" ON "memberships" FOR ALL
  USING ("tenant_id" = app_tenant_id())
  WITH CHECK ("tenant_id" = app_tenant_id());
