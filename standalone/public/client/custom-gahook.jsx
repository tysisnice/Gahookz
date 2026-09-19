import React, { useEffect, useMemo, useRef, useState } from "react";
import { SimplePaintEditor } from "./drawing.jsx";

export const CUSTOM_GAHOOK_BACKGROUND_COLORS = Object.freeze([
  Object.freeze({ id: "pink", color: "#ff3d8b", label: "Gahook pink" }),
  Object.freeze({ id: "blue", color: "#246bfe", label: "Arcade blue" }),
  Object.freeze({ id: "teal", color: "#00bfd8", label: "Electric teal" }),
  Object.freeze({ id: "purple", color: "#7c3aed", label: "Party purple" }),
  Object.freeze({ id: "green", color: "#20b26b", label: "Power green" }),
  Object.freeze({ id: "orange", color: "#ff8a00", label: "Chaos orange" }),
  Object.freeze({ id: "red", color: "#ef4444", label: "Alarm red" }),
  Object.freeze({ id: "black", color: "#111214", label: "Midnight" })
]);
export const CUSTOM_GAHOOK_BACKGROUNDS = CUSTOM_GAHOOK_BACKGROUND_COLORS;

export const CUSTOM_GAHOOK_EFFECTS = Object.freeze([
  Object.freeze({ id: "shake", label: "Wild shake", description: "Rattles into view" }),
  Object.freeze({ id: "spin", label: "Spin attack", description: "Whirls around the screen" }),
  Object.freeze({ id: "bounce", label: "Mega bounce", description: "Springs in and out" }),
  Object.freeze({ id: "zoom", label: "Jump zoom", description: "Rushes straight at the target" })
]);

export const CUSTOM_GAHOOK_SOUNDS = Object.freeze([
  Object.freeze({ id: "bonk", label: "Bonk", description: "Cartoon impact" }),
  Object.freeze({ id: "honk", label: "Honk", description: "Chaotic horn" }),
  Object.freeze({ id: "boing", label: "Boing", description: "Springy surprise" }),
  Object.freeze({ id: "airhorn", label: "Airhorn", description: "Maximum drama" }),
  Object.freeze({ id: "none", label: "Silent", description: "No sound effect" }),
  Object.freeze({ id: "custom", label: "My sound", description: "Record or upload a short sound" })
]);

const DEFAULT_MAX_IMAGE_BYTES = 130_000;
const DEFAULT_MAX_AUDIO_BYTES = 200_000;
const DEFAULT_MAX_RECORDING_MS = 5_000;
const MAX_SOURCE_IMAGE_UPLOAD_BYTES = 4_000_000;
const MAX_CUSTOM_GAHOOK_FRAMES = 3;
const LEGACY_BACKGROUND_COLORS = Object.freeze({ burst: "#ff3d8b", checker: "#7c3aed", void: "#063352", confetti: "#00bfd8" });

function isRoomMediaUrl(value) {
  return /^\/media\/[a-z]{4}\/[a-f0-9]{32}$/i.test(String(value || ""));
}

function isImageSource(value) {
  return /^data:image\/(?:png|jpe?g|webp);base64,/i.test(String(value || "")) || isRoomMediaUrl(value);
}

function boundedFrames(value) {
  const candidates = Array.isArray(value?.frames)
    ? value.frames
    : (Array.isArray(value?.avatarFrames) ? value.avatarFrames : []);
  const frames = candidates.filter(isImageSource).slice(0, MAX_CUSTOM_GAHOOK_FRAMES);
  return frames.length ? frames : [null];
}

function dataUrlByteSize(value) {
  const data = String(value || "").split(",", 2)[1] || "";
  const padding = data.endsWith("==") ? 2 : (data.endsWith("=") ? 1 : 0);
  return Math.max(0, Math.floor(data.length * 0.75) - padding);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("That file could not be read."));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}

function preferredRecordingMimeType() {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") return "";
  return ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4", "audio/webm"]
    .find(type => MediaRecorder.isTypeSupported(type)) || "";
}

