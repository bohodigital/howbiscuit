export const REQUIRED_PI_PAGE_SIZE = 16384;

export function assertFullPagefindLane({ skipRequested, lane }) {
  if (skipRequested) {
    throw new Error(`${lane || 'This build lane'} may not skip Pagefind. Use the guarded Pi QA lane only.`);
  }
}

export function assertPiPagefindSkipAllowed({ platform, arch, pageSize }) {
  if (platform !== 'linux' || arch !== 'arm64' || pageSize !== REQUIRED_PI_PAGE_SIZE) {
    throw new Error(
      `The Pagefind exception requires Linux ARM64 with a ${REQUIRED_PI_PAGE_SIZE} byte page size; received ${platform}/${arch}/${pageSize}.`,
    );
  }
}
