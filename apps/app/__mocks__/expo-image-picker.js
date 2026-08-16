// Manual Jest mock for expo-image-picker (LS-9445).
//
// expo-image-picker binds to the ExponentImagePicker native module via
// expo-modules-core, which does not exist under Jest — requiring the real
// package throws during module evaluation. BugReportModal imports it
// statically (the convention for every other expo module in apps/app), so
// every spec that renders that modal — directly, or transitively through
// app/(app)/help.tsx — needs this stub.
//
// __esModule: true is required for correct ES module interop; see the
// expo-constants mock alongside this file for the full explanation.
//
// The defaults describe the inert "permission granted, user cancelled" path so
// suites that never open the picker are unaffected. Specs that exercise it
// override per-call with mockResolvedValueOnce.
module.exports = {
  __esModule: true,
  requestMediaLibraryPermissionsAsync: jest.fn(() =>
    Promise.resolve({ granted: true }),
  ),
  launchImageLibraryAsync: jest.fn(() =>
    Promise.resolve({ canceled: true, assets: [] }),
  ),
};
