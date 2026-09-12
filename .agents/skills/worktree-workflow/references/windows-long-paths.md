# Known Limitation: Native Android Builds and Windows MAX_PATH

> Loaded from [worktree-workflow SKILL](../SKILL.md).

## Known limitation: native Android builds and Windows MAX_PATH

Native Android builds (`expo run:android`, `./gradlew assembleDebug|assembleRelease`) from a `.claude/worktrees/` checkout can fail on Windows with a CMake `CMAKE_OBJECT_PATH_MAX` warning followed by a cascading `ninja: error: manifest 'build.ninja' still dirty after 100 tries`, or with `ninja: error: mkdir(...): No such file or directory` (LS-8811, LS-9443).

**Root cause**: Windows `MAX_PATH` (260 chars) / CMake's own `CMAKE_OBJECT_PATH_MAX` (250 chars). A worktree checkout already lives ~70+ characters deep (`.claude/worktrees/<ticket>-<hash>/`), and its `node_modules` is a symlink into the pooled slot (`.modules-pool/<hash>/node_modules`, ~30 chars longer than a plain `node_modules`). Deeply-nested native module sources (e.g. `react-native-reanimated`'s `Common/cpp/reanimated/LayoutAnimations/LayoutAnimationsProxy_Experimental.cpp`, or `react-native-iap`'s nitrogen-generated C++) push the CMake/ninja object-file path over the limit. Nothing is wrong with the module or the build config — it's purely path length.

**Confirmed non-fixes** — don't spend time re-discovering these:

- `subst X: <worktree>` and NTFS junctions (`mklink /J`) both shrink the _visible_ path, but `expo-modules-autolinking` realpaths through both back to the true long path internally (`apps/app/android/build/generated/autolinking/autolinking.json` still records the long path even when Gradle was invoked from the short one). This causes a second, unrelated Gradle failure (`IllegalArgumentException: this and base files have different roots`) mixing short/long roots in one relative-path computation.
- `NODE_OPTIONS=--preserve-symlinks` doesn't help — `subst` is a DOS device mapping, not an NTFS reparse point, so Node's symlink flags don't apply to it.

**The real fix** is a one-time, per-machine OS setting — out of scope for an agent to flip autonomously (system/security setting, requires admin + reboot):

```powershell
New-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem' -Name LongPathsEnabled -Value 1 -PropertyType DWORD -Force
```

then reboot.

**What to do as an agent**: `node scripts/run-android-dev.mjs --check` (or any real invocation) preflights `LongPathsEnabled` on Windows and prints the remediation above whenever it's not `1` — this is a warning, not a hard block, since not every build path is long enough to hit the limit. If a native Android build fails with either symptom above, don't re-diagnose from scratch or attempt `subst`/junction workarounds (proven not to work, see above) — tell the user it's the known Windows long-path limitation and point them at the one-time fix. See also [dev-environment's mobile section](../../dev-environment/SKILL.md#android-native-builds-on-windows-long-path-limitation).
