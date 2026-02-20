/**
 * Parameters for listing wikis
 */
export interface ListWikisParams {
  project?: string;
}

/**
 * Parameters for getting a specific wiki
 */
export interface GetWikiParams {
  wikiIdentifier: string;
  project?: string;
}

/**
 * Parameters for listing wiki pages
 */
export interface ListWikiPagesParams {
  wikiIdentifier: string;
  path?: string;
  recursionLevel?: string;
  project?: string;
}

/**
 * Parameters for getting wiki page content
 */
export interface GetWikiPageContentParams {
  wikiIdentifier: string;
  path?: string;
  project?: string;
}

/**
 * Parameters for creating or updating a wiki page
 */
export interface CreateOrUpdateWikiPageParams {
  wikiIdentifier: string;
  path: string;
  content: string;
  comment?: string;
  project?: string;
}
