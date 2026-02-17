/**
 * Interface for getting a work item by ID
 */
export interface WorkItemByIdParams {
  id: number;
}

/**
 * Interface for searching work items
 */
export interface SearchWorkItemsParams {
  searchText: string;
  top?: number;
}

/**
 * Interface for recently updated work items
 */
export interface RecentWorkItemsParams {
  top?: number;
  skip?: number;
}

/**
 * Interface for work items assigned to current user
 */
export interface MyWorkItemsParams {
  state?: string;
  top?: number;
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
 * Interface for adding a comment to a work item
 */
export interface AddWorkItemCommentParams {
  id: number;
  text: string;
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