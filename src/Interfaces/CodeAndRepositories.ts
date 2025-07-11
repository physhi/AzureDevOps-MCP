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
  repositoryId: string;
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
  repositoryId: string;
  filter?: string;
  top?: number;
}

/**
 * Interface for searching code
 */
export interface SearchCodeParams {
  searchText: string;
  projectId?: string;
  repositoryId?: string;
  fileExtension?: string;
  top?: number;
}

/**
 * Interface for browsing repository
 */
export interface BrowseRepositoryParams {
  repositoryId: string;
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
  repositoryId: string;
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
  repositoryId: string;
  itemPath?: string;
  top?: number;
  skip?: number;
  projectId?: string;
}

/**
 * Interface for listing pull requests
 */
export interface ListPullRequestsParams {
  repositoryId: string;
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
  repositoryId: string;
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
  repositoryId: string;
  pullRequestId: number;
}

/**
 * Interface for getting pull request comments
 */
export interface GetPullRequestCommentsParams {
  repositoryId: string;
  pullRequestId: number;
  threadId?: number;
  top?: number;
  skip?: number;
}

/**
 * Interface for approving pull request
 */
export interface ApprovePullRequestParams {
  repositoryId: string;
  pullRequestId: number;
}

/**
 * Interface for merging pull request
 */
export interface MergePullRequestParams {
  repositoryId: string;
  pullRequestId: number;
  mergeStrategy?: 'noFastForward' | 'rebase' | 'rebaseMerge' | 'squash';
  comment?: string;
}

/**
 * Interface for getting commits
 */
export interface GetCommitsParams {
  repositoryId: string;
  path?: string;
  version?: string;
  versionType?: string;
  projectId?: string;
}

/**
 * Interface for getting pull requests
 */
export interface GetPullRequestsParams {
  repositoryId: string;
  status?: 'abandoned' | 'active' | 'all' | 'completed' | 'notSet';
  creatorId?: string;
  reviewerId?: string;
  sourceRefName?: string;
  targetRefName?: string;
  projectId?: string;
}

/**
 * Interface for completing pull request
 */
export interface CompletePullRequestParams {
  repositoryId: string;
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
  repositoryId: string;
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
  repositoryId: string;
  pullRequestId: number;
  path: string;
  comment: string;
}

/**
 * Interface for adding general comment to pull request
 */
export interface AddPullRequestCommentParams {
  repositoryId: string;
  pullRequestId: number;
  comment: string;
}

/**
 * Interface for getting pull request file changes
 */
export interface GetPullRequestFileChangesParams {
  repositoryId: string;
  pullRequestId: number;
  path?: string;
}

/**
 * Interface for getting pull request changes count
 */
export interface GetPullRequestChangesCountParams {
  repositoryId: string;
  pullRequestId: number;
}

/**
 * Interface for getting all pull request changes
 */
export interface GetAllPullRequestChangesParams {
  repositoryId: string;
  pullRequestId: number;
  top?: number;
  skip?: number;
} 