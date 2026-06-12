<#
.SYNOPSIS
    Connect to your Android phone with adb over Wi-Fi (wireless debugging),
    walking you through pairing automatically if this PC isn't paired yet.

.DESCRIPTION
    Run with no arguments for the guided wireless flow:
      1. Confirms adb is installed.
      2. Asks for the IP:PORT from the phone's "Wireless debugging" screen.
      3. Tries to connect. If you're already paired, you're done.
      4. If not paired, it walks you through pairing (code + pairing port),
         then retries the connection automatically.

    NOTE: adb is Wi-Fi only for wireless. There is no Bluetooth transport.
          Phone and PC must be on the same Wi-Fi network.

.PREREQUISITES (one-time, ON THE PHONE)
    1. Settings > About phone > tap "Build number" 7 times -> unlocks Developer options.
    2. Settings > System > Developer options > enable "Wireless debugging".

.USAGE
    .\adb-connect.ps1            # guided Wi-Fi connect + auto-pair if needed
    .\adb-connect.ps1 -Mode usb # USB instead
#>

param(
    [ValidateSet('wifi', 'usb')]
    [string]$Mode = 'wifi'
)

$ErrorActionPreference = 'Stop'

# Prompt for an IP:PORT and re-ask until it matches the expected shape. Beyond
# catching typos, validating before the value reaches adb keeps untrusted input
# strictly numeric/dotted so it can never be mistaken for anything but a host.
function Read-Address {
    param([string]$Prompt)

    $pattern = '^\d{1,3}(\.\d{1,3}){3}:\d{1,5}$'
    while ($true) {
        $value = (Read-Host $Prompt).Trim()
        if ($value -match $pattern) { return $value }
        Write-Host "  Invalid IP:PORT (expected e.g. 192.168.1.42:5555). Try again." -ForegroundColor Red
    }
}

# Prompt for the 6-digit pairing code, re-asking until it is exactly 6 digits.
function Read-PairingCode {
    param([string]$Prompt)

    $pattern = '^\d{6}$'
    while ($true) {
        $value = (Read-Host $Prompt).Trim()
        if ($value -match $pattern) { return $value }
        Write-Host "  Invalid code (expected exactly 6 digits). Try again." -ForegroundColor Red
    }
}

function Test-Adb {
    if (Get-Command adb -ErrorAction SilentlyContinue) {
        Write-Host "adb found: $((Get-Command adb).Source)" -ForegroundColor Green
        return $true
    }

    Write-Host "adb is NOT installed or not on your PATH." -ForegroundColor Red
    Write-Host ""
    Write-Host "Install it with one of these, then reopen this terminal:" -ForegroundColor Yellow
    Write-Host "  winget install --id Google.PlatformTools -e"
    Write-Host "  # or download 'SDK Platform-Tools' from"
    Write-Host "  #   https://developer.android.com/tools/releases/platform-tools"
    return $false
}

function Invoke-Pairing {
    Write-Host "`n--- Not paired yet. Let's pair this PC with your phone. ---" -ForegroundColor Yellow
    Write-Host "On the phone:" -ForegroundColor Cyan
    Write-Host "  Developer options > Wireless debugging > 'Pair device with pairing code'."
    Write-Host "  That popup shows an IP & port AND a 6-digit code. Leave it open.`n"

    $pairAddr = Read-Address "Enter the PAIRING IP:PORT shown in that popup (e.g. 192.168.1.42:37123)"
    $pairCode = Read-PairingCode "Enter the 6-digit pairing code shown on the phone"

    Write-Host "`nPairing..." -ForegroundColor Cyan

    # Pass the code as an argument and DO NOT capture adb's output.
    # Capturing (2>&1) while also passing the code is what caused the earlier
    # hang; letting adb write straight to the console avoids the deadlock.
    & adb pair $pairAddr $pairCode
    $ok = ($LASTEXITCODE -eq 0)

    if ($ok) {
        Write-Host "`nPaired successfully." -ForegroundColor Green
        return $true
    }

    Write-Host "`nPairing did not succeed. Things to check:" -ForegroundColor Red
    Write-Host "  - The pairing popup was still open (codes expire fast - reopen it)."
    Write-Host "  - You used the PAIRING port from the popup, not the main-screen port."
    Write-Host "  - Phone and PC are on the same Wi-Fi (not a guest network)."
    return $false
}

