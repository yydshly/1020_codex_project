/* Injected only into the task-owned, hidden, sandboxed source renderer. */
(() => {
  'use strict';
  if (window.__napaliSourceStream) return;
  let peer = null, stream = null, track = null, sender = null;
  let encodedFrames = 0, sentFrames = 0, lastCaptureAt = 0, pollingStats = false;
  const status = () => ({
    connectionState: peer?.connectionState || 'idle',
    iceConnectionState: peer?.iceConnectionState || 'idle',
    encodedFrames, sentFrames, lastCaptureAt,
    trackReadyState: track?.readyState || null,
    sourceWidth: document.getElementById('c')?.width || 0,
    sourceHeight: document.getElementById('c')?.height || 0,
    streamKind: 'live WebRTC canvas video', captureMode: 'automatic actual canvas presentation (30fps limit)'
  });
  function close() {
    peer?.close(); stream?.getTracks().forEach(item => item.stop());
    peer = stream = track = sender = null; encodedFrames = sentFrames = 0;
  }
  async function iceComplete(connection) {
    if (connection.iceGatheringState === 'complete') return;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { cleanup(); reject(new Error('Local WebRTC ICE gathering timed out')); }, 15000);
      function cleanup() { clearTimeout(timer); connection.removeEventListener('icegatheringstatechange', changed); }
      function changed() { if (connection.iceGatheringState === 'complete') { cleanup(); resolve(); } }
      connection.addEventListener('icegatheringstatechange', changed); changed();
    });
  }
  async function answer(description) {
    if (!window.napaliControl?.getState().ready) throw new Error('The complete source renderer is still initializing');
    close();
    const canvas = document.getElementById('c');
    stream = canvas.captureStream(30); track = stream.getVideoTracks()[0];
    if (!track) { close(); throw new Error('Live original canvas video capture is unavailable'); }
    track.contentHint = 'detail';
    peer = new RTCPeerConnection({iceServers: [], bundlePolicy: 'max-bundle'});
    await peer.setRemoteDescription(description);
    sender = peer.addTrack(track, stream);
    const transceiver = peer.getTransceivers().find(item => item.sender === sender);
    const codecs = RTCRtpSender.getCapabilities('video')?.codecs || [];
    const vp8 = codecs.filter(codec => codec.mimeType.toLowerCase() === 'video/vp8');
    if (vp8.length && transceiver?.setCodecPreferences) transceiver.setCodecPreferences(vp8);
    const parameters = sender.getParameters();
    parameters.encodings ||= [{}];
    for (const encoding of parameters.encodings) { encoding.maxBitrate = 30000000; encoding.maxFramerate = 30; }
    parameters.degradationPreference = 'maintain-resolution';
    await sender.setParameters(parameters);
    await peer.setLocalDescription(await peer.createAnswer());
    await iceComplete(peer);
    return {type: peer.localDescription.type, sdp: peer.localDescription.sdp};
  }
  // Capture the browser's actual canvas presentations. Generation and render
  // accumulation use offscreen GL framebuffers; only the final source present
  // draws into this canvas. The peer is created after the complete scene is
  // ready. Automatic capture avoids missing the short completion/next-render
  // interval in an always-hidden offscreen window. No stored frames are used.
  setInterval(async () => {
    if (!sender || !track || track.readyState !== 'live' || pollingStats) return;
    pollingStats = true;
    const currentSender=sender;
    try {
      const reports=await currentSender.getStats();
      if(sender!==currentSender)return;
      for(const report of reports.values())if(report.type==='outbound-rtp'&&report.kind==='video'){
        const nextEncoded=report.framesEncoded||0;
        if(nextEncoded!==encodedFrames)lastCaptureAt=performance.now();
        encodedFrames=nextEncoded;sentFrames=report.framesSent||0;
      }
    } catch { /* Connection retirement may race this diagnostic read. */ }
    finally { pollingStats=false; }
  }, 500);
  window.__napaliSourceStream = Object.freeze({answer, close, getState: status});
})();
