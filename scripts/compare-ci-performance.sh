#!/bin/bash

# CI Performance Comparison Script
# Compares performance metrics between old and new CI systems
# Usage: ./compare-ci-performance.sh [--detailed]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

DETAILED=false
if [[ "$1" == "--detailed" ]]; then
    DETAILED=true
fi

echo -e "${BLUE}🔍 Comparing CI Performance: Old vs New System${NC}"
echo ""

# Check if GitHub CLI is available
if ! command -v gh &> /dev/null; then
    echo -e "${RED}❌ GitHub CLI (gh) is not installed. Please install it first.${NC}"
    echo "Visit: https://cli.github.com/"
    exit 1
fi

# Check if user is authenticated
if ! gh auth status &> /dev/null; then
    echo -e "${YELLOW}⚠️  Please authenticate with GitHub CLI first:${NC}"
    echo "gh auth login"
    exit 1
fi

echo -e "${CYAN}📊 Fetching workflow run data...${NC}"

# Get repository info
REPO=$(gh repo view --json owner,name --jq '.owner.login + "/" + .name')
echo "Repository: $REPO"
echo ""

# Fetch recent runs for both workflows
echo -e "${CYAN}Getting old CI system runs (PR Validation)...${NC}"
OLD_RUNS=$(gh api "repos/$REPO/actions/workflows/pr-validation.yml/runs" \
  --jq '.workflow_runs[:20] | map(select(.status == "completed"))[:15]' 2>/dev/null || echo '[]')

echo -e "${CYAN}Getting new CI system runs (CI Pipeline Improved)...${NC}"
NEW_RUNS=$(gh api "repos/$REPO/actions/workflows/ci-pipeline-improved.yml/runs" \
  --jq '.workflow_runs[:20] | map(select(.status == "completed"))[:15]' 2>/dev/null || echo '[]')

# Check if we have data for both systems
OLD_COUNT=$(echo "$OLD_RUNS" | jq 'length')
NEW_COUNT=$(echo "$NEW_RUNS" | jq 'length')

if [ "$OLD_COUNT" -eq 0 ]; then
    echo -e "${YELLOW}⚠️  No completed runs found for old CI system (pr-validation.yml)${NC}"
fi

if [ "$NEW_COUNT" -eq 0 ]; then
    echo -e "${YELLOW}⚠️  No completed runs found for new CI system (ci-pipeline-improved.yml)${NC}"
    echo "Make sure the new workflow has been run at least once."
    echo "Add 'ci-new' label to a PR to trigger it."
    exit 1
fi

echo -e "${GREEN}✅ Found $OLD_COUNT old system runs and $NEW_COUNT new system runs${NC}"
echo ""

# Calculate performance metrics
echo -e "${BLUE}📈 Performance Analysis${NC}"
echo "========================"

# Function to convert ISO date to epoch seconds
iso_to_epoch() {
    date -d "$1" +%s 2>/dev/null || date -j -f "%Y-%m-%dT%H:%M:%SZ" "$1" +%s 2>/dev/null
}

