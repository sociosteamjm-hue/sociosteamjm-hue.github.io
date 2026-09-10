-- Apply after 006, before publishing the updated UAT frontend.
begin;
alter table public.public_requests drop constraint public_requests_payment_allowed;
alter table public.public_requests add constraint public_requests_payment_allowed check (
  payment_method is null or payment_method in ('Transferência bancária', 'MB WAY')
  or (request_type = 'membership' and payment_method = 'Dinheiro')
);
alter table public.public_requests drop constraint public_requests_fields_match_type;
alter table public.public_requests add constraint public_requests_fields_match_type check (
  (request_type = 'membership' and (
    (quota_year is null and amount is null and payment_method is null and payment_date is null and payment_reference is null)
    or (quota_year is not null and amount is not null and payment_method is not null
      and (payment_method = 'Dinheiro' or (payment_date is not null and payment_reference is not null)))
  ))
  or (request_type = 'quota' and member_number is not null and quota_year is not null
    and amount is not null and payment_method is not null and payment_date is not null and payment_reference is not null)
  or (request_type = 'donation' and member_number is null and quota_year is null
    and amount is not null and payment_method is not null and payment_date is not null and payment_reference is not null)
);
alter table public.public_requests drop constraint public_requests_review_consistency;
alter table public.public_requests add constraint public_requests_review_consistency check (
  (status = 'pending' and reviewed_at is null and reviewed_by is null and member_id is null and receipt_id is null)
  or (status = 'rejected' and reviewed_at is not null and reviewed_by is not null and member_id is null and receipt_id is null)
  or (status = 'approved' and reviewed_at is not null and reviewed_by is not null
    and ((request_type in ('membership', 'quota') and member_id is not null)
      or (request_type = 'donation' and member_id is null)))
);
drop function public.review_public_request(uuid, text, text, boolean);

