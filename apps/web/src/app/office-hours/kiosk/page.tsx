"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";

import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";

type KioskOpenSession = {
  id: string;
  checkin_at: string;
};

type KioskStatus = {
  user_exists: boolean;
  open_session: KioskOpenSession | null;
};

const EmailSchema = z.string().email();

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

function friendlyError(code: string): string {
  switch (code) {
    case "invalid_email":
      return "Enter a valid email.";
    case "email_not_allowed":
      return "This email isn’t allowed to use the Office Hours form. Ask an admin to add you to the allowlist.";
    case "outside_geofence":
      return "You appear to be outside the allowed office area.";
    case "already_checked_in":
      return "You already have an open session.";
    case "no_open_session":
      return "No open session found to check out.";
    case "office_location_not_configured":
      return "Office location is not fully configured yet (lat/lon/radii missing).";
    case "office_location_missing":
    case "office_config_missing":
      return "Office location is not configured yet.";
    case "location_incomplete":
      return "Location data is incomplete.";
    case "weekend_not_allowed":
      return "Office hours are only available Monday through Friday.";
    case "photo_required":
      return "A photo is required to check in.";
    case "invalid_photo_type":
      return "Unsupported photo type. Use JPG, PNG, or WebP.";
    case "photo_too_large":
      return "Photo is too large. Please retake a smaller photo.";
    default:
      return code || "Something went wrong.";
  }
}

async function getCurrentPosition(): Promise<{ lat: number; lon: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation not supported"));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      (err) => reject(err),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    );
  });
}

function supportsCameraCapture(): boolean {
  return typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
}

async function imageBlobFromVideo(video: HTMLVideoElement): Promise<Blob> {
  const w = video.videoWidth || 1280;
  const h = video.videoHeight || 720;

  const maxDim = 1280;
  const scale = Math.min(1, maxDim / Math.max(w, h));
  const outW = Math.max(1, Math.round(w * scale));
  const outH = Math.max(1, Math.round(h * scale));

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_unavailable");

  ctx.drawImage(video, 0, 0, outW, outH);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  if (!blob) throw new Error("capture_failed");
  return blob;
}

function fileFromBlob(blob: Blob): File {
  const name = `kiosk-selfie-${new Date().toISOString().replace(/[:.]/g, "-")}.jpg`;
  return new File([blob], name, { type: "image/jpeg" });
}

