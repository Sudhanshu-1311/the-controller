$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $repoRoot

if (-not $env:ANDROID_SDK_ROOT) {
  $candidate = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
  if (Test-Path $candidate) { $env:ANDROID_SDK_ROOT = $candidate }
}
if (-not $env:ANDROID_SDK_ROOT -or -not (Test-Path $env:ANDROID_SDK_ROOT)) {
  throw 'Set ANDROID_SDK_ROOT to an installed Android SDK.'
}
if (-not $env:JAVA_HOME) {
  $candidate = Join-Path $env:ProgramFiles 'Android\Android Studio\jbr'
  if (Test-Path (Join-Path $candidate 'bin\javac.exe')) { $env:JAVA_HOME = $candidate }
}
if (-not $env:JAVA_HOME -or -not (Test-Path (Join-Path $env:JAVA_HOME 'bin\javac.exe'))) {
  throw 'Set JAVA_HOME to an installed JDK (17 or newer).'
}
$env:PATH = "$(Join-Path $env:JAVA_HOME 'bin');$env:PATH"

$sdk = $env:ANDROID_SDK_ROOT
$buildTools = Join-Path $sdk 'build-tools\36.0.0'
$platform = Join-Path $sdk 'platforms\android-37.0\android.jar'
foreach ($required in @((Join-Path $buildTools 'aapt2.exe'), (Join-Path $buildTools 'd8.bat'), (Join-Path $buildTools 'zipalign.exe'), (Join-Path $buildTools 'apksigner.bat'), $platform)) {
  if (-not (Test-Path $required)) { throw "Android SDK component missing: $required" }
}

$package = Get-Content (Join-Path $repoRoot 'package.json') -Raw | ConvertFrom-Json
$version = $package.version
$assetDir = Join-Path $repoRoot 'android\app\src\main\assets\site'
New-Item -ItemType Directory -Path $assetDir -Force | Out-Null
Get-ChildItem -LiteralPath $assetDir -Force | Remove-Item -Recurse -Force
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Vite production build failed.' }
Copy-Item -LiteralPath (Join-Path $repoRoot 'dist\index.html') -Destination $assetDir -Force
Copy-Item -LiteralPath (Join-Path $repoRoot 'dist\assets') -Destination (Join-Path $assetDir 'assets') -Recurse -Force

$tempRoot = [System.IO.Path]::GetTempPath()
$work = Join-Path $tempRoot ("the-controller-android-" + [guid]::NewGuid().ToString('N'))
$classes = Join-Path $work 'classes'
$dex = Join-Path $work 'dex'
New-Item -ItemType Directory -Path $classes, $dex -Force | Out-Null
$unsignedApk = Join-Path $work 'unsigned.apk'
$compiledJar = Join-Path $work 'classes.jar'
$alignedApk = Join-Path $work 'aligned.apk'
$keystore = Join-Path $work 'build-signing.jks'
$output = Join-Path $repoRoot "dist\THE-CONTROLLER-Android-$version.apk"
$manifest = Join-Path $repoRoot 'android\app\src\main\AndroidManifest.xml'
$javaDir = Join-Path $repoRoot 'android\app\src\main\java\com\thecontroller\android'
$javaFiles = Get-ChildItem -LiteralPath $javaDir -Filter '*.java' | ForEach-Object FullName

try {
  & (Join-Path $buildTools 'aapt2.exe') link -o $unsignedApk --manifest $manifest -I $platform --min-sdk-version 26 --target-sdk-version 35 --version-code 1 --version-name $version
  if ($LASTEXITCODE -ne 0) { throw 'Android manifest/package link failed.' }

  & (Join-Path $env:JAVA_HOME 'bin\javac.exe') -source 8 -target 8 -classpath $platform -d $classes @javaFiles
  if ($LASTEXITCODE -ne 0) { throw 'Android Java compilation failed.' }

  & (Join-Path $env:JAVA_HOME 'bin\jar.exe') cf $compiledJar -C $classes .
  if ($LASTEXITCODE -ne 0) { throw 'Could not archive compiled Android classes.' }
  & (Join-Path $buildTools 'd8.bat') --min-api 26 --lib $platform --output $dex $compiledJar
  if ($LASTEXITCODE -ne 0) { throw 'Android DEX compilation failed.' }
  & (Join-Path $env:JAVA_HOME 'bin\jar.exe') uf $unsignedApk -C $dex classes.dex -C (Join-Path $repoRoot 'android\app\src\main\assets') site
  if ($LASTEXITCODE -ne 0) { throw 'Could not bundle the web UI in the Android package.' }

  & (Join-Path $buildTools 'zipalign.exe') -f -p 4 $unsignedApk $alignedApk
  if ($LASTEXITCODE -ne 0) { throw 'APK alignment failed.' }
  $password = [guid]::NewGuid().ToString('N')
  & (Join-Path $env:JAVA_HOME 'bin\keytool.exe') -genkeypair -keystore $keystore -storepass $password -keypass $password -alias controller-build -dname 'CN=THE CONTROLLER Local Build' -keyalg RSA -keysize 2048 -validity 3650 -noprompt
  if ($LASTEXITCODE -ne 0) { throw 'Temporary APK signing key creation failed.' }
  & (Join-Path $buildTools 'apksigner.bat') sign --ks $keystore --ks-pass "pass:$password" --key-pass "pass:$password" --out $output $alignedApk
  if ($LASTEXITCODE -ne 0) { throw 'APK signing failed.' }
  & (Join-Path $buildTools 'apksigner.bat') verify --verbose $output
  if ($LASTEXITCODE -ne 0) { throw 'APK signature verification failed.' }
  & (Join-Path $buildTools 'aapt.exe') dump badging $output | Select-Object -First 3
  Get-Item -LiteralPath $output | Select-Object FullName, Length
}
finally {
  $resolvedTempRoot = [System.IO.Path]::GetFullPath($tempRoot)
  $resolvedWork = [System.IO.Path]::GetFullPath($work)
  if ($resolvedWork.StartsWith($resolvedTempRoot, [System.StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $resolvedWork)) {
    Remove-Item -LiteralPath $resolvedWork -Recurse -Force
  }
}
