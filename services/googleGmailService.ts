import { getGoogleAuthService } from './googleAuthService';

export interface GmailSendOptions {
  to: string;
  subject: string;
  body: string;
  from?: string;
  cc?: string[];
  bcc?: string[];
  replyTo?: string;
}

export interface GmailProfile {
  emailAddress?: string;
  messagesTotal?: number;
  threadsTotal?: number;
  historyId?: string;
}

export class GoogleGmailService {
  private authService = getGoogleAuthService();

  async getProfile(): Promise<GmailProfile> {
    const accessToken = await this.authService.getAccessToken();
    const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to load Gmail profile (${response.status})`);
    }

    return response.json();
  }

  async sendEmail(options: GmailSendOptions): Promise<void> {
    const accessToken = await this.authService.getAccessToken();
    const rawMessage = this.buildMimeMessage(options);

    const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: rawMessage }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gmail send failed (${response.status}): ${errorText}`);
    }
  }

  private buildMimeMessage(options: GmailSendOptions): string {
    const headers = [
      `To: ${options.to}`,
      options.from ? `From: ${options.from}` : undefined,
      options.replyTo ? `Reply-To: ${options.replyTo}` : undefined,
      options.cc && options.cc.length ? `Cc: ${options.cc.join(', ')}` : undefined,
      options.bcc && options.bcc.length ? `Bcc: ${options.bcc.join(', ')}` : undefined,
      `Subject: ${options.subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: 7bit',
      '',
    ].filter(Boolean) as string[];

    const message = `${headers.join('\n')}${options.body}`;
    return this.toBase64Url(message);
  }

  private toBase64Url(value: string): string {
    const encoded = typeof window !== 'undefined'
      ? window.btoa(unescape(encodeURIComponent(value)))
      : Buffer.from(value, 'utf8').toString('base64');

    return encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
}

let gmailService: GoogleGmailService | null = null;

export function getGoogleGmailService(): GoogleGmailService {
  if (!gmailService) {
    gmailService = new GoogleGmailService();
  }
  return gmailService;
}
