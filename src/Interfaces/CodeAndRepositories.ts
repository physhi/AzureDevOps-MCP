/**
 * Interface for listing repositories
 */
export interface ListRepositoriesParams {
  projectId?: string;
  includeHidden?: boolean;
  includeAllUrls?: boolean;
}

/**
 * Interface for getting repository details
 */
export interface GetRepositoryParams {
  projectId: string;
  repository: string;
}

/**
 * Interface for creating repository
 */
export interface CreateRepositoryParams {
  name: string;
  projectId: string;
}

/**
 * Interface for listing branches
 */
export interface ListBranchesParams {
  repository: string;
  filter?: string;
  top?: number;
}

/**
 * Interface for searching code
 */
export interface SearchCodeParams {
  searchText: string;
  projectId?: string;
  repository?: string;
  fileExtension?: string;
  top?: number;
}

/**
 * Interface for browsing repository
 */
export interface BrowseRepositoryParams {
  repository: string;
  path?: string;
  versionDescriptor?: {
    version?: string;
    versionOptions?: string;
    versionType?: string;
  };
}

/**
 * Interface for getting file content
 */
export interface GetFileContentParams {
  repository: string;
  path: string;
  versionDescriptor?: {
    version?: string;
    versionOptions?: string;
    versionType?: string;
  };
}

/**
 * Interface for getting commit history
 */
export interface GetCommitHistoryParams {
  repository: string;
  itemPath?: string;
  top?: number;
  skip?: number;
  projectId?: string;
}

/**
 * Interface for listing pull requests
 */
export interface ListPullRequestsParams {
  repository: string;
  status?: 'abandoned' | 'active' | 'all' | 'completed' | 'notSet';
  creatorId?: string;
  reviewerId?: string;
  top?: number;
  skip?: number;
}

/**
 * Interface for creating pull request
 */
export interface CreatePullRequestParams {
  repository: string;
  sourceRefName: string;
  targetRefName: string;
  title: string;
  description?: string;
  reviewers?: string[];
}

/**
 * Interface for getting pull request by ID
 */
export interface GetPullRequestParams {
  repository: string;
  pullRequestId: number;
}

/**
 * Interface for getting pull request comments
 */
export interface GetPullRequestCommentsParams {
  repository: string;
  pullRequestId: number;
  threadId?: number;
  top?: number;
  skip?: number;
}

/**
 * Interface for approving pull request
 */
export interface ApprovePullRequestParams {
  repository: string;
  pullRequestId: number;
}

/**
 * Interface for merging pull request
 */
export interface MergePullRequestParams {
  repository: string;
  pullRequestId: number;
  mergeStrategy?: 'noFastForward' | 'rebase' | 'rebaseMerge' | 'squash';
  comment?: string;
}

/**
 * Interface for getting commits
 */
export interface GetCommitsParams {
  repository: string;
  path?: string;
  version?: string;
  versionType?: string;
  projectId?: string;
}

/**
 * Interface for getting pull requests
 */
export interface GetPullRequestsParams {
  repository: string;
  status?: 'abandoned' | 'active' | 'all' | 'completed' | 'notSet';
  creatorId?: string;
  reviewerId?: string;
  sourceRefName?: string;
  targetRefName?: string;
  projectId?: string;
  skip?: number;
  top?: number;
}

/**
 * Interface for completing pull request
 */
export interface CompletePullRequestParams {
  repository: string;
  pullRequestId: number;
  status: 'completed';
  mergeStrategy: 'noFastForward' | 'rebase' | 'rebaseMerge' | 'squash';
  deleteSourceBranch?: boolean;
  comment?: string;
  projectId?: string;
}

/**
 * Interface for adding inline comment to pull request
 */
export interface AddPullRequestInlineCommentParams {
  repository: string;
  pullRequestId: number;
  comment: string;
  position: {
    line: number;
    offset: number;
  };
  path: string;
}

/**
 * Interface for adding file comment to pull request
 */
export interface AddPullRequestFileCommentParams {
  repository: string;
  pullRequestId: number;
  path: string;
  comment: string;
}

/**
 * Interface for adding general comment to pull request
 */
export interface AddPullRequestCommentParams {
  repository: string;
  pullRequestId: number;
  comment: string;
}

/**
 * Interface for getting pull request file changes
 */
export interface GetPullRequestFileChangesParams {
  repository: string;
  pullRequestId: number;
  path?: string;
}

/**
 * Interface for getting pull request changes count
 */
export interface GetPullRequestChangesCountParams {
  repository: string;
  pullRequestId: number;
}

/**
 * Interface for getting all pull request changes
 */
export interface GetAllPullRequestChangesParams {
  repository: string;
  pullRequestId: number;
  top?: number;
  skip?: number;
} 