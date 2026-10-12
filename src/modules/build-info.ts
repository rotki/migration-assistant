export interface BuildInfo {
  repositoryUrl: string;
  /** Empty for a build made outside a git checkout. */
  commitSha: string;
  /** The GitHub Actions run that built this deployment, empty for a local build. */
  buildRunUrl: string;
  /** The release tag, as `v0.2.0`; empty for a build that is not a release. */
  version: string;
}

export interface BuildLinks {
  repositoryUrl: string;
  version: string | undefined;
  releaseUrl: string | undefined;
  shortSha: string | undefined;
  commitUrl: string | undefined;
  buildRunUrl: string | undefined;
  attestationsUrl: string;
}

export function getBuildLinks(info: BuildInfo): BuildLinks {
  const { buildRunUrl, commitSha, repositoryUrl, version } = info;
  return {
    repositoryUrl,
    version: version || undefined,
    releaseUrl: version ? `${repositoryUrl}/releases/tag/${version}` : undefined,
    attestationsUrl: `${repositoryUrl}/attestations`,
    shortSha: commitSha ? commitSha.slice(0, 7) : undefined,
    commitUrl: commitSha ? `${repositoryUrl}/commit/${commitSha}` : undefined,
    buildRunUrl: buildRunUrl || undefined,
  };
}

export const buildLinks: BuildLinks = getBuildLinks({
  repositoryUrl: import.meta.env.VITE_REPOSITORY_URL,
  commitSha: import.meta.env.VITE_COMMIT_SHA,
  buildRunUrl: import.meta.env.VITE_BUILD_RUN_URL,
  version: import.meta.env.VITE_APP_VERSION,
});
