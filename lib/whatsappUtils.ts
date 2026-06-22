export function renderPaymentReminderMessage(template: string, variables: Record<string, any>): string {
  if (!template) return '';
  let rendered = template;
  
  const expectedKeys = ['clientName', 'projectName', 'studioName', 'amount', 'milestone', 'daysPending', 'supportContact'];
  
  expectedKeys.forEach(key => {
    const value = variables[key];
    const regex = new RegExp(`{${key}}`, 'g');
    if (value === undefined || value === null || value === '') {
      rendered = rendered.replace(regex, `[${key}]`); 
    } else {
      rendered = rendered.replace(regex, String(value));
    }
  });

  return rendered;
}

export function buildWhatsAppURL(phone: string, message: string): string {
  let cleanPhone = phone.replace(/\D/g, '');
  if (cleanPhone && cleanPhone.length === 10) {
    cleanPhone = '91' + cleanPhone; // India default if it seems to be 10 digits
  } else if (cleanPhone && !cleanPhone.startsWith('91') && cleanPhone.length < 12) {
      if(cleanPhone.length !== 10 && cleanPhone.length > 0) {
          // If we can't reliably guess, we prepend 91 only if they put a phone length that implies missing country code. Wait, standard is 91 for India and length is 10.
          // Let's just prepend 91 if it doesn't already start with 91, or let's say if length <= 10.
          if(cleanPhone.length <= 10) {
               cleanPhone = '91' + cleanPhone;
          }
      }
  }
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
}
