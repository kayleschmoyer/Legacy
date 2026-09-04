import { describe, expect, it, jest } from '@jest/globals';

import { classifyForceRemoveFailure } from './classify-force-remove-failure';

describe('classifyForceRemoveFailure', () => {
  it('is a genuine failure when the worktree is still registered', () => {
    const isEmptyDir = jest.fn<() => boolean>().mockReturnValue(true);

    const result = classifyForceRemoveFailure({
      stillRegistered: true,
      pathExists: true,
      isEmptyDir,
    });

    expect(result).toEqual({ partial: false, leftoverEmptyDir: false });
    expect(isEmptyDir).not.toHaveBeenCalled();
  });

  it('is a partial success with no leftover when the directory is fully gone', () => {
    const isEmptyDir = jest.fn<() => boolean>();

    const result = classifyForceRemoveFailure({
      stillRegistered: false,
      pathExists: false,
      isEmptyDir,
    });

    expect(result).toEqual({ partial: true, leftoverEmptyDir: false });
    expect(isEmptyDir).not.toHaveBeenCalled();
  });

  it('is a partial success with a leftover note when an empty directory remains (LS-9403)', () => {
    const isEmptyDir = jest.fn<() => boolean>().mockReturnValue(true);

    const result = classifyForceRemoveFailure({
      stillRegistered: false,
      pathExists: true,
      isEmptyDir,
    });

    expect(result).toEqual({ partial: true, leftoverEmptyDir: true });
    expect(isEmptyDir).toHaveBeenCalledTimes(1);
  });

  it('is a genuine failure when the directory is deregistered but non-empty', () => {
    const isEmptyDir = jest.fn<() => boolean>().mockReturnValue(false);

    const result = classifyForceRemoveFailure({
      stillRegistered: false,
      pathExists: true,
      isEmptyDir,
    });

    expect(result).toEqual({ partial: false, leftoverEmptyDir: false });
  });
});
