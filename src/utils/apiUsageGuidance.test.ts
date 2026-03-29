import { describe, expect, it } from 'vitest';

import {
  analyzeWiql,
  buildListWorkItemsUsageProfile,
  buildSearchWorkItemsUsageProfile,
} from './apiUsageGuidance';

describe('apiUsageGuidance', () => {
  it('detects a performant bounded WIQL query', () => {
    const analysis = analyzeWiql(
      `SELECT [System.Id]
       FROM WorkItems
       WHERE
         [System.TeamProject] = @project
         AND [System.WorkItemType] = 'Bug'
         AND [System.State] = 'Active'
         AND [System.ChangedDate] >= @Today - 14
       ORDER BY [System.ChangedDate] DESC`,
      50,
      6,
    );

    expect(analysis.usesContains).toBe(false);
    expect(analysis.hasProjectFilter).toBe(true);
    expect(analysis.hasDateWindow).toBe(true);
    expect(analysis.narrowFilterCount).toBeGreaterThanOrEqual(3);
    expect(analysis.riskFlags).not.toContainEqual(expect.stringContaining('CONTAINS'));
  });

  it('flags expensive substring and revision-history patterns', () => {
    const analysis = analyzeWiql(
      `SELECT [System.Id]
       FROM WorkItems
       WHERE
         [System.TeamProject] = @project
         AND EVER [System.AssignedTo] = @Me
         AND [System.Title] CONTAINS 'login'`,
      250,
      18,
    );

    expect(analysis.usesContains).toBe(true);
    expect(analysis.usesEver).toBe(true);
    expect(analysis.riskFlags).toContainEqual(expect.stringContaining('CONTAINS'));
    expect(analysis.riskFlags).toContainEqual(expect.stringContaining('revision history'));
    expect(analysis.riskFlags).toContainEqual(expect.stringContaining('High top value'));
  });

  it('estimates low-cost list usage for selective queries', () => {
    const queryAnalysis = analyzeWiql(
      `SELECT [System.Id]
       FROM WorkItems
       WHERE
         [System.TeamProject] = @project
         AND [System.AssignedTo] = @Me
         AND [System.State] = 'Active'
         AND [System.ChangedDate] >= @Today - 7`,
      25,
      8,
    );

    const profile = buildListWorkItemsUsageProfile({
      resultCount: 25,
      top: 25,
      requestedFieldCount: 8,
      queryAnalysis,
    });

    expect(profile.estimatedAdoCalls).toBe(2);
    expect(profile.relativeCost).toBe('low');
  });

  it('marks searchWorkItems as high relative cost', () => {
    const profile = buildSearchWorkItemsUsageProfile({
      resultCount: 25,
      top: 25,
      requestedFieldCount: 8,
      query: `SELECT [System.Id]
              FROM WorkItems
              WHERE
                [System.TeamProject] = @project
                AND [System.Title] CONTAINS 'auth'`,
    });

    expect(profile.relativeCost).toBe('high');
    expect(profile.estimatedAdoCalls).toBe(2);
    expect(profile.bestFor[0]).toContain('free text');
  });
});