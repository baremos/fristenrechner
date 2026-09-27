<#
.SYNOPSIS
  Richtet das Projekt-SDK fuer Android nach docs/toolchain.md ein (Windows).

.DESCRIPTION
  Legt ein eigenes Android SDK im Benutzerbereich an. Ein SDK, das ein anderes
  Werkzeug verwaltet (Visual Studio, Android Studio), bleibt unberuehrt.

  Das Skript laedt die Kommandozeilenwerkzeuge von Google, prueft die
  Pruefsumme, zeigt die Lizenzbedingungen zur Bestaetigung und installiert
  die Gruppen "Build" und "Test" (Emulator, Systemabbilder). Mit
  -OhneTestgruppe entfaellt die Gruppe "Test". Am Ende vergleicht es die
  installierten Revisionen mit scripts/toolchain.json.

  Ort des SDK, in dieser Reihenfolge: -SdkRoot, ANDROID_HOME, Standardordner
  des Projekt-SDK. Das Build-Skript verwendet dieselbe Reihenfolge.

  Das Skript braucht keine Administratorrechte und aendert keine
  Einstellungen des Rechners. JAVA_HOME gilt nur fuer diesen Lauf.

  Die Datei enthaelt bewusst nur ASCII-Zeichen: Windows PowerShell 5.1 liest
  Skripte ohne BOM nicht als UTF-8.

.EXAMPLE
  pwsh -File scripts/android-sdk-einrichten.ps1

.EXAMPLE
  pwsh -File scripts/android-sdk-einrichten.ps1 -OhneTestgruppe
