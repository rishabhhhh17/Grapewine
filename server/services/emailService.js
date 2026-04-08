const { Resend } = require('resend');

const sendOutreachEmail = async (toEmail, name, company, role, city) => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log('No RESEND_API_KEY found. Mocking email send.');
    return { success: true, messageId: 'mock-id-123' };
  }

  const resend = new Resend(apiKey);
  const textContent = `Hi ${name},\n\nWe noticed ${company} is actively building out its ${role} team in ${city}. At Grape, we have 300 pre-vetted candidates ready to interview. Our AI Tal has already done deep assessments on each of them so you skip straight to the final conversation.\n\nWorth a quick look?`;
  
  try {
    const { data, error } = await resend.emails.send({
      from: 'Grape <hello@grape-engine.com>', // User will need to verify domain to use actual Resend fully
      to: [toEmail],
      subject: `Candidates for your ${role} team at ${company}`,
      text: textContent
    });

    if (error) {
      console.error('Resend error:', error);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (error) {
    console.error('Email error:', error);
    return { success: false, error: error.message };
  }
};

module.exports = { sendOutreachEmail };
