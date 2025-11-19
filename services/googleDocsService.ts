import { getGoogleAuthService } from './googleAuthService';

export interface CreateDocumentOptions {
  title: string;
  body: string;
}

export interface CreatedDocument {
  documentId: string;
  documentUrl: string;
}

export class GoogleDocsService {
  private authService = getGoogleAuthService();

  async createDocument(options: CreateDocumentOptions): Promise<CreatedDocument> {
    const accessToken = await this.authService.getAccessToken();

    const createResponse = await fetch('https://docs.googleapis.com/v1/documents', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title: options.title }),
    });

    if (!createResponse.ok) {
      const text = await createResponse.text();
      throw new Error(`Failed to create Google Doc (${createResponse.status}): ${text}`);
    }

    const created = await createResponse.json();
    const documentId = created.documentId as string;

    if (!documentId) {
      throw new Error('Failed to create Google Doc (missing documentId)');
    }

    const updateResponse = await fetch(`https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: [
          {
            insertText: {
              location: { index: 1 },
              text: options.body,
            },
          },
        ],
      }),
    });

    if (!updateResponse.ok) {
      const text = await updateResponse.text();
      throw new Error(`Failed to populate Google Doc (${updateResponse.status}): ${text}`);
    }

    return {
      documentId,
      documentUrl: `https://docs.google.com/document/d/${documentId}/edit`,
    };
  }
}

let docsService: GoogleDocsService | null = null;

export function getGoogleDocsService(): GoogleDocsService {
  if (!docsService) {
    docsService = new GoogleDocsService();
  }
  return docsService;
}
