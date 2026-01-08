import { ImapFlow } from 'imapflow';

export function createImapClient() {
  return new ImapFlow({
    host: process.env.IMAP_HOST,
    port: process.env.IMAP_PORT,
    secure: true,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
}
