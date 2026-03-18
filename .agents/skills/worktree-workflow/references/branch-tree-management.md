# Branch Tree Management

## View Branch Tree

```powershell
twig tree
```

## Reading the Tree Output

```
main
├── LS-7/design-league-scoring-data-model                  [+23]
│   └── LS-17/set-up-matchup-system (current)              [+1]
│       └── LS-18/extend-matchup-schema                    [+1]
└── LS-10/refactor-scoring-library                         [+15/-1]
```

- `[+1]` = 1 unique commit (clean)
- `[+25]` = 25 commits (likely has duplicates)
- `[+23/-24]` = Many changes (definitely has duplicates)

## Rebase Tree

```powershell
# Interactive rebase of entire tree (recommended)
make rebase-tree

# Auto-rebase (no prompts)
make rebase-tree-auto

# Skip specific commits after squashing
make rebase-tree-skip SKIP_COMMITS_FILE="skip-commits.txt"
```

> Always use `--no-edit` with `git rebase` so git never opens a text editor.

## Cascade Rebase

```powershell
git checkout parent-branch
twig cascade --show-graph --autostash
```

## Skip-Commits Pattern (After Squashing)

```powershell
# 1. Squash parent
git checkout LS-23/parent-branch
git rebase -i main

# 2. Identify old commits in child
git checkout LS-24/child-branch
git log --oneline LS-23/parent-branch..HEAD

# 3. Create skip file
@"
abc1234  # Old commit removed during squash
def5678  # Another old commit
"@ | Out-File skip-commits.txt

# 4. Rebase skipping those commits
make rebase-tree-skip SKIP_COMMITS_FILE="skip-commits.txt"

# 5. Verify
twig tree  # All should show [+1]
```

## Creating Dependent Branches

```powershell
# Plan the tree structure first:
# LS-17: Base setup (from main)
# LS-18: Database (from LS-17)
# LS-19: GraphQL (from LS-18)

# Create each dependent branch
git checkout LS-17/branch-name
twig switch LS-18 -p=current

# Verify after each creation
twig tree
```

## Troubleshooting

- **High commit count**: Use skip-commits to rebase cleanly
- **Branch not in tree**: Run `twig init` or `twig branch --set-parent parent-branch`
- **Lost commits after rebase**: Use `git reflog` then `git reset --hard HEAD@{N}`
