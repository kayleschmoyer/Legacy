# Merge Queue Usage Guide

## 🚀 How to Use the Label-Based Merge Queue

### Quick Start

1. **Add to Queue**: Add the `merge-when-ready` label to your PR
2. **Monitor**: The merge queue will automatically process your PR
3. **Remove from Queue**: Remove the `merge-when-ready` label to exit the queue

### Detailed Workflow

#### ✅ Adding a PR to the Merge Queue

**Method 1: Via GitHub UI**
1. Go to your pull request
2. Click on the "Labels" section on the right sidebar
3. Add the `merge-when-ready` label
4. The system will automatically post a confirmation comment

**Method 2: Via Git CLI** (if you have the GitHub CLI installed)
```bash
gh pr edit --add-label "merge-when-ready"
```

#### ⏹️ Removing a PR from the Merge Queue

**Method 1: Via GitHub UI**
1. Go to your pull request  
2. Click on the "Labels" section
3. Remove the `merge-when-ready` label
4. The system will post a confirmation comment

**Method 2: Via Git CLI**
```bash
gh pr edit --remove-label "merge-when-ready"
```

### 🔄 How the Merge Queue Works

#### Automatic Processing
- **Immediate Check**: When you add the label, the queue processes immediately
- **Status Monitoring**: Responds to CI status changes automatically  
- **Regular Polling**: Checks every 10 minutes as backup

#### Merge Requirements
Your PR will be merged automatically when **ALL** of these conditions are met:

✅ **Not in draft state**  
✅ **All required status checks passing**  
✅ **At least one approved review** (if required)  
✅ **No merge conflicts**  
✅ **Branch is up to date** (GitHub handles this automatically)

#### What Happens When Requirements Aren't Met

The merge queue will post a detailed comment explaining:
- **Specific issue** preventing merge
- **Step-by-step instructions** to resolve the issue  
- **Automatic retry** once issues are resolved

### 📊 Merge Queue Behavior

#### Triggers
- ⚡ **Immediate**: When `merge-when-ready` label is added
- 🔄 **Responsive**: When CI status checks complete
- ⏰ **Regular**: Every 10 minutes for reliability

#### Merge Method
- **Squash and Merge**: Creates clean commit history
- **Automatic Title**: Uses PR title + number format
- **Commit Message**: Includes original PR body

#### Success Notifications
When your PR is merged, you'll get:
- ✅ **Success comment** with merge details
- 📧 **GitHub notification** (if enabled)
- 🏷️ **Automatic label removal**

### 🛠️ Manual Controls

#### Manual Processing
You can manually trigger the merge queue:
```bash
# Via GitHub Actions UI: Go to Actions → Enhanced Merge Queue → Run workflow
```

#### Dry Run Mode
Test the merge queue without actually merging:
```bash
# Enable "dry_run" in the manual workflow trigger
# This will show what would happen without making changes
```

### 🚨 Troubleshooting

#### Common Issues

**"PR requires at least one approval"**
- Request review from a team member
- Address any review feedback
- Obtain approval

**"PR has merge conflicts"** 
```bash
git checkout main
git pull origin main  
git checkout your-branch
git merge main
# Resolve conflicts
git push origin your-branch
```

**"Status checks failing"**
- Check the CI pipeline results
- Fix any failing tests or linting issues
- Push fixes to trigger re-run

**"GitHub is still calculating mergeable state"**
- This is temporary - the queue will retry automatically
- Usually resolves within 1-2 minutes

#### Emergency Procedures

**Queue is stuck**: 
1. Remove and re-add the `merge-when-ready` label
2. Manually trigger the workflow via GitHub Actions

**Need immediate merge**:
1. Remove the label to exit the queue
2. Manually merge via GitHub UI or CLI

### 📈 Benefits of Label-Based Approach

✅ **GitHub Native**: Uses familiar label interface  
✅ **Visual**: Easy to see queue status in PR list  
✅ **Fast**: Immediate processing when label added  
✅ **Flexible**: Easy to add/remove from queue  
✅ **Trackable**: Clear audit trail of queue changes  

### 🎯 Best Practices

1. **Add label after approval**: Wait for reviews before adding to queue
2. **Monitor notifications**: Watch for merge queue comments  
3. **Keep branches updated**: Regularly sync with main branch
4. **Fix issues quickly**: Address merge blockers promptly
5. **Use dry run**: Test merge queue behavior when setting up

---

*For technical details about the merge queue implementation, see `.github/workflows/merge-queue.yml` and `.github/workflows/merge-queue-management.yml`.*