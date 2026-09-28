<#
.SYNOPSIS
  Richtet das Projekt-SDK fuer Android nach docs/toolchain.md ein (Windows).

.DESCRIPTION
  Legt ein eigenes Android SDK im Benutzerbereich an. Ein SDK, das ein anderes
  Werkzeug verwaltet (Visual Studio, Android Studio), bleibt unberuehrt.

  Das Skript laedt die Kommandozeilenwerkzeuge von Google, prueft die
  Pruefsumme und installiert mit sdkmanager die Gruppen "Build" und "Test"
  (Emulator, Systemabbilder). sdkmanager zeigt vorher die Lizenzbedingungen
  der Pakete. Die Bestaetigung gibt ein, wer das Skript startet. Mit
  -OhneTestgruppe entfaellt die Gruppe "Test". Am Ende vergleicht das Skript
  die installierten Revisionen mit scripts/toolchain.json.

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

# Entfernt Schraegstriche am Ende eines Pfads, ausser bei einem Wurzelordner.
# Windows PowerShell 5.1 setzt ein Argument mit Leerzeichen in Anfuehrungszeichen.
# Ein Backslash direkt davor wuerde das schliessende Zeichen maskieren.
function Get-OhneEndstrich([string]$Pfad) {
    $wurzel = [string][System.IO.Path]::GetPathRoot($Pfad)
    if ($Pfad.Length -le $wurzel.Length) { return $Pfad }
    return $wurzel + $Pfad.Substring($wurzel.Length).TrimEnd('\', '/')
}

# Prueft Pakete mit scripts/SdkPruefung.java und liefert je Paket Status, Name,
# gefundene Revision und Meldung. Das Build-Skript ruft dasselbe Programm auf.
# Status: OK, ABWEICHUNG, FEHLT oder UNGUELTIG.
function Test-Pakete([string]$Jdk, [string]$Sdk, $Pakete, [string]$Programm = (Join-Path $PSScriptRoot 'SdkPruefung.java')) {
    $angaben = @()
    foreach ($paket in $Pakete) { $angaben += @([string]$paket.name, [string]$paket.ordner, [string]$paket.revision) }
    $zeilen = @(& (Join-Path $Jdk 'bin\java.exe') $Programm (Get-OhneEndstrich $Sdk) @angaben)
    if ($LASTEXITCODE -ne 0) { throw "Die Pruefung der Pakete endete mit Code $LASTEXITCODE." }
    $zeilen = @($zeilen | Where-Object { $_ })
    if ($zeilen.Count -ne @($Pakete).Count) { throw 'Die Pruefung der Pakete hat eine unerwartete Ausgabe geliefert.' }
    foreach ($zeile in $zeilen) {
        $felder = ([string]$zeile).Split("`t")
        if ($felder.Count -ne 4) { throw 'Die Pruefung der Pakete hat eine unerwartete Ausgabe geliefert.' }
        [pscustomobject]@{ Status = $felder[0]; Name = $felder[1]; Gefunden = $felder[2]; Meldung = $felder[3] }
    }
}

function Get-PaketOrdner([string]$Wurzel, $Paket) {
    return Join-Path $Wurzel ($Paket.ordner -replace '/', '\')
}

$javaHomeVorher = $env:JAVA_HOME
$abweichung = $false
$fehlt = $false
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
    $SdkRoot = Get-OhneEndstrich $SdkRoot
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
    # sdkmanager laeuft mit dem JDK aus Schritt 1 und wird ohne die Batch-Datei
    # gestartet. Das Android-CLI (android.exe) aus demselben Archiv wird nicht
    # verwendet: Es laedt sein Programm und eine eigene Laufzeit nach.
    $sdkmanager = Join-Path $ziel 'lib\sdkmanager-classpath.jar'

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
            if (-not (Test-Path (Join-Path $inhalt 'lib\sdkmanager-classpath.jar'))) {
                throw 'Das Archiv hat nicht den erwarteten Aufbau: cmdline-tools\lib\sdkmanager-classpath.jar fehlt.'
            }
            New-Item -ItemType Directory -Path (Split-Path $ziel -Parent) -Force | Out-Null
            Move-Item -Path $inhalt -Destination $ziel
        }
        finally {
            Remove-Item -Recurse -Force -Path $arbeit -ErrorAction SilentlyContinue
        }
    }

    if (-not (Test-Path $sdkmanager)) { throw "sdkmanager-classpath.jar fehlt unter $ziel." }
    $ergebnis = @(Test-Pakete $jdk $SdkRoot @($werkzeuge))[0]
    if ($ergebnis.Status -ne 'OK') {
        throw "Kommandozeilenwerkzeuge unter ${ziel}: $($ergebnis.Status) $($ergebnis.Gefunden) $($ergebnis.Meldung) Festgelegt ist $($werkzeuge.revision)."
    }
    $gefunden = $ergebnis.Gefunden
    Write-Host "Kommandozeilenwerkzeuge $gefunden sind vorhanden."
    foreach ($ordner in @(Get-ChildItem -Path (Split-Path $ziel -Parent) -Directory | Where-Object { $_.FullName -ne $ziel })) {
        Write-Host "Hinweis: $($ordner.FullName) gehoert nicht zur Festlegung."
    }

    # 4. Pakete. Die Kommandozeilenwerkzeuge sind schon vorhanden.
    # sdkmanager zeigt die Lizenzbedingungen der angeforderten Pakete, solange
    # sie in diesem SDK nicht bestaetigt sind. "sdkmanager --licenses" entfaellt:
    # Der Aufruf legt auch Bedingungen vor, die diese Pakete nicht brauchen.
    $pakete = @($vorgabe.android.pakete | Where-Object { ($_.gruppe -eq 'build') -or (-not $OhneTestgruppe) })
    $namen = @($pakete | Where-Object { $_.name -ne $werkzeuge.name } | ForEach-Object { $_.name })
    Write-Host ''
    Write-Host "Installiere: $($namen -join ', ')"
    Write-Host 'Zeigt sdkmanager Lizenzbedingungen an: bitte lesen und selbst bestaetigen.'
    & (Join-Path $jdk 'bin\java.exe') "-Dcom.android.sdklib.toolsdir=$ziel" -classpath $sdkmanager `
        com.android.sdklib.tool.sdkmanager.SdkManagerCli "--sdk_root=$SdkRoot" --install @namen
    if ($LASTEXITCODE -ne 0) { throw "sdkmanager --install endete mit Code $LASTEXITCODE." }

    # 5. Installierte Revisionen gegen die Festlegung pruefen
    Write-Host ''
    foreach ($ergebnis in @(Test-Pakete $jdk $SdkRoot $pakete)) {
        switch ($ergebnis.Status) {
            'OK' { Write-Host "OK         $($ergebnis.Name)  $($ergebnis.Gefunden)" }
            'FEHLT' {
                Write-Host "FEHLT      $($ergebnis.Name)"
                $abweichung = $true
                $fehlt = $true
            }
            'ABWEICHUNG' {
                $soll = @($pakete | Where-Object { $_.name -eq $ergebnis.Name })[0].revision
                Write-Host "ABWEICHUNG $($ergebnis.Name)  gefunden $($ergebnis.Gefunden), festgelegt $soll"
                $abweichung = $true
            }
            'UNGUELTIG' {
                Write-Host "UNGUELTIG  $($ergebnis.Name)  $($ergebnis.Meldung)"
                $abweichung = $true
            }
            default { throw "Die Pruefung der Pakete meldet den unbekannten Status $($ergebnis.Status)." }
        }
    }

    Write-Host ''
    if ($fehlt) {
        Write-Host 'Mindestens ein Paket fehlt. sdkmanager installiert nur Pakete, deren Lizenzbedingungen bestaetigt sind.'
    }
    elseif ($abweichung) {
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
