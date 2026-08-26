import React, { useEffect, useId, useRef, useState } from "react";

export const SOCIAL_CHAT_LIMIT = 60;
export const SOCIAL_CHAT_CHARACTER_LIMIT = 240;
const SOCIAL_DRAWING_POINTS_PER_STROKE = 128;

const AVATAR_BASE_HUES = Object.freeze({
  zap: 334, pop: 188, star: 218, bolt: 263, disco: 205, rocket: 145, crown: 33,
  pizza: 7, gamepad: 201, gem: 187, panda: 205, tiger: 28, koala: 216, fox: 20,
  frog: 137, owl: 264, whale: 193, bee: 48, bunny: 329, turtle: 142, poop: 28,
  caseoh: 22, banana: 51
});

function stableProfileHash(value) {
  let hash = 2166136261;
  for (const character of String(value || "player")) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function chatProfileStyle(message) {
  const avatarId = String(message?.senderAvatarId || "").toLowerCase();
  const imageSeed = String(message?.senderAvatarImageDataUrl || "");
  const playerSeed = String(message?.senderId || message?.senderName || "player");
  const profileHash = stableProfileHash(imageSeed || avatarId || playerSeed);
  const playerOffset = (stableProfileHash(playerSeed) % 23) - 11;
  const baseHue = Number.isFinite(AVATAR_BASE_HUES[avatarId]) ? AVATAR_BASE_HUES[avatarId] : profileHash % 360;
  const hue = (baseHue + playerOffset + 360) % 360;
  const secondHue = (hue + 18 + profileHash % 16) % 360;
  return {
    "--chat-profile-background": `linear-gradient(135deg, hsla(${hue}, 66%, 38%, 0.68), hsla(${secondHue}, 58%, 25%, 0.78))`,
    "--chat-profile-border": `hsla(${hue}, 88%, 74%, 0.58)`,
    "--chat-profile-accent": `hsl(${hue}, 88%, 84%)`
  };
}

function messageTime(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
  } catch {
    return "";
  }
}

function socialMessageKey(message, index = 0) {
  return String(message?.id || `${message?.senderId || "player"}-${message?.createdAt || index}-${index}`);
}

function drawingStrokeSegments(stroke) {
  const points = Array.isArray(stroke?.points) ? stroke.points : [];
  if (points.length <= SOCIAL_DRAWING_POINTS_PER_STROKE) return [stroke];
  const segments = [];
  let startIndex = 0;
  while (startIndex < points.length) {
    const segmentPoints = points.slice(startIndex, startIndex + SOCIAL_DRAWING_POINTS_PER_STROKE);
    segments.push({ ...stroke, points: segmentPoints });
    if (startIndex + SOCIAL_DRAWING_POINTS_PER_STROKE >= points.length) break;
    startIndex += SOCIAL_DRAWING_POINTS_PER_STROKE - 1;
  }
  return segments;
}

function SocialAvatar({ message, renderAvatar }) {
  if (typeof renderAvatar === "function") {
    const rendered = renderAvatar(message);
    if (rendered) return rendered;
  }
  const image = String(message?.senderAvatarImageDataUrl || "");
  const name = String(message?.senderName || "Player");
  return <span className="social-chat__avatar" aria-hidden="true">
    {image.startsWith("data:image/") || image.startsWith("/media/")
      ? <img src={image} alt="" />
      : <span>{name.trim().slice(0, 1).toUpperCase() || "?"}</span>}
  </span>;
}

