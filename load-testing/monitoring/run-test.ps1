# PowerShell Script to Run Load Tests with Monitoring
# This script starts performance monitoring and runs k6 tests

param(
    [string]$TestScript = "01-auth-test.js",
    [switch]$Monitor = $true,
    [int]$MonitorDuration = 0  # 0 = auto-calculate based on test
)

# Configuration
$LoadTestDir = "c:\Users\int0003\OneDrive - REDDINGTON GLOBAL CONSULTANCY PRIVATE LIMITED\Desktop\desktop\leadmanagementttttt\load-testing"
$ScriptsDir = "$LoadTestDir\scripts"
$MonitoringDir = "$LoadTestDir\monitoring"
$ResultsDir = "$LoadTestDir\results"

# Ensure directories exist
if (!(Test-Path $ResultsDir)) {
    New-Item -ItemType Directory -Path $ResultsDir -Force | Out-Null
}

Write-Host "🚀 Load Test Runner" -ForegroundColor Green
Write-Host "==================" -ForegroundColor Green
Write-Host ""

# Validate test script
$testPath = Join-Path $ScriptsDir $TestScript
if (!(Test-Path $testPath)) {
    Write-Host "❌ Test script not found: $testPath" -ForegroundColor Red
    Write-Host "Available test scripts:" -ForegroundColor Yellow
    Get-ChildItem "$ScriptsDir\*.js" | ForEach-Object { Write-Host "  - $($_.Name)" -ForegroundColor Cyan }
    exit 1
}

# Auto-calculate monitor duration based on test type
if ($MonitorDuration -eq 0) {
    switch ($TestScript) {
        "01-auth-test.js" { $MonitorDuration = 60 }      # 1 minute
        "02-comprehensive-api-test.js" { $MonitorDuration = 240 }  # 4 minutes
        "03-capacity-ramp-test.js" { $MonitorDuration = 720 }      # 12 minutes
        default { $MonitorDuration = 300 }                # 5 minutes default
    }
}

$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$testResultFile = "$ResultsDir\k6_results_$($TestScript.Replace('.js', ''))_$timestamp.json"
$monitorResultFile = "$ResultsDir\performance_monitor_$($TestScript.Replace('.js', ''))_$timestamp.csv"

Write-Host "📝 Test Configuration:" -ForegroundColor Yellow
Write-Host "  Test Script: $TestScript" -ForegroundColor White
Write-Host "  K6 Results: $testResultFile" -ForegroundColor White
Write-Host "  Monitor Duration: $MonitorDuration seconds" -ForegroundColor White
if ($Monitor) {
    Write-Host "  Performance Log: $monitorResultFile" -ForegroundColor White
}
Write-Host ""

# Start performance monitoring if requested
$monitorJob = $null
if ($Monitor) {
    Write-Host "🔍 Starting performance monitoring..." -ForegroundColor Cyan
    $monitorScript = "$MonitoringDir\performance-monitor.ps1"
    $monitorJob = Start-Job -ScriptBlock {
        param($script, $duration, $output)
        & powershell.exe -ExecutionPolicy Bypass -File $script -Duration $duration -OutputFile $output
    } -ArgumentList $monitorScript, $MonitorDuration, $monitorResultFile
    
    Start-Sleep -Seconds 2  # Give monitor time to start
    Write-Host "✅ Performance monitoring started (Job ID: $($monitorJob.Id))" -ForegroundColor Green
    Write-Host ""
}

# Start the k6 test
Write-Host "🎯 Starting k6 load test..." -ForegroundColor Cyan
Write-Host "Command: k6 run --out json=$testResultFile $testPath" -ForegroundColor Gray
Write-Host ""

try {
    $k6Process = Start-Process -FilePath "k6" -ArgumentList "run", "--out", "json=$testResultFile", $testPath -Wait -PassThru -NoNewWindow
    
    Write-Host ""
    if ($k6Process.ExitCode -eq 0) {
        Write-Host "✅ K6 test completed successfully!" -ForegroundColor Green
    } else {
        Write-Host "⚠️  K6 test completed with exit code: $($k6Process.ExitCode)" -ForegroundColor Yellow
    }
}
catch {
    Write-Host "❌ Error running k6 test: $($_.Exception.Message)" -ForegroundColor Red
}

