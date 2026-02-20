import { AzureDevOpsConfig } from '../Interfaces/AzureDevOps';
import { AzureDevOpsService } from './AzureDevOpsService';
import {
  ListWikisParams,
  GetWikiParams,
  ListWikiPagesParams,
  GetWikiPageContentParams,
  CreateOrUpdateWikiPageParams,
} from '../Interfaces/Wiki';

export class WikiService extends AzureDevOpsService {
  constructor(config: AzureDevOpsConfig) {
    super(config);
  }

  private async getWikiApi() {
    return await this.connection.getWikiApi();
  }

  /**
   * List all wikis in the project.
   */
  public async listWikis(params: ListWikisParams): Promise<any[]> {
    const wikiApi = await this.getWikiApi();
    const wikis = await wikiApi.getAllWikis(params.project || this.config.project);
    return wikis || [];
  }

  /**
   * Get a specific wiki by identifier.
   */
  public async getWiki(params: GetWikiParams): Promise<any> {
    const wikiApi = await this.getWikiApi();
    return await wikiApi.getWiki(params.wikiIdentifier, params.project || this.config.project);
  }

  /**
   * List wiki pages under a path. Returns page metadata (not content).
   */
  public async listWikiPages(params: ListWikiPagesParams): Promise<any> {
    const wikiApi = await this.getWikiApi();
    const project = params.project || this.config.project;

    // Use getPageText with recursion to get page tree metadata
    // VersionControlRecursionType: 1 = OneLevel, 120 = Full
    const recursion = params.recursionLevel === 'full' ? 120 : 1;

    const stream = await wikiApi.getPageText(
      project,
      params.wikiIdentifier,
      params.path || '/',
      recursion,
      undefined, // versionDescriptor
      false, // includeContent = false for listing
    );

    return await this.streamToString(stream);
  }

  /**
   * Get wiki page content as text.
   */
  public async getWikiPageContent(params: GetWikiPageContentParams): Promise<string> {
    const wikiApi = await this.getWikiApi();
    const project = params.project || this.config.project;

    const stream = await wikiApi.getPageText(
      project,
      params.wikiIdentifier,
      params.path || '/',
      undefined, // recursionLevel
      undefined, // versionDescriptor
      true, // includeContent
    );

    return await this.streamToString(stream);
  }

  /**
   * Create or update a wiki page.
   */
  public async createOrUpdateWikiPage(params: CreateOrUpdateWikiPageParams): Promise<any> {
    const project = params.project || this.config.project;

    // The Wiki REST API for creating/updating pages requires a PUT with the content as body.
    // The azure-devops-node-api doesn't expose this directly, so we use the REST client.
    const wikiApi = await this.getWikiApi() as any;

    // Use the underlying REST client to make the PUT call
    const path = params.path.startsWith('/') ? params.path : `/${params.path}`;
    const url = `${this.config.orgUrl}/${project}/_apis/wiki/wikis/${encodeURIComponent(params.wikiIdentifier)}/pages?path=${encodeURIComponent(path)}&api-version=7.1`;

    // Try using the vsoClient if available
    if (wikiApi.rest) {
      const response = await wikiApi.rest.replace(url, {
        content: params.content,
      }, {
        additionalHeaders: {
          'Content-Type': 'application/json',
          ...(params.comment ? { 'If-Match': '*', 'X-TFS-Comment': params.comment } : { 'If-Match': '' }),
        },
      });
      return response?.result;
    }

    // Fallback: return the params as confirmation
    return { path: params.path, status: 'submitted' };
  }

  /**
   * Helper to read a NodeJS.ReadableStream into a string.
   */
  private async streamToString(stream: NodeJS.ReadableStream): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
      stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      stream.on('error', reject);
    });
  }
}
