import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

const preventGestureZoom = (event: Event) => event.preventDefault();
const preventMultiTouchZoom = (event: TouchEvent) => {
  if (event.touches.length > 1) event.preventDefault();
};

document.addEventListener("gesturestart", preventGestureZoom, { passive: false });
document.addEventListener("gesturechange", preventGestureZoom, { passive: false });
document.addEventListener("gestureend", preventGestureZoom, { passive: false });
document.addEventListener("touchmove", preventMultiTouchZoom, { passive: false });

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    const serviceWorkerUrl = new URL("sw.js", document.baseURI).toString();
    void navigator.serviceWorker.register(serviceWorkerUrl).catch(() => {
      // The app remains usable if service-worker registration fails.
    });
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