create or replace function public.submit_public_request(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_request_type public.public_request_type;
  v_name text;
  v_contact text;
  v_nif text;
  v_locality text;
  v_address text;
  v_postal text;
  v_email text;
  v_message text;
  v_member_number bigint;
  v_quota_year integer;
  v_amount numeric;
  v_payment_method text;
  v_payment_date date;
  v_payment_reference text;
  v_text text;
  v_request public.public_requests%rowtype;
begin
  if payload is null or pg_catalog.jsonb_typeof(payload) <> 'object' then
    raise exception using errcode = '22023', message = 'O pedido deve ser um objeto JSON.';
  end if;

  -- Campo invisível no formulário público. Bots que o preencham são rejeitados.
  if nullif(pg_catalog.btrim(payload ->> 'website'), '') is not null then
    raise exception using errcode = '22023', message = 'Não foi possível validar o pedido.';
  end if;

  begin
    v_request_type := pg_catalog.btrim(coalesce(payload ->> 'request_type', ''))::public.public_request_type;
  exception
    when invalid_text_representation then
      raise exception using errcode = '22023', message = 'Selecione um tipo de pedido válido.';
  end;

  v_name := nullif(pg_catalog.btrim(payload ->> 'name'), '');
  v_contact := nullif(pg_catalog.btrim(payload ->> 'contact'), '');
  v_nif := nullif(pg_catalog.btrim(payload ->> 'nif'), '');
  v_locality := nullif(pg_catalog.btrim(payload ->> 'locality'), '');
  v_address := nullif(pg_catalog.btrim(payload ->> 'address'), '');
  v_postal := nullif(pg_catalog.btrim(payload ->> 'postal'), '');
  v_email := pg_catalog.lower(nullif(pg_catalog.btrim(payload ->> 'email'), ''));
  v_message := nullif(pg_catalog.btrim(payload ->> 'message'), '');

  if v_name is null then
    raise exception using errcode = '22023', message = 'Indique o nome da pessoa ou entidade.';
  end if;
  if v_address is null then
    raise exception using errcode = '22023', message = 'Indique a morada.';
  end if;
  if v_email is null or pg_catalog.strpos(v_email, '@') < 2 then
    raise exception using errcode = '22023', message = 'Indique um email válido.';
  end if;
  if coalesce((payload ->> 'consent')::boolean, false) is not true then
    raise exception using errcode = '22023', message = 'É necessário aceitar o tratamento dos dados para enviar o pedido.';
  end if;

  if pg_catalog.char_length(v_name) > 200
    or pg_catalog.char_length(coalesce(v_contact, '')) > 64
    or pg_catalog.char_length(coalesce(v_nif, '')) > 32
    or pg_catalog.char_length(coalesce(v_locality, '')) > 160
    or pg_catalog.char_length(v_address) > 500
    or pg_catalog.char_length(coalesce(v_postal, '')) > 32
    or pg_catalog.char_length(v_email) > 320
    or pg_catalog.char_length(coalesce(v_message, '')) > 2000 then
    raise exception using errcode = '22023', message = 'Um dos campos excede o tamanho permitido.';
  end if;

  if (
    select pg_catalog.count(*)
    from public.public_requests as recent
    where pg_catalog.lower(recent.email) = v_email
      and recent.submitted_at >= pg_catalog.clock_timestamp() - interval '1 hour'
  ) >= 5 then
    raise exception using errcode = 'P0001', message = 'Foram enviados demasiados pedidos para este email. Tente novamente mais tarde.';
  end if;

  if v_request_type = 'membership'::public.public_request_type then
    v_quota_year := extract(year from current_date)::integer;
  end if;
  begin
    v_payment_method := nullif(pg_catalog.btrim(payload ->> 'payment_method'), '');
    if v_payment_method is null or (v_payment_method not in ('Transferência bancária', 'MB WAY')
      and not (v_request_type = 'membership' and v_payment_method = 'Dinheiro')) then
      raise exception using errcode = '22023', message = 'Selecione um método de pagamento válido.';
    end if;

    if v_payment_method <> 'Dinheiro' then
    v_payment_reference := nullif(pg_catalog.btrim(payload ->> 'payment_reference'), '');
    if v_payment_reference is null then
      raise exception using errcode = '22023', message = 'Indique a referência ou descrição do pagamento.';
    end if;
    if pg_catalog.char_length(v_payment_reference) > 120 then
      raise exception using errcode = '22023', message = 'A referência do pagamento é demasiado longa.';
    end if;

    v_text := nullif(pg_catalog.btrim(payload ->> 'payment_date'), '');
    begin
      v_payment_date := v_text::date;
    exception
      when invalid_datetime_format or datetime_field_overflow then
        raise exception using errcode = '22023', message = 'Indique uma data de pagamento válida.';
    end;
    if v_payment_date is null then
      raise exception using errcode = '22023', message = 'Indique a data do pagamento.';
    end if;
    if v_payment_date > current_date then
      raise exception using errcode = '22023', message = 'A data do pagamento não pode ser futura.';
    end if;

    end if;

    v_text := nullif(pg_catalog.btrim(payload ->> 'amount'), '');
    begin
      v_amount := v_text::numeric;
    exception
      when invalid_text_representation or numeric_value_out_of_range then
        raise exception using errcode = '22023', message = 'Indique um valor válido.';
    end;
    if v_amount is null or v_amount <= 0 or v_amount > 9999999999.99 then
      raise exception using errcode = '22023', message = 'O valor deve ser superior a zero.';
    end if;
  end;

  if v_request_type = 'quota'::public.public_request_type then
    v_text := nullif(pg_catalog.btrim(payload ->> 'member_number'), '');
    if v_text is null or v_text !~ '^[1-9][0-9]*$' then
      raise exception using errcode = '22023', message = 'Indique um número de sócio válido.';
    end if;
    begin
      v_member_number := v_text::bigint;
    exception
      when numeric_value_out_of_range then
        raise exception using errcode = '22023', message = 'O número de sócio é demasiado grande.';
    end;

    v_text := nullif(pg_catalog.btrim(payload ->> 'quota_year'), '');
    if v_text is null or v_text !~ '^[0-9]{4}$' then
      raise exception using errcode = '22023', message = 'Selecione um ano de quota válido.';
    end if;
    v_quota_year := v_text::integer;
    if v_quota_year < 1900 or v_quota_year > 2200 then
      raise exception using errcode = '22023', message = 'O ano da quota está fora do intervalo permitido.';
    end if;
  end if;

  insert into public.public_requests (
    request_type, member_number, quota_year, name, contact, nif, locality,
    address, postal, email, amount, payment_method, payment_date,
    payment_reference, message
  )
  values (
    v_request_type, v_member_number, v_quota_year, v_name, v_contact, v_nif,
    v_locality, v_address, v_postal, v_email, v_amount, v_payment_method,
    v_payment_date, v_payment_reference, v_message
  )
  returning * into v_request;

  return pg_catalog.jsonb_build_object(
    'id', v_request.id,
    'request_number', v_request.request_number,
    'status', v_request.status
  );
exception
  when invalid_text_representation then
    raise exception using errcode = '22023', message = 'Os dados enviados não são válidos.';
end;
$function$;

create or replace function public.review_public_request(
  p_request_id uuid,
  p_decision text,
  p_review_notes text default null,
  p_issue_receipt boolean default true,
  p_cash_received boolean default false
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

  if v_request.payment_method = 'Dinheiro' then
    if p_cash_received is not true then
      raise exception 'Confirme a recepção do dinheiro antes de aprovar. O pedido permanece pendente.';
    end if;
    v_request.payment_date := current_date;
  end if;
  if v_request.request_type = 'membership' and v_request.amount is not null then
    v_request.quota_year := extract(year from v_request.payment_date)::integer;
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

  if v_request.request_type in ('membership', 'quota') and v_request.amount is not null then
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
  end if;

  update public.public_requests as request
  set status = 'approved'::public.public_request_status,
      reviewed_at = pg_catalog.clock_timestamp(),
      reviewed_by = v_actor,
      review_notes = v_notes,
      payment_date = v_request.payment_date,
      quota_year = v_request.quota_year,
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
revoke all on function public.review_public_request(uuid,text,text,boolean,boolean) from public,anon,authenticated;
grant execute on function public.review_public_request(uuid,text,text,boolean,boolean) to authenticated;

notify pgrst, 'reload schema';
commit;