#>
[CmdletBinding()]
param(
    [string]$SdkRoot,
    [string]$JavaHome,
    [switch]$OhneTestgruppe
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$vorgabe = Get-Content -Raw -Path (Join-Path $PSScriptRoot 'toolchain.json') | ConvertFrom-Json

# Startet ein Programm und liefert Rueckgabewert und gesamte Ausgabe.
# Umgeht die Fehlerbehandlung von Windows PowerShell 5.1 bei Ausgaben auf stderr.
function Invoke-Programm([string]$Datei, [string]$Argumente) {
    $info = New-Object System.Diagnostics.ProcessStartInfo
    $info.FileName = $Datei
    $info.Arguments = $Argumente
    $info.UseShellExecute = $false
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    $info.CreateNoWindow = $true
    $prozess = [System.Diagnostics.Process]::Start($info)
    $fehler = $prozess.StandardError.ReadToEndAsync()
    $ausgabe = $prozess.StandardOutput.ReadToEnd()
    $prozess.WaitForExit()
    return [pscustomobject]@{ Code = $prozess.ExitCode; Text = $ausgabe + $fehler.Result }
}

# Liefert $null, wenn der Ordner ein vollstaendiges JDK der festgelegten
# Hauptversion und Kennung enthaelt. Sonst den Grund, warum er nicht passt.
function Test-Jdk([string]$Pfad) {
    foreach ($programm in @('java.exe', 'javac.exe')) {
        if (-not (Test-Path (Join-Path $Pfad "bin\$programm"))) { return "$programm fehlt" }
    }
    $lauf = Invoke-Programm (Join-Path $Pfad 'bin\java.exe') '-version'
    if ($lauf.Code -ne 0) { return 'Versionsabfrage schlaegt fehl' }
    if ($lauf.Text -notmatch 'version "([^"]+)"') { return 'Version nicht lesbar' }
    $teile = $Matches[1].Split('.')
    $haupt = $teile[0]
    if ($haupt -eq '1') { $haupt = $teile[1] }
    if ([int]$haupt -ne $vorgabe.jdk.hauptversion) { return "Hauptversion $haupt" }
    if (-not $lauf.Text.Contains($vorgabe.jdk.kennung)) { return "keine $($vorgabe.jdk.kennung)-Distribution" }
    return $null
}

function Find-Jdk {
    $kandidaten = @()
    if ($JavaHome) { $kandidaten += $JavaHome }
    if ($env:JAVA_HOME) { $kandidaten += $env:JAVA_HOME }
    foreach ($name in @('Eclipse Adoptium', 'Microsoft', 'Android\openjdk')) {
        $ordner = Join-Path $env:ProgramFiles $name
        if (Test-Path $ordner) {
            $kandidaten += Get-ChildItem -Path $ordner -Directory |
                Sort-Object Name -Descending |
                ForEach-Object { $_.FullName }
        }
    }
    foreach ($k in $kandidaten) {
        if (-not $k) { continue }
        $grund = Test-Jdk $k
        if (-not $grund) { return $k }
        if (($k -eq $JavaHome) -or ($k -eq $env:JAVA_HOME)) { Write-Host "Uebersprungen: $k ($grund)" }
    }
    throw "Kein JDK $($vorgabe.jdk.hauptversion) gefunden. Zuerst ein JDK nach docs/toolchain.md installieren oder -JavaHome angeben."
}

function Get-Revision([string]$Ordner) {
    $datei = Join-Path $Ordner 'source.properties'
    if (-not (Test-Path $datei)) { return $null }
    foreach ($zeile in Get-Content $datei) {
        if ($zeile -match '^Pkg\.Revision\s*=\s*(.+?)\s*$') { return $Matches[1] }
    }
    return $null
}

function Test-GleicheRevision([string]$A, [string]$B) {
    # Revisionen mit Zusatz wie "36.0.0 rc5" werden als Text verglichen.
    if (($A -notmatch '^[\d.]+$') -or ($B -notmatch '^[\d.]+$')) { return $A -eq $B }
    $x = @($A.Split('.') | ForEach-Object { [int]$_ })
    $y = @($B.Split('.') | ForEach-Object { [int]$_ })
    $n = [Math]::Max($x.Count, $y.Count)
    for ($i = 0; $i -lt $n; $i++) {
        $p = 0; if ($i -lt $x.Count) { $p = $x[$i] }
        $q = 0; if ($i -lt $y.Count) { $q = $y[$i] }
        if ($p -ne $q) { return $false }
    }
    return $true
}

function Get-PaketOrdner([string]$Wurzel, $Paket) {
    return Join-Path $Wurzel ($Paket.ordner -replace '/', '\')
}

$javaHomeVorher = $env:JAVA_HOME
$abweichung = $false
try {
    # 1. JDK
    $jdk = Find-Jdk
    $env:JAVA_HOME = $jdk

    # 2. Zielordner: muss im Benutzerbereich liegen und beschreibbar sein
    $herkunft = '-SdkRoot'
    if (-not $SdkRoot) {
        if ($env:ANDROID_HOME) {
            $SdkRoot = $env:ANDROID_HOME
            $herkunft = 'ANDROID_HOME'
        }
        else {
            $SdkRoot = Join-Path $env:LOCALAPPDATA ($vorgabe.android.sdkOrdner -replace '/', '\')
            $herkunft = 'Standardordner'
        }
    }
    # Relative Angaben gelten ab dem aktuellen Ordner der PowerShell, nicht ab dem des Prozesses.
    $anbieter = $null
    $laufwerk = $null
    $SdkRoot = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($SdkRoot, [ref]$anbieter, [ref]$laufwerk)
    if ($anbieter.Name -ne 'FileSystem') { throw "Der Ort des SDK muss ein Ordner im Dateisystem sein: $SdkRoot" }
    Write-Host "JDK:  $jdk"
    Write-Host "SDK:  $SdkRoot ($herkunft)"

    try {
        New-Item -ItemType Directory -Path $SdkRoot -Force | Out-Null
        $probe = Join-Path $SdkRoot ('schreibprobe-' + [guid]::NewGuid().ToString('N'))
        Set-Content -Path $probe -Value 'x'
        Remove-Item -Path $probe
    }
    catch {
        throw "Der Ordner $SdkRoot ist nicht beschreibbar. Das Projekt-SDK braucht einen eigenen Ordner im Benutzerbereich. Mit -SdkRoot einen anderen Ort angeben."
    }

    # 3. Kommandozeilenwerkzeuge
    $werkzeuge = $vorgabe.android.pakete | Where-Object { $_.name -like 'cmdline-tools;*' } | Select-Object -First 1
    $ziel = Get-PaketOrdner $SdkRoot $werkzeuge
    $sdkmanager = Join-Path $ziel 'bin\sdkmanager.bat'

    if ((Test-Path $ziel) -and -not (Test-Path $sdkmanager)) {
        throw "Der Ordner $ziel ist vorhanden, aber unvollstaendig. Bitte pruefen und loeschen, dann das Skript erneut starten."
    }
    if (-not (Test-Path $sdkmanager)) {
        $arbeit = Join-Path ([System.IO.Path]::GetTempPath()) ('android-sdk-' + [guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Path $arbeit | Out-Null
        try {
            $archiv = Join-Path $arbeit $werkzeuge.archive.windows.datei
            $quelle = $vorgabe.android.quelle + $werkzeuge.archive.windows.datei
            Write-Host "Lade $quelle"
            $alt = $ProgressPreference
            $ProgressPreference = 'SilentlyContinue'
            try { Invoke-WebRequest -Uri $quelle -OutFile $archiv -UseBasicParsing }
            finally { $ProgressPreference = $alt }

            $sha1 = (Get-FileHash -Path $archiv -Algorithm SHA1).Hash.ToLowerInvariant()
            $sha256 = (Get-FileHash -Path $archiv -Algorithm SHA256).Hash.ToLowerInvariant()
            Write-Host "SHA-1:   $sha1"
            Write-Host "SHA-256: $sha256"
            if ($sha1 -ne $werkzeuge.archive.windows.sha1) {
                throw "Pruefsumme weicht ab. Erwartet: $($werkzeuge.archive.windows.sha1)"
            }

            $entpackt = Join-Path $arbeit 'entpackt'
            Expand-Archive -Path $archiv -DestinationPath $entpackt
            $inhalt = Join-Path $entpackt 'cmdline-tools'
            if (-not (Test-Path (Join-Path $inhalt 'bin\sdkmanager.bat'))) {
                throw 'Das Archiv hat nicht den erwarteten Aufbau: cmdline-tools\bin\sdkmanager.bat fehlt.'
            }
            New-Item -ItemType Directory -Path (Split-Path $ziel -Parent) -Force | Out-Null
            Move-Item -Path $inhalt -Destination $ziel
        }
        finally {
            Remove-Item -Recurse -Force -Path $arbeit -ErrorAction SilentlyContinue
        }
    }

    if (-not (Test-Path $sdkmanager)) { throw "sdkmanager.bat fehlt unter $ziel." }
    $gefunden = Get-Revision $ziel
    if ((-not $gefunden) -or -not (Test-GleicheRevision $gefunden $werkzeuge.revision)) {
        throw "Kommandozeilenwerkzeuge unter ${ziel}: Revision '$gefunden' gefunden, festgelegt ist $($werkzeuge.revision)."
    }
    Write-Host "Kommandozeilenwerkzeuge $gefunden sind vorhanden."

    # 4. Lizenzbedingungen: Die Bestaetigung gibt ein, wer das Skript startet.
    Write-Host ''
    Write-Host 'Es folgen die Lizenzbedingungen des Android SDK. Bitte lesen und selbst bestaetigen.'
    & $sdkmanager "--sdk_root=$SdkRoot" --licenses
    if ($LASTEXITCODE -ne 0) { throw "sdkmanager --licenses endete mit Code $LASTEXITCODE." }

    # 5. Pakete. Die Kommandozeilenwerkzeuge sind schon vorhanden.
    $pakete = @($vorgabe.android.pakete | Where-Object { ($_.gruppe -eq 'build') -or (-not $OhneTestgruppe) })
    $namen = @($pakete | Where-Object { $_.name -ne $werkzeuge.name } | ForEach-Object { $_.name })
    Write-Host ''
    Write-Host "Installiere: $($namen -join ', ')"
    & $sdkmanager "--sdk_root=$SdkRoot" --install @namen
    if ($LASTEXITCODE -ne 0) { throw "sdkmanager --install endete mit Code $LASTEXITCODE." }

    # 6. Installierte Revisionen gegen die Festlegung pruefen
    Write-Host ''
    foreach ($paket in $pakete) {
        $gefunden = Get-Revision (Get-PaketOrdner $SdkRoot $paket)
        if (-not $gefunden) {
            Write-Host "FEHLT      $($paket.name)"
            $abweichung = $true
        }
        elseif (Test-GleicheRevision $gefunden $paket.revision) {
            Write-Host "OK         $($paket.name)  $gefunden"
        }
        else {
            Write-Host "ABWEICHUNG $($paket.name)  gefunden $gefunden, festgelegt $($paket.revision)"
            $abweichung = $true
        }
    }

    Write-Host ''
    if ($abweichung) {
        Write-Host 'Mindestens ein Paket weicht von docs/toolchain.md ab. Die Festlegung pruefen und im Kreuz-Review aktualisieren.'
    }
    elseif ($herkunft -eq 'Standardordner') {
        Write-Host 'Fertig. Das Build-Skript findet das SDK im Standardordner.'
    }
    else {
        Write-Host 'Fertig. Das Build-Skript findet dieses SDK ueber ANDROID_HOME, ueber sdk.dir in local.properties oder ueber --sdk:'
        Write-Host "  node scripts/android-build.mjs --sdk `"$SdkRoot`""
    }
}
finally {
    $env:JAVA_HOME = $javaHomeVorher
}

if ($abweichung) { exit 2 }
