param(
  [string]$Scope = "full",
  [switch]$Headed,
  [switch]$Debug
)

$ArgsList = @($Scope)
if ($Headed) { $ArgsList += "--headed" }
if ($Debug) { $ArgsList += "--debug" }

node .\scripts\run-mathpath-verification.mjs @ArgsList
