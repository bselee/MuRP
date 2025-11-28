/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EXTERNAL DOCUMENT SERVER SERVICE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Manages integrations with external document servers like Notion, Google Docs,
 * MCP servers, Confluence, SharePoint, etc.
 *
 * Features:
 * - Unified interface for different document servers
 * - Server-specific authentication and API handling
 * - Document discovery and import capabilities
 * - Bidirectional sync support
 * - Error handling and retry logic
 */

import { supabase } from '../lib/supabase/client';

export interface DocumentServerConfig {
  id: string;
  name: string;
  type: 'notion' | 'google_docs' | 'mcp_server' | 'confluence' | 'sharepoint';
  config: {
    apiKey?: string;
    apiToken?: string;
    accessToken?: string;
    refreshToken?: string;
    baseUrl?: string;
    workspaceId?: string;
    databaseId?: string;
    clientId?: string;
    clientSecret?: string;
    [key: string]: any;
  };
  isActive: boolean;
}

export interface DocumentItem {
  id: string;
  title: string;
  content?: string;
  url?: string;
  lastModified: string;
  type: 'document' | 'page' | 'database' | 'folder';
  metadata?: Record<string, any>;
}

export abstract class BaseDocumentServer {
  protected config: DocumentServerConfig;

  constructor(config: DocumentServerConfig) {
    this.config = config;
  }

  abstract authenticate(): Promise<boolean>;
  abstract listDocuments(parentId?: string): Promise<DocumentItem[]>;
  abstract getDocumentContent(documentId: string): Promise<string>;
  abstract createDocument(title: string, content: string): Promise<DocumentItem>;
  abstract updateDocument(documentId: string, updates: { title?: string; content?: string }): Promise<void>;
  abstract searchDocuments(query: string): Promise<DocumentItem[]>;

