# PowerShell Script to Monitor System Performance During Load Testing
# Run this in a separate PowerShell window while running k6 tests

param(
    [int]$Duration = 300,  # Default 5 minutes (300 seconds)
    [int]$Interval = 5,    # Sample every 5 seconds
    [string]$OutputFile = ""
)

# Set default output file if not provided
if ($OutputFile -eq "") {
    $timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
    $OutputFile = ".\results\performance_monitor_$timestamp.csv"
}

Write-Host "🔍 Starting Performance Monitoring" -ForegroundColor Green
Write-Host "Duration: $Duration seconds" -ForegroundColor Yellow
Write-Host "Interval: $Interval seconds" -ForegroundColor Yellow
Write-Host "Output: $OutputFile" -ForegroundColor Yellow
Write-Host "Press Ctrl+C to stop monitoring early" -ForegroundColor Red
Write-Host ""

# Create results directory if it doesn't exist
$resultsDir = Split-Path $OutputFile -Parent
if (!(Test-Path $resultsDir)) {
    New-Item -ItemType Directory -Path $resultsDir -Force | Out-Null
}

# Initialize CSV file with headers
$headers = "Timestamp,CPU_Usage_Percent,Memory_Available_MB,Memory_Used_Percent,Disk_Read_MB_Per_Sec,Disk_Write_MB_Per_Sec,Network_Bytes_Sent_Per_Sec,Network_Bytes_Received_Per_Sec,Node_Process_Count,Node_Memory_MB"
$headers | Out-File -FilePath $OutputFile -Encoding UTF8

# Initialize counters for network monitoring
$networkCounters = @(
    "\Network Interface(*)\Bytes Sent/sec",
    "\Network Interface(*)\Bytes Received/sec"
)

# Function to get Node.js process information
function Get-NodeProcessInfo {
    $nodeProcesses = Get-Process -Name "node" -ErrorAction SilentlyContinue
    if ($nodeProcesses) {
        $totalMemory = ($nodeProcesses | Measure-Object WorkingSet -Sum).Sum / 1MB
        $processCount = $nodeProcesses.Count
        return @{
            Count = $processCount
            MemoryMB = [math]::Round($totalMemory, 2)
        }
    }
    return @{ Count = 0; MemoryMB = 0 }
}

# Function to get network stats
function Get-NetworkStats {
    try {
        $networkAdapters = Get-WmiObject -Class Win32_PerfRawData_Tcpip_NetworkInterface | Where-Object { $_.Name -notlike "*Loopback*" -and $_.Name -notlike "*Isatap*" -and $_.Name -ne "_Total" }
        
        $totalSent = 0
        $totalReceived = 0
        
        foreach ($adapter in $networkAdapters) {
            $totalSent += $adapter.BytesSentPerSec
            $totalReceived += $adapter.BytesReceivedPerSec
        }
        
        return @{
            Sent = $totalSent
            Received = $totalReceived
        }
    }
    catch {
        return @{ Sent = 0; Received = 0 }
    }
}

# Initialize previous network values for rate calculation
$previousNetwork = Get-NetworkStats
$previousTime = Get-Date

Write-Host "Starting monitoring loop..." -ForegroundColor Cyan

$startTime = Get-Date
$endTime = $startTime.AddSeconds($Duration)
$sampleCount = 0

