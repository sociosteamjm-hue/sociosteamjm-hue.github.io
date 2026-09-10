-- Apply after migration 004 in the current project.
begin;
drop function public.review_public_request(uuid, text, text);
create or replace function public.review_public_request(
  p_request_id uuid,
  p_decision text,
  p_review_notes text default null,
  p_issue_receipt boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_role public.app_role;
  v_decision text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_decision, '')));
  v_notes text := nullif(pg_catalog.btrim(p_review_notes), '');
  v_request public.public_requests%rowtype;
  v_member public.members%rowtype;
  v_receipt public.receipts%rowtype;
  v_member_id uuid;
  v_receipt_id uuid;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'É necessário iniciar sessão.';
  end if;

  select app_user.role into v_role
  from public.app_users as app_user
  where app_user.user_id = v_actor;

  if v_role is null or v_role not in ('admin'::public.app_role, 'staff'::public.app_role) then
    raise exception using errcode = '42501', message = 'Apenas administradores ou membros da equipa podem rever pedidos.';
  end if;

  if v_decision not in ('approve', 'reject') then
    raise exception using errcode = '22023', message = 'A decisão deve ser aprovar ou rejeitar.';
  end if;
  if pg_catalog.char_length(coalesce(v_notes, '')) > 2000 then
    raise exception using errcode = '22023', message = 'As notas de revisão são demasiado longas.';
  end if;
  if v_decision = 'reject' and v_notes is null then
    raise exception using errcode = '22023', message = 'Indique o motivo da rejeição.';
  end if;

  select request.* into v_request
  from public.public_requests as request
  where request.id = p_request_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Pedido não encontrado.';
  end if;
  if v_request.status <> 'pending'::public.public_request_status then
    raise exception using errcode = '22023', message = 'Este pedido já foi revisto.';
  end if;

  if v_decision = 'reject' then
    update public.public_requests as request
    set status = 'rejected'::public.public_request_status,
        reviewed_at = pg_catalog.clock_timestamp(),
        reviewed_by = v_actor,
        review_notes = v_notes
    where request.id = v_request.id;

    return pg_catalog.jsonb_build_object(
      'request_number', v_request.request_number,
      'status', 'rejected'
    );
  end if;

  if v_request.request_type = 'membership'::public.public_request_type then
    insert into public.members (
      name, contact, nif, locality, address, postal, email, registration_date,
      notes, dues, updated_by
    )
    values (
      v_request.name, v_request.contact, v_request.nif, v_request.locality,
      v_request.address, v_request.postal, v_request.email, current_date,
      pg_catalog.concat(
        'Criado a partir do pedido público n.º ', v_request.request_number,
        case when v_request.message is null then '' else '. Mensagem: ' || v_request.message end
      ),
      '{}'::jsonb, v_actor
    )
    returning * into v_member;
    v_member_id := v_member.id;
  elsif v_request.request_type = 'quota'::public.public_request_type then
    select member.* into v_member
    from public.members as member
    where member.member_number = v_request.member_number
      and not member.removed
    for update;

    if not found then
      raise exception using errcode = 'P0002', message = 'Sócio ativo não encontrado.';
    end if;

    if p_issue_receipt then
    v_receipt := public.issue_receipt(pg_catalog.jsonb_build_object(
      'member_id', v_member.id,
      'receipt_date', v_request.payment_date,
      'receipt_type', 'Quota',
      'payment_method', v_request.payment_method,
      'payer_name', v_request.name,
      'payer_tax_id', coalesce(v_request.nif, ''),
      'payer_address', v_request.address,
      'amount', v_request.amount,
      'description', 'Quota',
      'quota_years', pg_catalog.jsonb_build_array(v_request.quota_year),
      'quota_year', v_request.quota_year
    ));
    else
      if v_member.dues ->> v_request.quota_year::text = 'Pago' then
        raise exception 'Esta quota já está paga.';
      end if;
      update public.members set dues = pg_catalog.jsonb_set(dues, array[v_request.quota_year::text], '"Pago"'::jsonb, true) where id = v_member.id;
    end if;
    v_member_id := v_member.id;
    v_receipt_id := v_receipt.id;
  elsif p_issue_receipt then
    v_receipt := public.issue_receipt(pg_catalog.jsonb_build_object(
      'receipt_date', v_request.payment_date,
      'receipt_type', 'Donativo',
      'payment_method', v_request.payment_method,
      'payer_name', v_request.name,
      'payer_tax_id', coalesce(v_request.nif, ''),
      'payer_address', v_request.address,
      'amount', v_request.amount,
      'description', coalesce(v_request.message, 'Donativo')
    ));
    v_receipt_id := v_receipt.id;
  end if;

  update public.public_requests as request
  set status = 'approved'::public.public_request_status,
      reviewed_at = pg_catalog.clock_timestamp(),
      reviewed_by = v_actor,
      review_notes = v_notes,
      member_id = v_member_id,
      member_number = coalesce(v_member.member_number, request.member_number),
      receipt_id = v_receipt_id
  where request.id = v_request.id;

  return pg_catalog.jsonb_build_object(
    'request_number', v_request.request_number,
    'status', 'approved',
    'member_number', v_member.member_number,
    'receipt_number', v_receipt.receipt_number,
    'receipt_id', v_receipt.id
  );
end;
$function$;
revoke all on function public.review_public_request(uuid,text,text,boolean) from public,anon,authenticated;
grant execute on function public.review_public_request(uuid,text,text,boolean) to authenticated;
create table public.email_deliveries (
  id text primary key,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  provider_id text
);
alter table public.email_deliveries enable row level security;
revoke all on public.email_deliveries from public,anon,authenticated;
grant all on public.email_deliveries to service_role;
notify pgrst, 'reload schema';
commit;

