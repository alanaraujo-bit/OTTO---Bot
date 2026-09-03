CREATE TYPE "public"."channel_kind" AS ENUM('whatsapp', 'instagram', 'simulador');--> statement-breakpoint
CREATE TYPE "public"."channel_status" AS ENUM('nao_conectado', 'conectado', 'degradado', 'desconectado', 'pausado');--> statement-breakpoint
CREATE TYPE "public"."content_type" AS ENUM('texto', 'imagem', 'audio', 'video', 'documento', 'localizacao', 'contato', 'figurinha', 'nao_suportado');--> statement-breakpoint
CREATE TYPE "public"."conversation_mode" AS ENUM('automatico', 'copilot', 'humano');--> statement-breakpoint
CREATE TYPE "public"."conversation_status" AS ENUM('aberta', 'aguardando_cliente', 'aguardando_humano', 'resolvida', 'encerrada');--> statement-breakpoint
CREATE TYPE "public"."knowledge_kind" AS ENUM('fato', 'pergunta_frequente', 'politica', 'procedimento', 'servico', 'horario', 'localizacao', 'documento');--> statement-breakpoint
CREATE TYPE "public"."knowledge_status" AS ENUM('rascunho', 'em_aprovacao', 'publicado', 'desatualizado', 'arquivado');--> statement-breakpoint
CREATE TYPE "public"."membership_role" AS ENUM('proprietario', 'administrador', 'supervisor', 'atendente', 'analista', 'visualizacao');--> statement-breakpoint
CREATE TYPE "public"."message_author" AS ENUM('cliente', 'agente', 'operador', 'sistema');--> statement-breakpoint
CREATE TYPE "public"."message_direction" AS ENUM('entrada', 'saida');--> statement-breakpoint
CREATE TYPE "public"."message_status" AS ENUM('pendente', 'enviando', 'enviada', 'entregue', 'lida', 'falhou');--> statement-breakpoint
CREATE TYPE "public"."platform_role" AS ENUM('fundador', 'suporte');--> statement-breakpoint
CREATE TYPE "public"."suggestion_status" AS ENUM('aberta', 'em_analise', 'aceita', 'recusada', 'expirada');--> statement-breakpoint
CREATE TYPE "public"."tenant_status" AS ENUM('ativo', 'suspenso', 'em_implantacao', 'encerrado');--> statement-breakpoint
CREATE TYPE "public"."webhook_status" AS ENUM('recebido', 'processando', 'processado', 'falhou', 'descartado');--> statement-breakpoint
CREATE TABLE "location_exceptions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"date" date NOT NULL,
	"closed" boolean DEFAULT false NOT NULL,
	"opens_at" integer,
	"closes_at" integer,
	"reason" varchar(120),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "location_hours" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"weekday" smallint NOT NULL,
	"opens_at" integer NOT NULL,
	"closes_at" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_locations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"street" varchar(200),
	"number" varchar(20),
	"complement" varchar(100),
	"district" varchar(100),
	"city" varchar(100),
	"state" varchar(2),
	"postal_code" varchar(8),
	"latitude" numeric(10, 7),
	"longitude" numeric(10, 7),
	"phone" varchar(20),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"slug" varchar(63) NOT NULL,
	"display_name" varchar(120) NOT NULL,
	"legal_name" varchar(200),
	"tax_id" varchar(14),
	"status" "tenant_status" DEFAULT 'em_implantacao' NOT NULL,
	"status_reason" text,
	"timezone" varchar(64) DEFAULT 'America/Sao_Paulo' NOT NULL,
	"locale" varchar(10) DEFAULT 'pt-BR' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"email" varchar(255) NOT NULL,
	"role" "membership_role" NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"invited_by" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "membership_role" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"invited_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"last_tenant_id" uuid,
	"ip_address" "inet",
	"user_agent" text,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" text,
	"name" varchar(120) NOT NULL,
	"phone" varchar(20),
	"avatar_url" text,
	"platform_role" "platform_role",
	"is_active" boolean DEFAULT true NOT NULL,
	"email_verified_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "channels" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" "channel_kind" NOT NULL,
	"name" varchar(120) NOT NULL,
	"status" "channel_status" DEFAULT 'nao_conectado' NOT NULL,
	"external_id" varchar(128),
	"external_handle" varchar(128),
	"external_account_id" varchar(128),
	"credentials" text,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"connected_at" timestamp with time zone,
	"last_event_at" timestamp with time zone,
	"last_error_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"provider" varchar(32) NOT NULL,
	"external_id" varchar(200) NOT NULL,
	"tenant_id" uuid,
	"channel_id" uuid,
	"payload" jsonb NOT NULL,
	"status" "webhook_status" DEFAULT 'recebido' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"discard_reason" varchar(120),
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "contact_identities" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"kind" "channel_kind" NOT NULL,
	"external_id" varchar(128) NOT NULL,
	"handle" varchar(128),
	"profile_name" varchar(160),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_tags" (
	"tenant_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"applied_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_tags_contact_id_tag_id_pk" PRIMARY KEY("contact_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"display_name" varchar(160),
	"name_source" varchar(16) DEFAULT 'canal' NOT NULL,
	"phone" varchar(20),
	"email" varchar(255),
	"notes" text,
	"is_blocked" boolean DEFAULT false NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_interaction_at" timestamp with time zone,
	"conversation_count" integer DEFAULT 0 NOT NULL,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(40) NOT NULL,
	"color" varchar(24) DEFAULT 'neutro' NOT NULL,
	"description" varchar(160),
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_events" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"type" varchar(40) NOT NULL,
	"actor_user_id" uuid,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_notes" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_tags" (
	"tenant_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"applied_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_tags_conversation_id_tag_id_pk" PRIMARY KEY("conversation_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"status" "conversation_status" DEFAULT 'aberta' NOT NULL,
	"mode" "conversation_mode" DEFAULT 'automatico' NOT NULL,
	"assigned_user_id" uuid,
	"assigned_at" timestamp with time zone,
	"ai_paused_until" timestamp with time zone,
	"priority" smallint DEFAULT 0 NOT NULL,
	"summary" text,
	"summary_updated_at" timestamp with time zone,
	"intent" varchar(60),
	"sentiment" smallint,
	"first_inbound_at" timestamp with time zone,
	"first_response_at" timestamp with time zone,
	"last_message_at" timestamp with time zone,
	"last_inbound_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"handoff_count" integer DEFAULT 0 NOT NULL,
	"unread_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"direction" "message_direction" NOT NULL,
	"author" "message_author" NOT NULL,
	"author_user_id" uuid,
	"content_type" "content_type" DEFAULT 'texto' NOT NULL,
	"body" text,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "message_status" DEFAULT 'pendente' NOT NULL,
	"external_id" varchar(200),
	"idempotency_key" varchar(100),
	"ai_run_id" uuid,
	"original_draft" text,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_categories" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(80) NOT NULL,
	"description" varchar(240),
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_chunks" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(1536),
	"embedding_model" varchar(64),
	"embedded_at" timestamp with time zone,
	"token_count" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_items" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"category_id" uuid,
	"kind" "knowledge_kind" DEFAULT 'fato' NOT NULL,
	"status" "knowledge_status" DEFAULT 'rascunho' NOT NULL,
	"title" varchar(200) NOT NULL,
	"body" text NOT NULL,
	"aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_type" varchar(32) DEFAULT 'manual' NOT NULL,
	"source_ref" text,
	"source_conversation_id" uuid,
	"valid_from" timestamp with time zone,
	"valid_until" timestamp with time zone,
	"review_due_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"published_by" uuid,
	"published_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_signals" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"type" varchar(40) NOT NULL,
	"conversation_id" uuid,
	"message_id" uuid,
	"query_text" text,
	"confidence" real,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"aggregated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"type" varchar(40) NOT NULL,
	"status" "suggestion_status" DEFAULT 'aberta' NOT NULL,
	"title" varchar(200) NOT NULL,
	"rationale" text NOT NULL,
	"proposed_body" text,
	"related_item_id" uuid,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"occurrences" integer DEFAULT 1 NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"priority" real DEFAULT 0 NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"review_note" varchar(300),
	"resulting_item_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_versions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"title" varchar(200) NOT NULL,
	"body" text NOT NULL,
	"kind" "knowledge_kind" NOT NULL,
	"change_note" varchar(300),
	"author_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_versions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"settings" jsonb NOT NULL,
	"compiled_instruction" text NOT NULL,
	"change_note" varchar(300),
	"published_by" uuid,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"display_name" varchar(60) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"active_version_id" uuid,
	"draft_settings" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_runs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"conversation_id" uuid,
	"trigger_message_id" uuid,
	"agent_version_id" uuid,
	"purpose" varchar(40) NOT NULL,
	"provider" varchar(32) NOT NULL,
	"model" varchar(64) NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cached_tokens" integer DEFAULT 0 NOT NULL,
	"cost_micro_usd" bigint DEFAULT 0 NOT NULL,
	"latency_ms" integer,
	"confidence" real,
	"grounded" boolean DEFAULT false NOT NULL,
	"retrieved_item_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"outcome" varchar(32) DEFAULT 'ok' NOT NULL,
	"error" text,
	"attempts" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ai_tool_calls" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"tool_name" varchar(64) NOT NULL,
	"arguments" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"result" jsonb,
	"success" boolean DEFAULT true NOT NULL,
	"error" text,
	"latency_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_events" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" varchar(40) NOT NULL,
	"quantity" bigint DEFAULT 0 NOT NULL,
	"unit" varchar(20) NOT NULL,
	"cost_micro_usd" bigint DEFAULT 0 NOT NULL,
	"ref_type" varchar(32),
	"ref_id" uuid,
	"local_date" varchar(10) NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tenant_id" uuid,
	"target_tenant_id" uuid,
	"actor_type" varchar(20) NOT NULL,
	"actor_user_id" uuid,
	"actor_label" varchar(160),
	"action" varchar(60) NOT NULL,
	"target_type" varchar(40),
	"target_id" uuid,
	"target_label" varchar(200),
	"changes" jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip_address" "inet",
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "location_exceptions_key" ON "location_exceptions" USING btree ("location_id","date");--> statement-breakpoint
CREATE INDEX "location_hours_location_idx" ON "location_hours" USING btree ("location_id","weekday");--> statement-breakpoint
CREATE INDEX "tenant_locations_tenant_idx" ON "tenant_locations" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_locations_primary_key" ON "tenant_locations" USING btree ("tenant_id") WHERE is_primary;--> statement-breakpoint
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "tenants_status_idx" ON "tenants" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_token_hash_key" ON "invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "invitations_tenant_idx" ON "invitations" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_pending_key" ON "invitations" USING btree ("tenant_id",lower("email")) WHERE accepted_at is null and revoked_at is null;--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_tenant_user_key" ON "memberships" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE INDEX "memberships_user_idx" ON "memberships" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "users_platform_role_idx" ON "users" USING btree ("platform_role") WHERE platform_role is not null;--> statement-breakpoint
CREATE INDEX "channels_tenant_idx" ON "channels" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "channels_external_key" ON "channels" USING btree ("kind","external_id") WHERE external_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_dedupe_key" ON "webhook_events" USING btree ("provider","external_id");--> statement-breakpoint
CREATE INDEX "webhook_events_status_idx" ON "webhook_events" USING btree ("status","received_at");--> statement-breakpoint
CREATE INDEX "webhook_events_tenant_idx" ON "webhook_events" USING btree ("tenant_id","received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "contact_identities_key" ON "contact_identities" USING btree ("tenant_id","kind","external_id");--> statement-breakpoint
CREATE INDEX "contact_identities_contact_idx" ON "contact_identities" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "contact_tags_tag_idx" ON "contact_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "contacts_tenant_idx" ON "contacts" USING btree ("tenant_id","last_interaction_at");--> statement-breakpoint
CREATE INDEX "contacts_phone_idx" ON "contacts" USING btree ("tenant_id","phone") WHERE phone is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "tags_tenant_name_key" ON "tags" USING btree ("tenant_id",lower("name"));--> statement-breakpoint
CREATE INDEX "conversation_events_conversation_idx" ON "conversation_events" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "conversation_notes_conversation_idx" ON "conversation_notes" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "conversation_tags_tag_idx" ON "conversation_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "conversations_inbox_idx" ON "conversations" USING btree ("tenant_id","status","last_message_at");--> statement-breakpoint
CREATE INDEX "conversations_contact_idx" ON "conversations" USING btree ("contact_id","created_at");--> statement-breakpoint
CREATE INDEX "conversations_assigned_idx" ON "conversations" USING btree ("tenant_id","assigned_user_id") WHERE assigned_user_id is not null;--> statement-breakpoint
CREATE INDEX "conversations_channel_idx" ON "conversations" USING btree ("channel_id","last_message_at");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_open_key" ON "conversations" USING btree ("contact_id","channel_id") WHERE status in ('aberta','aguardando_cliente','aguardando_humano');--> statement-breakpoint
CREATE INDEX "messages_conversation_idx" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "messages_tenant_created_idx" ON "messages" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_external_key" ON "messages" USING btree ("tenant_id","external_id") WHERE external_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "messages_idempotency_key" ON "messages" USING btree ("tenant_id","idempotency_key") WHERE idempotency_key is not null;--> statement-breakpoint
CREATE INDEX "messages_pending_idx" ON "messages" USING btree ("status","created_at") WHERE status in ('pendente','enviando');--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_categories_key" ON "knowledge_categories" USING btree ("tenant_id",lower("name"));--> statement-breakpoint
CREATE INDEX "knowledge_chunks_item_idx" ON "knowledge_chunks" USING btree ("item_id","position");--> statement-breakpoint
CREATE INDEX "knowledge_chunks_tenant_idx" ON "knowledge_chunks" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "knowledge_items_tenant_status_idx" ON "knowledge_items" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "knowledge_items_category_idx" ON "knowledge_items" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "knowledge_items_review_idx" ON "knowledge_items" USING btree ("tenant_id","review_due_at") WHERE review_due_at is not null;--> statement-breakpoint
CREATE INDEX "knowledge_signals_tenant_type_idx" ON "knowledge_signals" USING btree ("tenant_id","type","created_at");--> statement-breakpoint
CREATE INDEX "knowledge_signals_pending_idx" ON "knowledge_signals" USING btree ("tenant_id","created_at") WHERE aggregated_at is null;--> statement-breakpoint
CREATE INDEX "knowledge_suggestions_queue_idx" ON "knowledge_suggestions" USING btree ("tenant_id","status","priority");--> statement-breakpoint
CREATE INDEX "knowledge_suggestions_related_idx" ON "knowledge_suggestions" USING btree ("related_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_versions_key" ON "knowledge_versions" USING btree ("item_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_versions_key" ON "agent_versions" USING btree ("agent_id","version");--> statement-breakpoint
CREATE INDEX "agent_versions_tenant_idx" ON "agent_versions" USING btree ("tenant_id","published_at");--> statement-breakpoint
CREATE UNIQUE INDEX "agents_tenant_key" ON "agents" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "ai_runs_tenant_created_idx" ON "ai_runs" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_runs_conversation_idx" ON "ai_runs" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_runs_agent_version_idx" ON "ai_runs" USING btree ("agent_version_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_tool_calls_run_idx" ON "ai_tool_calls" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "ai_tool_calls_tenant_tool_idx" ON "ai_tool_calls" USING btree ("tenant_id","tool_name","created_at");--> statement-breakpoint
CREATE INDEX "usage_events_tenant_date_idx" ON "usage_events" USING btree ("tenant_id","local_date","kind");--> statement-breakpoint
CREATE INDEX "usage_events_occurred_idx" ON "usage_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "audit_log_tenant_idx" ON "audit_log" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_target_idx" ON "audit_log" USING btree ("target_type","target_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_actor_idx" ON "audit_log" USING btree ("actor_user_id","created_at");