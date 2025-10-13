# Fix Badge JSON in Gist - Remove Escaped Backslashes
# This script fixes badge files that were incorrectly escaped

$GIST_ID = $env:CI_BADGES_GIST_ID
if (-not $GIST_ID) {
    Write-Error "CI_BADGES_GIST_ID environment variable not set"
    exit 1
}

$TOKEN = $env:GIST_TOKEN
if (-not $TOKEN) {
    Write-Error "GIST_TOKEN environment variable not set"
    exit 1
}

# Get current gist content
Write-Host "Fetching gist content..."
$gist = gh api /gists/$GIST_ID | ConvertFrom-Json

# Files to fix (those with escaped JSON)
$badgeFiles = @(
    "Deploy-Draft-Processor-Lambda.json",
    "Deploy-Game-Selection-Lambda.json",
    "Deploy-GraphQL-Lambda.json"
)

# Create temporary directory for badge files
$tempDir = New-Item -ItemType Directory -Path (Join-Path $env:TEMP "badge-fix-$(Get-Date -Format 'yyyyMMddHHmmss')") -Force
Write-Host "Using temp directory: $tempDir"

$updates = @{}

foreach ($file in $badgeFiles) {
    if ($gist.files.$file) {
        Write-Host "`nProcessing $file..."
        $content = $gist.files.$file.content
        
        # Check if it has escaped content
        if ($content -match '\\"') {
            Write-Host "  Found escaped JSON, fixing..."
            
            # Remove the escaped backslashes
            $fixedContent = $content -replace '\\\\', '' -replace '\\"', '"' -replace '^\{  ', '{' -replace '  \}$', '}'
            
            # Prettify the JSON
            try {
                $jsonObj = $fixedContent | ConvertFrom-Json
                $prettyJson = $jsonObj | ConvertTo-Json -Depth 10
                
                Write-Host "  Original: $($content.Length) chars"
                Write-Host "  Fixed: $($prettyJson.Length) chars"
                
                $updates[$file] = @{ content = $prettyJson }
            }
            catch {
                Write-Host "  ERROR: Failed to parse JSON: $_"
            }
        }
        else {
            Write-Host "  Already correct format"
        }
    }
    else {
        Write-Host "`n$file not found in gist, skipping"
    }
}

if ($updates.Count -gt 0) {
    Write-Host "`n========================================`n"
    Write-Host "Updating $($updates.Count) badge file(s)..."
    
    # Build payload manually - need to escape the JSON content properly for GitHub API
    $filesJson = @()
    foreach ($filename in $updates.Keys) {
        $content = $updates[$filename].content
        # Escape the content for JSON - replace backslash and quote
        $escapedContent = $content -replace '\\', '\\' -replace '"', '\"' -replace "`r`n", '\n' -replace "`n", '\n'
        $filesJson += "`"$filename`": {`"content`": `"$escapedContent`"}"
    }
    
    $payload = "{`"files`": {$($filesJson -join ', ')}}"
    
    # Write payload to temp file for debugging
    $payloadFile = Join-Path $tempDir "payload.json"
    $payload | Out-File -FilePath $payloadFile -Encoding utf8 -NoNewline
    
    Write-Host "Payload saved to: $payloadFile"
    
    # Update gist
    $result = Get-Content $payloadFile -Raw | gh api -X PATCH "/gists/$GIST_ID" --input - 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        $resultObj = $result | ConvertFrom-Json
        Write-Host "✅ Successfully updated gist!"
        Write-Host "URL: $($resultObj.html_url)"
    }
    else {
        Write-Host "❌ Failed to update gist"
        Write-Host "Error: $result"
        exit 1
    }
}
else {
    Write-Host "`nNo badges need fixing!"
}

# Cleanup
Remove-Item -Path $tempDir -Recurse -Force
Write-Host "`n✅ Done!"
