import * as azdev from 'azure-devops-node-api';
import { Readable } from 'stream';
import { GitApi } from 'azure-devops-node-api/GitApi';
import { VersionControlChangeType } from 'azure-devops-node-api/interfaces/GitInterfaces';
import { AzureDevOpsConfig } from '../Interfaces/AzureDevOps';
import { AzureDevOpsService } from './AzureDevOpsService';
import { isRepositoryId, isRepositoryName } from '../utils/repositoryResolver';
import {
  ListRepositoriesParams,
  GetRepositoryParams,
  CreateRepositoryParams,
  ListBranchesParams,
  SearchCodeParams,
  BrowseRepositoryParams,
  GetFileContentParams,
  GetCommitHistoryParams,
  CreatePullRequestParams,
  GetPullRequestParams,
  GetPullRequestCommentsParams,
  ApprovePullRequestParams,
  MergePullRequestParams,
  GetCommitsParams,
  GetPullRequestsParams,
  CompletePullRequestParams,
  AddPullRequestInlineCommentParams,
  AddPullRequestFileCommentParams,
  AddPullRequestCommentParams,
  GetPullRequestFileChangesParams,
  GetPullRequestChangesCountParams,
  GetAllPullRequestChangesParams
} from '../Interfaces/CodeAndRepositories';

export class GitService extends AzureDevOpsService {
  // Cache for repository name-to-ID mappings to improve performance
  private repositoryCache: Map<string, string> = new Map();

  constructor(config: AzureDevOpsConfig) {
    super(config);
  }

  /**
   * Get the Git API client
   */
  private async getGitApi(): Promise<GitApi> {
    return await this.connection.getGitApi();
  }

