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

/**
 * The colour this player paints in.
 *
 * Derived from the same hue the chat already gives a player's profile, so the
 * strokes on the lobby wall read as theirs without a colour picker, a legend
 * or a name label. A player who changes their profile picture changes their
 * paint colour with it, which is the point: the colour *is* the identity.
 */
export function profilePaintColor(player) {
  const avatarId = String(player?.avatarId || "").toLowerCase();
  const imageSeed = String(player?.avatarImageDataUrl || "");
  const playerSeed = String(player?.id || player?.name || "player");
  const profileHash = stableProfileHash(imageSeed || avatarId || playerSeed);
  const playerOffset = (stableProfileHash(playerSeed) % 23) - 11;
  const baseHue = Number.isFinite(AVATAR_BASE_HUES[avatarId]) ? AVATAR_BASE_HUES[avatarId] : profileHash % 360;
  const hue = (baseHue + playerOffset + 360) % 360;
  return hslToHex(hue, 82, 62);
}

function hslToHex(hue, saturation, lightness) {
  const a = (saturation / 100) * Math.min(lightness / 100, 1 - lightness / 100);
  const channel = (n) => {
    const k = (n + hue / 30) % 12;
    const value = lightness / 100 - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return Math.round(255 * value).toString(16).padStart(2, "0");
  };
  return "#" + channel(0) + channel(8) + channel(4);
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
  const [minimized, setMinimized] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const rootRef = useRef(null);
  const messageListRef = useRef(null);
  const chatInputRef = useRef(null);
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

  // Painting moved off the chat window and onto the lobby player wall; see
  // LobbyPaintLayer below. Scribbling over the messages hid the conversation,
  // and the drawing had no relationship to anything underneath it.
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

  const minimizeChat = () => setMinimized(true);

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
      if (!root.contains(event.target)) minimizeChat();
    };
    document.addEventListener("pointerdown", handlePagePointerDown);
    return () => document.removeEventListener("pointerdown", handlePagePointerDown);
  }, [minimized]);

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
        <button className="social-chat-minimize" type="button" onClick={minimizeChat} aria-label="Minimize room chat" title="Minimize room chat"><span aria-hidden="true">×</span></button>
      </div>
    </header>

    <section className="social-chat" aria-labelledby={chatTitleId}>
      {/* Drawing moved off the chat and onto the player wall, so this heading
          no longer promises a surface that is not here. A screen-reader user
          being told about drawings they cannot reach is a worse bug than the
          stale wording looks. */}
      <h3 className="sr-only" id={chatTitleId}>Room messages</h3>
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

/** Opacity every lobby stroke is painted at. One value, deliberately. */
export const LOBBY_PAINT_OPACITY = 0.6;
/** The one brush. Mid-sized: broad enough to be a gesture, fine enough to write with. */
export const LOBBY_PAINT_BRUSH = 7;

/**
 * Paint over the lobby's player wall.
 *
 * Deliberately one tool and no options. The chat drawing surface had three
 * brush sizes, an eraser and a colour, which is a drawing app; this is a way
 * to scribble on your friends while you wait. Colour comes from the player's
 * own profile, size and opacity are fixed, and the only control is Draw.
 *
 * Strokes are stored per player on the server, which is what lets a Gahook
 * erase only the strokes belonging to the person who got Gahooked.
 */
