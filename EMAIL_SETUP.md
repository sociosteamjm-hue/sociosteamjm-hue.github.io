# Email da área de sócios

Remetente previsto: `sociosteamjm@gmail.com`.

O endereço está documentado em `supabase/functions/.env.example`, apenas como
referência para a configuração segura do servidor. Não ativa o envio.

A função `send-email` existente foi inicialmente preparada para Resend.
A ligação ao Gmail ainda precisa de ser implementada e autorizada antes de
enviar emails. Não configurar um endereço Gmail como remetente do Resend.

## Trocar de conta mais tarde

1. Autorizar a nova conta no mecanismo de envio que ficar configurado.
2. Alterar `EMAIL_FROM` e as credenciais correspondentes nos secrets do servidor.
3. Testar o envio para um endereço controlado pela associação.
4. Revogar a autorização da conta antiga quando já não for necessária.

Não é necessário alterar sócios, pagamentos ou recibos para trocar o remetente.
Emails já enviados não são alterados. Tentativas pendentes podem conservar o
remetente anterior e devem ser verificadas antes da mudança.

Não colocar passwords no código, na configuração pública do site, no GitHub
ou na conversa. O email geral impresso nos recibos não foi alterado: é distinto
da conta escolhida para o envio.
