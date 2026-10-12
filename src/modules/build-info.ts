export interface BuildInfo {
  repositoryUrl: string;
  /** Empty for a build made outside a git checkout. */
  commitSha: string;
  /** The GitHub Actions run that built this deployment, empty for a local build. */
  buildRunUrl: string;
}

export interface BuildLinks {
  repositoryUrl: string;
  shortSha: string | undefined;
  commitUrl: string | undefined;
  buildRunUrl: string | undefined;
  attestationsUrl: string;
}

export function getBuildLinks(info: BuildInfo): BuildLinks {
  const { buildRunUrl, commitSha, repositoryUrl } = info;
  return {
    repositoryUrl,
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
});
