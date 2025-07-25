const nodemailer = require('nodemailer');
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});
exports.sendCSVEmail = async (to, csvBuffer, filename = 'export.csv') => {
  return transporter.sendMail({
    from: `"LeadCourt" <export@leadcourt.cloud>`,
    to,
    subject: 'Your LeadCourt Export is Ready ✅',
    text: `Hi there,

Thanks for using LeadCourt!
Your requested lead list has been successfully generated and is now ready for you.

Please find the list attached to this email.

Best regards,
The LeadCourt Team`,
    attachments: [
      {
        filename,
        content: csvBuffer,
      },
    ],
  });
};