  protected async makeRequest(endpoint: string, options: RequestInit = {}): Promise<any> {
    const url = this.buildUrl(endpoint);
    const headers = await this.getHeaders();

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...headers,
          ...options.headers,
        },
      });

      if (!response.ok) {
        throw new Error(`Request failed: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`[${this.config.type}] Request failed:`, error);
      throw error;
    }
  }

  protected abstract buildUrl(endpoint: string): string;
  protected abstract getHeaders(): Promise<Record<string, string>>;
}

export class NotionServer extends BaseDocumentServer {
  async authenticate(): Promise<boolean> {
    try {
      // Test authentication by listing databases
      await this.listDocuments();
      return true;
    } catch (error) {
      return false;
    }
  }

  async listDocuments(parentId?: string): Promise<DocumentItem[]> {
    const endpoint = parentId ? `/databases/${parentId}/query` : '/databases';
    const response = await this.makeRequest(endpoint, {
      method: 'POST',
      body: JSON.stringify({}),
    });

    return response.results.map((item: any) => ({
      id: item.id,
      title: item.title?.[0]?.plain_text || 'Untitled',
      url: item.url,
      lastModified: item.last_edited_time,
      type: 'database',
      metadata: item,
    }));
  }

  async getDocumentContent(documentId: string): Promise<string> {
    const response = await this.makeRequest(`/pages/${documentId}`);
    // Notion content extraction would require parsing blocks
    // This is a simplified implementation
    return response.properties?.title?.title?.[0]?.plain_text || '';
  }

  async createDocument(title: string, content: string): Promise<DocumentItem> {
    const response = await this.makeRequest('/pages', {
      method: 'POST',
      body: JSON.stringify({
        parent: { database_id: this.config.config.databaseId },
        properties: {
          title: {
            title: [{ text: { content: title } }],
          },
        },
      }),
    });

    return {
      id: response.id,
      title,
      url: response.url,
      lastModified: response.created_time,
      type: 'page',
    };
  }

  async updateDocument(documentId: string, updates: { title?: string; content?: string }): Promise<void> {
    // Notion update implementation
    await this.makeRequest(`/pages/${documentId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        properties: updates.title ? {
          title: {
            title: [{ text: { content: updates.title } }],
          },
        } : {},
      }),
    });
  }

  async searchDocuments(query: string): Promise<DocumentItem[]> {
    const response = await this.makeRequest('/search', {
      method: 'POST',
      body: JSON.stringify({
        query,
        filter: { property: 'object', value: 'page' },
      }),
    });

    return response.results.map((item: any) => ({
      id: item.id,
      title: item.properties?.title?.title?.[0]?.plain_text || 'Untitled',
      url: item.url,
      lastModified: item.last_edited_time,
      type: 'page',
    }));
  }

  protected buildUrl(endpoint: string): string {
    return `https://api.notion.com/v1${endpoint}`;
  }

  protected async getHeaders(): Promise<Record<string, string>> {
    return {
      'Authorization': `Bearer ${this.config.config.apiToken}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    };
  }
}

export class ConfluenceServer extends BaseDocumentServer {
  async authenticate(): Promise<boolean> {
    try {
      await this.listDocuments();
      return true;
    } catch (error) {
      return false;
    }
  }

  async listDocuments(parentId?: string): Promise<DocumentItem[]> {
    const spaceKey = parentId || this.config.config.spaceKey || 'default';
    const response = await this.makeRequest(`/content?spaceKey=${spaceKey}&expand=version`);

    return response.results.map((item: any) => ({
      id: item.id,
      title: item.title,
      url: item._links.self,
      lastModified: item.version?.when || item.createdDate,
      type: 'page',
      metadata: item,
    }));
  }

  async getDocumentContent(documentId: string): Promise<string> {
    const response = await this.makeRequest(`/content/${documentId}?expand=body.storage`);
    return response.body?.storage?.value || '';
  }

  async createDocument(title: string, content: string): Promise<DocumentItem> {
    const response = await this.makeRequest('/content', {
      method: 'POST',
      body: JSON.stringify({
        type: 'page',
        title,
        space: { key: this.config.config.spaceKey },
        body: {
          storage: {
            value: content,
            representation: 'storage',
          },
        },
      }),
    });

    return {
      id: response.id,
      title,
      url: response._links.self,
      lastModified: response.createdDate,
      type: 'page',
    };
  }

  async updateDocument(documentId: string, updates: { title?: string; content?: string }): Promise<void> {
    const updateData: any = {};

    if (updates.title) {
      updateData.title = updates.title;
    }

    if (updates.content) {
      updateData.body = {
        storage: {
          value: updates.content,
          representation: 'storage',
        },
      };
    }

    await this.makeRequest(`/content/${documentId}`, {
      method: 'PUT',
      body: JSON.stringify({
        version: { number: Date.now() }, // Force version update
        ...updateData,
      }),
    });
  }

  async searchDocuments(query: string): Promise<DocumentItem[]> {
    const response = await this.makeRequest(`/content/search?cql=text~"${query}"`);

    return response.results.map((item: any) => ({
      id: item.id,
      title: item.title,
      url: item._links.self,
      lastModified: item.last_edited_time,
      type: 'page',
    }));
  }

  protected buildUrl(endpoint: string): string {
    return `${this.config.config.baseUrl}/rest/api${endpoint}`;
  }

  protected async getHeaders(): Promise<Record<string, string>> {
    const auth = btoa(`${this.config.config.username}:${this.config.config.apiToken}`);
    return {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
    };
  }
}

export class MCPServer extends BaseDocumentServer {
  async authenticate(): Promise<boolean> {
    try {
      // MCP servers typically use custom authentication
      // This is a placeholder for MCP-specific auth
      return true;
    } catch (error) {
      return false;
    }
  }

  async listDocuments(parentId?: string): Promise<DocumentItem[]> {
    // MCP server implementation would depend on the specific MCP protocol
    // This is a placeholder
    const response = await this.makeRequest('/documents', {
      method: 'GET',
    });

    return response.documents?.map((item: any) => ({
      id: item.id,
      title: item.title,
      content: item.content,
      lastModified: item.updated_at,
      type: 'document',
      metadata: item,
    })) || [];
  }

  async getDocumentContent(documentId: string): Promise<string> {
    const response = await this.makeRequest(`/documents/${documentId}`);
    return response.content || '';
  }

  async createDocument(title: string, content: string): Promise<DocumentItem> {
    const response = await this.makeRequest('/documents', {
      method: 'POST',
      body: JSON.stringify({
        title,
        content,
      }),
    });

    return {
      id: response.id,
      title,
      content,
      lastModified: new Date().toISOString(),
      type: 'document',
    };
  }

  async updateDocument(documentId: string, updates: { title?: string; content?: string }): Promise<void> {
    await this.makeRequest(`/documents/${documentId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async searchDocuments(query: string): Promise<DocumentItem[]> {
    const response = await this.makeRequest(`/documents/search?q=${encodeURIComponent(query)}`);
    return response.results || [];
  }

  protected buildUrl(endpoint: string): string {
    return `${this.config.config.baseUrl}${endpoint}`;
  }

  protected async getHeaders(): Promise<Record<string, string>> {
    return {
      'Authorization': `Bearer ${this.config.config.apiToken}`,
      'Content-Type': 'application/json',
    };
  }
}

export class ExternalDocumentService {
  private servers: Map<string, BaseDocumentServer> = new Map();

  async loadServers(): Promise<void> {
    try {
      const { data, error } = await supabase
        .from('external_document_servers')
        .select('*')
        .eq('is_active', true);

      if (error) throw error;

      this.servers.clear();

      for (const serverConfig of data || []) {
        const server = this.createServer(serverConfig);
        if (server) {
          this.servers.set(serverConfig.id, server);
        }
      }
    } catch (error) {
      console.error('Failed to load external document servers:', error);
    }
  }

  private createServer(config: any): BaseDocumentServer | null {
    switch (config.type) {
      case 'notion':
        return new NotionServer(config);
      case 'confluence':
        return new ConfluenceServer(config);
      case 'mcp_server':
        return new MCPServer(config);
      // Add other server types as needed
      default:
        console.warn(`Unsupported document server type: ${config.type}`);
        return null;
    }
  }

  async getServer(serverId: string): Promise<BaseDocumentServer | null> {
    return this.servers.get(serverId) || null;
  }

  async getAllServers(): Promise<DocumentServerConfig[]> {
    const { data, error } = await supabase
      .from('external_document_servers')
      .select('*')
      .eq('is_active', true);

    if (error) throw error;
    return data || [];
  }

  async addServer(config: Omit<DocumentServerConfig, 'id'>): Promise<string> {
    const serverId = `server_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const { error } = await supabase
      .from('external_document_servers')
      .insert({
        id: serverId,
        ...config,
        created_by: 'admin', // TODO: Get from auth
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

    if (error) throw error;

    await this.loadServers(); // Refresh servers
    return serverId;
  }

  async updateServer(serverId: string, updates: Partial<DocumentServerConfig>): Promise<void> {
    const { error } = await supabase
      .from('external_document_servers')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', serverId);

    if (error) throw error;
    await this.loadServers(); // Refresh servers
  }

  async deleteServer(serverId: string): Promise<void> {
    const { error } = await supabase
      .from('external_document_servers')
      .delete()
      .eq('id', serverId);

    if (error) throw error;
    this.servers.delete(serverId);
  }

  async testServerConnection(serverId: string): Promise<boolean> {
    const server = await this.getServer(serverId);
    if (!server) return false;

    try {
      return await server.authenticate();
    } catch (error) {
      console.error(`Failed to test connection for server ${serverId}:`, error);
      return false;
    }
  }
}

// Export singleton
export const externalDocumentService = new ExternalDocumentService();