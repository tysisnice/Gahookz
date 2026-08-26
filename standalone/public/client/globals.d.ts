interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

interface Window {
  gahookzInstallPrompt?: BeforeInstallPromptEvent;
  gahookzClockOffset?: number;
  gahookzRefreshSnapshot?: () => void;
  ReactDOM: typeof import("react-dom");
}
