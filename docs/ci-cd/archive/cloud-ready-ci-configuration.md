> **Archived 2026-04-27.** This document describes a system that has been replaced. See [ci-greenfield-design.md](../ci-greenfield-design.md) for the current architecture.

---

# Cloud-Ready CI Pipeline Configuration

This file shows the optimized CI configuration that automatically adapts based on Nx Cloud availability.

## Environment Variables (Cloud-Aware)

```yaml
env:
  # Nx Cloud configuration (conditional)
  NX_CLOUD_ACCESS_TOKEN: ${{ secrets.NX_CLOUD_ACCESS_TOKEN }}

  # Adaptive settings based on cloud availability
  NX_DAEMON: false # Always disabled in CI
  NX_PARALLEL: ${{ secrets.NX_CLOUD_ACCESS_TOKEN != '' && '8' || '4' }}
  NX_CLOUD_DISTRIBUTED_EXECUTION: ${{ secrets.NX_CLOUD_ACCESS_TOKEN != '' && 'true' || 'false' }}
  NX_CLOUD_TIMEOUT: 600000

  # Cache configuration
  NX_CACHE_DIRECTORY: .nx-cache
  NX_SKIP_NX_CACHE: false

  # Performance tuning (adaptive)
  NODE_OPTIONS: ${{ secrets.NX_CLOUD_ACCESS_TOKEN != '' && '--max_old_space_size=6144' || '--max_old_space_size=4096' }}

  # Debug mode
  NX_VERBOSE_LOGGING: ${{ github.event.inputs.debug_mode == 'true' || contains(github.event.pull_request.labels.*.name, 'ci-debug') }}
```

## Cloud Detection Step

```yaml
- name: '☁️ Detect Nx Cloud Availability'
  id: cloud-detect
  run: |
    if [ -n "$NX_CLOUD_ACCESS_TOKEN" ]; then
      echo "cloud-available=true" >> $GITHUB_OUTPUT
      echo "execution-mode=distributed" >> $GITHUB_OUTPUT
      echo "agents=8" >> $GITHUB_OUTPUT
      echo "::notice::Nx Cloud detected - enabling distributed execution"
    else
      echo "cloud-available=false" >> $GITHUB_OUTPUT  
      echo "execution-mode=local" >> $GITHUB_OUTPUT
      echo "agents=4" >> $GITHUB_OUTPUT
      echo "::notice::Nx Cloud not available - using local execution"
    fi
```

## Adaptive Task Execution

```yaml
# Cloud-optimized execution
- name: '⚡ Code Quality (Distributed)'
  if: steps.cloud-detect.outputs.cloud-available == 'true'
  run: |
    echo "::group::🚀 Starting Nx Cloud Distributed Execution"

    # Start DTE agents
    pnpm exec nx-cloud start-ci-run --stop-agents-after="build" --agent-count=${{ steps.cloud-detect.outputs.agents }}

    # Distributed task execution with optimal parallelization  
    pnpm exec nx affected -t lint,typecheck --parallel=${{ steps.cloud-detect.outputs.agents }} --max-parallel=${{ steps.cloud-detect.outputs.agents }}

    echo "::endgroup::"

# Local fallback execution
- name: '🔄 Code Quality (Local)'
  if: steps.cloud-detect.outputs.cloud-available != 'true'
  run: |
    echo "::group::🏠 Local Execution Mode"

    # Sequential execution with local parallelization
    pnpm exec nx affected -t lint --parallel=4 --base=origin/main --head=HEAD
    pnpm exec nx affected -t typecheck --parallel=4 --base=origin/main --head=HEAD

    echo "::endgroup::"
```

## Performance Monitoring

