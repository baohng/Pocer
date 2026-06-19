import { useEffect, useState } from "react";
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
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    let cancelled = false;
    encodeSession(session)
      .then(async (p) => {
        if (cancelled) return;
        const qr = await QRCode.toDataURL(p.url, {
          margin: 1,
          width: 240,
          color: { dark: "#0f1115", light: "#ffffff" },
        });
        if (cancelled) return;
        setPayload(p);
        setQrDataUrl(qr);
      })
      .catch(() => {
        if (!cancelled) setError("Could not generate share link.");
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

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
            {qrDataUrl && (
              <div className="share-qr">
                <img src={qrDataUrl} alt="QR code to join session" />
              </div>
            )}

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
