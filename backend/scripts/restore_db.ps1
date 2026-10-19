# Windows helper — DESTRUCTIVE restore
$ErrorActionPreference = "Stop"
$Backend = Split-Path $PSScriptRoot -Parent
$Python = Join-Path $Backend ".venv\Scripts\python.exe"
if (-not (Test-Path $Python)) {
  Write-Error "venv پیدا نشد: $Python"
}
& $Python (Join-Path $PSScriptRoot "restore_db.py") @args
exit $LASTEXITCODE