# Function to calculate duration statistics
calculate_stats() {
    local runs=$1
    local system_name=$2
    
    if [ "$(echo "$runs" | jq 'length')" -eq 0 ]; then
        echo -e "${YELLOW}No data available for $system_name${NC}"
        return
    fi
    
    # Calculate durations in minutes
    local durations=$(echo "$runs" | jq -r '.[] | 
        (.updated_at | fromdateiso8601) - (.created_at | fromdateiso8601) | . / 60')
    
    # Calculate statistics
    local avg=$(echo "$durations" | awk '{sum+=$1} END {if(NR>0) print sum/NR; else print 0}')
    local min=$(echo "$durations" | sort -n | head -1)
    local max=$(echo "$durations" | sort -n | tail -1)
    
    # Success rate
    local total=$(echo "$runs" | jq 'length')
    local successful=$(echo "$runs" | jq '[.[] | select(.conclusion == "success")] | length')
    local success_rate=$(echo "scale=1; $successful * 100 / $total" | bc -l 2>/dev/null || echo "0")
    
    echo -e "${CYAN}$system_name:${NC}"
    echo "  Average Duration: $(printf "%.1f" $avg) minutes"
    echo "  Min Duration: $(printf "%.1f" $min) minutes"
    echo "  Max Duration: $(printf "%.1f" $max) minutes"
    echo "  Success Rate: $successful/$total (${success_rate}%)"
    
    if [ "$DETAILED" = true ]; then
        echo "  Recent Runs:"
        echo "$runs" | jq -r '.[] | "    " + .created_at + " - " + .conclusion + " (" + 
            ((.updated_at | fromdateiso8601) - (.created_at | fromdateiso8601) | . / 60 | tostring | .[0:4]) + "min)"'
    fi
    echo ""
}

# Calculate statistics for both systems
if [ "$OLD_COUNT" -gt 0 ]; then
    calculate_stats "$OLD_RUNS" "Old CI System (PR Validation)"
fi

if [ "$NEW_COUNT" -gt 0 ]; then
    calculate_stats "$NEW_RUNS" "New CI System (Improved Pipeline)"
fi

# Performance comparison if we have both datasets
if [ "$OLD_COUNT" -gt 0 ] && [ "$NEW_COUNT" -gt 0 ]; then
    echo -e "${BLUE}🎯 Performance Comparison${NC}"
    echo "=========================="
    
    # Calculate averages
    OLD_AVG=$(echo "$OLD_RUNS" | jq '[.[] | (.updated_at | fromdateiso8601) - (.created_at | fromdateiso8601)] | add / length / 60')
    NEW_AVG=$(echo "$NEW_RUNS" | jq '[.[] | (.updated_at | fromdateiso8601) - (.created_at | fromdateiso8601)] | add / length / 60')
    
    # Calculate success rates
    OLD_SUCCESS=$(echo "$OLD_RUNS" | jq '[.[] | select(.conclusion == "success")] | length')
    OLD_TOTAL=$(echo "$OLD_RUNS" | jq 'length')
    NEW_SUCCESS=$(echo "$NEW_RUNS" | jq '[.[] | select(.conclusion == "success")] | length')
    NEW_TOTAL=$(echo "$NEW_RUNS" | jq 'length')
    
    OLD_SUCCESS_RATE=$(echo "scale=1; $OLD_SUCCESS * 100 / $OLD_TOTAL" | bc -l)
    NEW_SUCCESS_RATE=$(echo "scale=1; $NEW_SUCCESS * 100 / $NEW_TOTAL" | bc -l)
    
    # Duration improvement
    DURATION_DIFF=$(echo "scale=1; $OLD_AVG - $NEW_AVG" | bc -l)
    DURATION_PERCENT=$(echo "scale=1; ($OLD_AVG - $NEW_AVG) * 100 / $OLD_AVG" | bc -l)
    
    # Success rate improvement
    SUCCESS_DIFF=$(echo "scale=1; $NEW_SUCCESS_RATE - $OLD_SUCCESS_RATE" | bc -l)
    
    if (( $(echo "$DURATION_DIFF > 0" | bc -l) )); then
        echo -e "${GREEN}✅ Duration Improvement: ${DURATION_DIFF} minutes faster (${DURATION_PERCENT}% improvement)${NC}"
    else
        echo -e "${RED}⚠️  Duration Change: $(echo "$DURATION_DIFF * -1" | bc) minutes slower${NC}"
    fi
    
    if (( $(echo "$SUCCESS_DIFF > 0" | bc -l) )); then
        echo -e "${GREEN}✅ Success Rate Improvement: +${SUCCESS_DIFF} percentage points${NC}"
    elif (( $(echo "$SUCCESS_DIFF < 0" | bc -l) )); then
        echo -e "${RED}⚠️  Success Rate Change: ${SUCCESS_DIFF} percentage points${NC}"
    else
        echo -e "${CYAN}➡️  Success Rate: No change${NC}"
    fi
    
    echo ""
fi

# Failure analysis
echo -e "${BLUE}🔍 Failure Analysis${NC}"
echo "==================="

analyze_failures() {
    local runs=$1
    local system_name=$2
    
    local failures=$(echo "$runs" | jq '[.[] | select(.conclusion != "success")]')
    local failure_count=$(echo "$failures" | jq 'length')
    
    if [ "$failure_count" -eq 0 ]; then
        echo -e "${GREEN}$system_name: No recent failures! 🎉${NC}"
        return
    fi
    
    echo -e "${CYAN}$system_name Failures:${NC}"
    echo "  Total Failed Runs: $failure_count"
    
    # Most common failure types
    local conclusions=$(echo "$failures" | jq -r '.[].conclusion' | sort | uniq -c | sort -nr)
    if [ -n "$conclusions" ]; then
        echo "  Failure Types:"
        echo "$conclusions" | while read -r count type; do
            echo "    $type: $count runs"
        done
    fi
    
    if [ "$DETAILED" = true ]; then
        echo "  Recent Failed Runs:"
        echo "$failures" | jq -r '.[] | "    " + .created_at + " - " + .conclusion + " (" + .html_url + ")"' | head -5
    fi
    echo ""
}

if [ "$OLD_COUNT" -gt 0 ]; then
    analyze_failures "$OLD_RUNS" "Old CI System"
fi

if [ "$NEW_COUNT" -gt 0 ]; then
    analyze_failures "$NEW_RUNS" "New CI System"
fi

# Recommendations
echo -e "${BLUE}💡 Recommendations${NC}"
echo "=================="

if [ "$NEW_COUNT" -lt 5 ]; then
    echo -e "${YELLOW}⚠️  Limited data for new CI system ($NEW_COUNT runs). Consider:${NC}"
    echo "   • Running more PRs with 'ci-new' label"
    echo "   • Testing various types of changes (web, mobile, lambdas)"
    echo "   • Monitoring performance over a longer period"
    echo ""
fi

if [ "$OLD_COUNT" -gt 0 ] && [ "$NEW_COUNT" -gt 0 ]; then
    if (( $(echo "$DURATION_DIFF > 5" | bc -l) )); then
        echo -e "${GREEN}✅ Significant performance improvement detected!${NC}"
        echo "   • Consider enabling new CI for all PRs"
        echo "   • Document the improvement for team awareness"
    elif (( $(echo "$DURATION_DIFF < -2" | bc -l) )); then
        echo -e "${YELLOW}⚠️  Performance regression detected.${NC}"
        echo "   • Investigate causes of slower execution"
        echo "   • Consider optimizations before full rollout"
    fi
    
    if (( $(echo "$SUCCESS_DIFF < -5" | bc -l) )); then
        echo -e "${RED}⚠️  Success rate regression detected.${NC}"
        echo "   • Investigate new failure patterns"
        echo "   • Consider stability improvements before rollout"
    fi
fi

echo ""
echo -e "${CYAN}📋 Next Steps:${NC}"
echo "1. Review the performance data above"
echo "2. If new system shows improvement, consider expanding rollout"
echo "3. Monitor failure patterns and address any regressions"
echo "4. Run this script regularly during migration period"
echo ""
echo -e "${GREEN}✅ Performance comparison complete!${NC}"

# Generate JSON report for programmatic use
if [ "$DETAILED" = true ]; then
    cat > ci-performance-report.json << EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "old_system": {
    "runs": $OLD_COUNT,
    "average_duration_minutes": $(echo "$OLD_RUNS" | jq '[.[] | (.updated_at | fromdateiso8601) - (.created_at | fromdateiso8601)] | add / length / 60'),
    "success_rate": $(echo "scale=3; $OLD_SUCCESS * 100 / $OLD_TOTAL" | bc -l)
  },
  "new_system": {
    "runs": $NEW_COUNT,
    "average_duration_minutes": $(echo "$NEW_RUNS" | jq '[.[] | (.updated_at | fromdateiso8601) - (.created_at | fromdateiso8601)] | add / length / 60'),
    "success_rate": $(echo "scale=3; $NEW_SUCCESS * 100 / $NEW_TOTAL" | bc -l)
  }
}
EOF
    echo -e "${CYAN}📄 Detailed report saved to: ci-performance-report.json${NC}"
fi
