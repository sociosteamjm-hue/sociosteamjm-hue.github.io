export function contactFooter(contactEmail = '') {
  const email = String(contactEmail).trim() || 'teamjm29@gmail.com';
  const extra = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) ? ' ou envie um email para ' + email : '';
  return '\n\nPor favor, não responda a este email. Para esclarecer dúvidas, contacte-nos pelo número 963 069 801' + extra + '.\n\nObrigado,\nAssociação Team JM';
}

export function acknowledgementEmail(request, contactEmail) {
  return {
    subject: 'Recebemos o seu pedido de adesão — PED-' + request.request_number,
    text: 'Olá ' + request.name + ',\n\nRecebemos o seu pedido para se tornar sócio da Associação Team JM.' +
      '\n\nReferência do pedido: PED-' + request.request_number +
      '\nQuota anual: ' + Number(request.amount).toFixed(2).replace('.', ',') + ' €' +
      '\nMétodo de pagamento escolhido: ' + request.payment_method +
      '\n\nPode efectuar o pagamento através dos seguintes dados:' +
      '\nTransferência bancária: IBAN PT50 0045 5080 4041 6062 0745 4' +
      '\nTitular: Associação Team JM\nMB WAY: 963 069 801' +
      '\nDinheiro: entregue o valor à equipa da Associação Team JM.' +
      '\n\nSempre que possível, indique o seu nome e a referência PED-' + request.request_number + ' na descrição do pagamento. Se já efectuou o pagamento, não precisa de pagar novamente.' +
      '\n\nO pedido fica pendente até a equipa verificar os dados e confirmar o pagamento, qualquer que seja o método escolhido. Se optar por dinheiro, aguardaremos a sua entrega.' +
      '\n\nApós confirmação pela equipa, a quota fica paga para o ano corrente.' + contactFooter(contactEmail),
  };
}

export function decisionEmail(request, contactEmail) {
  const type = { membership: 'adesão', quota: 'pagamento de quotas', donation: 'donativo' }[request.request_type] || 'adesão';
  const approved = request.status === 'approved';
  let text = 'Olá ' + request.name + ',\n\n';
  if (approved) {
    text += 'O seu pedido de ' + type + ', com a referência PED-' + request.request_number + ', foi aprovado pela equipa da Associação Team JM.';
    if (request.request_type === 'membership') {
      text += '\n\nBem-vindo à Associação Team JM! O seu número de sócio é ' + request.member_number + '.';
      // Historical memberships may have been approved without a payment.
      if (request.amount != null && request.quota_year != null) text += ' Confirmámos o pagamento e a sua quota fica paga para o ano ' + request.quota_year + '.';
    } else if (request.request_type === 'quota') {
      text += '\n\nConfirmámos o seu pagamento. A quota referente ao ano ' + request.quota_year + ' fica registada como paga.';
    } else {
      text += '\n\nConfirmámos a recepção do seu donativo de ' + Number(request.amount).toFixed(2).replace('.', ',') + ' €. Obrigado pelo seu apoio à Associação Team JM.';
    }
    if (request.review_notes) text += '\n\nObservações da equipa:\n' + request.review_notes;
  } else {
    text += 'Após análise pela equipa da Associação Team JM, não foi possível aprovar o seu pedido de ' + type + ', com a referência PED-' + request.request_number + '.' +
      '\n\nMotivo:\n' + (request.review_notes || 'Contacte a equipa para esclarecer o pedido.') +
      '\n\nSe precisar de esclarecer os dados do pedido ou do pagamento, contacte-nos indicando a referência acima. Caso já tenha efectuado o pagamento, não o repita antes de falar com a equipa.';
  }
  return { subject: (approved ? 'O seu pedido foi aprovado — PED-' : 'Informação sobre o seu pedido — PED-') + request.request_number, text: text + contactFooter(contactEmail) };
}

export function receiptEmail(receipt, contactEmail) {
  return {
    subject: 'Team JM — Recibo n.º ' + receipt.receipt_number,
    text: 'Olá ' + receipt.payer_name + ',\n\nEnviamos em anexo o recibo n.º ' + receipt.receipt_number + ', referente ao pagamento de ' + Number(receipt.amount).toFixed(2).replace('.', ',') + ' €, relativo a ' + receipt.description + '.\n\nObrigado pelo seu contributo.' + contactFooter(contactEmail),
  };
}