# Wait for monitoring to complete and get results
if ($Monitor -and $monitorJob) {
    Write-Host ""
    Write-Host "⏳ Waiting for performance monitoring to complete..." -ForegroundColor Cyan
    
    Wait-Job $monitorJob -Timeout ($MonitorDuration + 30) | Out-Null
    
    if ($monitorJob.State -eq "Completed") {
        Write-Host "✅ Performance monitoring completed" -ForegroundColor Green
        $monitorOutput = Receive-Job $monitorJob
        if ($monitorOutput) {
            Write-Host $monitorOutput -ForegroundColor White
        }
    } else {
        Write-Host "⚠️  Performance monitoring timed out or failed" -ForegroundColor Yellow
        Stop-Job $monitorJob -ErrorAction SilentlyContinue
    }
    
    Remove-Job $monitorJob -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "📊 Test Results Summary:" -ForegroundColor Green
Write-Host "========================" -ForegroundColor Green

# Display k6 results if available
if (Test-Path $testResultFile) {
    Write-Host "✅ K6 results saved to: $testResultFile" -ForegroundColor Cyan
    
    # Try to parse and display key metrics
    try {
        $k6Results = Get-Content $testResultFile | ConvertFrom-Json | Where-Object { $_.type -eq "Point" -and $_.metric -eq "http_req_duration" }
        if ($k6Results) {
            $avgResponseTime = [math]::Round(($k6Results | Measure-Object -Property value -Average).Average, 2)
            Write-Host "📈 Average Response Time: $avgResponseTime ms" -ForegroundColor White
        }
        
        $errorResults = Get-Content $testResultFile | ConvertFrom-Json | Where-Object { $_.type -eq "Point" -and $_.metric -eq "http_req_failed" }
        if ($errorResults) {
            $errorRate = [math]::Round(($errorResults | Measure-Object -Property value -Average).Average * 100, 2)
            Write-Host "❌ Error Rate: $errorRate%" -ForegroundColor White
        }
    }
    catch {
        Write-Host "⚠️  Could not parse k6 results for summary" -ForegroundColor Yellow
    }
} else {
    Write-Host "❌ K6 results file not found" -ForegroundColor Red
}

# Display performance monitoring results if available
if ($Monitor -and (Test-Path $monitorResultFile)) {
    Write-Host "✅ Performance monitoring results saved to: $monitorResultFile" -ForegroundColor Cyan
    
    try {
        $perfData = Import-Csv $monitorResultFile
        if ($perfData.Count -gt 1) {
            $avgCPU = [math]::Round(($perfData | Measure-Object CPU_Usage_Percent -Average).Average, 2)
            $maxCPU = [math]::Round(($perfData | Measure-Object CPU_Usage_Percent -Maximum).Maximum, 2)
            $avgMemory = [math]::Round(($perfData | Measure-Object Memory_Used_Percent -Average).Average, 2)
            $maxMemory = [math]::Round(($perfData | Measure-Object Memory_Used_Percent -Maximum).Maximum, 2)
            
            Write-Host "🖥️  CPU Usage: Avg $avgCPU%, Max $maxCPU%" -ForegroundColor White
            Write-Host "💾 Memory Usage: Avg $avgMemory%, Max $maxMemory%" -ForegroundColor White
        }
    }
    catch {
        Write-Host "⚠️  Could not parse performance data for summary" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "🎉 Load test session complete!" -ForegroundColor Green
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Review detailed results in the output files" -ForegroundColor White
Write-Host "  2. Analyze performance trends and bottlenecks" -ForegroundColor White
Write-Host "  3. Compare results with your performance thresholds" -ForegroundColor White
Write-Host "  4. Scale up tests gradually to find capacity limits" -ForegroundColor White