function Try-Connect {
    param([string]$Addr, [int]$TimeoutSec = 8)

    Write-Host "`nConnecting to $Addr ..." -ForegroundColor Cyan

    # adb connect to an UNPAIRED device hangs instead of failing fast, so we
    # run it in a job and time it out, then fall through to pairing.
    $job = Start-Job -ScriptBlock { param($a) adb connect $a 2>&1 } -ArgumentList $Addr
    if (Wait-Job $job -Timeout $TimeoutSec) {
        $out = (Receive-Job $job) -join "`n"
        Remove-Job $job | Out-Null
        Write-Host $out
        # "connected to ..." or "already connected to ..." both mean success
        return ($out -match 'connected to')
    }

    Stop-Job $job | Out-Null
    Remove-Job $job -Force | Out-Null
    Write-Host "Connection timed out after $TimeoutSec s (this PC probably isn't paired yet)." -ForegroundColor Yellow
    return $false
}

function Connect-Wifi {
    Write-Host "`n=== Wi-Fi wireless debugging ===" -ForegroundColor Cyan
    Write-Host "On the phone, open: Developer options > Wireless debugging (MAIN screen)."
    Write-Host "Note the 'IP address & Port' shown there.`n"

    $addr = Read-Address "Enter the device IP:PORT from the main Wireless debugging screen (e.g. 192.168.1.42:5555)"

    if (Try-Connect -Addr $addr) {
        Write-Host "`nConnected. You're good to go." -ForegroundColor Green
    }
    else {
        # Most likely cause: this PC isn't paired with the phone yet.
        if (Invoke-Pairing) {
            Write-Host "`nRe-reading the MAIN Wireless debugging screen..." -ForegroundColor Cyan
            Write-Host "(The connect port often CHANGES after pairing.)`n"
            $addr2 = Read-Address "Enter the device IP:PORT from the main screen again (e.g. 192.168.1.42:5555)"
            if (Try-Connect -Addr $addr2) {
                Write-Host "`nConnected. You're good to go." -ForegroundColor Green
            }
            else {
                Write-Host "`nStill couldn't connect. Confirm both devices are on the same Wi-Fi" -ForegroundColor Red
                Write-Host "and that the port matches the main Wireless debugging screen."
            }
        }
    }

    Write-Host "`nDevices now visible to adb:" -ForegroundColor Yellow
    adb devices -l
}

function Connect-Usb {
    Write-Host "`n=== USB mode ===" -ForegroundColor Cyan
    Write-Host "1. Plug the phone in with a data-capable cable."
    Write-Host "2. On the phone, tap 'Allow' on the USB debugging prompt.`n"
    adb kill-server | Out-Null
    adb start-server | Out-Null
    adb devices -l
}

# --- main ---
if (-not (Test-Adb)) { exit 1 }

switch ($Mode) {
    'wifi' { Connect-Wifi }
    'usb'  { Connect-Usb }
}

Write-Host "`nHandy follow-up commands:" -ForegroundColor Magenta
Write-Host "  adb devices -l                 # list connected devices"
Write-Host "  adb shell                      # open a shell on the phone"
Write-Host "  adb logcat                     # stream device logs"
Write-Host "  adb disconnect                 # drop all network connections"
Write-Host ""
Write-Host "If adb reports 'more than one device', target one explicitly:" -ForegroundColor Magenta
Write-Host "  adb -s <serial> logcat         # <serial> is the first column of 'adb devices'"
Write-Host "  `$env:ANDROID_SERIAL = '<serial>'  # or set a default for the session"
