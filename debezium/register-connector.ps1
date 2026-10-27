# Register Debezium CDC Connector for public.events
$connectorJsonPath = Join-Path $PSScriptRoot "events-connector.json"
$configContent = Get-Content -Raw -Path $connectorJsonPath

Write-Host "Registering Debezium connector from $connectorJsonPath..." -ForegroundColor Cyan

# Check if connector already exists
try {
    $existing = Invoke-RestMethod -Uri "http://localhost:8083/connectors/events-cdc-connector" -Method Get -ErrorAction SilentlyContinue
    if ($existing) {
        Write-Host "Connector already exists. Updating configuration..." -ForegroundColor Yellow
        $configOnly = ($configContent | ConvertFrom-Json).config | ConvertTo-Json -Depth 10
        Invoke-RestMethod -Uri "http://localhost:8083/connectors/events-cdc-connector/config" -Method Put -ContentType "application/json" -Body $configOnly | Out-Null
    }
} catch {
    # Post new connector
    Invoke-RestMethod -Uri "http://localhost:8083/connectors" -Method Post -ContentType "application/json" -Body $configContent | Out-Null
}

Start-Sleep -Seconds 2
$status = Invoke-RestMethod -Uri "http://localhost:8083/connectors/events-cdc-connector/status" -Method Get
Write-Host "Connector Name: $($status.name)" -ForegroundColor Green
Write-Host "Connector State: $($status.connector.state)" -ForegroundColor Green
foreach ($task in $status.tasks) {
    Write-Host "Task $($task.id) State: $($task.state)" -ForegroundColor Green
}