function normaliseBackgroundColor(value, legacyId = "") {
  const candidate = String(value || LEGACY_BACKGROUND_COLORS[legacyId] || CUSTOM_GAHOOK_BACKGROUND_COLORS[0].color).toLowerCase();
  return /^#[0-9a-f]{6}$/.test(candidate) ? candidate : CUSTOM_GAHOOK_BACKGROUND_COLORS[0].color;
}

function backgroundStageStyle(color) {
  return { "--custom-gahook-color": normaliseBackgroundColor(color) };
}

function formatBytes(bytes) {
  if (bytes < 1_000_000) return `${Math.max(1, Math.round(bytes / 1_000))} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

/**
 * Creates the custom payload consumed by the room/player API:
 * `{ frames, backgroundColor, effectId, soundId, customAudioDataUrl }`.
 * The component performs all media work locally and only hands data to
 * `onSave`, so the integrating screen controls when anything is uploaded.
 */
export function CustomGahookCreator({
  initialValue = null,
  onSave,
  onCancel,
  onPreviewPresetSound,
  disabled = false,
  maxImageBytes = DEFAULT_MAX_IMAGE_BYTES,
  maxAudioBytes = DEFAULT_MAX_AUDIO_BYTES,
  maxRecordingMs = DEFAULT_MAX_RECORDING_MS,
  title = "Make your own Gahook"
}) {
  const [name, setName] = useState(() => String(initialValue?.name || "My Gahook").slice(0, 32));
  const [frames, setFrames] = useState(() => boundedFrames(initialValue));
  const [activeFrame, setActiveFrame] = useState(0);
  const [backgroundColor, setBackgroundColor] = useState(() => normaliseBackgroundColor(initialValue?.backgroundColor, initialValue?.backgroundId));
  const [effectId, setEffectId] = useState(() => CUSTOM_GAHOOK_EFFECTS.some(item => item.id === initialValue?.effectId)
    ? initialValue.effectId
    : "shake");
  const [soundId, setSoundId] = useState(() => CUSTOM_GAHOOK_SOUNDS.some(item => item.id === initialValue?.soundId)
    ? initialValue.soundId
    : "bonk");
  const [customAudio, setCustomAudio] = useState(() => {
    const dataUrl = String(initialValue?.customAudioDataUrl || initialValue?.sound?.dataUrl || "");
    if (!dataUrl.startsWith("data:audio/") && !isRoomMediaUrl(dataUrl)) return null;
    return {
      dataUrl,
      mimeType: String(initialValue?.customAudioMimeType || initialValue?.sound?.mimeType || "audio/webm"),
      name: String(initialValue?.customAudioName || initialValue?.sound?.name || "Custom sound")
    };
  });
  const [previewFrame, setPreviewFrame] = useState(0);
  const [recording, setRecording] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const recordingTimerRef = useRef(null);
  const recordingChunksRef = useRef([]);
  const recordingBytesRef = useRef(0);
  const recordingTooLargeRef = useRef(false);
  const recordingStartRef = useRef(0);
  const audioInputRef = useRef(null);
  const audioPreviewRef = useRef(null);

  const safeMaxImageBytes = Math.max(80_000, Math.min(DEFAULT_MAX_IMAGE_BYTES, Number(maxImageBytes) || DEFAULT_MAX_IMAGE_BYTES));
  const safeMaxAudioBytes = Math.max(80_000, Math.min(DEFAULT_MAX_AUDIO_BYTES, Number(maxAudioBytes) || DEFAULT_MAX_AUDIO_BYTES));
  const safeRecordingMs = Math.max(1_000, Math.min(10_000, Number(maxRecordingMs) || DEFAULT_MAX_RECORDING_MS));
  const canRecord = typeof navigator !== "undefined"
    && Boolean(navigator.mediaDevices?.getUserMedia)
    && typeof MediaRecorder !== "undefined";
  const previewFrames = useMemo(() => frames.filter(isImageSource).slice(0, MAX_CUSTOM_GAHOOK_FRAMES), [frames]);

  useEffect(() => {
    if (previewFrames.length < 2) {
      setPreviewFrame(0);
      return undefined;
    }
    const timer = window.setInterval(() => setPreviewFrame(current => (current + 1) % previewFrames.length), 300);
    return () => window.clearInterval(timer);
  }, [previewFrames.length]);

  useEffect(() => () => {
    window.clearTimeout(recordingTimerRef.current);
    const recorder = recorderRef.current;
    if (recorder) recorder.onstop = null;
    if (recorder?.state === "recording") recorder.stop();
    streamRef.current?.getTracks?.().forEach(track => track.stop());
  }, []);

  const selectedEffect = useMemo(
    () => CUSTOM_GAHOOK_EFFECTS.find(item => item.id === effectId) || CUSTOM_GAHOOK_EFFECTS[0],
    [effectId]
  );

  const updateFrame = (dataUrl, meta = {}) => {
    if (dataUrl && (!isImageSource(dataUrl) || dataUrlByteSize(dataUrl) > safeMaxImageBytes)) {
      setStatus(`Keep each avatar frame under ${formatBytes(safeMaxImageBytes)}.`);
      return;
    }
    setFrames(current => current.map((frame, index) => index === activeFrame ? (dataUrl || null) : frame));
    setStatus(meta.reason === "upload" ? "Image added to this frame." : "Drawing saved to this frame.");
  };

  const addFrame = () => {
    if (frames.length >= MAX_CUSTOM_GAHOOK_FRAMES) return;
    const nextFrame = frames.length;
    setFrames(current => [...current, null]);
    setActiveFrame(nextFrame);
    setStatus(`Draw pose ${nextFrame + 1}. The preview will animate through every pose.`);
  };

  const removeFrame = () => {
    if (frames.length < 2) return;
    const removedFrame = activeFrame;
    setFrames(current => current.filter((_frame, index) => index !== removedFrame));
    setActiveFrame(Math.min(activeFrame, frames.length - 2));
    setPreviewFrame(0);
    setStatus(`Pose ${removedFrame + 1} removed.`);
  };

  const chooseAudioFile = async event => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!String(file.type || "").startsWith("audio/")) {
      setStatus("Choose an audio file such as MP3, WAV, OGG, M4A, or WebM.");
      return;
    }
    if (file.size > safeMaxAudioBytes) {
      setStatus(`That sound is too large. Choose one under ${formatBytes(safeMaxAudioBytes)}.`);
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setCustomAudio({ dataUrl, mimeType: file.type || "audio/mpeg", name: file.name.slice(0, 80) });
      setSoundId("custom");
      setStatus("Custom sound ready.");
    } catch (error) {
      setStatus(error?.message || "That sound could not be loaded.");
    }
  };

  const stopRecording = () => {
    window.clearTimeout(recordingTimerRef.current);
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") recorder.stop();
  };

  const startRecording = async () => {
    if (!canRecord || recording || disabled) {
      if (!canRecord) setStatus("Recording is not available in this browser. You can upload a short audio file instead.");
      return;
    }
    setStatus("Requesting microphone access…");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false
      });
      streamRef.current = stream;
      const mimeType = preferredRecordingMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorderRef.current = recorder;
      recordingChunksRef.current = [];
      recordingBytesRef.current = 0;
      recordingTooLargeRef.current = false;
      recordingStartRef.current = Date.now();

      recorder.ondataavailable = event => {
        if (!event.data?.size) return;
        recordingBytesRef.current += event.data.size;
        if (recordingBytesRef.current > safeMaxAudioBytes) {
          recordingTooLargeRef.current = true;
          stopRecording();
          return;
        }
        recordingChunksRef.current.push(event.data);
      };
      recorder.onerror = () => setStatus("Recording stopped unexpectedly. Try again or upload a sound.");
      recorder.onstop = async () => {
        window.clearTimeout(recordingTimerRef.current);
        stream.getTracks().forEach(track => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        setRecording(false);
        if (recordingTooLargeRef.current) {
          setStatus(`Recording was stopped because it exceeded ${formatBytes(safeMaxAudioBytes)}.`);
          return;
        }
        const blob = new Blob(recordingChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (!blob.size) {
          setStatus("Nothing was recorded. Check your microphone and try again.");
          return;
        }
        try {
          const dataUrl = await readFileAsDataUrl(blob);
          const seconds = Math.max(1, Math.round((Date.now() - recordingStartRef.current) / 1000));
          setCustomAudio({ dataUrl, mimeType: blob.type || "audio/webm", name: `Recorded sound (${seconds}s)` });
          setSoundId("custom");
          setStatus("Recording ready. Give it a listen!");
        } catch (error) {
          setStatus(error?.message || "That recording could not be prepared.");
        }
      };

      recorder.start(250);
      setRecording(true);
      setSoundId("custom");
      setStatus(`Recording… it will stop after ${Math.round(safeRecordingMs / 1000)} seconds.`);
      recordingTimerRef.current = window.setTimeout(stopRecording, safeRecordingMs);
    } catch (error) {
      streamRef.current?.getTracks?.().forEach(track => track.stop());
      streamRef.current = null;
      setRecording(false);
      if (error?.name === "NotAllowedError") {
        setStatus("Microphone permission was not granted. You can upload a short sound instead.");
      } else {
        setStatus("The microphone could not start. Try an audio upload instead.");
      }
    }
  };

  const previewSound = () => {
    if (soundId === "custom") {
      audioPreviewRef.current?.play?.().catch?.(() => {});
      return;
    }
    if (soundId !== "none") onPreviewPresetSound?.(soundId);
  };

  const save = async event => {
    event.preventDefault();
    const completedFrames = frames.filter(isImageSource).slice(0, MAX_CUSTOM_GAHOOK_FRAMES);
    if (!completedFrames.length) {
      setStatus("Draw or upload at least one avatar pose before saving.");
      return;
    }
    if (completedFrames.some(frame => dataUrlByteSize(frame) > safeMaxImageBytes)) {
      setStatus(`Keep each avatar frame under ${formatBytes(safeMaxImageBytes)}.`);
      return;
    }
    if (soundId === "custom" && !customAudio?.dataUrl) {
      setStatus("Record or upload your custom sound, or choose a preset sound.");
      return;
    }

    const value = {
      version: 2,
      name: name.trim().slice(0, 32) || "My Gahook",
      frames: completedFrames,
      backgroundId: "monkey",
      backgroundColor,
      effectId,
      soundId,
      customAudioDataUrl: soundId === "custom" ? customAudio.dataUrl : null,
      customAudioMimeType: soundId === "custom" ? customAudio.mimeType : null,
      customAudioName: soundId === "custom" ? customAudio.name : null
    };

    setSaving(true);
    setStatus("");
    try {
      await Promise.resolve(onSave?.(value));
    } catch (error) {
      setStatus(error?.message || "Your Gahook could not be saved. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return <form className="custom-gahook-creator" onSubmit={save}>
    <header className="custom-gahook-creator__header">
      <div>
        <span className="custom-gahook-creator__eyebrow">Your prank, your style</span>
        <h2>{title}</h2>
        <p>Draw up to three poses, choose a colour, then pick how your custom Gahook crashes onto your friends’ screens.</p>
      </div>
      <label className="custom-gahook-creator__name">
        <span>Gahook name</span>
        <input value={name} onChange={event => setName(event.target.value.slice(0, 32))} maxLength="32" disabled={disabled || saving} />
      </label>
    </header>

    <div className="custom-gahook-creator__workspace">
      <section className="custom-gahook-frames" aria-labelledby="custom-gahook-frames-title">
        <div className="custom-gahook-section-heading">
          <div><span>Step 1</span><h3 id="custom-gahook-frames-title">Draw the avatar</h3></div>
          <small>PNG, JPG, or WebP · resized to a room-safe {formatBytes(safeMaxImageBytes)}</small>
        </div>
        <SimplePaintEditor
          value={frames[activeFrame] || null}
          onChange={updateFrame}
          onExport={updateFrame}
          width={512}
          height={512}
          label={`Draw custom Gahook pose ${activeFrame + 1}`}
          backgroundColor="#ffffff"
          transparent
          allowUpload
          showExport={false}
          maxExportDimension={384}
          maxUploadBytes={MAX_SOURCE_IMAGE_UPLOAD_BYTES}
          mimeType="image/webp"
          imageQuality={0.78}
          readOnly={disabled || saving}
          className="custom-gahook-paint"
        />
        {/* The poses live under the canvas: they describe what has been drawn,
            so reading them before the drawing put the summary above the thing
            it summarises. */}
        <div className="custom-gahook-frame-tabs" role="group" aria-label="Avatar poses">
          {frames.map((frame, index) => <button
            type="button"
            aria-pressed={activeFrame === index}
            className={activeFrame === index ? "is-selected" : ""}
            onClick={() => setActiveFrame(index)}
            disabled={disabled || saving}
            key={`frame-${index}`}
          >
            <span>{frame ? <img src={frame} alt="" /> : index + 1}</span>
            Pose {index + 1}
          </button>)}
          {frames.length < MAX_CUSTOM_GAHOOK_FRAMES ? <button type="button" className="custom-gahook-frame-tabs__add" onClick={addFrame} disabled={disabled || saving}>
            <span aria-hidden="true">+</span> Add pose
          </button> : null}
          {frames.length > 1 ? <button type="button" className="custom-gahook-frame-tabs__remove" onClick={removeFrame} disabled={disabled || saving}>
            <span className="custom-gahook-button-icon" aria-hidden="true">🗑</span>
            Remove pose {activeFrame + 1}
          </button> : null}
        </div>
      </section>

      <aside className="custom-gahook-preview-panel" aria-labelledby="custom-gahook-preview-title">
        <div className="custom-gahook-section-heading">
          <div><span>Live preview</span><h3 id="custom-gahook-preview-title">Incoming Gahook!</h3></div>
        </div>
        <div className="custom-gahook-preview custom-gahook-monkey-stage" style={backgroundStageStyle(backgroundColor)}>
          <div className={`custom-gahook-preview__avatar custom-gahook-effect--${effectId}`}>
            {previewFrames[previewFrame]
              ? <img src={previewFrames[previewFrame]} alt="Preview of your custom Gahook" />
              : <span aria-hidden="true">?</span>}
          </div>
          <div className="custom-gahook-preview__wordmark"><strong>GAHOOK!</strong><span>−50</span></div>
        </div>
        <dl className="custom-gahook-preview-panel__summary">
          <div><dt>Background</dt><dd>{backgroundColor.toUpperCase()}</dd></div>
          <div><dt>Entrance</dt><dd>{selectedEffect.label}</dd></div>
          <div><dt>Poses</dt><dd>{previewFrames.length || 1}</dd></div>
        </dl>
      </aside>
    </div>

    <section className="custom-gahook-options" aria-labelledby="custom-gahook-style-title">
      <div className="custom-gahook-section-heading">
        <div><span>Step 2</span><h3 id="custom-gahook-style-title">Choose the chaos</h3></div>
      </div>
      <fieldset className="custom-gahook-choice-group custom-gahook-background-picker">
        <legend>Choose background color</legend>
        <input
          className="custom-gahook-custom-color"
          type="color"
          value={backgroundColor}
          onChange={event => setBackgroundColor(event.target.value)}
          disabled={disabled || saving}
          aria-label="Choose background color"
        />
      </fieldset>
      <fieldset className="custom-gahook-choice-group">
        <legend>Avatar motion</legend>
        <div className="custom-gahook-choice-grid custom-gahook-choice-grid--effects">
          {CUSTOM_GAHOOK_EFFECTS.map(option => <label className={effectId === option.id ? "is-selected" : ""} key={option.id}>
            <input type="radio" name="custom-gahook-effect" value={option.id} checked={effectId === option.id} onChange={() => setEffectId(option.id)} disabled={disabled || saving} />
            <strong>{option.label}</strong><small>{option.description}</small>
          </label>)}
        </div>
      </fieldset>
    </section>

    <section className="custom-gahook-sound" aria-labelledby="custom-gahook-sound-title">
      <div className="custom-gahook-section-heading">
        <div><span>Step 3</span><h3 id="custom-gahook-sound-title">Pick the noise</h3></div>
        <small>Record up to {Math.round(safeRecordingMs / 1000)} seconds, or upload up to {formatBytes(safeMaxAudioBytes)}</small>
      </div>
      <div className="custom-gahook-sound__choices">
        {CUSTOM_GAHOOK_SOUNDS.map(option => <label className={soundId === option.id ? "is-selected" : ""} key={option.id}>
          <input type="radio" name="custom-gahook-sound" value={option.id} checked={soundId === option.id} onChange={() => setSoundId(option.id)} disabled={disabled || saving || recording} />
          <strong>{option.label}</strong><small>{option.description}</small>
        </label>)}
      </div>
      <div className="custom-gahook-sound__custom">
        <button type="button" onClick={recording ? stopRecording : startRecording} disabled={disabled || saving || (!canRecord && !recording)} className={recording ? "is-recording" : ""}>
          <span className="custom-gahook-button-icon" aria-hidden="true">{recording ? "■" : "●"}</span>
          {recording ? "Stop recording" : "Record sound"}
        </button>
        <button type="button" onClick={() => audioInputRef.current?.click()} disabled={disabled || saving || recording}>
          <span className="custom-gahook-button-icon" aria-hidden="true">⭱</span>
          Upload audio
        </button>
        <input ref={audioInputRef} className="sr-only" type="file" accept="audio/mpeg,audio/wav,audio/ogg,audio/webm,audio/mp4,audio/x-m4a" onChange={chooseAudioFile} />
        {soundId !== "none" ? <button type="button" onClick={previewSound} disabled={disabled || saving || (soundId === "custom" && !customAudio) || (soundId !== "custom" && typeof onPreviewPresetSound !== "function")}>
          <span className="custom-gahook-button-icon" aria-hidden="true">▶</span>
          Preview sound
        </button> : null}
        {!canRecord ? <span>Microphone recording is unavailable here; audio upload still works.</span> : null}
      </div>
      {customAudio ? <div className="custom-gahook-sound__player">
        <span>{customAudio.name}</span>
        <audio ref={audioPreviewRef} className="custom-gahook-audio" controls preload="metadata" src={customAudio.dataUrl} />
        <button type="button" onClick={() => { setCustomAudio(null); if (soundId === "custom") setSoundId("bonk"); }} disabled={disabled || saving || recording}>
          <span className="custom-gahook-button-icon" aria-hidden="true">✕</span>
          Remove
        </button>
      </div> : null}
    </section>

    <div className="custom-gahook-creator__footer">
      <p className="custom-gahook-creator__status" role="status" aria-live="polite">{status}</p>
      <div>
        <button type="button" className="custom-gahook-creator__cancel" onClick={onCancel} disabled={saving || recording}>
          <span className="custom-gahook-button-icon" aria-hidden="true">✕</span>
          Cancel
        </button>
        <button type="submit" className="custom-gahook-creator__save" disabled={disabled || saving || recording || typeof onSave !== "function"}>
          <span className="custom-gahook-button-icon" aria-hidden="true">{saving ? "⏳" : "✓"}</span>
          {saving ? "Saving…" : "Use my Gahook"}
        </button>
      </div>
    </div>
  </form>;
}
