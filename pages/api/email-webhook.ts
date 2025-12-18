/**
 * Email Webhook API Endpoint
 *
 * Receives incoming emails from email providers (SendGrid, Mailgun, Gmail, etc.)
 * and processes them through the Email Intelligence Agent
 */

import { NextApiRequest, NextApiResponse } from 'next';
import { processIncomingEmail } from '../../services/emailIntelligenceAgent';

interface WebhookEmailPayload {
  messageId: string;
  threadId: string;
  from: {
    email: string;
    name?: string;
  };
  to: Array<{ email: string; name?: string }>;
  cc?: Array<{ email: string; name?: string }>;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  receivedAt: string;
  attachments?: Array<{
    filename: string;
    contentType: string;
    size: number;
    content?: string; // Base64 encoded
  }>;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only accept POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Verify webhook signature (if using SendGrid/Mailgun)
    // const isValid = verifyWebhookSignature(req);
    // if (!isValid) {
    //   return res.status(401).json({ error: 'Invalid webhook signature' });
    // }

    // Parse the incoming email based on provider
    const provider = req.headers['x-email-provider'] || 'generic';
    let emailData: WebhookEmailPayload;

    switch (provider) {
      case 'sendgrid':
        emailData = parseSendGridWebhook(req.body);
        break;
      case 'mailgun':
        emailData = parseMailgunWebhook(req.body);
        break;
      case 'gmail':
        emailData = parseGmailWebhook(req.body);
        break;
      default:
        emailData = parseGenericWebhook(req.body);
    }

    // Process the email through the agent
    const result = await processIncomingEmail({
      messageId: emailData.messageId,
      threadId: emailData.threadId,
      from: emailData.from,
      to: emailData.to,
      cc: emailData.cc,
      subject: emailData.subject,
      bodyText: emailData.bodyText,
      bodyHtml: emailData.bodyHtml,
      receivedAt: new Date(emailData.receivedAt),
      attachments: emailData.attachments,
    });

    if (result.success) {
      return res.status(200).json({
        success: true,
        emailId: result.emailId,
        message: 'Email processed successfully',
      });
    } else {
      return res.status(500).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    console.error('Error in email webhook:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * Parse SendGrid webhook format
 */
function parseSendGridWebhook(body: any): WebhookEmailPayload {
  // SendGrid sends an array of events
  const email = Array.isArray(body) ? body[0] : body;

  return {
    messageId: email.sg_message_id || email.message_id,
    threadId: email.thread_id || email.sg_message_id,
    from: {
      email: email.from,
      name: email.from_name,
    },
    to: parseEmailList(email.to),
    cc: parseEmailList(email.cc),
    subject: email.subject,
    bodyText: email.text || email.body,
    bodyHtml: email.html,
    receivedAt: email.timestamp || new Date().toISOString(),
    attachments: parseAttachments(email.attachments),
  };
}

/**
 * Parse Mailgun webhook format
 */
function parseMailgunWebhook(body: any): WebhookEmailPayload {
  return {
    messageId: body['Message-Id'] || body.messageId,
    threadId: body['In-Reply-To'] || body['Message-Id'],
    from: {
      email: body.sender || body.from,
      name: body['from-name'],
    },
    to: parseEmailList(body.recipient || body.to),
    cc: parseEmailList(body.cc),
    subject: body.subject,
    bodyText: body['body-plain'] || body.text,
    bodyHtml: body['body-html'] || body.html,
    receivedAt: body.timestamp || new Date().toISOString(),
    attachments: parseMailgunAttachments(body),
  };
}

/**
 * Parse Gmail API webhook format
 */
function parseGmailWebhook(body: any): WebhookEmailPayload {
  const message = body.message || body;

  return {
    messageId: message.id,
    threadId: message.threadId,
    from: {
      email: extractEmail(message.from),
      name: extractName(message.from),
    },
    to: parseEmailList(message.to),
    cc: parseEmailList(message.cc),
    subject: message.subject,
    bodyText: message.snippet || message.body?.text,
    bodyHtml: message.body?.html,
    receivedAt: new Date(parseInt(message.internalDate)).toISOString(),
    attachments: message.attachments,
  };
}

/**
 * Parse generic webhook format
 */
function parseGenericWebhook(body: any): WebhookEmailPayload {
  return {
    messageId: body.messageId || body.id,
    threadId: body.threadId || body.messageId,
    from: {
      email: body.from?.email || body.from,
      name: body.from?.name,
    },
    to: Array.isArray(body.to) ? body.to : [{ email: body.to }],
    cc: body.cc,
    subject: body.subject,
    bodyText: body.bodyText || body.text || body.body,
    bodyHtml: body.bodyHtml || body.html,
    receivedAt: body.receivedAt || body.timestamp || new Date().toISOString(),
    attachments: body.attachments,
  };
}

/**
 * Helper: Parse email list
 */
function parseEmailList(
  emails: string | string[] | Array<{ email: string; name?: string }> | undefined
): Array<{ email: string; name?: string }> {
  if (!emails) return [];

  if (typeof emails === 'string') {
    return emails.split(',').map(e => ({
      email: extractEmail(e.trim()),
      name: extractName(e.trim()),
    }));
  }

  if (Array.isArray(emails)) {
    return emails.map(e => {
      if (typeof e === 'string') {
        return { email: extractEmail(e), name: extractName(e) };
      }
      return e;
    });
  }

  return [];
}

/**
 * Helper: Extract email from "Name <email@domain.com>" format
 */
function extractEmail(str: string): string {
  const match = str.match(/<(.+?)>/);
  return match ? match[1] : str;
}

/**
 * Helper: Extract name from "Name <email@domain.com>" format
 */
function extractName(str: string): string | undefined {
  const match = str.match(/^(.+?)\s*</);
  return match ? match[1].trim() : undefined;
}

/**
 * Helper: Parse attachments
 */
function parseAttachments(
  attachments: any
): Array<{ filename: string; contentType: string; size: number; content?: string }> {
  if (!attachments) return [];
  if (!Array.isArray(attachments)) return [];

  return attachments.map(att => ({
    filename: att.filename || att.name,
    contentType: att.contentType || att.type || att['content-type'],
    size: att.size || att.length || 0,
    content: att.content || att.data,
  }));
}

/**
 * Helper: Parse Mailgun attachments (multipart form data)
 */
function parseMailgunAttachments(body: any): any[] {
  const attachments = [];
  let i = 1;

  while (body[`attachment-${i}`]) {
    attachments.push({
      filename: body[`attachment-${i}`].filename,
      contentType: body[`attachment-${i}`].contentType,
      size: body[`attachment-${i}`].size,
      content: body[`attachment-${i}`].content,
    });
    i++;
  }

  return attachments;
}

/**
 * Verify webhook signature (example for SendGrid)
 */
function verifyWebhookSignature(req: NextApiRequest): boolean {
  // TODO: Implement signature verification based on your email provider
  // SendGrid example:
  // const signature = req.headers['x-twilio-email-event-webhook-signature'];
  // const timestamp = req.headers['x-twilio-email-event-webhook-timestamp'];
  // const publicKey = process.env.SENDGRID_WEBHOOK_PUBLIC_KEY;
  // return verifySendGridSignature(signature, timestamp, req.body, publicKey);

  // For now, return true (disable in production)
  return true;
}
