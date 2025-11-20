import { getGoogleAuthService } from './googleAuthService';

export interface GmailAttachment {
  filename: string;
  mimeType: string;
  contentBase64: string;
}

export interface GmailSendOptions {
  to: string;
  subject: string;
  body: string;
  from?: string;
  cc?: string[];
  bcc?: string[];
  replyTo?: string;
  attachments?: GmailAttachment[];
  threadId?: string;
  inReplyToMessageId?: string;
}

export interface GmailProfile {
  emailAddress?: string;
  messagesTotal?: number;
  threadsTotal?: number;
  historyId?: string;
}

export interface GmailSendResult {
  id: string;
  threadId: string;
  labelIds?: string[];
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

  async sendEmail(options: GmailSendOptions): Promise<GmailSendResult> {
    const accessToken = await this.authService.getAccessToken();
    const rawMessage = this.buildMimeMessage(options);

    const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        raw: rawMessage,
        threadId: options.threadId,
      }),
    });

    const payload = await response.json();

    if (!response.ok) {
      throw new Error(`Gmail send failed (${response.status}): ${JSON.stringify(payload)}`);
    }

    return {
      id: payload.id,
      threadId: payload.threadId,
      labelIds: payload.labelIds,
    };
  }

  private buildMimeMessage(options: GmailSendOptions): string {
    const headers = [
      `To: ${options.to}`,
      options.from ? `From: ${options.from}` : undefined,
      options.replyTo ? `Reply-To: ${options.replyTo}` : undefined,
      options.cc && options.cc.length ? `Cc: ${options.cc.join(', ')}` : undefined,
      options.bcc && options.bcc.length ? `Bcc: ${options.bcc.join(', ')}` : undefined,
      options.inReplyToMessageId ? `In-Reply-To: ${options.inReplyToMessageId}` : undefined,
      options.inReplyToMessageId ? `References: ${options.inReplyToMessageId}` : undefined,
      `Subject: ${options.subject}`,
      'MIME-Version: 1.0',
    ].filter(Boolean) as string[];

    if (options.attachments && options.attachments.length > 0) {
      const boundary = `=_Boundary_${Date.now()}`;
      const multipartHeaders = [
        ...headers,
        `Content-Type: multipart/mixed; boundary="${boundary}"`,
        '',
        `--${boundary}`,
        'Content-Type: text/plain; charset="UTF-8"',
        'Content-Transfer-Encoding: 7bit',
        '',
        options.body,
        '',
      ];

      const attachmentParts = options.attachments.map(attachment => [
        `--${boundary}`,
        `Content-Type: ${attachment.mimeType}; name="${attachment.filename}"`,
        'Content-Transfer-Encoding: base64',
        `Content-Disposition: attachment; filename="${attachment.filename}"`,
        '',
        attachment.contentBase64,
        '',
      ].join('\n'));

      const closing = `--${boundary}--`;
      const message = [...multipartHeaders, ...attachmentParts, closing].join('\n');
      return this.toBase64Url(message);
    }

    const plainHeaders = [
      ...headers,
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: 7bit',
      '',
    ];
    const message = `${plainHeaders.join('\n')}${options.body}`;
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