export function LobbyPaintLayer({ snapshot = null, ownPlayer = null, disabled = false, onDrawStroke, onClearDrawings }) {
  const [drawing, setDrawing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const canvasRef = useRef(null);
  const surfaceRef = useRef(null);
  const activeStrokeRef = useRef(null);

  const strokes = Array.isArray(snapshot?.whiteboardStrokes) ? snapshot.whiteboardStrokes : [];
  const boardRevision = Number(snapshot?.whiteboardRevision || 0);
  const ownPlayerId = String(ownPlayer?.id || "");
  const hasOwnStrokes = strokes.some((stroke) => String(stroke?.senderId || "") === ownPlayerId);
  const paintColor = profilePaintColor(ownPlayer);
  const canPaint = Boolean(ownPlayerId) && !disabled && typeof onDrawStroke === "function";

  const paintCanvas = (draft = activeStrokeRef.current) => {
    const canvas = canvasRef.current;
    const surface = surfaceRef.current;
    if (!canvas || !surface) return;
    const rect = surface.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
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
    const drawStroke = (stroke) => {
      const points = Array.isArray(stroke?.points) ? stroke.points : [];
      if (!points.length) return;
      context.save();
      context.globalAlpha = LOBBY_PAINT_OPACITY;
      context.strokeStyle = stroke.color || "#ffffff";
      context.fillStyle = stroke.color || "#ffffff";
      context.lineWidth = Number(stroke.size) || LOBBY_PAINT_BRUSH;
      context.lineCap = "round";
      context.lineJoin = "round";
      context.beginPath();
      context.moveTo(points[0].x * rect.width, points[0].y * rect.height);
      points.slice(1).forEach((point) => context.lineTo(point.x * rect.width, point.y * rect.height));
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
    const surface = surfaceRef.current;
    if (!surface || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => paintCanvas());
    observer.observe(surface);
    return () => observer.disconnect();
  }, [strokes, boardRevision, drawing]);

  // The wall grows as players join, so a stroke is stored against the surface
  // it was drawn on, in fractions, not pixels.
  const pointFromEvent = (event) => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect?.width || !rect?.height) return null;
    return {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))
    };
  };

  const startStroke = (event) => {
    if (!drawing || !canPaint || busy) return;
    const point = pointFromEvent(event);
    if (!point) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    activeStrokeRef.current = { tool: "brush", color: paintColor, size: LOBBY_PAINT_BRUSH, points: [point] };
    paintCanvas(activeStrokeRef.current);
  };

  const continueStroke = (event) => {
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

  const finishStroke = async (event) => {
    const stroke = activeStrokeRef.current;
    if (!stroke) return;
    event.preventDefault();
    activeStrokeRef.current = null;
    setBusy(true);
    try {
      for (const segment of drawingStrokeSegments(stroke)) {
        await Promise.resolve(onDrawStroke?.(segment));
      }
      setStatus("");
    } catch (error) {
      setStatus(error?.message || "That stroke was not shared. Try again.");
    } finally {
      setBusy(false);
      paintCanvas(null);
    }
  };

  const eraseOwn = async () => {
    if (busy || typeof onClearDrawings !== "function") return;
    setBusy(true);
    try {
      await Promise.resolve(onClearDrawings());
      setStatus("");
    } catch (error) {
      setStatus(error?.message || "Your drawings were not cleared. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return <div className={drawing ? "lobby-paint is-drawing" : "lobby-paint"} ref={surfaceRef}>
    <canvas
      ref={canvasRef}
      className="lobby-paint__canvas"
      aria-hidden="true"
      onPointerDown={startStroke}
      onPointerMove={continueStroke}
      onPointerUp={finishStroke}
      onPointerCancel={finishStroke}
    />
    {canPaint ? <div className="lobby-paint__tools">
      {/* One option. Not a toolbar. */}
      <button
        className={drawing ? "lobby-paint__draw is-on" : "lobby-paint__draw"}
        type="button"
        aria-pressed={drawing}
        style={{ "--lobby-paint-color": paintColor }}
        onClick={() => setDrawing((was) => !was)}>
        <span className="lobby-paint__swatch" aria-hidden="true" />
        {drawing ? "Done" : "Draw"}
      </button>
      {hasOwnStrokes ? <button className="lobby-paint__erase" type="button" disabled={busy} onClick={eraseOwn}>Erase mine</button> : null}
    </div> : null}
    {status ? <p className="lobby-paint__status" role="status">{status}</p> : null}
  </div>;
}