try {
    while ((Get-Date) -lt $endTime) {
        $currentTime = Get-Date
        $timestamp = $currentTime.ToString("yyyy-MM-dd HH:mm:ss")
        
        # Get CPU usage
        $cpuUsage = (Get-WmiObject -Class Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average
        
        # Get memory info
        $memory = Get-WmiObject -Class Win32_OperatingSystem
        $totalMemoryGB = [math]::Round($memory.TotalVisibleMemorySize / 1MB, 2)
        $freeMemoryGB = [math]::Round($memory.FreePhysicalMemory / 1MB, 2)
        $usedMemoryPercent = [math]::Round((($totalMemoryGB - $freeMemoryGB) / $totalMemoryGB) * 100, 2)
        
        # Get disk stats
        $diskReads = (Get-WmiObject -Class Win32_PerfRawData_PerfDisk_LogicalDisk | Where-Object { $_.Name -eq "_Total" }).DiskReadBytesPerSec / 1MB
        $diskWrites = (Get-WmiObject -Class Win32_PerfRawData_PerfDisk_LogicalDisk | Where-Object { $_.Name -eq "_Total" }).DiskWriteBytesPerSec / 1MB
        
        # Get network stats and calculate rates
        $currentNetwork = Get-NetworkStats
        $timeDiff = ($currentTime - $previousTime).TotalSeconds
        
        if ($timeDiff -gt 0) {
            $networkSentRate = [math]::Max(0, ($currentNetwork.Sent - $previousNetwork.Sent) / $timeDiff)
            $networkReceivedRate = [math]::Max(0, ($currentNetwork.Received - $previousNetwork.Received) / $timeDiff)
        } else {
            $networkSentRate = 0
            $networkReceivedRate = 0
        }
        
        # Get Node.js process info
        $nodeInfo = Get-NodeProcessInfo
        
        # Create data row
        $dataRow = "$timestamp,$cpuUsage,$([math]::Round($freeMemoryGB * 1024, 0)),$usedMemoryPercent,$([math]::Round($diskReads, 2)),$([math]::Round($diskWrites, 2)),$([math]::Round($networkSentRate, 0)),$([math]::Round($networkReceivedRate, 0)),$($nodeInfo.Count),$($nodeInfo.MemoryMB)"
        
        # Write to CSV
        $dataRow | Out-File -FilePath $OutputFile -Append -Encoding UTF8
        
        # Display current stats
        $sampleCount++
        $remainingTime = [math]::Max(0, ($endTime - $currentTime).TotalSeconds)
        
        Write-Host "[$sampleCount] $timestamp" -ForegroundColor White
        Write-Host "  CPU: $cpuUsage% | Memory: $usedMemoryPercent% | Free: $([math]::Round($freeMemoryGB * 1024, 0))MB" -ForegroundColor Cyan
        Write-Host "  Node Processes: $($nodeInfo.Count) | Node Memory: $($nodeInfo.MemoryMB)MB" -ForegroundColor Yellow
        Write-Host "  Network: ↑$([math]::Round($networkSentRate/1024, 1))KB/s ↓$([math]::Round($networkReceivedRate/1024, 1))KB/s" -ForegroundColor Magenta
        Write-Host "  Remaining: $([math]::Round($remainingTime, 0))s" -ForegroundColor Gray
        Write-Host ""
        
        # Update previous values
        $previousNetwork = $currentNetwork
        $previousTime = $currentTime
        
        # Wait for next interval
        Start-Sleep -Seconds $Interval
    }
}
catch {
    Write-Host "Monitoring stopped: $($_.Exception.Message)" -ForegroundColor Red
}
finally {
    Write-Host "🏁 Performance monitoring complete!" -ForegroundColor Green
    Write-Host "Results saved to: $OutputFile" -ForegroundColor Yellow
    Write-Host "Total samples collected: $sampleCount" -ForegroundColor Cyan
    
    # Display summary statistics
    if (Test-Path $OutputFile) {
        try {
            $data = Import-Csv $OutputFile
            if ($data.Count -gt 1) {
                $avgCPU = [math]::Round(($data | Measure-Object CPU_Usage_Percent -Average).Average, 2)
                $maxCPU = [math]::Round(($data | Measure-Object CPU_Usage_Percent -Maximum).Maximum, 2)
                $avgMemory = [math]::Round(($data | Measure-Object Memory_Used_Percent -Average).Average, 2)
                $maxMemory = [math]::Round(($data | Measure-Object Memory_Used_Percent -Maximum).Maximum, 2)
                $maxNodeMemory = [math]::Round(($data | Measure-Object Node_Memory_MB -Maximum).Maximum, 2)
                
                Write-Host ""
                Write-Host "📊 Performance Summary:" -ForegroundColor Green
                Write-Host "  CPU Usage: Avg $avgCPU%, Max $maxCPU%" -ForegroundColor White
                Write-Host "  Memory Usage: Avg $avgMemory%, Max $maxMemory%" -ForegroundColor White
                Write-Host "  Node.js Memory: Max $maxNodeMemory MB" -ForegroundColor White
            }
        }
        catch {
            Write-Host "Could not generate summary statistics: $($_.Exception.Message)" -ForegroundColor Red
        }
    }
}