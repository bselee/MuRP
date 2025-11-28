import { getGoogleAuthService } from './googleAuthService';

export interface CreateDocumentOptions {
  title: string;
  body: string;
}

export interface CreatedDocument {
  documentId: string;
  documentUrl: string;
}

export interface GoogleDoc {
  id: string;
  name: string;
  modifiedTime: string;
}

export interface UpdateDocumentOptions {
  title?: string;
  content?: string;
}

export class GoogleDocsService {
  private _authService: ReturnType<typeof getGoogleAuthService> | null = null;

  private get authService() {
    if (!this._authService) {
      this._authService = getGoogleAuthService();
    }
    return this._authService;
  }

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

  async listDocuments(): Promise<GoogleDoc[]> {
    const accessToken = await this.authService.getAccessToken();

    const response = await fetch(
      'https://www.googleapis.com/drive/v3/files?' +
      new URLSearchParams({
        q: "mimeType='application/vnd.google-apps.document'",
        orderBy: 'modifiedTime desc',
        pageSize: '20',
        fields: 'files(id,name,modifiedTime)',
      }),
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to list Google Docs (${response.status}): ${text}`);
    }

    const data = await response.json();
    return data.files || [];
  }

  async getDocumentContent(documentId: string): Promise<string> {
    const accessToken = await this.authService.getAccessToken();

    const response = await fetch(`https://docs.googleapis.com/v1/documents/${documentId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to get Google Doc content (${response.status}): ${text}`);
    }

    const data = await response.json();

    // Extract text content from Google Docs JSON
    let content = '';
    if (data.body && data.body.content) {
      for (const element of data.body.content) {
        if (element.paragraph) {
          for (const element of element.paragraph.elements) {
            if (element.textRun && element.textRun.content) {
              content += element.textRun.content;
            }
          }
          content += '\n';
        }
      }
    }

    return content.trim();
  }

  async updateDocument(documentId: string, options: UpdateDocumentOptions): Promise<void> {
    const accessToken = await this.authService.getAccessToken();

    const requests: any[] = [];

    // Update title if provided
    if (options.title) {
      requests.push({
        updateDocumentStyle: {
          documentStyle: {
            title: options.title,
          },
          fields: 'title',
        },
      });
    }

    // Replace content if provided
    if (options.content) {
      // First, delete existing content
      requests.push({
        deleteContentRange: {
          range: {
            startIndex: 1,
            endIndex: 999999, // Delete everything after the title
          },
        },
      });

      // Then insert new content
      requests.push({
        insertText: {
          location: { index: 1 },
          text: options.content,
        },
      });
    }

    if (requests.length === 0) return;

    const response = await fetch(`https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requests }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to update Google Doc (${response.status}): ${text}`);
    }
  }
}

export function getGoogleDocsService(): GoogleDocsService {
  if (!docsService) {
    docsService = new GoogleDocsService();
  }
  return docsService;
}