/** Waiting-room chat presented in the same banner style as the player list. */
export function WaitingRoomSocial({
  snapshot = null,
  messages,
  ownPlayerId = "",
  disabled = false,
  onSendMessage,
  onDrawStroke,
  onClearDrawings,
  renderAvatar,
  title = "Room chat",
  className = ""
}) {
  const sourceMessages = Array.isArray(messages)
    ? messages
    : (Array.isArray(snapshot?.chatMessages) ? snapshot.chatMessages : []);
  const visibleMessages = sourceMessages.slice(-SOCIAL_CHAT_LIMIT);
  const newestMessageKey = visibleMessages.length
    ? String(visibleMessages[visibleMessages.length - 1]?.id || visibleMessages[visibleMessages.length - 1]?.createdAt || visibleMessages.length)
    : "empty";

  const [chatText, setChatText] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [chatStatus, setChatStatus] = useState("");
  const [brushSize, setBrushSize] = useState(7);
  const [drawingEnabled, setDrawingEnabled] = useState(false);
  const [drawingBusy, setDrawingBusy] = useState(false);
  const [minimized, setMinimized] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const rootRef = useRef(null);
  const messageListRef = useRef(null);
  const canvasRef = useRef(null);
  const chatInputRef = useRef(null);
  const activeStrokeRef = useRef(null);
  const knownMessageKeysRef = useRef(new Set(visibleMessages.map(socialMessageKey)));
  const sectionTitleId = useId();
  const chatTitleId = useId();
  const chatInputId = useId();

  useEffect(() => {
    const list = messageListRef.current;
    if (!list) return;
    list.scrollTop = list.scrollHeight;
  }, [newestMessageKey, minimized]);

  useEffect(() => {
    const knownKeys = knownMessageKeysRef.current;
    const incoming = [];
    visibleMessages.forEach((message, index) => {
      const key = socialMessageKey(message, index);
      if (!knownKeys.has(key)) {
        knownKeys.add(key);
        if (String(message?.senderId || "") !== String(ownPlayerId || "")) incoming.push({ ...message, notificationKey: key });
      }
    });
    if (knownKeys.size > SOCIAL_CHAT_LIMIT * 3) {
      knownMessageKeysRef.current = new Set(visibleMessages.map(socialMessageKey));
    }
    if (!minimized || !incoming.length) return;
    setUnreadCount((count) => Math.min(99, count + incoming.length));
    setNotifications((current) => [...current, ...incoming].slice(-3));
  }, [newestMessageKey, minimized, ownPlayerId]);

  const strokes = Array.isArray(snapshot?.whiteboardStrokes) ? snapshot.whiteboardStrokes : [];
  const boardRevision = Number(snapshot?.whiteboardRevision || 0);
  const hasOwnDrawings = strokes.some(stroke => String(stroke?.senderId || "") === String(ownPlayerId || ""));

  const paintCanvas = (draft = activeStrokeRef.current) => {
    const canvas = canvasRef.current;
    const shell = messageListRef.current;
    if (!canvas || !shell) return;
    const rect = shell.getBoundingClientRect();
    const ratio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const width = Math.max(1, Math.round(rect.width * ratio));
    const height = Math.max(1, Math.round(rect.height * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, rect.width, rect.height);
    const drawStroke = stroke => {
      const points = Array.isArray(stroke?.points) ? stroke.points : [];
      if (!points.length) return;
      context.save();
      context.globalAlpha = 0.5;
      context.strokeStyle = "#ffffff";
      context.fillStyle = "#ffffff";
      context.lineWidth = Number(stroke.size) || 7;
      context.lineCap = "round";
      context.lineJoin = "round";
      context.beginPath();
      context.moveTo(points[0].x * rect.width, points[0].y * rect.height);
      points.slice(1).forEach(point => context.lineTo(point.x * rect.width, point.y * rect.height));
      if (points.length === 1) {
        context.arc(points[0].x * rect.width, points[0].y * rect.height, context.lineWidth / 2, 0, Math.PI * 2);
        context.fill();
      } else {
        context.stroke();
      }
      context.restore();
    };
    strokes.forEach(drawStroke);
    if (draft) drawStroke(draft);
  };

  useEffect(() => {
    paintCanvas();
    const shell = messageListRef.current;
    if (!shell || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => paintCanvas());
    observer.observe(shell);
    return () => observer.disconnect();
  }, [strokes, boardRevision]);

  const pointFromEvent = event => {
    const rect = messageListRef.current?.getBoundingClientRect();
    if (!rect?.width || !rect?.height) return null;
    return {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))
    };
  };

  const startDrawing = event => {
    if (!drawingEnabled || disabled || drawingBusy) return;
    const point = pointFromEvent(event);
    if (!point) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    activeStrokeRef.current = { tool: "brush", color: "#ffffff", size: brushSize, points: [point] };
    paintCanvas(activeStrokeRef.current);
  };

  const continueDrawing = event => {
    const stroke = activeStrokeRef.current;
    if (!stroke) return;
    const point = pointFromEvent(event);
    if (!point) return;
    const previous = stroke.points[stroke.points.length - 1];
    if (Math.hypot(point.x - previous.x, point.y - previous.y) < 0.003) return;
    event.preventDefault();
    stroke.points.push(point);
    paintCanvas(stroke);
  };

  const finishDrawing = async event => {
    const stroke = activeStrokeRef.current;
    if (!stroke) return;
    event.preventDefault();
    activeStrokeRef.current = null;
    setDrawingBusy(true);
    try {
      for (const segment of drawingStrokeSegments(stroke)) {
        await Promise.resolve(onDrawStroke?.(segment));
      }
    } catch (error) {
      setChatStatus(error?.message || "Drawing not shared. Try again.");
    } finally {
      setDrawingBusy(false);
      paintCanvas(null);
    }
  };

  const chooseBrush = size => {
    setBrushSize(size);
    setDrawingEnabled(true);
  };

  const clearDrawings = async () => {
    if (disabled || drawingBusy || typeof onClearDrawings !== "function") return;
    setDrawingBusy(true);
    try {
      await Promise.resolve(onClearDrawings());
    } catch (error) {
      setChatStatus(error?.message || "Drawings not cleared. Try again.");
    } finally {
      setDrawingBusy(false);
    }
  };

  const sendMessage = async event => {
    event.preventDefault();
    const text = chatText.trim().slice(0, SOCIAL_CHAT_CHARACTER_LIMIT);
    if (!text || disabled || chatBusy || typeof onSendMessage !== "function") return;
    setChatBusy(true);
    setChatStatus("");
    try {
      await Promise.resolve(onSendMessage(text));
      setChatText("");
    } catch (error) {
      setChatStatus(error?.message || "Message not sent. Try again.");
    } finally {
      setChatBusy(false);
      window.requestAnimationFrame(() => chatInputRef.current?.focus({ preventScroll: true }));
    }
  };

  const stopDrawing = () => setDrawingEnabled(false);

  const minimizeChat = () => {
    stopDrawing();
    setMinimized(true);
  };

  const restoreChat = () => {
    setMinimized(false);
    setUnreadCount(0);
    setNotifications([]);
  };

  useEffect(() => {
    if (minimized) return undefined;
    const handlePagePointerDown = event => {
      const root = rootRef.current;
      if (!root) return;
      if (!root.contains(event.target)) {
        minimizeChat();
        return;
      }
      if (drawingEnabled && !canvasRef.current?.contains(event.target)) stopDrawing();
    };
    document.addEventListener("pointerdown", handlePagePointerDown);
    return () => document.removeEventListener("pointerdown", handlePagePointerDown);
  }, [drawingEnabled, minimized]);

  const rootClassName = [`waiting-room-social`, minimized ? "is-minimized" : "is-expanded", className].filter(Boolean).join(" ");

  if (minimized) {
    return <section ref={rootRef} className={rootClassName} aria-label={title}>
      <h2 className="sr-only" id={sectionTitleId}>{title}</h2>
      <div className="social-chat-notifications" aria-live="polite" aria-atomic="false">
        {notifications.map((message) => <button className="social-chat-notification" style={chatProfileStyle(message)} type="button" onClick={restoreChat} key={message.notificationKey}>
          <SocialAvatar message={message} renderAvatar={renderAvatar} />
          <span>
            <strong>{String(message?.senderName || "Player")}</strong>
            <small>{String(message?.text || "").slice(0, 110)}</small>
          </span>
        </button>)}
      </div>
      <button className="social-chat-fab" type="button" onClick={restoreChat} aria-label={`Open room chat${unreadCount ? `, ${unreadCount} unread` : ""}`} aria-expanded="false">
        <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M6 7h20v14H14l-6 5v-5H6z" /><path d="M11 12h10M11 16h7" /></svg>
        {unreadCount ? <span>{unreadCount === 99 ? "99+" : unreadCount}</span> : null}
      </button>
    </section>;
  }

  return <section ref={rootRef} className={rootClassName} aria-labelledby={sectionTitleId}>
    <header className="waiting-room-social__header">
      <h2 id={sectionTitleId}>{title}</h2>
      <div className="social-chat-window-actions">
        <div className="social-drawing-tools" role="group" aria-label="Draw over room chat">
          {[3, 7, 14].map((size, index) => <button className={drawingEnabled && brushSize === size ? "is-selected" : ""} type="button" aria-pressed={drawingEnabled && brushSize === size} onClick={() => chooseBrush(size)} key={size} title={["Small brush", "Medium brush", "Large brush"][index]}><span style={{ width: size, height: size }} /> <b>{["S", "M", "L"][index]}</b></button>)}
          <button className="social-drawing-tools__clear" type="button" onClick={clearDrawings} disabled={disabled || drawingBusy || !hasOwnDrawings} title="Erase only your drawings">Erase</button>
        </div>
        <button className="social-chat-minimize" type="button" onClick={minimizeChat} aria-label="Minimize room chat" title="Minimize room chat"><span aria-hidden="true">×</span></button>
      </div>
    </header>

    <section className="social-chat" aria-labelledby={chatTitleId}>
      <h3 className="sr-only" id={chatTitleId}>Room messages and drawings</h3>
      <div className="social-chat__canvas-shell">
      <ol ref={messageListRef} className="social-chat__messages" role="log" aria-live="polite" aria-relevant="additions text">
        {visibleMessages.length ? visibleMessages.map((message, index) => {
          const senderId = String(message?.senderId || "");
          const isOwn = Boolean(ownPlayerId && senderId === String(ownPlayerId));
          const messageKey = socialMessageKey(message, index);
          const time = messageTime(message?.createdAt);
          return <li className={isOwn ? "social-chat__message is-own" : "social-chat__message"} style={chatProfileStyle(message)} key={messageKey}>
            <SocialAvatar message={message} renderAvatar={renderAvatar} />
            <div className="social-chat__bubble">
              <div className="social-chat__meta">
                <strong>{String(message?.senderName || "Player")}</strong>
                {time ? <time dateTime={String(message.createdAt)}>{time}</time> : null}
                {isOwn ? <span>You</span> : null}
              </div>
              <p>{String(message?.text || "")}</p>
            </div>
          </li>;
        }) : <li className="social-chat__empty">No messages yet. Break the ice!</li>}
      </ol>
      <canvas ref={canvasRef} className={drawingEnabled ? "social-chat__drawing is-active" : "social-chat__drawing"} aria-label="Shared chat drawing surface" onPointerDown={startDrawing} onPointerMove={continueDrawing} onPointerUp={finishDrawing} onPointerCancel={finishDrawing} onWheel={event => { if (messageListRef.current) messageListRef.current.scrollTop += event.deltaY; }} />
      {drawingEnabled ? <button className="social-chat__stop-drawing" type="button" onClick={stopDrawing}>Done drawing</button> : null}
      </div>
      <form className="social-chat__composer" onSubmit={sendMessage}>
        <label className="sr-only" htmlFor={chatInputId}>Message the room</label>
        <input
          ref={chatInputRef}
          id={chatInputId}
          type="text"
          value={chatText}
          onChange={event => setChatText(event.target.value.slice(0, SOCIAL_CHAT_CHARACTER_LIMIT))}
          maxLength={SOCIAL_CHAT_CHARACTER_LIMIT}
          placeholder="Send message"
          autoComplete="off"
          disabled={disabled || chatBusy}
        />
        <button type="submit" disabled={disabled || chatBusy || !chatText.trim() || typeof onSendMessage !== "function"}>
          {chatBusy ? "Sending…" : "Send"}
        </button>
      </form>
      <div className="social-chat__composer-meta">
        <span>{chatText.length}/{SOCIAL_CHAT_CHARACTER_LIMIT}</span>
        <span className="social-feedback" role="status" aria-live="polite">{chatStatus}</span>
        <button className="social-chat-minimize social-chat-minimize--footer" type="button" onClick={minimizeChat} aria-label="Minimize room chat" title="Minimize room chat"><span aria-hidden="true">×</span></button>
      </div>
    </section>
  </section>;
}
