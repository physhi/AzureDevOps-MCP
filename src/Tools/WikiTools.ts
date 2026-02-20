import { AzureDevOpsConfig } from '../Interfaces/AzureDevOps';
import { WikiService } from '../Services/WikiService';
import { formatMcpResponse, formatErrorResponse, McpResponse } from '../Interfaces/Common';
import {
  ListWikisParams,
  GetWikiParams,
  ListWikiPagesParams,
  GetWikiPageContentParams,
  CreateOrUpdateWikiPageParams,
} from '../Interfaces/Wiki';
import getClassMethods from '../utils/getClassMethods';
import { markdownTable, truncateText } from '../utils/formatHelpers';

export class WikiTools {
  private wikiService: WikiService;

  constructor(config: AzureDevOpsConfig) {
    this.wikiService = new WikiService(config);
  }

  /**
   * List all wikis in the project
   */
  public async listWikis(params: ListWikisParams): Promise<McpResponse> {
    try {
      const wikis = await this.wikiService.listWikis(params);

      if (wikis.length === 0) {
        return formatMcpResponse(wikis, `## Wikis\n\nNo wikis found in the project.`);
      }

      let md = `## Wikis\n\n**${wikis.length} wiki${wikis.length !== 1 ? 's' : ''}** found\n\n`;

      const rows = wikis.map((w: any) => [
        w.name || 'Unknown',
        w.id || '-',
        w.type === 0 ? 'Project Wiki' : w.type === 1 ? 'Code Wiki' : `${w.type ?? '-'}`,
        w.versions?.[0]?.version || '-',
      ]);

      md += markdownTable(['Name', 'ID', 'Type', 'Version'], rows);

      return formatMcpResponse(wikis, md, false, true);
    } catch (error) {
      return formatErrorResponse(error);
    }
  }

  /**
   * Get details about a specific wiki
   */
  public async getWiki(params: GetWikiParams): Promise<McpResponse> {
    try {
      const wiki = await this.wikiService.getWiki(params);

      let md = `## Wiki: ${wiki.name || 'Unknown'}\n\n`;
      md += `| Property | Value |\n|---|---|\n`;
      md += `| **ID** | ${wiki.id || '-'} |\n`;
      md += `| **Name** | ${wiki.name || '-'} |\n`;
      md += `| **Type** | ${wiki.type === 0 ? 'Project Wiki' : wiki.type === 1 ? 'Code Wiki' : `${wiki.type ?? '-'}`} |\n`;
      md += `| **URL** | ${wiki.url || '-'} |\n`;

      if (wiki.versions && wiki.versions.length > 0) {
        md += `| **Version** | ${wiki.versions[0].version || '-'} |\n`;
      }

      if (wiki.mappedPath) {
        md += `| **Mapped Path** | \`${wiki.mappedPath}\` |\n`;
      }

      return formatMcpResponse(wiki, md, false, true);
    } catch (error) {
      return formatErrorResponse(error);
    }
  }

  /**
   * List wiki pages under a path
   */
  public async listWikiPages(params: ListWikiPagesParams): Promise<McpResponse> {
    try {
      const content = await this.wikiService.listWikiPages(params);

      let md = `## Wiki Pages: ${params.wikiIdentifier}\n\n`;
      md += `**Path:** \`${params.path || '/'}\`\n\n`;

      // The content is typically JSON with page structure
      try {
        const parsed = JSON.parse(content);
        if (parsed.subPages && Array.isArray(parsed.subPages)) {
          md += `**${parsed.subPages.length} page(s)**\n\n`;
          const rows = parsed.subPages.map((p: any) => [
            p.path || '-',
            `${p.id || '-'}`,
            p.isNonConformant ? 'Non-conformant' : 'OK',
          ]);
          md += markdownTable(['Path', 'ID', 'Status'], rows);
        } else {
          md += `**Page:** ${parsed.path || '/'}\n`;
          if (parsed.id) md += `**ID:** ${parsed.id}\n`;
        }
      } catch {
        // If not JSON, show as-is
        md += content;
      }

      return formatMcpResponse({ content, path: params.path }, md, false, true);
    } catch (error) {
      return formatErrorResponse(error);
    }
  }

  /**
   * Get wiki page content
   */
  public async getWikiPageContent(params: GetWikiPageContentParams): Promise<McpResponse> {
    try {
      const content = await this.wikiService.getWikiPageContent(params);

      let md = `## Wiki Page: ${params.path || '/'}\n\n`;
      md += `**Wiki:** ${params.wikiIdentifier}\n\n`;
      md += `---\n\n`;
      md += content;

      return formatMcpResponse({ content, path: params.path, wikiIdentifier: params.wikiIdentifier }, md, false, true);
    } catch (error) {
      return formatErrorResponse(error);
    }
  }

  /**
   * Create or update a wiki page
   */
  public async createOrUpdateWikiPage(params: CreateOrUpdateWikiPageParams): Promise<McpResponse> {
    try {
      const result = await this.wikiService.createOrUpdateWikiPage(params);

      let md = `## Wiki Page Updated\n\n`;
      md += `| Property | Value |\n|---|---|\n`;
      md += `| **Wiki** | ${params.wikiIdentifier} |\n`;
      md += `| **Path** | \`${params.path}\` |\n`;
      md += `| **Content Length** | ${params.content.length} chars |\n`;
      if (params.comment) {
        md += `| **Comment** | ${params.comment} |\n`;
      }

      return formatMcpResponse(result, md, false, true);
    } catch (error) {
      return formatErrorResponse(error);
    }
  }
}

export const WikiToolMethods = getClassMethods(WikiTools);
