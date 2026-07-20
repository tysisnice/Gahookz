import * as Redux from "/vendor/redux.browser.js";
import * as ReactRedux from "/vendor/react-redux.browser.js";

globalThis.Redux = Redux;
globalThis.ReactRedux = ReactRedux;

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  window.gahookzInstallPrompt = event;
  window.dispatchEvent(new CustomEvent("gahookz-install-ready", { detail: event }));
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/service-worker.js", { scope: "/" }).catch(() => {});
}

await import("/app.js?v=release-c3ff48f8903517b2");
