import { describe, expect, it } from 'vitest';
import { getBuildLinks } from './build-info';

const repositoryUrl = 'https://github.com/rotki/migration-assistant';

describe('getBuildLinks', () => {
  it('links the release, the commit and the build run of a release build', () => {
    const links = getBuildLinks({
      repositoryUrl,
      commitSha: '0123456789abcdef0123456789abcdef01234567',
      buildRunUrl: `${repositoryUrl}/actions/runs/42`,
      version: 'v0.2.0',
    });

    expect(links).toEqual({
      repositoryUrl,
      version: 'v0.2.0',
      releaseUrl: `${repositoryUrl}/releases/tag/v0.2.0`,
      attestationsUrl: `${repositoryUrl}/attestations`,
      shortSha: '0123456',
      commitUrl: `${repositoryUrl}/commit/0123456789abcdef0123456789abcdef01234567`,
      buildRunUrl: `${repositoryUrl}/actions/runs/42`,
    });
  });

  it('leaves out the links a local build cannot provide', () => {
    const links = getBuildLinks({ repositoryUrl, commitSha: '', buildRunUrl: '', version: '' });

    expect(links).toEqual({
      repositoryUrl,
      version: undefined,
      releaseUrl: undefined,
      attestationsUrl: `${repositoryUrl}/attestations`,
      shortSha: undefined,
      commitUrl: undefined,
      buildRunUrl: undefined,
    });
  });
});
