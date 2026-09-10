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
| CONTACT_EMAIL | Opcional: endereço de contacto a incluir nos emails. Enquanto não estiver definido, aparece apenas o telefone 963 069 801. |

Não usar a password normal. Não enviar a credencial por mensagem nem guardá-la no GitHub ou em supabase-config.js. O ficheiro .env.example é apenas uma referência sem credenciais. Não são necessários Resend nem EMAIL_PROVIDER.
SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY são disponibilizadas pelo ambiente Supabase; nunca colocar a service role no browser.

## 3. Publicar

Publicar duas Edge Functions: `send-email` e `submit-public-request`.
A pasta `send-email` inclui `index.ts`, `templates.js` e `receipt-pdf.js`; todos estes ficheiros são necessários. Se usar o editor do Supabase, adicionar também os dois módulos JS, com os mesmos nomes e caminhos relativos. A função `submit-public-request` tem o seu próprio `index.ts`.

O envio liga ao Gmail por TLS na porta 465. Respostas e recibos exigem sessão válida e perfil admin/staff. A confirmação automática da adesão é pedida pelo servidor, depois de guardar o pedido, usando a chave de serviço apenas no servidor. A função pública não aceita destinatários de email nem referências a pedidos já existentes para envio: usa o ID devolvido pela submissão validada na base de dados.

Com Supabase CLI, na raiz do projecto UAT:

    supabase functions deploy send-email --project-ref ID_DO_PROJETO_DO_SITE
    supabase functions deploy submit-public-request --project-ref ID_DO_PROJETO_DO_SITE

Manter a configuração de `supabase/config.toml`: `send-email` com verificação JWT activa; `submit-public-request` com verificação JWT desactivada porque recebe o formulário público, sem sessão. No editor do Supabase, configurar estas opções explicitamente. A submissão continua a usar a validação, consentimento, honeypot e limite por email da função SQL existente. Não desactivar a autenticação de staff/admin no envio de respostas e recibos.

Publicar as funções antes de actualizar o site. Publicar também `public.js`, `public.html`, `app.js`, `index.html` e `styles.css`. Aplicar a migração 007, se ainda não foi aplicada. Estes emails não exigem uma migração adicional.

## 4. Testar

Entrar no site como admin/staff. Usar exclusivamente dados fictícios.
Abrir um recibo de teste guardado, preencher um email controlado pela associação e escolher Enviar por email. Confirmar o endereço antes do envio.
Verificar o resultado no site, os Enviados do Gmail e a caixa de entrada/spam do destinatário. Aceitação pelo Gmail não garante entrega.

Testar também um pedido: Sim/Não para resposta, emissão e envio do recibo.
O recibo segue em PDF anexo, gerado no servidor a partir dos dados guardados do recibo. O corpo do email contém uma mensagem curta e os contactos. O PDF apresenta os dados do recibo num modelo próprio; não é uma captura visual da página de impressão.
O email geral impresso no recibo continua separado do remetente.

Submeter uma adesão com cada método de pagamento e verificar a confirmação com referência PED, valor, IBAN, MB WAY e aviso de validação pela equipa. O envio não aprova a adesão nem marca a quota como paga. Se o Gmail falhar, o site mantém a referência e informa que o pedido foi guardado; não repetir a submissão. Staff/admin pode tentar a confirmação com `kind: acknowledgement` e `request_id` na função autenticada, respeitando os mesmos bloqueios de duplicados/envios incertos.

Verificar aprovação de adesão, quota e donativo e rejeição com motivo. Testar um recibo com nome/morada extensos e vários anos de quotas; abrir o PDF e conferir número, pagador, valor e anos. PDFs usam Helvetica: caracteres fora do conjunto suportado são apresentados como `?`; os acentos portugueses são suportados.

Testes sem credenciais nem envios reais (Node 22+):

    node supabase/functions/send-email/handler.mock-test.mjs
    node supabase/functions/send-email/templates.test.mjs
    node supabase/functions/submit-public-request/handler.mock-test.mjs

Teste do PDF com a dependência real (Deno):

    deno test supabase/functions/send-email/receipt-pdf.test.ts

## Erros e duplicados

Cada confirmação/resposta/recibo tem um único registo em email_deliveries, protegido por RLS e acessível apenas ao servidor. Cliques repetidos não reenviam documentos aceites. O conteúdo de envios já registados mantém-se: esta actualização não reenvia emails antigos nem altera os seus textos/anexos.
Falhas na ligação/autenticação antes da submissão permitem tentar novamente depois de corrigir os Secrets. Se o envio ficou incerto, não existe repetição automática: um administrador deve verificar os Enviados e a receção antes de desbloquear o registo. Não apagar registos nem emitir novos recibos para repetir emails.
O Gmail pode bloquear acessos ou limitar envios. O teste real depende da configuração no Supabase.

## Mudar a conta depois

Alterar EMAIL_FROM e GMAIL_APP_PASSWORD nos Secrets para a nova conta Gmail autorizada. Não é necessário alterar sócios nem recibos. Testar novamente e só depois revogar a credencial antiga. Envios pendentes com o remetente anterior exigem verificação manual; emails já enviados não são modificados.

Referências: [Secrets Supabase](https://supabase.com/docs/guides/functions/secrets), [exemplo SMTP Supabase](https://github.com/supabase/supabase/blob/master/examples/edge-functions/supabase/functions/send-email-smtp/index.ts), [Gmail](https://nodemailer.com/guides/using-gmail).
