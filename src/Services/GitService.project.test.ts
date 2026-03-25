/**
 * Tests that the `project` parameter is correctly propagated from service method
 * params to the underlying Azure DevOps API calls, instead of always using
 * the default config project.
 *
 * This was the root cause of project override not working for threads/comments
 * while it worked for build APIs.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock the azure-devops-node-api module ────────────────────────────
const mockGetThreads = vi.fn().mockResolvedValue([]);
const mockGetPullRequestThread = vi.fn().mockResolvedValue({ id: 1 });
const mockCreateThread = vi.fn().mockResolvedValue({ id: 1, comments: [] });
const mockCreateComment = vi.fn().mockResolvedValue({ id: 1 });
const mockUpdateThread = vi.fn().mockResolvedValue({ id: 1 });
const mockGetPullRequests = vi.fn().mockResolvedValue([]);
const mockGetPullRequest = vi.fn().mockResolvedValue({ pullRequestId: 42 });
const mockCreatePullRequest = vi.fn().mockResolvedValue({ pullRequestId: 99 });
const mockUpdatePullRequest = vi.fn().mockResolvedValue({ pullRequestId: 42 });
const mockCreatePullRequestReviewer = vi.fn().mockResolvedValue({});
const mockDeletePullRequestReviewer = vi.fn().mockResolvedValue(undefined);
const mockGetPullRequestWorkItemRefs = vi.fn().mockResolvedValue([]);
const mockGetPullRequestIterations = vi.fn().mockResolvedValue([{ id: 1 }]);
const mockGetPullRequestIterationChanges = vi.fn().mockResolvedValue({ changeEntries: [] });
const mockGetBranches = vi.fn().mockResolvedValue([{ name: 'main', commit: { commitId: 'abc123' } }]);
const mockUpdateRefs = vi.fn().mockResolvedValue([{ name: 'refs/heads/new-branch' }]);
const REPO_GUID = 'c5e7435f-113e-4328-9d8a-726f094bfa95';
const mockGetRepository = vi.fn().mockResolvedValue({ id: REPO_GUID, name: 'MyRepo' });
const mockGetRepositories = vi.fn().mockResolvedValue([{ id: REPO_GUID, name: 'MyRepo' }]);
const mockConnect = vi.fn().mockResolvedValue({ authenticatedUser: { id: 'user-123' } });
const mockGetWorkItems = vi.fn().mockResolvedValue([]);

const mockGetItems = vi.fn().mockResolvedValue([]);
const mockGetItemContent = vi.fn().mockResolvedValue(Buffer.from('file content'));
const mockGetBlobContent = vi.fn().mockResolvedValue(Buffer.from('blob content'));
const mockGetPullRequestById = vi.fn().mockResolvedValue({ pullRequestId: 42 });
const mockGetCommits = vi.fn().mockResolvedValue([]);

const mockGitApi = {
  getThreads: mockGetThreads,
  getPullRequestThread: mockGetPullRequestThread,
  createThread: mockCreateThread,
  createComment: mockCreateComment,
  updateThread: mockUpdateThread,
  getPullRequests: mockGetPullRequests,
  getPullRequest: mockGetPullRequest,
  createPullRequest: mockCreatePullRequest,
  updatePullRequest: mockUpdatePullRequest,
  createPullRequestReviewer: mockCreatePullRequestReviewer,
  deletePullRequestReviewer: mockDeletePullRequestReviewer,
  getPullRequestWorkItemRefs: mockGetPullRequestWorkItemRefs,
  getPullRequestIterations: mockGetPullRequestIterations,
  getPullRequestIterationChanges: mockGetPullRequestIterationChanges,
  getBranches: mockGetBranches,
  updateRefs: mockUpdateRefs,
  getRepository: mockGetRepository,
  getRepositories: mockGetRepositories,
  getItems: mockGetItems,
  getItemContent: mockGetItemContent,
  getBlobContent: mockGetBlobContent,
  getPullRequestById: mockGetPullRequestById,
  getCommits: mockGetCommits,
};

const mockWorkItemTrackingApi = {
  getWorkItems: mockGetWorkItems,
};

vi.mock('azure-devops-node-api', () => {
  class MockWebApi {
    constructor() {}
    getGitApi = vi.fn().mockResolvedValue(mockGitApi);
    getWorkItemTrackingApi = vi.fn().mockResolvedValue(mockWorkItemTrackingApi);
    getPolicyApi = vi.fn().mockResolvedValue({ getPolicyEvaluations: vi.fn().mockResolvedValue([]) });
    getCoreApi = vi.fn().mockResolvedValue({ getProject: vi.fn().mockResolvedValue({ id: 'proj-guid' }) });
    connect = mockConnect;
  }
  return {
    WebApi: MockWebApi,
    getPersonalAccessTokenHandler: vi.fn().mockReturnValue({}),
  };
});

// Import after mocking
import { GitService } from './GitService';

const DEFAULT_PROJECT = 'DefaultProject';
const OVERRIDE_PROJECT = 'OverrideProject';

function createService(): GitService {
  return new GitService({
    orgUrl: 'https://dev.azure.com/test',
    project: DEFAULT_PROJECT,
    personalAccessToken: 'fake-pat',
  });
}

describe('GitService project parameter propagation', () => {
  let service: GitService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = createService();
  });

  // ── getPullRequestComments ──────────────────────────────────────

  describe('getPullRequestComments', () => {
    it('uses config.project by default', async () => {
      await service.getPullRequestComments({
        repository: 'c5e7435f-113e-4328-9d8a-726f094bfa95',
        pullRequestId: 42,
      });

      expect(mockGetThreads).toHaveBeenCalledWith(
        'c5e7435f-113e-4328-9d8a-726f094bfa95', 42, DEFAULT_PROJECT
      );
    });

    it('uses override project when provided', async () => {
      await service.getPullRequestComments({
        repository: 'c5e7435f-113e-4328-9d8a-726f094bfa95',
        pullRequestId: 42,
        project: OVERRIDE_PROJECT,
      });

      expect(mockGetThreads).toHaveBeenCalledWith(
        'c5e7435f-113e-4328-9d8a-726f094bfa95', 42, OVERRIDE_PROJECT
      );
    });

    it('uses override project for single thread retrieval', async () => {
      await service.getPullRequestComments({
        repository: 'c5e7435f-113e-4328-9d8a-726f094bfa95',
        pullRequestId: 42,
        threadId: 7,
        project: OVERRIDE_PROJECT,
      });

      expect(mockGetPullRequestThread).toHaveBeenCalledWith(
        'c5e7435f-113e-4328-9d8a-726f094bfa95', 42, 7, OVERRIDE_PROJECT
      );
    });
  });

  // ── addPullRequestComment ──────────────────────────────────────

  describe('addPullRequestComment', () => {
    it('uses config.project by default', async () => {
      await service.addPullRequestComment({
        repository: 'c5e7435f-113e-4328-9d8a-726f094bfa95',
        pullRequestId: 42,
        comment: 'LGTM',
      });

      expect(mockCreateThread).toHaveBeenCalledWith(
        expect.any(Object),
        'c5e7435f-113e-4328-9d8a-726f094bfa95',
        42,
        DEFAULT_PROJECT
      );
    });

    it('uses override project when provided', async () => {
      await service.addPullRequestComment({
        repository: 'c5e7435f-113e-4328-9d8a-726f094bfa95',
        pullRequestId: 42,
        comment: 'LGTM',
        project: OVERRIDE_PROJECT,
      });

      expect(mockCreateThread).toHaveBeenCalledWith(
        expect.any(Object),
        'c5e7435f-113e-4328-9d8a-726f094bfa95',
        42,
        OVERRIDE_PROJECT
      );
    });
  });

  // ── addPullRequestFileComment ──────────────────────────────────

  describe('addPullRequestFileComment', () => {
    it('uses override project when provided', async () => {
      await service.addPullRequestFileComment({
        repository: 'c5e7435f-113e-4328-9d8a-726f094bfa95',
        pullRequestId: 42,
        path: '/src/foo.ts',
        comment: 'This file needs tests',
        project: OVERRIDE_PROJECT,
      });

      expect(mockCreateThread).toHaveBeenCalledWith(
        expect.any(Object),
        'c5e7435f-113e-4328-9d8a-726f094bfa95',
        42,
        OVERRIDE_PROJECT
      );
    });
  });

  // ── replyToComment ─────────────────────────────────────────────

  describe('replyToComment', () => {
    it('uses config.project by default', async () => {
      await service.replyToComment({
        repository: 'c5e7435f-113e-4328-9d8a-726f094bfa95',
        pullRequestId: 42,
        threadId: 7,
        comment: 'Fixed',
      });

      expect(mockCreateComment).toHaveBeenCalledWith(
        expect.any(Object),
        'c5e7435f-113e-4328-9d8a-726f094bfa95',
        42,
        7,
        DEFAULT_PROJECT
      );
    });

    it('uses override project when provided', async () => {
      await service.replyToComment({
        repository: 'c5e7435f-113e-4328-9d8a-726f094bfa95',
        pullRequestId: 42,
        threadId: 7,
        comment: 'Fixed',
        project: OVERRIDE_PROJECT,
      });

      expect(mockCreateComment).toHaveBeenCalledWith(
        expect.any(Object),
        'c5e7435f-113e-4328-9d8a-726f094bfa95',
        42,
        7,
        OVERRIDE_PROJECT
      );
    });
  });

  // ── updatePullRequestThread ────────────────────────────────────

  describe('updatePullRequestThread', () => {
    it('uses config.project by default', async () => {
      await service.updatePullRequestThread({
        repository: 'c5e7435f-113e-4328-9d8a-726f094bfa95',
        pullRequestId: 42,
        threadId: 7,
        status: 'fixed',
      });

      expect(mockUpdateThread).toHaveBeenCalledWith(
        expect.any(Object),
        'c5e7435f-113e-4328-9d8a-726f094bfa95',
        42,
        7,
        DEFAULT_PROJECT
      );
    });

    it('uses override project when provided', async () => {
      await service.updatePullRequestThread({
        repository: 'c5e7435f-113e-4328-9d8a-726f094bfa95',
        pullRequestId: 42,
        threadId: 7,
        status: 'closed',
        project: OVERRIDE_PROJECT,
      });

      expect(mockUpdateThread).toHaveBeenCalledWith(
        expect.any(Object),
        'c5e7435f-113e-4328-9d8a-726f094bfa95',
        42,
        7,
        OVERRIDE_PROJECT
      );
    });
  });

  // ── getPullRequests ────────────────────────────────────────────

  describe('getPullRequests', () => {
    it('uses override project when provided', async () => {
      await service.getPullRequests({
        repository: 'c5e7435f-113e-4328-9d8a-726f094bfa95',
        project: OVERRIDE_PROJECT,
      });

      expect(mockGetPullRequests).toHaveBeenCalledWith(
        'c5e7435f-113e-4328-9d8a-726f094bfa95',
        expect.any(Object),
        OVERRIDE_PROJECT,
        undefined,
        0,
        50
      );
    });
  });

  // ── createPullRequest ──────────────────────────────────────────

  describe('createPullRequest', () => {
    it('uses override project when provided', async () => {
      await service.createPullRequest({
        repository: 'c5e7435f-113e-4328-9d8a-726f094bfa95',
        sourceRefName: 'refs/heads/feature',
        targetRefName: 'refs/heads/main',
        title: 'My PR',
        project: OVERRIDE_PROJECT,
      });

      expect(mockCreatePullRequest).toHaveBeenCalledWith(
        expect.any(Object),
        'c5e7435f-113e-4328-9d8a-726f094bfa95',
        OVERRIDE_PROJECT
      );
    });
  });

  // ── getPullRequest ─────────────────────────────────────────────

  describe('getPullRequest', () => {
    it('uses override project when provided', async () => {
      await service.getPullRequest({
        repository: 'c5e7435f-113e-4328-9d8a-726f094bfa95',
        pullRequestId: 42,
        project: OVERRIDE_PROJECT,
      });

      expect(mockGetPullRequest).toHaveBeenCalledWith(
        'c5e7435f-113e-4328-9d8a-726f094bfa95',
        42,
        OVERRIDE_PROJECT
      );
    });
  });

  // ── approvePullRequest ─────────────────────────────────────────

  describe('approvePullRequest', () => {
    it('uses override project when provided', async () => {
      await service.approvePullRequest({
        repository: 'c5e7435f-113e-4328-9d8a-726f094bfa95',
        pullRequestId: 42,
        project: OVERRIDE_PROJECT,
      });

      expect(mockCreatePullRequestReviewer).toHaveBeenCalledWith(
        { vote: 10 },
        'c5e7435f-113e-4328-9d8a-726f094bfa95',
        42,
        'user-123',
        OVERRIDE_PROJECT
      );
    });
  });

  // ── mergePullRequest ───────────────────────────────────────────

  describe('mergePullRequest', () => {
    it('uses override project when provided', async () => {
      await service.mergePullRequest({
        repository: 'c5e7435f-113e-4328-9d8a-726f094bfa95',
        pullRequestId: 42,
        project: OVERRIDE_PROJECT,
      });

      expect(mockUpdatePullRequest).toHaveBeenCalledWith(
        expect.objectContaining({ status: 3 }),
        'c5e7435f-113e-4328-9d8a-726f094bfa95',
        42,
        OVERRIDE_PROJECT
      );
    });
  });

  // ── updatePullRequest ──────────────────────────────────────────

  describe('updatePullRequest', () => {
    it('uses override project when provided', async () => {
      await service.updatePullRequest({
        repository: 'c5e7435f-113e-4328-9d8a-726f094bfa95',
        pullRequestId: 42,
        title: 'New Title',
        project: OVERRIDE_PROJECT,
      });

      expect(mockUpdatePullRequest).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'New Title' }),
        'c5e7435f-113e-4328-9d8a-726f094bfa95',
        42,
        OVERRIDE_PROJECT
      );
    });
  });

  // ── updatePullRequestReviewers ─────────────────────────────────

  describe('updatePullRequestReviewers', () => {
    it('uses override project for adding reviewers', async () => {
      await service.updatePullRequestReviewers({
        repository: 'c5e7435f-113e-4328-9d8a-726f094bfa95',
        pullRequestId: 42,
        reviewersToAdd: ['user-abc'],
        project: OVERRIDE_PROJECT,
      });

      expect(mockCreatePullRequestReviewer).toHaveBeenCalledWith(
        expect.any(Object),
        'c5e7435f-113e-4328-9d8a-726f094bfa95',
        42,
        'user-abc',
        OVERRIDE_PROJECT
      );
    });

    it('uses override project for removing reviewers', async () => {
      await service.updatePullRequestReviewers({
        repository: 'c5e7435f-113e-4328-9d8a-726f094bfa95',
        pullRequestId: 42,
        reviewersToRemove: ['user-xyz'],
        project: OVERRIDE_PROJECT,
      });

      expect(mockDeletePullRequestReviewer).toHaveBeenCalledWith(
        'c5e7435f-113e-4328-9d8a-726f094bfa95',
        42,
        'user-xyz',
        OVERRIDE_PROJECT
      );
    });
  });

  // ── createBranch ───────────────────────────────────────────────

  describe('createBranch', () => {
    it('uses override project when provided', async () => {
      await service.createBranch({
        repository: 'c5e7435f-113e-4328-9d8a-726f094bfa95',
        branchName: 'feature/new',
        sourceRef: 'main',
        project: OVERRIDE_PROJECT,
      });

      expect(mockGetBranches).toHaveBeenCalledWith('c5e7435f-113e-4328-9d8a-726f094bfa95', OVERRIDE_PROJECT);
      expect(mockUpdateRefs).toHaveBeenCalledWith(
        expect.any(Array),
        'c5e7435f-113e-4328-9d8a-726f094bfa95',
        OVERRIDE_PROJECT
      );
    });
  });

  // ── browseRepository ─────────────────────────────────────────

  describe('browseRepository', () => {
    it('uses override project for resolveRepositoryId', async () => {
      await service.browseRepository({
        repository: 'MyRepo',
        project: OVERRIDE_PROJECT,
      });

      expect(mockGetRepositories).toHaveBeenCalledWith(
        OVERRIDE_PROJECT, undefined, undefined
      );
    });
  });

  // ── getFileContent ──────────────────────────────────────────

  describe('getFileContent', () => {
    it('uses override project for resolveRepositoryId', async () => {
      await service.getFileContent({
        repository: 'MyRepo',
        path: '/src/index.ts',
        project: OVERRIDE_PROJECT,
      });

      expect(mockGetRepositories).toHaveBeenCalledWith(
        OVERRIDE_PROJECT, undefined, undefined
      );
    });
  });

  // ── getCommitHistory ────────────────────────────────────────

  describe('getCommitHistory', () => {
    it('uses projectId for resolveRepositoryId and API call', async () => {
      await service.getCommitHistory({
        repository: 'MyRepo',
        projectId: OVERRIDE_PROJECT,
      });

      expect(mockGetRepositories).toHaveBeenCalledWith(
        OVERRIDE_PROJECT, undefined, undefined
      );
      expect(mockGetCommits).toHaveBeenCalledWith(
        REPO_GUID,
        expect.any(Object),
        OVERRIDE_PROJECT
      );
    });
  });

  // ── getPullRequestWorkItemRefs ──────────────────────────────

  describe('getPullRequestWorkItemRefs', () => {
    it('uses override project when provided', async () => {
      await service.getPullRequestWorkItemRefs(REPO_GUID, 42, OVERRIDE_PROJECT);

      expect(mockGetPullRequestWorkItemRefs).toHaveBeenCalledWith(
        REPO_GUID, 42, OVERRIDE_PROJECT
      );
    });

    it('uses config.project by default', async () => {
      await service.getPullRequestWorkItemRefs(REPO_GUID, 42);

      expect(mockGetPullRequestWorkItemRefs).toHaveBeenCalledWith(
        REPO_GUID, 42, DEFAULT_PROJECT
      );
    });
  });

  // ── getPolicyEvaluations ────────────────────────────────────

  describe('getPolicyEvaluations', () => {
    it('uses override project when provided', async () => {
      const mockGetPolicyEvaluations = vi.fn().mockResolvedValue([]);
      const mockGetProject = vi.fn().mockResolvedValue({ id: 'proj-guid' });

      // Access the mock to set up the policy and core APIs
      const policyApi = await (service as any).connection.getPolicyApi();
      policyApi.getPolicyEvaluations = mockGetPolicyEvaluations;
      const coreApi = await (service as any).connection.getCoreApi();
      coreApi.getProject = mockGetProject;

      await service.getPolicyEvaluations(REPO_GUID, 42, OVERRIDE_PROJECT);

      expect(mockGetProject).toHaveBeenCalledWith(OVERRIDE_PROJECT);
      expect(mockGetPolicyEvaluations).toHaveBeenCalledWith(
        OVERRIDE_PROJECT,
        expect.stringContaining('proj-guid')
      );
    });
  });

  // ── completePullRequest ─────────────────────────────────────

  describe('completePullRequest', () => {
    it('uses override project for resolveRepositoryId', async () => {
      await service.completePullRequest({
        repository: 'MyRepo',
        pullRequestId: 42,
        status: 'completed',
        mergeStrategy: 'squash',
        project: OVERRIDE_PROJECT,
      });

      expect(mockGetRepositories).toHaveBeenCalledWith(
        OVERRIDE_PROJECT, undefined, undefined
      );
    });
  });

  // ── getPullRequestChangesCount ──────────────────────────────

  describe('getPullRequestChangesCount', () => {
    it('passes project through to getLatestPullRequestIteration', async () => {
      await service.getPullRequestChangesCount({
        repository: REPO_GUID,
        pullRequestId: 42,
        project: OVERRIDE_PROJECT,
      });

      // getLatestPullRequestIteration calls getPullRequestIterations with project
      expect(mockGetPullRequestIterations).toHaveBeenCalledWith(
        REPO_GUID, 42, OVERRIDE_PROJECT
      );
      // getPullRequestIterationChanges also uses project
      expect(mockGetPullRequestIterationChanges).toHaveBeenCalledWith(
        REPO_GUID, 42, 1, OVERRIDE_PROJECT
      );
    });
  });

  // ── resolveRepositoryId with project override ──────────────────

  describe('resolveRepositoryId with project override', () => {
    it('passes project to listRepositories when resolving repo name', async () => {
      // Use a repository name (not a GUID) to trigger resolution
      await service.getPullRequestComments({
        repository: 'MyRepo',
        pullRequestId: 42,
        project: OVERRIDE_PROJECT,
      });

      // resolveRepositoryId calls listRepositories which calls getRepositories
      // The first arg should be the override project
      expect(mockGetRepositories).toHaveBeenCalledWith(
        OVERRIDE_PROJECT,
        undefined,
        undefined
      );
      // And the resolved GUID should be used for getThreads
      expect(mockGetThreads).toHaveBeenCalledWith(
        REPO_GUID, 42, OVERRIDE_PROJECT
      );
    });
  });
});
