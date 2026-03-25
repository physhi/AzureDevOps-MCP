/**
 * Tests that the BuildService `project` parameter propagation works correctly.
 * Build APIs already had this working — these tests serve as regression protection.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetBuilds = vi.fn().mockResolvedValue([]);
const mockGetBuild = vi.fn().mockResolvedValue({ id: 1 });
const mockGetBuildLogs = vi.fn().mockResolvedValue([]);
const mockGetBuildLogLines = vi.fn().mockResolvedValue([]);
const mockGetBuildTimeline = vi.fn().mockResolvedValue({ records: [] });

const mockBuildApi = {
  getBuilds: mockGetBuilds,
  getBuild: mockGetBuild,
  getBuildLogs: mockGetBuildLogs,
  getBuildLogLines: mockGetBuildLogLines,
  getBuildTimeline: mockGetBuildTimeline,
  getBuildChanges: vi.fn().mockResolvedValue([]),
  getDefinitions: vi.fn().mockResolvedValue([]),
  getDefinition: vi.fn().mockResolvedValue({}),
  queueBuild: vi.fn().mockResolvedValue({}),
  getArtifacts: vi.fn().mockResolvedValue([]),
  getBuildWorkItemsRefs: vi.fn().mockResolvedValue([]),
};

vi.mock('azure-devops-node-api', () => {
  class MockWebApi {
    constructor() {}
    getBuildApi = vi.fn().mockResolvedValue(mockBuildApi);
    getGitApi = vi.fn().mockResolvedValue({
      getRepository: vi.fn().mockResolvedValue({ id: 'repo-guid' }),
    });
    connect = vi.fn().mockResolvedValue({ authenticatedUser: { id: 'user-123' } });
  }
  return {
    WebApi: MockWebApi,
    getPersonalAccessTokenHandler: vi.fn().mockReturnValue({}),
  };
});

import { BuildService } from './BuildService';

const DEFAULT_PROJECT = 'DefaultProject';
const OVERRIDE_PROJECT = 'OverrideProject';

function createService(): BuildService {
  return new BuildService({
    orgUrl: 'https://dev.azure.com/test',
    project: DEFAULT_PROJECT,
    personalAccessToken: 'fake-pat',
  });
}

describe('BuildService project parameter propagation', () => {
  let service: BuildService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = createService();
  });

  describe('getBuilds', () => {
    it('uses config.project by default', async () => {
      await service.getBuilds({});
      // First argument should be the project name
      expect(mockGetBuilds.mock.calls[0][0]).toBe(DEFAULT_PROJECT);
    });

    it('uses override project when provided', async () => {
      await service.getBuilds({ project: OVERRIDE_PROJECT });
      expect(mockGetBuilds.mock.calls[0][0]).toBe(OVERRIDE_PROJECT);
    });
  });

  describe('getBuild', () => {
    it('uses override project when provided', async () => {
      await service.getBuild({ buildId: 1, project: OVERRIDE_PROJECT });
      expect(mockGetBuild).toHaveBeenCalledWith(OVERRIDE_PROJECT, 1);
    });
  });

  describe('getBuildLogs', () => {
    it('uses override project for log metadata', async () => {
      await service.getBuildLogs({ buildId: 1, project: OVERRIDE_PROJECT });
      expect(mockGetBuildLogs).toHaveBeenCalledWith(OVERRIDE_PROJECT, 1);
    });

    it('uses override project for specific log lines', async () => {
      await service.getBuildLogs({ buildId: 1, logId: 5, project: OVERRIDE_PROJECT });
      expect(mockGetBuildLogLines).toHaveBeenCalledWith(
        OVERRIDE_PROJECT, 1, 5, undefined, undefined
      );
    });
  });

  describe('getBuildTimeline', () => {
    it('uses override project when provided', async () => {
      await service.getBuildTimeline({ buildId: 1, project: OVERRIDE_PROJECT });
      expect(mockGetBuildTimeline).toHaveBeenCalledWith(OVERRIDE_PROJECT, 1);
    });
  });
});
