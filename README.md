<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

## Windows desktop build

The Electron Windows build hosts the React UI, creates a real Windows notification-area icon, hides the main window on close, and provides a separate **Exit THE CONTROLLER** command. The background agent runs in a detached Node process. Firebase refresh credentials and the device identity are encrypted with Electron `safeStorage` (Windows DPAPI); the agent renews Firebase ID tokens, registers the device, maintains authenticated presence, polls authorized Firestore signaling messages, and reconnects with bounded exponential backoff. Presence expires server-side if the agent crashes or loses connectivity.

Run `npm install`, then `npm run desktop:dev`. Create a Windows installer with `npm run desktop:pack`. The browser `npm run dev` mode remains available, but cannot remain running after its tab or browser closes.

The owner can authorize controller Firebase UIDs in Settings. Firestore rules enforce owner and authorized-user access; WebRTC offers are held until explicit approval. The background agent relays signaling to the renderer. Closing the main window hides it and leaves the renderer loaded, so the active WebRTC session can continue while hidden. A renderer crash/reload still ends that session; the background agent does not own or restore WebRTC sessions.

### Firebase deployment

Deploy the Firestore rules, indexes, and Cloud Functions with `npm run firebase:deploy`. This requires Firebase CLI authentication and a Firebase project with Cloud Functions/Cloud Scheduler billing enabled. The scheduled function marks devices offline after 90 seconds without a successful authenticated heartbeat and removes expired signaling messages.

### Android APK

Build an installable universal APK on Windows with `npm run android:pack`. Install `dist/THE-CONTROLLER-Android-1.0.0.apk` on Android 8.0 (API 26) or newer. The APK bundles the UI and a native Android foreground service. After Firebase authentication, it encrypts the refresh credential with Android Keystore, refreshes the token, registers and heartbeats the device through authenticated Firestore REST calls, polls signaling, and posts a notification for a connection request. It reports ONLINE only after authentication, registration, a successful signaling query, and an authenticated presence update.

**Android Google sign-in is NOT IMPLEMENTED.** The current login UI uses Firebase's web popup; Google blocks OAuth inside embedded WebViews. A native Google Sign-In integration and an Android OAuth client for package `com.thecontroller.android` are required. Until configured, this APK cannot authenticate and will stay OFFLINE. Native Android screen capture, remote input/control, and active-session recovery are also **NOT IMPLEMENTED**. Android may stop background work under user or manufacturer battery restrictions; the user must start the foreground service from the visible app and keep its notification enabled. Automatic start after reboot is not implemented.

Deploy Firebase rules, indexes, and cleanup functions before using device presence: `npm run firebase:deploy`. The APK is signed with a temporary per-build local key; it can be sideloaded but is not a Play Store release. Future APK builds will not install as upgrades over an APK signed by a different temporary key.

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/98515a5b-723f-4db7-80c1-f31d22517c92

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`
# ICE / TURN deployment

WebRTC ICE settings are returned by the authenticated `getIceConfiguration` callable. Set
`STUN_URLS` and `TURN_URLS` as Functions environment parameters (comma-separated `stun:`/`stuns:`
and `turn:`/`turns:` URLs). TURN credentials are short-lived coturn REST credentials generated
per signed-in Firebase user; configure the real TURN server with `use-auth-secret` and the same
secret stored using `firebase functions:secrets:set TURN_SHARED_SECRET`. Never put the shared
secret in this repository or the client application. Deploy Functions after configuration.
The callable reports `turnAvailable: false` until TURN URLs and the shared secret are present;
STUN-only or host-candidate sessions are not proof that TURN relay works. TURN must be tested
against an actual restrictive-NAT path before deployment is described as production-ready.

On Windows desktop, the renderer requests actual selected-display frames through Electron's
`desktopCapturer` source and Chromium's native desktop media source. Browser/mobile builds still
use their platform capture permission path. The Windows agent process currently owns authenticated
presence and signaling delivery, while RTCPeerConnection and media run in the renderer; a fully
independent Windows service-owned WebRTC/media runtime is not implemented.

## Windows remote input

The Windows desktop agent can inject validated mouse and keyboard events using Windows `SendInput`
through one long-lived PowerShell helper. The agent user must grant mouse/keyboard control for each
session, and the controller operator must enable it in the session viewport. The message path
validates normalized selected-display coordinates, supported mouse buttons and wheel values, and an
allowlist of virtual-key codes. Windows interprets virtual keys using the target's active keyboard
layout. Held inputs are released on session cleanup, connection loss, access pause/revocation, or
helper exit.

Android native input and Android WebRTC sessions are NOT IMPLEMENTED. The Windows background agent
does not own the active media/input session independently of its renderer yet; UI crash recovery for
an active session is NOT IMPLEMENTED.

## Native Windows media and data features

The Windows desktop build discovers connected displays through Electron and captures a selected
display with the native desktop capture source. Windows system audio can be requested explicitly;
the UI only reports it active when a live audio track was returned. Mouse coordinates are mapped to
the captured display's desktop bounds, including non-primary display origins and DPI conversion.
Combined-desktop capture is not implemented.

File transfer uses native Windows open/save dialogs and file handles. Files move in 64 KiB ordered
chunks over the active peer DataChannel, with byte acknowledgements, a cancel command, temporary
destination files, and SHA-256 verification before the destination is finalized. Each incoming
transfer requires choosing a save location. Folder transfer, resume after disconnect, and Android
native file transfer are NOT IMPLEMENTED. The transfer source is only a file explicitly chosen in
the UI; it does not expose arbitrary filesystem paths.

Text clipboard sharing is available in the Windows desktop build only. Each endpoint must enable
clipboard access for its current UI session, the sender must explicitly send text, and the recipient
must explicitly accept the clipboard write. Payloads are limited to 1 MiB. Clipboard monitoring,
automatic synchronization, and Android clipboard access are NOT IMPLEMENTED.

Android currently has an authenticated foreground presence/signaling poller, but it does not have
MediaProjection capture, Android WebRTC media transport, native screen/input control, remote
session recovery, or Android-to-Windows control. These are NOT IMPLEMENTED; the APK must not be
treated as a remote desktop agent. Android Google sign-in and automatic start after reboot also
remain NOT IMPLEMENTED. Android background availability remains subject to OS and manufacturer
battery restrictions.
