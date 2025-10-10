# Queue 100 players for remote stats processing
# Skip the first 4 players we already processed

$players = @(
    "acostcy01", "acosted01", "acostjo01", "acostma01", "acostma02", "acostme01", "acrema01", "actonga01", "acunajo01", "acunaro01",
    "adairje01", "adairji01", "adamja01", "adamecr01", "adamewi01", "adams05", "adamsac01", "adamsau01", "adamsau02", "adamsba01",
    "adamsbe01", "adamsbo01", "adamsbo02", "adamsbo04", "adamsbo03", "adamsbu01", "adamsch01", "adamsda01", "adamsda02", "adamsdi01",
    "adamsdo01", "adamsem01", "adamsge01", "adamsgl01", "adamshe01", "adamsji01", "adamsjo01", "adamsjo03", "adamska01", "adamsla01",
    "adamsma01", "adamsmi02", "adamsmi03", "adamsre01", "adamsri01", "adamsri02", "adamsri03", "adamsru01", "adamsry01", "adamssp01",
    "adamssp02", "adamste01", "adamstr01", "adamswi01", "adamswi02", "adamsjo02", "adamsmi01", "adcocjo01", "adcocna01", "adcocty01",
    "addisbo01", "adducji01", "adducji02", "addybo01", "adelljo01", "adenhni01", "aderhmo01", "adkinde01", "adkindi01", "adkingr01",
    "adkinjo01", "adkindo01", "adkinst01", "adlemti01", "adlesda01", "adonjo01", "adriaeh01", "afenitr01", "affelje01", "agbaybe01",
    "ageeto01", "agganha01", "aglerjo01", "agnewsa01", "agnosza01", "agostju01", "agrazda01", "aguaylu01", "aguiaju01", "aguilch01",
    "aguilje01", "aguilmi01", "aguilry01", "aguilri01", "aguirha01", "ahearch01", "ahearpa01", "ahmedni01", "aikenwi01", "aingeda01"
)

Write-Host "Starting to queue 100 players for remote stats processing..."
Write-Host "This may take a few minutes..."

$count = 0
$totalPlayers = $players.Count

foreach ($player in $players) {
    $count++
    Write-Host "[$count/$totalPlayers] Queuing player: $player" -ForegroundColor Green
    
    try {
        $result = npx tsx --tsconfig tsconfig.base.json apps/cli/src/main.ts load-single-player-stats --player $player --remote
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  ✅ Successfully queued $player" -ForegroundColor Green
        } else {
            Write-Host "  ❌ Failed to queue $player" -ForegroundColor Red
        }
    } catch {
        Write-Host "  ❌ Error queuing $player`: $_" -ForegroundColor Red
    }
    
    # Small delay to avoid overwhelming the system
    Start-Sleep -Milliseconds 500
}

Write-Host "`n🎉 Completed queuing $totalPlayers players for remote processing!" -ForegroundColor Cyan
Write-Host "All players have been added to the SQS queue and will be processed by AWS Lambda functions." -ForegroundColor Cyan
