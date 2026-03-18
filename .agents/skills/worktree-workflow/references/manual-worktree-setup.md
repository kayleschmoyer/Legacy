# Manual Worktree Setup (without make wt-setup)

Use this if `make wt-setup` or `scripts/setup-worktree.ps1` is not available.

```powershell
$wt = (twig worktree list --porcelain 2>$null | Select-String "path:" | Where-Object { $_ -match "LS-####" } | ForEach-Object { ($_ -split "path: ")[1].Trim() })
# OR just set it manually:
$wt = "<path-from-twig-worktree-list>"

cd $wt

# Install all dependencies (pnpm + poetry) using the standard Makefile target
make install

# Copy .env from main repo
Copy-Item "D:\code\legacy-sports\.env" "$wt\.env"

# Junction .twig so twig shares branch dependency state with the main repo
# (junction = no admin required; symlink would require admin on Windows)
cmd /c mklink /J "$wt\.twig" "D:\code\legacy-sports\.twig"
```

> **Why junction not copy?** `.twig/state.json` tracks branch dependencies. Both the main repo and worktree must read/write the same file or twig commands (`twig tree`, `twig branch depend`, etc.) will diverge.
