import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import type { Session } from "../types";
import { encodeSession, type SharePayload } from "../utils/share";
import { useToast } from "./Toast";

interface Props {
  session: Session;
  onClose: () => void;
}

export default function ShareSheet({ session, onClose }: Props) {
  const [payload, setPayload] = useState<SharePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { showToast } = useToast();

  useEffect(() => {
    let cancelled = false;
    encodeSession(session)
      .then((p) => {
        if (!cancelled) setPayload(p);
      })
      .catch((err) => {
        if (!cancelled) {
          console.error("Share link error:", err);
          setError("Could not generate share link.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  // Drawing has to be its own effect: the canvas only exists once `payload` is
  // set, so the ref isn't populated until React has committed that render.
  // Awaiting a microtask inside the encode promise is not enough -- React
  // schedules the re-render as a macrotask, so the ref was still null and the
  // QR silently never got drawn.
  useEffect(() => {
    if (!payload || !canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, payload.url, {
      margin: 1,
      width: 220,
      color: { dark: "#0f1115", light: "#ffffff" },
    }).catch((err) => {
      console.error("QR render error:", err);
      setError("Could not render the QR code.");
    });
  }, [payload]);

  async function copyLink() {
    if (!payload) return;
    try {
      await navigator.clipboard.writeText(payload.url);
      showToast("Link copied", "success");
    } catch {
      showToast("Copy failed — long-press the link", "warning");
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal share-sheet" onClick={(e) => e.stopPropagation()}>
        <h2 className="share-title">Hand off this session</h2>
        <p className="modal-message">
          Share this link or QR with whoever is taking over. They'll load the
          current game onto their device.
        </p>

        {error ? (
          <p className="share-error">{error}</p>
        ) : !payload ? (
          <p className="modal-message">Generating…</p>
        ) : (
          <>
            <div className="share-qr">
              <canvas ref={canvasRef} aria-label="QR code to join session" />
            </div>

            <div className="share-code">Code: {payload.code}</div>

            <div className="share-link-row">
              <input
                className="share-link-input"
                readOnly
                value={payload.url}
                onFocus={(e) => e.currentTarget.select()}
              />
              <button className="btn btn-primary" onClick={copyLink}>
                Copy
              </button>
            </div>

            <p className="share-note">
              Once they've taken over, close this screen — only one person
              should keep score at a time.
            </p>
          </>
        )}

        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