function PreviewImage({ file }: { file: File }) {
  const [url, setUrl] = useState<string>("");

  useEffect(() => {
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="Selfie preview" className="w-full rounded-md border bg-foreground/5 object-cover" />;
}

function SelfieCapture({
  value,
  disabled,
  onChange,
}: {
  value: File | null;
  disabled: boolean;
  onChange: (file: File | null) => void;
}) {
  const [mode, setMode] = useState<"camera" | "file">(() => (supportsCameraCapture() ? "camera" : "file"));
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stop = useCallback(() => {
    const stream = streamRef.current;
    streamRef.current = null;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const start = useCallback(async () => {
    if (!supportsCameraCapture()) {
      setCameraError("Camera is not supported on this device.");
      return;
    }
    setStarting(true);
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => null);
      }
    } catch {
      setCameraError("Camera permission is blocked. Use upload instead.");
      stop();
      setMode("file");
    } finally {
      setStarting(false);
    }
  }, [stop]);

  useEffect(() => {
    if (mode !== "camera" || value || disabled) {
      stop();
      return;
    }
    void start();
    return () => stop();
  }, [disabled, mode, start, stop, value]);

  async function capture() {
    if (!videoRef.current) return;
    setCapturing(true);
    setCameraError(null);
    try {
      const blob = await imageBlobFromVideo(videoRef.current);
      onChange(fileFromBlob(blob));
      stop();
    } catch {
      setCameraError("Could not capture a photo. Try again.");
    } finally {
      setCapturing(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">Selfie</div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="text-xs text-foreground/70 hover:text-foreground disabled:opacity-50"
            onClick={() => setMode("camera")}
            disabled={!supportsCameraCapture() || disabled}
          >
            Camera
          </button>
          <span className="text-xs text-foreground/30">|</span>
          <button
            type="button"
            className="text-xs text-foreground/70 hover:text-foreground disabled:opacity-50"
            onClick={() => setMode("file")}
            disabled={disabled}
          >
            Upload
          </button>
        </div>
      </div>

      {value ? (
        <div className="space-y-2">
          <PreviewImage file={value} />
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="h-10 w-full" onClick={() => onChange(null)} disabled={disabled}>
              Retake
            </Button>
          </div>
        </div>
      ) : mode === "camera" ? (
        <div className="space-y-2">
          <div className="relative overflow-hidden rounded-md border bg-black">
            <video ref={videoRef} playsInline muted className="aspect-[3/4] w-full object-cover" />
            {starting ? (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-sm text-white">
                Starting camera…
              </div>
            ) : null}
          </div>
          <Button type="button" className="h-12 w-full text-base" onClick={() => void capture()} disabled={disabled || starting || capturing}>
            {capturing ? "Capturing…" : "Take selfie"}
          </Button>
          {cameraError ? <div className="text-xs text-red-600">{cameraError}</div> : null}
          <div className="text-xs text-foreground/70">
            Tip: hold your phone at eye level and make sure your face is visible.
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <input
            type="file"
            accept="image/*"
            capture="user"
            className="block w-full text-sm text-foreground/80 file:mr-3 file:rounded-md file:border file:border-foreground/20 file:bg-transparent file:px-3 file:py-2 file:text-sm file:font-medium file:text-foreground hover:file:bg-foreground/5"
            onChange={(e) => onChange(e.target.files?.[0] ?? null)}
            disabled={disabled}
          />
          <div className="text-xs text-foreground/70">
            If your phone saves photos as HEIC and it fails, try the Camera mode.
          </div>
        </div>
      )}
    </div>
  );
}

export default function OfficeHoursKioskPage() {
  const [email, setEmail] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [status, setStatus] = useState<KioskStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [geoPermission, setGeoPermission] = useState<"granted" | "denied" | "prompt" | "unsupported">("prompt");

  const emailNormalized = useMemo(() => normalizeEmail(email), [email]);
  const emailValid = useMemo(() => EmailSchema.safeParse(emailNormalized).success, [emailNormalized]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("officeHours.kioskEmail");
      if (saved) setEmail(saved);
    } catch {
      // Ignore
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!navigator?.permissions?.query) {
      setGeoPermission("unsupported");
      return;
    }

    navigator.permissions
      .query({ name: "geolocation" as PermissionName })
      .then((status) => {
        if (cancelled) return;
        setGeoPermission(status.state);
        status.onchange = () => setGeoPermission(status.state);
      })
      .catch(() => setGeoPermission("unsupported"));

    return () => {
      cancelled = true;
    };
  }, []);

  const loadStatus = useCallback(async () => {
     if (!emailValid) {
       setStatus(null);
       return;
     }
 
     setStatusLoading(true);
     try {
       const res = await fetch(`/api/office-hours/kiosk/status?email=${encodeURIComponent(emailNormalized)}`);
       const json = (await res.json().catch(() => null)) as { error?: string } | KioskStatus | null;
 
       if (!res.ok) {
         setStatus(null);
         setError(friendlyError((json as { error?: string } | null)?.error ?? ""));
         return;
       }
 
       setStatus(json as KioskStatus);
     } finally {
       setStatusLoading(false);
     }
  }, [emailNormalized, emailValid]);

  useEffect(() => {
    setError(null);
    setNotice(null);

    if (!emailValid) {
      setStatus(null);
      return;
    }

    const id = window.setTimeout(() => {
      void loadStatus();
    }, 300);
    return () => window.clearTimeout(id);
  }, [emailValid, loadStatus]);

  const openSession = status?.open_session ?? null;

  const onCheckIn = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      if (!emailValid) {
        setError("Enter a valid email.");
        return;
      }

      if (!photo) {
        setError("Selfie is required to check in.");
        return;
      }

      const { lat, lon } = await getCurrentPosition();

      const form = new FormData();
      form.set("email", emailNormalized);
      form.set("lat", String(lat));
      form.set("lon", String(lon));
      form.set("photo", photo);

      const res = await fetch("/api/office-hours/kiosk/check-in", { method: "POST", body: form });

      const json = (await res.json().catch(() => null)) as { error?: string } | { session?: { checkin_at?: string } } | null;
      if (!res.ok) {
        setError(friendlyError((json as { error?: string } | null)?.error ?? ""));
        return;
      }
 
       try {
         window.localStorage.setItem("officeHours.kioskEmail", emailNormalized);
       } catch {
         // Ignore
       }
 
      const checkinAt = (json as { session?: { checkin_at?: string } } | null)?.session?.checkin_at;
      setNotice(checkinAt ? `Checked in at ${new Date(checkinAt).toLocaleString()}.` : "Checked in.");
      setPhoto(null);
      await loadStatus();
    } catch {
      setError("Location is required to check in. Enable location permissions and try again.");
    } finally {
      setLoading(false);
    }
  }, [emailNormalized, emailValid, loadStatus, photo]);

  const onCheckOut = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      if (!emailValid) {
        setError("Enter a valid email.");
        return;
      }

      const res = await fetch("/api/office-hours/kiosk/check-out", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: emailNormalized }),
      });
 
       const json = (await res.json().catch(() => null)) as { error?: string } | { session?: { duration_minutes?: number } } | null;
       if (!res.ok) {
         setError(friendlyError((json as { error?: string } | null)?.error ?? ""));
         return;
       }
 
       try {
         window.localStorage.setItem("officeHours.kioskEmail", emailNormalized);
       } catch {
         // Ignore
       }
 
       const duration = (json as { session?: { duration_minutes?: number } } | null)?.session?.duration_minutes;
       setNotice(typeof duration === "number" ? `Checked out. Session: ${duration} minutes.` : "Checked out.");
       await loadStatus();
     } finally {
       setLoading(false);
     }
  }, [emailNormalized, emailValid, loadStatus]);

  return (
    <PageShell
      title="Office Hours (Kiosk)"
      description="Enter your ASGC email, take a selfie, allow location, then tap Check in."
      containerClassName="max-w-md"
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-foreground/10 p-4">
          <div className="space-y-3">
            <label className="space-y-1 text-sm">
              <div className="text-foreground/70">ASGC email</div>
              <input
                type="email"
                inputMode="email"
                autoCapitalize="none"
                autoCorrect="off"
                className="h-12 w-full rounded-md border bg-transparent px-3 text-base"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@gcccd.edu"
              />
            </label>

            <div className="rounded-md border bg-foreground/[0.02] p-3 text-sm">
              {!emailValid ? (
                <div className="text-foreground/80">Enter your email to continue.</div>
              ) : statusLoading ? (
                <div className="text-foreground/80">Checking your status…</div>
              ) : openSession ? (
                <div className="text-foreground/80">
                  You’re currently <span className="font-medium">checked in</span> since{" "}
                  <span className="font-mono">{new Date(openSession.checkin_at).toLocaleString()}</span>.
                </div>
              ) : (
                <div className="text-foreground/80">
                  You’re <span className="font-medium">not checked in</span>.
                </div>
              )}
              {status?.user_exists === false ? (
                <div className="mt-1 text-xs text-foreground/70">
                  No account found yet — a kiosk check-in will create one.
                </div>
              ) : null}
            </div>

            {openSession ? (
              <div className="space-y-2">
                <Button
                  onClick={onCheckOut}
                  disabled={loading || !emailValid}
                  className="h-12 w-full text-base"
                >
                  {loading ? "Checking out…" : "Check out"}
                </Button>
                <div className="text-xs text-foreground/70">
                  Office hour credit requires manual check out.
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <SelfieCapture value={photo} disabled={loading || !emailValid} onChange={setPhoto} />

                {geoPermission === "denied" ? (
                  <div className="rounded-md border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-700 dark:text-red-300">
                    Location permission is blocked. Check-in requires location access.
                  </div>
                ) : (
                  <div className="text-xs text-foreground/70">
                    Location is checked at check-in to confirm you’re in the office.
                  </div>
                )}

                <Button
                  onClick={onCheckIn}
                  disabled={loading || !emailValid || !photo}
                  className="h-12 w-full text-base"
                >
                  {loading ? "Checking in…" : "Check in"}
                </Button>
                <div className="text-xs text-foreground/70">
                  Photos are retained for 30 days. Office hours are tracked Monday through Friday.
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-2">
              <Button variant="ghost" onClick={loadStatus} disabled={!emailValid || loading} className="h-9 px-2 text-xs">
                Refresh status
              </Button>
              <div className="text-[11px] text-foreground/60">Need access? Ask an admin to add you to the allowlist.</div>
            </div>

            {notice ? (
              <div className="rounded-md border bg-foreground/[0.02] p-3 text-sm text-foreground/80" role="status" aria-live="polite">
                {notice}
              </div>
            ) : null}
            {error ? (
              <div className="rounded-md border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-700 dark:text-red-300" role="alert">
                {error}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
