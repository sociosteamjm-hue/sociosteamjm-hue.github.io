# Ativar o envio por Gmail

O código está preparado para sociosteamjm@gmail.com. Só ficará ativo depois de aplicar as migrações, guardar os Secrets e publicar a função. Não basta carregar o site no GitHub. Nenhum email foi enviado durante o desenvolvimento.

## 1. Base de dados

No projeto usado pelo site, abrir SQL Editor. Se já tem as migrações até 004, executar uma vez supabase/migrations/005_email_optional_receipts.sql e depois supabase/migrations/006_gmail_delivery_claim.sql. Se 005 já foi aplicada, executar apenas 006. Não reinstalar schema.sql numa base existente.
Numa instalação vazia: schema.sql (já inclui 004) e migrações 005 e 006, nesta ordem.

## 2. Secrets (apenas no servidor)

Em Supabase → Edge Functions → Secrets, guardar:

| Nome | Valor |
| --- | --- |
| EMAIL_FROM | sociosteamjm@gmail.com |
| GMAIL_APP_PASSWORD | Palavra-passe de aplicação criada nessa conta Google |

Não usar a password normal. Não enviar a credencial por mensagem nem guardá-la no GitHub ou em supabase-config.js. O ficheiro .env.example é apenas uma referência sem credenciais. Não são necessários Resend nem EMAIL_PROVIDER.
SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY são disponibilizadas pelo ambiente Supabase; nunca colocar a service role no browser.

## 3. Publicar

Em Edge Functions, criar/publicar uma função com o nome exato send-email. No editor colocar o conteúdo de supabase/functions/send-email/index.ts.
O código importa as dependências npm e liga ao Gmail por TLS na porta 465. Exige sessão válida e perfil admin ou staff; não permite envios anónimos.

Alternativa com Supabase CLI, dentro de uat-v3:

    supabase functions deploy send-email --project-ref ID_DO_PROJETO_DO_SITE

Manter a verificação JWT conforme supabase/config.toml. Se o gateway devolver 401 com uma sessão válida, verificar a compatibilidade das chaves de assinatura do projeto antes de alterar esta opção. A autenticação getUser dentro da função nunca deve ser removida.

Publicar também app.js e index.html atualizados (e public.html/styles.css para as alterações visuais anteriores).

## 4. Testar

Entrar no site como admin/staff. Usar exclusivamente dados fictícios.
Abrir um recibo de teste guardado, preencher um email controlado pela associação e escolher Enviar por email. Confirmar o endereço antes do envio.
Verificar o resultado no site, os Enviados do Gmail e a caixa de entrada/spam do destinatário. Aceitação pelo Gmail não garante entrega.

Testar também um pedido: Sim/Não para resposta, emissão e envio do recibo.
O recibo é enviado no corpo do email (texto e HTML), não como PDF anexo.
O email geral impresso no recibo continua separado do remetente.

## Erros e duplicados

Cada resposta/recibo tem um único registo em email_deliveries, protegido por RLS e acessível apenas ao servidor. Cliques repetidos não reenviam documentos aceites.
Falhas na ligação/autenticação antes da submissão permitem tentar novamente depois de corrigir os Secrets. Se o envio ficou incerto, não existe repetição automática: um administrador deve verificar os Enviados e a receção antes de desbloquear o registo. Não apagar registos nem emitir novos recibos para repetir emails.
O Gmail pode bloquear acessos ou limitar envios. O teste real depende da configuração no Supabase.

## Mudar a conta depois

Alterar EMAIL_FROM e GMAIL_APP_PASSWORD nos Secrets para a nova conta Gmail autorizada. Não é necessário alterar sócios nem recibos. Testar novamente e só depois revogar a credencial antiga. Envios pendentes com o remetente anterior exigem verificação manual; emails já enviados não são modificados.

Referências: [Secrets Supabase](https://supabase.com/docs/guides/functions/secrets), [exemplo SMTP Supabase](https://github.com/supabase/supabase/blob/master/examples/edge-functions/supabase/functions/send-email-smtp/index.ts), [Gmail](https://nodemailer.com/guides/using-gmail).