  /**
   * Resolve repository identifier (name or ID) to repository ID
   * Supports hybrid approach: if input is already a GUID, returns it; if name, resolves to ID
   * @param repository - Repository name or ID
   * @param projectId - Optional project ID for scoping (defaults to config project)
   * @returns Repository ID (GUID)
   */
  public async resolveRepositoryId(repository: string, projectId?: string): Promise<string> {
    // If it's already a GUID, return as-is
    if (isRepositoryId(repository)) {
      return repository;
    }

    // Check cache first for performance
    const cacheKey = `${projectId || this.config.project}:${repository}`;
    if (this.repositoryCache.has(cacheKey)) {
      return this.repositoryCache.get(cacheKey)!;
    }

    try {
      // Resolve repository name to ID by listing repositories
      const repositories = await this.listRepositories({ 
        projectId: projectId || this.config.project 
      });

      // Find repository by name (case-insensitive)
      const matchedRepo = repositories.find((repo: any) => 
        repo.name && repo.name.toLowerCase() === repository.toLowerCase()
      );

      if (!matchedRepo) {
        throw new Error(
          `Repository '${repository}' not found in project '${projectId || this.config.project}'. ` +
          `Available repositories: ${repositories.map((r: any) => r.name).join(', ')}`
        );
      }

      // Cache the result
      this.repositoryCache.set(cacheKey, matchedRepo.id);
      
      return matchedRepo.id;
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        throw error; // Re-throw our custom error
      }
      console.error(`Error resolving repository '${repository}':`, error);
      throw new Error(
        `Failed to resolve repository '${repository}'. ` +
        `Please verify the repository name exists and you have access to it.`
      );
    }
  }

  /**
   * List all repositories
   */
  public async listRepositories(params: ListRepositoriesParams): Promise<any> {
    try {
      const gitApi = await this.getGitApi();
      
      const repositories = await gitApi.getRepositories(
        params.projectId || this.config.project,
        params.includeHidden,
        params.includeAllUrls
      );
      
      return repositories;
    } catch (error) {
      console.error('Error listing repositories:', error);
      throw error;
    }
  }

  /**
   * Get repository details
   */
  public async getRepository(params: GetRepositoryParams): Promise<any> {
    try {
      const gitApi = await this.getGitApi();
      
      // Resolve repository name/ID to actual repository ID
      const repositoryId = await this.resolveRepositoryId(params.repository, params.projectId);
      
      const repository = await gitApi.getRepository(
        repositoryId,
        params.projectId || this.config.project
      );
      
      return repository;
    } catch (error) {
      console.error(`Error getting repository ${params.repository}:`, error);
      throw error;
    }
  }

  /**
   * Create a repository
   */
  public async createRepository(params: CreateRepositoryParams): Promise<any> {
    try {
      const gitApi = await this.getGitApi();
      
      const repository = await gitApi.createRepository({
        name: params.name,
        project: {
          id: params.projectId || this.config.project
        }
      }, params.projectId || this.config.project);
      
      return repository;
    } catch (error) {
      console.error(`Error creating repository ${params.name}:`, error);
      throw error;
    }
  }

  /**
   * List branches
   */
  public async listBranches(params: ListBranchesParams): Promise<any> {
    try {
      const gitApi = await this.getGitApi();
      
      // Resolve repository name/ID to actual repository ID
      const repositoryId = await this.resolveRepositoryId(params.repository);
      
      const branches = await gitApi.getBranches(
        repositoryId,
        params.filter
      );
      
      if (params.top && branches.length > params.top) {
        return branches.slice(0, params.top);
      }
      
      return branches;
    } catch (error) {
      console.error(`Error listing branches for repository ${params.repository}:`, error);
      throw error;
    }
  }

  /**
   * Search code (Note: This uses a simplified approach as the full-text search API
   * might require additional setup)
   */
  public async searchCode(params: SearchCodeParams): Promise<any> {
    try {
      const gitApi = await this.getGitApi();
      
      // Resolve repository name/ID to actual repository ID if provided
      const repositoryId = params.repository ? await this.resolveRepositoryId(params.repository) : "";
      
      // This is a simplified implementation using item search
      // For more comprehensive code search, you'd use the Search API
      const items = await gitApi.getItems(
        repositoryId || "",
        undefined,
        undefined,
        undefined,
        true,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined
      );
      
      // Simple filter based on the search text and file extension
      let filteredItems = items;
      
      if (params.searchText) {
        filteredItems = filteredItems.filter(item => 
          item.path && item.path.toLowerCase().includes(params.searchText.toLowerCase())
        );
      }
      
      if (params.fileExtension) {
        filteredItems = filteredItems.filter(item => 
          item.path && item.path.endsWith(params.fileExtension || "")
        );
      }
      
      // Limit results if top is specified
      if (params.top && filteredItems.length > params.top) {
        filteredItems = filteredItems.slice(0, params.top);
      }
      
      return filteredItems;
    } catch (error) {
      console.error(`Error searching code in repository ${params.repository}:`, error);
      throw error;
    }
  }

  /**
   * Browse repository
   */
  public async browseRepository(params: BrowseRepositoryParams): Promise<any> {
    try {
      const gitApi = await this.getGitApi();
      
      // Resolve repository name/ID to actual repository ID
      const repositoryId = await this.resolveRepositoryId(params.repository);
      
      const items = await gitApi.getItems(
        repositoryId,
        undefined,
        params.path,
        undefined,
        true,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined
      );
      
      return items;
    } catch (error) {
      console.error(`Error browsing repository ${params.repository}:`, error);
      throw error;
    }
  }

  /**
   * Get file content
   */
  public async getFileContent(params: GetFileContentParams): Promise<any> {
    try {
      const gitApi = await this.getGitApi();
      
      // Resolve repository name/ID to actual repository ID
      const repositoryId = await this.resolveRepositoryId(params.repository);
      
      // Get the file content as a stream
      const content = await gitApi.getItemContent(
        repositoryId,
        params.path,
        undefined,
        undefined
      );
      
      let fileContent = '';
      
      // Handle different content types
      if (Buffer.isBuffer(content)) {
        fileContent = content.toString('utf8');
      } else if (typeof content === 'string') {
        fileContent = content;
      } else if (content && typeof content === 'object' && 'pipe' in content && typeof content.pipe === 'function') {
        // Handle stream content
        const chunks: Buffer[] = [];
        const stream = content as Readable;
        
        return new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            stream.destroy();
            reject(new Error(`Stream timeout for ${params.path}`));
          }, 30000);

          stream.on('data', (chunk: Buffer) => {
            chunks.push(chunk);
          });
          
          stream.on('end', () => {
            clearTimeout(timeout);
            const buffer = Buffer.concat(chunks);
            const fileContent = buffer.toString('utf8');
            resolve({
              content: fileContent
            });
          });
          
          stream.on('error', (error) => {
            clearTimeout(timeout);
            console.error(`Error reading stream for ${params.path}:`, error);
            reject(error);
          });
        });
      } else {
        // If it's some other type, return a placeholder
        fileContent = "[Content not available in this format]";
      }
      
      return {
        content: fileContent
      };
    } catch (error) {
      console.error(`Error getting file content for ${params.path}:`, error);
      throw error;
    }
  }

  /**
   * Get file content by object ID
   */
  public async getFileContentByObjectId(repositoryId: string, objectId: string): Promise<string> {
    try {
      const gitApi = await this.getGitApi();
      
      // Get content by blob ID (object ID)
      const content = await gitApi.getBlobContent(
        repositoryId,
        objectId,
        this.config.project
      );
      
      if (Buffer.isBuffer(content)) {
        return content.toString('utf8');
      } else if (typeof content === 'string') {
        return content;
      } else if (content && typeof content === 'object' && 'pipe' in content && typeof content.pipe === 'function') {
        // Handle stream content
        const chunks: Buffer[] = [];
        const stream = content as Readable;
        
        return new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            stream.destroy();
            reject(new Error(`Stream timeout for objectId ${objectId}`));
          }, 30000);

          stream.on('data', (chunk: Buffer) => {
            chunks.push(chunk);
          });
          
          stream.on('end', () => {
            clearTimeout(timeout);
            const buffer = Buffer.concat(chunks);
            resolve(buffer.toString('utf8'));
          });
          
          stream.on('error', (error) => {
            clearTimeout(timeout);
            reject(error);
          });
        });
      }
      
      return '[Content not available]';
    } catch (error) {
      console.error(`Error getting file content by objectId ${objectId}:`, error);
      return '[Content not available]';
    }
  }

  /**
   * Calculate enhanced unified diff between two file contents with better readability
   */
  private calculateUnifiedDiff(originalContent: string, currentContent: string, filePath: string): string {
    const originalLines = originalContent.split('\n');
    const currentLines = currentContent.split('\n');
    
    // Enhanced diff algorithm with better change grouping
    let diffLines: string[] = [];
    diffLines.push(`--- a${filePath}`);
    diffLines.push(`+++ b${filePath}`);
    
    // Use a more sophisticated approach to find meaningful changes
    const changes = this.findMeaningfulChanges(originalLines, currentLines);
    
    if (changes.length === 0) {
      diffLines.push(`@@ -1,${originalLines.length} +1,${currentLines.length} @@`);
      diffLines.push(' (No meaningful differences found - likely formatting changes)');
      return diffLines.join('\n');
    }
    
    // Group changes into hunks with context
    for (const change of changes) {
      const contextLines = 3;
      const hunkStart = Math.max(1, change.originalStart - contextLines);
      const hunkEnd = Math.min(originalLines.length, change.originalEnd + contextLines);
      
      // Add hunk header
      const originalHunkSize = change.originalEnd - change.originalStart + 1;
      const currentHunkSize = change.currentEnd - change.currentStart + 1;
      const hunkHeader = `@@ -${change.originalStart},${originalHunkSize} +${change.currentStart},${currentHunkSize} @@`;
      diffLines.push(hunkHeader);
      
      // Add context before
      for (let i = hunkStart - 1; i < change.originalStart - 1; i++) {
        if (i >= 0 && i < originalLines.length) {
          diffLines.push(` ${originalLines[i]}`);
        }
      }
      
      // Add the actual changes
      switch (change.type) {
        case 'modified':
          // Show removed lines
          for (let i = change.originalStart - 1; i < change.originalEnd; i++) {
            diffLines.push(`-${originalLines[i]}`);
          }
          // Show added lines
          for (let i = change.currentStart - 1; i < change.currentEnd; i++) {
            diffLines.push(`+${currentLines[i]}`);
          }
          break;
        case 'added':
          for (let i = change.currentStart - 1; i < change.currentEnd; i++) {
            diffLines.push(`+${currentLines[i]}`);
          }
          break;
        case 'removed':
          for (let i = change.originalStart - 1; i < change.originalEnd; i++) {
            diffLines.push(`-${originalLines[i]}`);
          }
          break;
      }
      
      // Add context after
      for (let i = change.originalEnd; i < Math.min(change.originalEnd + contextLines, originalLines.length); i++) {
        diffLines.push(` ${originalLines[i]}`);
      }
      
      // Add separator between hunks if there are more changes
      if (changes.indexOf(change) < changes.length - 1) {
        diffLines.push('');
      }
    }
    
    return diffLines.join('\n');
  }

  /**
   * Find meaningful changes between two sets of lines
   */
  private findMeaningfulChanges(originalLines: string[], currentLines: string[]): any[] {
    const changes: any[] = [];
    let originalIndex = 0;
    let currentIndex = 0;
    
    while (originalIndex < originalLines.length || currentIndex < currentLines.length) {
      // Skip identical lines
      while (originalIndex < originalLines.length && 
             currentIndex < currentLines.length && 
             this.normalizeLineForComparison(originalLines[originalIndex]) === 
             this.normalizeLineForComparison(currentLines[currentIndex])) {
        originalIndex++;
        currentIndex++;
      }
      
      if (originalIndex >= originalLines.length && currentIndex >= currentLines.length) {
        break;
      }
      
      // Find the end of the different section
      const changeStartOriginal = originalIndex;
      const changeStartCurrent = currentIndex;
      
      // Look ahead to find where lines become similar again
      let foundMatch = false;
      let lookAhead = 5; // Look ahead up to 5 lines to find a match
      
      for (let ahead = 1; ahead <= lookAhead && !foundMatch; ahead++) {
        for (let origOffset = 0; origOffset <= ahead && !foundMatch; origOffset++) {
          const currOffset = ahead - origOffset;
          
          if (originalIndex + origOffset < originalLines.length && 
              currentIndex + currOffset < currentLines.length) {
            
            if (this.normalizeLineForComparison(originalLines[originalIndex + origOffset]) === 
                this.normalizeLineForComparison(currentLines[currentIndex + currOffset])) {
              
              // Found a match, determine change type
              if (origOffset === 0 && currOffset > 0) {
                // Lines were added
                changes.push({
                  type: 'added',
                  originalStart: originalIndex + 1,
                  originalEnd: originalIndex + 1,
                  currentStart: currentIndex + 1,
                  currentEnd: currentIndex + currOffset,
                  description: `Added ${currOffset} lines`
                });
                currentIndex += currOffset;
              } else if (origOffset > 0 && currOffset === 0) {
                // Lines were removed
                changes.push({
                  type: 'removed',
                  originalStart: originalIndex + 1,
                  originalEnd: originalIndex + origOffset,
                  currentStart: currentIndex + 1,
                  currentEnd: currentIndex + 1,
                  description: `Removed ${origOffset} lines`
                });
                originalIndex += origOffset;
              } else if (origOffset > 0 && currOffset > 0) {
                // Lines were modified
                changes.push({
                  type: 'modified',
                  originalStart: originalIndex + 1,
                  originalEnd: originalIndex + origOffset,
                  currentStart: currentIndex + 1,
                  currentEnd: currentIndex + currOffset,
                  description: `Modified ${Math.max(origOffset, currOffset)} lines`
                });
                originalIndex += origOffset;
                currentIndex += currOffset;
              }
              
              foundMatch = true;
            }
          }
        }
      }
      
      if (!foundMatch) {
        // No match found, treat remaining as changes
        if (originalIndex < originalLines.length && currentIndex < currentLines.length) {
          // Both have remaining lines - treat as modification
          const remainingOriginal = originalLines.length - originalIndex;
          const remainingCurrent = currentLines.length - currentIndex;
          changes.push({
            type: 'modified',
            originalStart: originalIndex + 1,
            originalEnd: originalLines.length,
            currentStart: currentIndex + 1,
            currentEnd: currentLines.length,
            description: `Modified remaining lines (${remainingOriginal} → ${remainingCurrent})`
          });
          break;
        } else if (originalIndex < originalLines.length) {
          // Only original has remaining lines - removed
          changes.push({
            type: 'removed',
            originalStart: originalIndex + 1,
            originalEnd: originalLines.length,
            currentStart: currentIndex + 1,
            currentEnd: currentIndex + 1,
            description: `Removed ${originalLines.length - originalIndex} lines`
          });
          break;
        } else if (currentIndex < currentLines.length) {
          // Only current has remaining lines - added
          changes.push({
            type: 'added',
            originalStart: originalIndex + 1,
            originalEnd: originalIndex + 1,
            currentStart: currentIndex + 1,
            currentEnd: currentLines.length,
            description: `Added ${currentLines.length - currentIndex} lines`
          });
          break;
        }
      }
    }
    
    return changes;
  }

  /**
   * Normalize line for comparison (remove extra whitespace, etc.)
   */
  private normalizeLineForComparison(line: string): string {
    return line.trim().replace(/\s+/g, ' ');
  }

  /**
   * Get commit history
   */
  public async getCommitHistory(params: GetCommitHistoryParams): Promise<any> {
    try {
      const gitApi = await this.getGitApi();
      
      // Create comprehensive search criteria
      const searchCriteria: any = {
        itemPath: params.itemPath,
        $skip: params.skip || 0,
        $top: params.top || 100, // Default to 100 if not specified
        includeStatuses: true,
        includeWorkItems: true
      };

      // Get commits with proper search criteria for richer data
      // Resolve repository name/ID to actual repository ID
      const repositoryId = await this.resolveRepositoryId(params.repository);
      
      const commits = await gitApi.getCommits(
        repositoryId,
        searchCriteria,
        params.projectId || this.config.project
      );
      
      // The commits are already filtered and paginated by the API
      return commits || [];
    } catch (error) {
      console.error(`Error getting commit history for repository ${params.repository}:`, error);
      throw error;
    }
  }

  /**
   * Get commits
   */
  public async getCommits(params: GetCommitsParams): Promise<any> {
    try {
      const gitApi = await this.getGitApi();
      
      // Resolve repository name/ID to actual repository ID
      const repositoryId = await this.resolveRepositoryId(params.repository);
      
      // Get commits without search criteria
      const commits = await gitApi.getCommits(
        repositoryId,
        {} // Empty search criteria
      );
      
      // Filter by path if provided
      let filteredCommits = commits;
      if (params.path) {
        filteredCommits = commits.filter(commit => 
          commit.comment && commit.comment.includes(params.path || "")
        );
      }
      
      return filteredCommits;
    } catch (error) {
      console.error(`Error getting commits for repository ${params.repository}:`, error);
      throw error;
    }
  }

  /**
   * Get pull requests
   */
  public async getPullRequests(params: GetPullRequestsParams): Promise<any> {
    try {
      const gitApi = await this.getGitApi();
      
      // Resolve repository name/ID to actual repository ID
      const repositoryId = await this.resolveRepositoryId(params.repository);
      
      // Create search criteria with proper types
      const searchCriteria: any = {
        repositoryId: repositoryId,
        creatorId: params.creatorId,
        reviewerId: params.reviewerId,
        sourceRefName: params.sourceRefName,
        targetRefName: params.targetRefName
      };
      
      // Convert string status to number if provided
      if (params.status) {
        if (params.status === 'active') searchCriteria.status = 1;
        else if (params.status === 'abandoned') searchCriteria.status = 2;
        else if (params.status === 'completed') searchCriteria.status = 3;
        else if (params.status === 'notSet') searchCriteria.status = 0;
        // 'all' doesn't need to be set
      }
      
      const pullRequests = await gitApi.getPullRequests(
        repositoryId,
        searchCriteria,
        this.config.project,
        undefined, // maxCommentLength
        params.skip || 0,
        params.top || 50
      );

      // Note: Work item integration could be added here in the future
      // For now, we return the basic pull request data with rich reviewer information
      
      return pullRequests;
    } catch (error) {
      console.error(`Error getting pull requests for repository ${params.repository}:`, error);
      throw error;
    }
  }

  /**
   * Create pull request
   */
  public async createPullRequest(params: CreatePullRequestParams): Promise<any> {
    try {
      const gitApi = await this.getGitApi();
      
      const pullRequest = {
        sourceRefName: params.sourceRefName,
        targetRefName: params.targetRefName,
        title: params.title,
        description: params.description,
        reviewers: params.reviewers ? params.reviewers.map(id => ({ id })) : undefined
      };
      
      // Resolve repository name/ID to actual repository ID
      const repositoryId = await this.resolveRepositoryId(params.repository);
      
      const createdPullRequest = await gitApi.createPullRequest(
        pullRequest,
        repositoryId,
        this.config.project
      );
      
      return createdPullRequest;
    } catch (error) {
      console.error('Error creating pull request:', error);
      throw error;
    }
  }

  /**
   * Get pull request by ID
   */
  public async getPullRequest(params: GetPullRequestParams): Promise<any> {
    try {
      const gitApi = await this.getGitApi();
      
      // Resolve repository name/ID to actual repository ID
      const repositoryId = await this.resolveRepositoryId(params.repository);
      
      const pullRequest = await gitApi.getPullRequest(
        repositoryId,
        params.pullRequestId,
        this.config.project
      );
      
      return pullRequest;
    } catch (error) {
      console.error(`Error getting pull request ${params.pullRequestId}:`, error);
      throw error;
    }
  }

  /**
   * Get pull request comments
   */
  public async getPullRequestComments(params: GetPullRequestCommentsParams): Promise<any> {
    try {
      const gitApi = await this.getGitApi();
      
      // Resolve repository name/ID to actual repository ID
      const repositoryId = await this.resolveRepositoryId(params.repository);
      
      if (params.threadId) {
        const thread = await gitApi.getPullRequestThread(
          repositoryId,
          params.pullRequestId,
          params.threadId,
          this.config.project
        );
        
        return thread;
      } else {
        const threads = await gitApi.getThreads(
          repositoryId,
          params.pullRequestId,
          this.config.project
        );
        
        return threads;
      }
    } catch (error) {
      console.error(`Error getting comments for pull request ${params.pullRequestId}:`, error);
      throw error;
    }
  }

  /**
   * Approve pull request
   */
  public async approvePullRequest(params: ApprovePullRequestParams): Promise<any> {
    try {
      const gitApi = await this.getGitApi();

      // Resolve repository name/ID to actual repository ID
      const repositoryId = await this.resolveRepositoryId(params.repository);
      
      const vote = {
        vote: 10
      };
      
      const result = await gitApi.createPullRequestReviewer(
        vote,
        repositoryId,
        params.pullRequestId,
        "me",
        this.config.project
      );
      
      return result;
    } catch (error) {
      console.error(`Error approving pull request ${params.pullRequestId}:`, error);
      throw error;
    }
  }

  /**
   * Merge pull request
   */
  public async mergePullRequest(params: MergePullRequestParams): Promise<any> {
    try {
      const gitApi = await this.getGitApi();
      
      // Convert string merge strategy to number
      let mergeStrategy = 1; // Default to noFastForward
      if (params.mergeStrategy === 'rebase') mergeStrategy = 2;
      else if (params.mergeStrategy === 'rebaseMerge') mergeStrategy = 3;
      else if (params.mergeStrategy === 'squash') mergeStrategy = 4;

      let repositoryId: string = await this.resolveRepositoryId(params.repository);
      
      const result = await gitApi.updatePullRequest(
        { 
          status: 3, // 3 = completed in PullRequestStatus enum
          completionOptions: {
            mergeStrategy: mergeStrategy
          }
        },
        repositoryId,
        params.pullRequestId,
        this.config.project
      );
      
      return result;
    } catch (error) {
      console.error(`Error merging pull request ${params.pullRequestId}:`, error);
      throw error;
    }
  }

  /**
   * Complete pull request
   */
  public async completePullRequest(params: CompletePullRequestParams): Promise<any> {
    try {
      const gitApi = await this.getGitApi();
      
      // Get the current pull request
      const pullRequest = await gitApi.getPullRequestById(params.pullRequestId);
      
      // Convert string merge strategy to number
      let mergeStrategy = 1; // Default to noFastForward
      if (params.mergeStrategy === 'rebase') mergeStrategy = 2;
      else if (params.mergeStrategy === 'rebaseMerge') mergeStrategy = 3;
      else if (params.mergeStrategy === 'squash') mergeStrategy = 4;

      let repositoryId: string = await this.resolveRepositoryId(params.repository);
      
      // Update the pull request to completed status
      const updatedPullRequest = await gitApi.updatePullRequest(
        {
          status: 3, // 3 = completed in PullRequestStatus enum
          completionOptions: {
            mergeStrategy: mergeStrategy,
            deleteSourceBranch: params.deleteSourceBranch
          }
        },
        repositoryId,
        params.pullRequestId
      );
      
      return updatedPullRequest;
    } catch (error) {
      console.error(`Error completing pull request ${params.pullRequestId}:`, error);
      throw error;
    }
  }

  /**
   * Add inline comment to pull request
   */
  public async addPullRequestInlineComment(params: AddPullRequestInlineCommentParams): Promise<any> {
    try {
      const gitApi = await this.getGitApi();

      let repositoryId: string = await this.resolveRepositoryId(params.repository);
      
      // First get the changes for the file to get the change tracking ID
      const changes = await gitApi.getPullRequestIterationChanges(
        repositoryId,
        params.pullRequestId,
        1, // First iteration
        this.config.project
      );

      // Helper function to normalize paths by removing leading slash
      const normalizePath = (path: string): string => {
        return path.startsWith('/') ? path.substring(1) : path;
      };

      // Normalize the request path for consistent matching
      const normalizedRequestPath = normalizePath(params.path);

      // Find the change entry for the specific file using normalized path matching
      const changeEntry = changes.changeEntries?.find(entry => {
        if (!entry.item?.path) return false;
        const normalizedEntryPath = normalizePath(entry.item.path);
        return normalizedEntryPath === normalizedRequestPath;
      });
      if (!changeEntry) {
        // Provide a more helpful error message with available files
        const availableFiles = changes.changeEntries?.map(entry => entry.item?.path).filter((path): path is string => Boolean(path)) || [];
        const fileList = availableFiles.length > 0 
          ? `\n\nFiles changed in this PR:\n${availableFiles.map(file => `- ${file}`).join('\n')}`
          : '\n\nNo files found in this PR.';
        
        throw new Error(`File '${params.path}' is not part of the changes in this pull request.${fileList}

💡 **To find the correct files and line numbers:**

Use 'getPullRequestFileChanges' with:
- repository: '${params.repository}'
- pullRequestId: ${params.pullRequestId}

This will show you the actual file changes and line numbers available for commenting.

Note: You can only add inline comments to files that have been modified in the PR.`);
      }

      // Determine thread context based on change type
      let threadContext: any = {
        filePath: params.path,
      };

      // Handle different change types according to Azure DevOps API documentation
      if (changeEntry.changeType === VersionControlChangeType.Add) {
        // ADDED file: leftFile positions should be null, rightFile positions are for the new file
        threadContext.leftFileStart = null;
        threadContext.leftFileEnd = null;
        threadContext.rightFileStart = {
          line: params.position.line,
          offset: params.position.offset
        };
        threadContext.rightFileEnd = {
          line: params.position.line,
          offset: params.position.offset + 1
        };
      } else if (changeEntry.changeType === VersionControlChangeType.Delete) {
        // DELETED file: rightFile positions should be null, leftFile positions are for the deleted content
        threadContext.leftFileStart = {
          line: params.position.line,
          offset: params.position.offset
        };
        threadContext.leftFileEnd = {
          line: params.position.line,
          offset: params.position.offset + 1
        };
        threadContext.rightFileStart = null;
        threadContext.rightFileEnd = null;
      } else {
        // MODIFIED file: both left and right positions can be set (traditional approach)
        threadContext.leftFileStart = null; // Often null for simple line comments
        threadContext.leftFileEnd = null;
        threadContext.rightFileStart = {
          line: params.position.line,
          offset: params.position.offset
        };
        threadContext.rightFileEnd = {
          line: params.position.line,
          offset: params.position.offset + 1
        };
      }

      // Create a thread with proper context for the comment
      const thread = {
        comments: [{
          content: params.comment,
          parentCommentId: 0,
          commentType: 1 // 1 = text
        }],
        status: 1, // 1 = active
        threadContext,
        pullRequestThreadContext: {
          changeTrackingId: changeEntry.changeTrackingId, // Use the change tracking ID from the diff
          iterationContext: {
            firstComparingIteration: 1, // First iteration
            secondComparingIteration: 1 // Current iteration
          }
        }
      };
      
      // Create the thread (which includes the comment)
      const result = await gitApi.createThread(
        thread,
        repositoryId,
        params.pullRequestId,
        this.config.project
      );
      
      return result;
    } catch (error: any) {
      console.error(`Error adding inline comment to pull request ${params.pullRequestId}:`, error);
      
      // Enhanced error handling for common scenarios
      if (error.message || error.response?.data?.message) {
        const errorMessage = error.message || error.response?.data?.message || '';
        
        // Check for line number related errors
        if (errorMessage.includes('line') || 
            errorMessage.includes('position') || 
            errorMessage.includes('range') ||
            errorMessage.includes('invalid') ||
            error.status === 400 || 
            error.statusCode === 400) {
          
          throw new Error(`Unable to add inline comment at line ${params.position.line} in file '${params.path}'. This could be because:

• The line number doesn't exist in the file
• The line position is outside the valid range
• For newly added files: line numbers start from 1 and go up to the total lines in the new file
• For modified files: only changed line ranges can be commented on
• For deleted files: only the original line numbers from the deleted content can be commented on

💡 **Solution:** Use 'getPullRequestFileChanges' with repository: '${params.repository}' and pullRequestId: ${params.pullRequestId} to:
- See the actual code diff for '${params.path}'
- For NEW files (Add): All lines (1 to N) are available for comments, shown as +1, +2, +3...
- For MODIFIED files (Edit): Only changed line ranges can be commented on
- For DELETED files (Delete): Only deleted line numbers can be commented on, shown as -1, -2, -3...
- View the exact changes and valid line numbers

**Based on Azure DevOps REST API research:** The thread context is now properly configured for each change type.

Original error: ${errorMessage}`);
        }
      }
      
      throw error;
    }
  }

  /**
   * Add file comment to pull request
   */
  public async addPullRequestFileComment(params: AddPullRequestFileCommentParams): Promise<any> {
    try {
      const gitApi = await this.getGitApi();
      
      // Create a thread with proper context for a file-level comment
      const thread = {
        comments: [{
          content: params.comment,
          parentCommentId: 0,
          commentType: 1 // 1 = text
        }],
        status: 1, // 1 = active
        threadContext: {
          filePath: params.path
          // No position info for file-level comments
        }
      };

      // Resolve repository name/ID to actual repository ID
      const repositoryId = await this.resolveRepositoryId(params.repository);
      
      // Create the thread (which includes the comment)
      const result = await gitApi.createThread(
        thread,
        repositoryId,
        params.pullRequestId,
        this.config.project
      );
      
      return result;
    } catch (error) {
      console.error(`Error adding file comment to pull request ${params.pullRequestId}:`, error);
      throw error;
    }
  }

  /**
   * Add general comment to pull request
   */
  public async addPullRequestComment(params: AddPullRequestCommentParams): Promise<any> {
    try {
      const gitApi = await this.getGitApi();
      
      // Create a thread for a general PR comment (no file context)
      const thread = {
        comments: [{
          content: params.comment,
          parentCommentId: 0,
          commentType: 1 // 1 = text
        }],
        status: 1 // 1 = active
        // No threadContext for general PR comments
      };

      // Resolve repository name/ID to actual repository ID
      const repositoryId = await this.resolveRepositoryId(params.repository);
      
      // Create the thread (which includes the comment)
      const result = await gitApi.createThread(
        thread,
        repositoryId,
        params.pullRequestId,
        this.config.project
      );
      
      return result;
    } catch (error) {
      console.error(`Error adding comment to pull request ${params.pullRequestId}:`, error);
      throw error;
    }
  }

  /**
   * Get pull request file changes with diff content
   */
  public async getPullRequestFileChanges(params: GetPullRequestFileChangesParams): Promise<any> {
    try {
      const gitApi = await this.getGitApi();

      // Resolve repository name/ID to actual repository ID
      const repositoryId = await this.resolveRepositoryId(params.repository);
      
      // If path is provided, we need to get the changes for that specific file
      if (params.path) {
        // Try to get changes from the latest iteration first, then fallback to iteration 1
        let changes: any = null;
        let iterationNumber = 1;
        
        try {
          // Try to get the latest changes (typically from the latest iteration)
          changes = await gitApi.getPullRequestIterationChanges(
            repositoryId,
            params.pullRequestId,
            iterationNumber,
            this.config.project
          );
          
        } catch (error) {
          console.error('Error getting PR changes:', error);
          throw error;
        }
        
        // Helper function to normalize paths by removing leading slash
        const normalizePath = (path: string): string => {
          return path.startsWith('/') ? path.substring(1) : path;
        };
        
        // Normalize the request path for consistent matching
        const normalizedRequestPath = normalizePath(params.path);
        
        // Filter changes for the specific file with improved path matching
        const filteredChanges = {
          ...changes,
          changeEntries: changes.changeEntries?.filter((entry: any) => {
            if (!entry.item?.path) return false;
            const entryPath = entry.item.path;
            const normalizedEntryPath = normalizePath(entryPath);
            
            // Compare normalized paths for consistent matching regardless of leading slash
            return normalizedEntryPath === normalizedRequestPath;
          }) || []
        };

        // Enhance with diff content for each change
        const enhancedChangeEntries = await Promise.all(
          filteredChanges.changeEntries.map(async (change: any) => {
            let diffContent = '';
            
            if (change.changeType === 2 && change.item?.originalObjectId && change.item?.objectId) {
              // Modified file - get both versions and calculate diff
              try {
                const [originalContent, currentContent] = await Promise.all([
                  this.getFileContentByObjectId(repositoryId, change.item.originalObjectId),
                  this.getFileContentByObjectId(repositoryId, change.item.objectId)
                ]);
                
                diffContent = this.calculateUnifiedDiff(originalContent, currentContent, change.item.path);
                diffContent = this.addInlineCommentGuidance(diffContent, change.changeType);
              } catch (error) {
                console.error(`Error getting diff for ${change.item.path}:`, error);
                diffContent = '[Diff not available]';
              }
            } else if (change.changeType === 1 && change.item?.objectId) {
              // Added file - get new content and format as all additions
              try {
                const newContent = await this.getFileContentByObjectId(repositoryId, change.item.objectId);
                diffContent = this.calculateAddedFileDiff(newContent, change.item.path);
              } catch (error) {
                console.error(`Error getting content for new file ${change.item.path}:`, error);
                diffContent = '[Content not available]';
              }
            } else if (change.changeType === 3 && change.item?.originalObjectId) {
              // Deleted file - get original content and format as all deletions
              try {
                const originalContent = await this.getFileContentByObjectId(repositoryId, change.item.originalObjectId);
                diffContent = this.calculateDeletedFileDiff(originalContent, change.item.path);
              } catch (error) {
                console.error(`Error getting content for deleted file ${change.item.path}:`, error);
                diffContent = '[Content not available]';
              }
            }
            
            return {
              ...change,
              diffContent
            };
          })
        );

        return {
          ...filteredChanges,
          changeEntries: enhancedChangeEntries
        };
      }
      
      // If no path is provided, get all changes with diffs
      const changes = await gitApi.getPullRequestIterationChanges(
        repositoryId,
        params.pullRequestId,
        1, // First iteration
        this.config.project
        // Remove the second iteration parameter that might be causing issues
      );

      // Enhance with diff content for each change (smart selection to show variety)
      const allChanges = changes.changeEntries || [];
      
      // Smart selection: try to get examples of different change types
      const modifiedFiles = allChanges.filter((c: any) => c.changeType === 2); // Modified
      const addedFiles = allChanges.filter((c: any) => c.changeType === 1);     // Added
      const deletedFiles = allChanges.filter((c: any) => c.changeType === 3);   // Deleted
      
      let changesToProcess: any[] = [];
      
      // Take up to 2 from each type, prioritizing modified files, then added, then deleted
      changesToProcess.push(...modifiedFiles.slice(0, 2));
      changesToProcess.push(...addedFiles.slice(0, 2));
      changesToProcess.push(...deletedFiles.slice(0, 1));
      
      // If we have fewer than 5, fill up with remaining files
      if (changesToProcess.length < 5) {
        const remainingFiles = allChanges.filter((c: any) => !changesToProcess.includes(c));
        changesToProcess.push(...remainingFiles.slice(0, 5 - changesToProcess.length));
      }
      
      // Limit to 5 files total for performance
      changesToProcess = changesToProcess.slice(0, 5);
      
      const enhancedChangeEntries = await Promise.all(
        changesToProcess.map(async (change: any) => {
          let diffContent = '';
          
          if (change.changeType === 2 && change.item?.originalObjectId && change.item?.objectId) {
            // Modified file - get both versions and calculate diff
            try {
              const [originalContent, currentContent] = await Promise.all([
                this.getFileContentByObjectId(repositoryId, change.item.originalObjectId),
                this.getFileContentByObjectId(repositoryId, change.item.objectId)
              ]);
              
              diffContent = this.calculateUnifiedDiff(originalContent, currentContent, change.item.path);
              diffContent = this.addInlineCommentGuidance(diffContent, change.changeType);
            } catch (error) {
              console.error(`Error getting diff for ${change.item.path}:`, error);
              diffContent = '[Diff not available]';
            }
          } else if (change.changeType === 1 && change.item?.objectId) {
            // Added file - get new content and format as all additions
            try {
              const newContent = await this.getFileContentByObjectId(repositoryId, change.item.objectId);
              diffContent = this.calculateAddedFileDiff(newContent, change.item.path);
            } catch (error) {
              console.error(`Error getting content for new file ${change.item.path}:`, error);
              diffContent = '[Content not available]';
            }
          } else if (change.changeType === 3 && change.item?.originalObjectId) {
            // Deleted file - get original content and format as all deletions
            try {
              const originalContent = await this.getFileContentByObjectId(repositoryId, change.item.originalObjectId);
              diffContent = this.calculateDeletedFileDiff(originalContent, change.item.path);
            } catch (error) {
              console.error(`Error getting content for deleted file ${change.item.path}:`, error);
              diffContent = '[Content not available]';
            }
          }
          
          return {
            ...change,
            diffContent
          };
        })
      );

      return {
        ...changes,
        changeEntries: enhancedChangeEntries,
        totalChanges: changes.changeEntries?.length || 0,
        processedChanges: enhancedChangeEntries.length
      };
    } catch (error) {
      console.error(`Error getting file changes for pull request ${params.pullRequestId}:`, error);
      throw error;
    }
  }

  /**
   * Get pull request changes count
   */
  public async getPullRequestChangesCount(params: GetPullRequestChangesCountParams): Promise<any> {
    try {
      const gitApi = await this.getGitApi();

      // Resolve repository name/ID to actual repository ID
      const repositoryId = await this.resolveRepositoryId(params.repository);
      
      const changes = await gitApi.getPullRequestIterationChanges(
        repositoryId,
        params.pullRequestId,
        1, // First iteration
        this.config.project
      );
      
      return {
        totalChanges: changes.changeEntries?.length || 0,
        addedFiles: changes.changeEntries?.filter(entry => entry.changeType === VersionControlChangeType.Add).length || 0,
        modifiedFiles: changes.changeEntries?.filter(entry => entry.changeType === VersionControlChangeType.Edit).length || 0,
        deletedFiles: changes.changeEntries?.filter(entry => entry.changeType === VersionControlChangeType.Delete).length || 0
      };
    } catch (error) {
      console.error(`Error getting changes count for pull request ${params.pullRequestId}:`, error);
      throw error;
    }
  }

  /**
   * Get all pull request changes
   */
  public async getAllPullRequestChanges(params: GetAllPullRequestChangesParams): Promise<any> {
    try {
      const gitApi = await this.getGitApi();

      // Resolve repository name/ID to actual repository ID
      const repositoryId = await this.resolveRepositoryId(params.repository);
      
      const changes = await gitApi.getPullRequestIterationChanges(
        repositoryId,
        params.pullRequestId,
        1, // First iteration
        this.config.project
      );
      
      let changeEntries = changes.changeEntries || [];
      
      // Apply pagination if specified
      if (params.skip && params.skip > 0) {
        changeEntries = changeEntries.slice(params.skip);
      }
      
      if (params.top && params.top > 0) {
        changeEntries = changeEntries.slice(0, params.top);
      }
      
      return {
        changes: changeEntries,
        totalCount: changes.changeEntries?.length || 0
      };
    } catch (error) {
      console.error(`Error getting all changes for pull request ${params.pullRequestId}:`, error);
      throw error;
    }
  }

  /**
   * Get list of changed files in a pull request (useful for knowing which files can have inline comments)
   */
  public async getPullRequestChangedFilesList(repositoryId: string, pullRequestId: number): Promise<string[]> {
    try {
      const gitApi = await this.getGitApi();
      
      const changes = await gitApi.getPullRequestIterationChanges(
        repositoryId,
        pullRequestId,
        1, // First iteration
        this.config.project
      );

      return changes.changeEntries?.map(entry => entry.item?.path).filter((path): path is string => Boolean(path)) || [];
    } catch (error) {
      console.error(`Error getting changed files list for PR ${pullRequestId}:`, error);
      return [];
    }
  }

  /**
   * Calculate diff for an added file (all content is new)
   */
  private calculateAddedFileDiff(content: string, filePath: string): string {
    const lines = content.split('\n');
    
    if (lines.length === 0) {
      return `--- /dev/null
+++ b${filePath}
@@ -0,0 +1,0 @@
📄 NEW FILE (Empty)

💬 INLINE COMMENT LINES: None (empty file)`;
    }
    
    // For large files, show a summary instead of all content
    const maxLinesToShow = 250;
    const isLargeFile = lines.length > maxLinesToShow;
    
    let diffLines: string[] = [];
    diffLines.push(`--- /dev/null`);
    diffLines.push(`+++ b${filePath}`);
    diffLines.push(`@@ -0,0 +1,${lines.length} @@`);
    diffLines.push(`📄 NEW FILE (${lines.length} lines)`);
    diffLines.push(`💬 INLINE COMMENT LINES: 1 to ${lines.length} (any line can be commented)`);
    diffLines.push(``);
    
    if (isLargeFile) {
      // Show first 50 lines with clear line numbers
      const firstLines = lines.slice(0, 50);
      const lastLines = lines.slice(-10);
      const hiddenLineCount = lines.length - firstLines.length - lastLines.length;
      
      // Add first 50 lines with line numbers
      firstLines.forEach((line, index) => {
        const lineNumber = index + 1;
        diffLines.push(`+${lineNumber.toString().padStart(4, ' ')}: ${line}  [← ${lineNumber}, right]`);
      });
      
      // Add summary of hidden content
      if (hiddenLineCount > 0) {
        const startHidden = firstLines.length + 1;
        const endHidden = lines.length - lastLines.length;
        diffLines.push(`+... (${hiddenLineCount} more lines: ${startHidden}-${endHidden}, all commentable) ...`);
      }
      
      // Add last 10 lines with line numbers
      lastLines.forEach((line, index) => {
        const lineNumber = lines.length - lastLines.length + index + 1;
        diffLines.push(`+${lineNumber.toString().padStart(4, ' ')}: ${line}  [← ${lineNumber}, right]`);
      });
    } else {
      // Show all content for smaller files with line numbers
      lines.forEach((line, index) => {
        const lineNumber = index + 1;
        diffLines.push(`+${lineNumber.toString().padStart(4, ' ')}: ${line}  [← ${lineNumber}, right]`);
      });
    }
    
    diffLines.push(``);
    diffLines.push(`📝 **Usage:** addPullRequestInlineComment with position.line = 1 to ${lines.length}`);
    diffLines.push(`💬 **Tip:** All lines in new files can be commented on!`);
    
    return diffLines.join('\n');
  }

  /**
   * Calculate diff for a deleted file (all content was removed)
   */
  private calculateDeletedFileDiff(content: string, filePath: string): string {
    const lines = content.split('\n');
    
    if (lines.length === 0) {
      return `--- a${filePath}
+++ /dev/null
@@ -1,0 +0,0 @@
🗑️ DELETED FILE (Empty)

💬 INLINE COMMENT LINES: None (empty file was deleted)`;
    }

    // For large files, show a summary instead of all content
    const maxLinesToShow = 100;
    const isLargeFile = lines.length > maxLinesToShow;
    
    let diffLines: string[] = [];
    diffLines.push(`--- a${filePath}`);
    diffLines.push(`+++ /dev/null`);
    diffLines.push(`@@ -1,${lines.length} +0,0 @@`);
    diffLines.push(`🗑️ DELETED FILE (${lines.length} lines removed)`);
    diffLines.push(`💬 INLINE COMMENT LINES: 1 to ${lines.length} (comment on deleted content)`);
    diffLines.push(``);
    
    if (isLargeFile) {
      // Show first 50 lines with clear line numbers
      const firstLines = lines.slice(0, 50);
      const lastLines = lines.slice(-10);
      const hiddenLineCount = lines.length - firstLines.length - lastLines.length;
      
      // Add first 50 lines with line numbers
      firstLines.forEach((line, index) => {
        const lineNumber = index + 1;
        diffLines.push(`-${lineNumber.toString().padStart(4, ' ')}: ${line}  [← ${lineNumber}, left]`);
      });
      
      // Add summary of hidden content
      if (hiddenLineCount > 0) {
        const startHidden = firstLines.length + 1;
        const endHidden = lines.length - lastLines.length;
        diffLines.push(`-... (${hiddenLineCount} more deleted lines: ${startHidden}-${endHidden}, all commentable) ...`);
      }
      
      // Add last 10 lines with line numbers
      lastLines.forEach((line, index) => {
        const lineNumber = lines.length - lastLines.length + index + 1;
        diffLines.push(`-${lineNumber.toString().padStart(4, ' ')}: ${line}  [← ${lineNumber}, left]`);
      });
    } else {
      // Show all content for smaller files with line numbers
      lines.forEach((line, index) => {
        const lineNumber = index + 1;
        diffLines.push(`-${lineNumber.toString().padStart(4, ' ')}: ${line}  [← ${lineNumber}, left]`);
      });
    }
    
    diffLines.push(``);
    diffLines.push(`📝 **Usage:** addPullRequestInlineComment with position.line = 1 to ${lines.length} (original line numbers)`);
    diffLines.push(`💬 **Tip:** Comment on the original content before it was deleted!`);
    
    return diffLines.join('\n');
  }

  /**
   * Add inline comment guidance to diff content with accurate line numbers
   */
  private addInlineCommentGuidance(diffContent: string, changeType: any): string {
    const lines = diffContent.split('\n');
    const enhancedLines: string[] = [];
    
    // Add header with comment guidance
    if (changeType === VersionControlChangeType.Add) {
      enhancedLines.push(`📄 NEW FILE - All lines available for inline comments`);
      enhancedLines.push(`💬 Use line numbers 1, 2, 3... etc. for addPullRequestInlineComment`);
    } else if (changeType === VersionControlChangeType.Delete) {
      enhancedLines.push(`🗑️ DELETED FILE - Original line numbers available for comments`);
      enhancedLines.push(`💬 Use original line numbers from deleted content for addPullRequestInlineComment`);
    } else {
      enhancedLines.push(`📝 MODIFIED FILE - Both original (left) and new (right) lines available for comments`);
      enhancedLines.push(`💬 Look for [← line, left] and [← line, right] markers for addPullRequestInlineComment`);
    }
    enhancedLines.push(``);

    let rightLineNumber = 1;
    let leftLineNumber = 1;
    let inHunk = false;
    
    for (const line of lines) {
      if (line.startsWith('@@')) {
        // Parse hunk header to get accurate starting line numbers
        // Format: @@ -startLeft,countLeft +startRight,countRight @@
        const hunkMatch = line.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
        if (hunkMatch) {
          leftLineNumber = parseInt(hunkMatch[1]);
          rightLineNumber = parseInt(hunkMatch[3]);
          inHunk = true;
          
          // Log for debugging
          console.log(`Hunk: left starts at ${leftLineNumber}, right starts at ${rightLineNumber}`);
        }
        enhancedLines.push(line);
        enhancedLines.push(`⬇️ Lines below can be commented on:`);
      } else if (line.startsWith('+') && !line.startsWith('+++')) {
        // Added line - can be commented on (right side)
        enhancedLines.push(`${line}  [← ${rightLineNumber}, right]`);
        rightLineNumber++;
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        // Removed line - can be commented on (left side)  
        enhancedLines.push(`${line}  [← ${leftLineNumber}, left]`);
        leftLineNumber++;
      } else if (line.startsWith(' ') && inHunk) {
        // Context line - can be commented on (both sides, but we use right)
        enhancedLines.push(`${line}  [← ${rightLineNumber}, right]`);
        leftLineNumber++;
        rightLineNumber++;
      } else {
        enhancedLines.push(line);
      }
    }
    
    // Add footer guidance
    enhancedLines.push(``);
    if (changeType === VersionControlChangeType.Add) {
      enhancedLines.push(`📝 **Usage:** Any line number from 1 to total lines can be used for inline comments`);
    } else if (changeType === VersionControlChangeType.Delete) {
      enhancedLines.push(`📝 **Usage:** Use original line numbers for commenting on deleted content`);
    } else {
      enhancedLines.push(`📝 **Usage:** Look for [← line, left] or [← line, right] markers above for valid line numbers`);
      enhancedLines.push(`💡 **Left numbers:** Comment on original content (what was removed)`);
      enhancedLines.push(`💡 **Right numbers:** Comment on new content (what was added or unchanged)`);
    }
    enhancedLines.push(`💬 **Format:** addPullRequestInlineComment(position: {line: X, offset: 1})`);
    
    return enhancedLines.join('\n');
  }
}