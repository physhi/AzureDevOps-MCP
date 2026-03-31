/**
 * Interface for getting a work item by ID
 */
export interface WorkItemByIdParams {
  id: number;
  fullDescription?: boolean;
}

/**
 * Interface for recently updated work items
 */
export interface RecentWorkItemsParams {
  top?: number;
  skip?: number;
  days?: number;
  fields?: string[];
}

/**
 * Interface for work items assigned to current user
 */
export interface MyWorkItemsParams {
  state?: string;
  top?: number;
  days?: number;
  fields?: string[];
}

/**
 * Interface for creating a work item
 */
export interface CreateWorkItemParams {
  workItemType: string;
  title: string;
  description?: string;
  assignedTo?: string;
  state?: string;
  areaPath?: string;
  iterationPath?: string;
  additionalFields?: Record<string, any>;
}

/**
 * Interface for updating a work item
 */
export interface UpdateWorkItemParams {
  id: number;
  fields: Record<string, any>;
}

/**
 * Interface for getting comments on a work item
 */
export interface GetWorkItemCommentsParams {
  id: number;
  top?: number;
  order?: 'asc' | 'desc';
  includeDeleted?: boolean;
}

/**
 * Interface for adding a comment to a work item
 */
export interface AddWorkItemCommentParams {
  id: number;
  text: string;
  format?: 'markdown' | 'html';
}

/**
 * Interface for managing (add or update) a work item comment
 */
export interface ManageWorkItemCommentParams {
  action: 'add' | 'update';
  id: number;
  text: string;
  format?: 'markdown' | 'html';
  commentId?: number; // required for 'update'
}

/**
 * Interface for updating a work item state
 */
export interface UpdateWorkItemStateParams {
  id: number;
  state: string;
  comment?: string;
}

/**
 * Interface for assigning a work item
 */
export interface AssignWorkItemParams {
  id: number;
  assignedTo: string;
}

/**
 * Interface for creating a link between a work item and another work item or artifact.
 * targetId supports prefixes: WI#123, PR#456, BUILD#789, BRANCH#main, COMMIT#abc123, or plain number.
 */
export interface CreateLinkParams {
  sourceId: number;
  targetId: string;
  linkType: string;
  comment?: string;
  repository?: string;
}

/**
 * Parsed target identifier from prefix notation
 */
export type ArtifactTargetType = 'workitem' | 'pr' | 'build' | 'branch' | 'commit';

export interface ParsedTarget {
  type: ArtifactTargetType;
  id: string;
  displayName: string;
}

/**
 * Internal params for WorkItemService.createLink with pre-resolved IDs
 */
export interface CreateLinkServiceParams {
  sourceId: number;
  linkType: string;
  comment?: string;
  // For work item links
  targetWorkItemId?: number;
  // For artifact links
  artifactUri?: string;
  artifactName?: string;
}

/**
 * Interface for bulk operations on work items
 */
export interface BulkWorkItemParams {
  workItems: Array<CreateWorkItemParams | UpdateWorkItemParams>;
}

/**
 * Interface for getting multiple work items by IDs
 */
export interface GetWorkItemsBatchParams {
  ids: number[];
  fields?: string[];
}

/**
 * Interface for getting work item revisions
 */
export interface GetWorkItemRevisionsParams {
  id: number;
  top?: number;
  skip?: number;
}

/**
 * Interface for listing work items via raw WIQL
 */
export interface ListWorkItemsParams {
  query: string;
  top?: number;
  days?: number;
  fields?: string[];
}

/**
 * Interface for executing a saved WIQL query by ID
 */
export interface GetQueryResultsParams {
  queryId: string;
  fields?: string[];
}

/**
 * Interface for creating a child work item under a parent
 */
export interface AddChildWorkItemParams {
  parentId: number;
  workItemType: string;
  title: string;
  description?: string;
  assignedTo?: string;
  state?: string;
  areaPath?: string;
  iterationPath?: string;
  additionalFields?: Record<string, any>;
}

/**
 * Interface for unlinking a work item relation
 */
export interface UnlinkWorkItemParams {
  id: number;
  relationIndex: number;
}