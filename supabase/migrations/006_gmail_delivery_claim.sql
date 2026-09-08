-- Aplicar depois da migração 005. Não envia emails.
begin;
alter table public.email_deliveries add column if not exists attempted_at timestamptz;
-- Envios antigos podem ter sido submetidos pelo fornecedor anterior.
-- Bloquear repetição automática até verificação manual.
update public.email_deliveries set attempted_at = created_at where attempted_at is null;
notify pgrst, 'reload schema';
commit;
