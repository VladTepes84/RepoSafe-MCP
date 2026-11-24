/** Type declaration for the existing bounded public GitHub transport. */
export function createGithubSnapshot(raw: string, signal?: AbortSignal): Promise<{
  root: string;
  url: string;
  sha: string;
  files: number;
  bytes: number;
}>;
