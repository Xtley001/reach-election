/**
 * REACH Election — Deep Link Generator
 * Verbatim from 06_MESSAGING.md
 */

export function resolveTemplate(template, context) {
  return template
    .replace(/{{voter_name}}/g,        context.voter_name        || '')
    .replace(/{{agent_name}}/g,        context.agent_name        || '')
    .replace(/{{candidate_name}}/g,    context.candidate_name    || '')
    .replace(/{{polling_unit_name}}/g, context.polling_unit_name || '');
}

export function whatsappLink(phone, message) {
  const stripped = phone.replace(/^\+/, '');
  const encoded  = encodeURIComponent(message);
  return `https://wa.me/${stripped}?text=${encoded}`;
}

export function smsLink(phone, message) {
  const encoded = encodeURIComponent(message);
  return `sms:${phone}?body=${encoded}`;
}

export function generateLinks(voter, agent, campaign, template) {
  const resolved = resolveTemplate(template, {
    voter_name:        voter.name,
    agent_name:        agent.name,
    candidate_name:    campaign.candidate_name,
    polling_unit_name: voter.polling_unit_name,
  });
  return {
    resolved,
    whatsapp: whatsappLink(voter.phone, resolved),
    sms:      smsLink(voter.phone, resolved),
  };
}
