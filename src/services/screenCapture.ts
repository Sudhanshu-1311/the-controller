export interface PrimaryDisplayCapture {
  stream: MediaStream;
  displayId: string | null;
}

/** Captures real OS display frames. Electron desktop capture is used on Windows. */
export async function capturePrimaryDisplay(displayId?: string, includeAudio = false): Promise<PrimaryDisplayCapture> {
  const desktop = window.controllerDesktop;
  if (desktop?.capturePrimaryScreen && navigator.mediaDevices?.getUserMedia) {
    if (includeAudio) {
      if (!navigator.mediaDevices.getDisplayMedia) throw new Error('Native system audio capture is unavailable on this platform.');
      // Start this native media request directly from the user gesture before awaiting IPC.
      const streamPromise = navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: 'monitor', frameRate: { max: 30 } }, audio: true });
      const sourcePromise = displayId && desktop.captureDisplay ? desktop.captureDisplay(displayId, true) : desktop.capturePrimaryScreen(true);
      const [stream, source] = await Promise.all([streamPromise, sourcePromise]);
      if (!stream.getAudioTracks().some((track) => track.readyState === 'live')) {
        stream.getTracks().forEach((track) => track.stop());
        throw new Error('Windows did not provide an active system-audio capture track.');
      }
      return { stream, displayId: source.displayId };
    }
    const source = displayId && desktop.captureDisplay ? await desktop.captureDisplay(displayId, includeAudio) : await desktop.capturePrimaryScreen(includeAudio);
    const constraints = {
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: source.sourceId,
          maxFrameRate: 30,
        },
      },
    } as unknown as MediaStreamConstraints;
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    const track = stream.getVideoTracks()[0];
    if (!track) {
      stream.getTracks().forEach((item) => item.stop());
      throw new Error('Windows did not return a primary-display video track.');
    }
    track.contentHint = 'detail';
    return { stream, displayId: source.displayId };
  }

  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error('This platform does not provide an available screen-capture service.');
  }
  if (includeAudio) throw new Error('System audio capture is supported only in the Windows desktop build.');
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { displaySurface: 'monitor', frameRate: { max: 30 } },
    audio: false,
  });
  return { stream, displayId: null };
}