```yaml
- name: '📊 Performance Analysis'
  if: always()
  run: |
    if [ "${{ steps.cloud-detect.outputs.cloud-available }}" == "true" ]; then
      # Nx Cloud performance metrics
      pnpm exec nx-cloud view-logs --json > cloud-metrics.json
      
      CACHE_HIT_RATE=$(cat cloud-metrics.json | jq -r '.cacheHitRate // "N/A"')
      AGENTS_USED=$(cat cloud-metrics.json | jq -r '.agentsUsed // "N/A"')
      TOTAL_TIME=$(cat cloud-metrics.json | jq -r '.totalTime // "N/A"')
      
      echo "## ☁️ Nx Cloud Performance Report" >> $GITHUB_STEP_SUMMARY
      echo "- **Execution Mode**: Distributed Task Execution" >> $GITHUB_STEP_SUMMARY
      echo "- **Cache Hit Rate**: ${CACHE_HIT_RATE}%" >> $GITHUB_STEP_SUMMARY
      echo "- **Agents Used**: ${AGENTS_USED}" >> $GITHUB_STEP_SUMMARY
      echo "- **Total Time**: ${TOTAL_TIME}s" >> $GITHUB_STEP_SUMMARY
    else
      # Local execution metrics  
      echo "## 🏠 Local Execution Report" >> $GITHUB_STEP_SUMMARY
      echo "- **Execution Mode**: Local (GitHub Actions)" >> $GITHUB_STEP_SUMMARY
      echo "- **Parallelization**: 4 processes" >> $GITHUB_STEP_SUMMARY
      echo "- **Cache**: Local Nx cache only" >> $GITHUB_STEP_SUMMARY
      echo "- **Note**: Add NX_CLOUD_ACCESS_TOKEN for distributed execution" >> $GITHUB_STEP_SUMMARY
    fi
```

## Complete Cloud-Ready Job Example

```yaml
jobs:
  ci-pipeline:
    name: 'CI Pipeline (Cloud-Ready)'
    runs-on: ubuntu-latest
    timeout-minutes: ${{ secrets.NX_CLOUD_ACCESS_TOKEN != '' && '30' || '60' }}

    outputs:
      cloud-available: ${{ steps.cloud-detect.outputs.cloud-available }}
      execution-mode: ${{ steps.cloud-detect.outputs.execution-mode }}

    steps:
      - name: '📂 Checkout Repository'
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: '⚙️ Setup Node.js'
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - name: '☁️ Detect Nx Cloud Availability'
        id: cloud-detect
        run: |
          if [ -n "$NX_CLOUD_ACCESS_TOKEN" ]; then
            echo "cloud-available=true" >> $GITHUB_OUTPUT
            echo "execution-mode=distributed" >> $GITHUB_OUTPUT
            echo "agents=8" >> $GITHUB_OUTPUT
            echo "::notice title=Nx Cloud::Distributed execution enabled with 8 agents"
          else
            echo "cloud-available=false" >> $GITHUB_OUTPUT
            echo "execution-mode=local" >> $GITHUB_OUTPUT  
            echo "agents=4" >> $GITHUB_OUTPUT
            echo "::notice title=Local Mode::Using GitHub Actions parallelization (4 processes)"
          fi

      - name: '📥 Install Dependencies'
        run: |
          npm ci --prefer-offline --no-audit

      - name: '⚡ Code Quality & Testing (Cloud)'
        if: steps.cloud-detect.outputs.cloud-available == 'true'
        run: |
          echo "::group::🚀 Nx Cloud Distributed Execution"

          # Start DTE with optimal agent count
          pnpm exec nx-cloud start-ci-run --stop-agents-after="build" \
            --agent-count=${{ steps.cloud-detect.outputs.agents }}

          # Execute tasks with maximum parallelization
          pnpm exec nx affected -t lint,typecheck,test,build \
            --parallel=${{ steps.cloud-detect.outputs.agents }} \
            --max-parallel=${{ steps.cloud-detect.outputs.agents }}
            
          echo "::endgroup::"

      - name: '🔄 Code Quality & Testing (Local)'
        if: steps.cloud-detect.outputs.cloud-available != 'true'
        run: |
          echo "::group::🏠 Local Execution with GitHub Actions"

          # Sequential stages with local parallelization
          pnpm exec nx affected -t lint --parallel=4 --base=origin/main --head=HEAD
          pnpm exec nx affected -t typecheck --parallel=4 --base=origin/main --head=HEAD  
          pnpm exec nx affected -t test --parallel=4 --base=origin/main --head=HEAD
          pnpm exec nx affected -t build --parallel=4 --base=origin/main --head=HEAD

          echo "::endgroup::"
```

## Implementation Steps

1. **Add the cloud detection logic** to your existing CI workflow
2. **Set up conditional execution** based on cloud availability
3. **Add performance monitoring** for both modes
4. **When ready**: Add `NX_CLOUD_ACCESS_TOKEN` to GitHub secrets
5. **Monitor performance** and adjust agent counts as needed

This configuration provides:

- ✅ **Automatic detection** of Nx Cloud availability
- ✅ **Seamless fallback** to local execution when cloud is unavailable
- ✅ **Performance monitoring** for both execution modes
- ✅ **Easy migration** when cloud allocation is restored
- ✅ **Zero breaking changes** to current workflow