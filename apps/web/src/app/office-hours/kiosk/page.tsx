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
      return "A selfie is required to check in.";
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
  const [cameraState, setCameraState] = useState<"idle" | "starting" | "ready">("idle");
  const [capturing, setCapturing] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stop = useCallback(() => {
    const stream = streamRef.current;
    streamRef.current = null;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
    setVideoReady(false);
    setCameraState("idle");
  }, []);

  const start = useCallback(async () => {
    if (!supportsCameraCapture()) {
      setCameraError("Camera is not supported on this device.");
      return;
    }
    setCameraState("starting");
    setVideoReady(false);
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
        setCameraState("ready");
      }
    } catch {
      setCameraError("Camera permission is blocked. Use upload instead.");
      stop();
      setMode("file");
    }
  }, [stop]);

  useEffect(() => {
    if (mode !== "camera" || value || disabled) stop();
    return () => stop();
  }, [disabled, mode, start, stop, value]);

  async function capture() {
    if (!videoRef.current) return;
    if (!videoReady || (videoRef.current.videoWidth ?? 0) <= 0) {
      setCameraError("Camera is not ready yet. Please wait a moment.");
      return;
    }
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

  const canUseCamera = supportsCameraCapture();

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">Selfie</div>
        <div className="inline-flex overflow-hidden rounded-md border">
          <button
            type="button"
            className={`px-3 py-1 text-xs ${mode === "camera" ? "bg-foreground/5 text-foreground" : "text-foreground/70 hover:text-foreground"} disabled:opacity-50`}
            onClick={() => {
              setCameraError(null);
              setMode("camera");
              stop();
            }}
            disabled={!canUseCamera || disabled}
          >
            Camera
          </button>
          <button
            type="button"
            className={`px-3 py-1 text-xs ${mode === "file" ? "bg-foreground/5 text-foreground" : "text-foreground/70 hover:text-foreground"} disabled:opacity-50`}
            onClick={() => {
              setCameraError(null);
              setMode("file");
              stop();
            }}
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
          {cameraState === "ready" ? (
            <>
              <div className="relative overflow-hidden rounded-md border bg-black">
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  onLoadedMetadata={() => setVideoReady(true)}
                  onCanPlay={() => setVideoReady(true)}
                  className="aspect-[4/5] w-full max-h-[360px] object-cover"
                />
                {!videoReady ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-sm text-white">
                    Warming up camera…
                  </div>
                ) : (
                  <div className="absolute bottom-2 left-2 rounded-full bg-black/50 px-2 py-1 text-[11px] text-white">
                    Center your face in the frame
                  </div>
                )}
              </div>
              <Button
                type="button"
                className="h-12 w-full text-base"
                onClick={() => void capture()}
                disabled={disabled || capturing || !videoReady}
              >
                {capturing ? "Capturing…" : "Take selfie"}
              </Button>
            </>
          ) : (
            <div className="space-y-2">
              <div className="rounded-md border bg-foreground/[0.02] p-3 text-sm text-foreground/80">
                Tap below to enable the front camera and take a quick selfie.
              </div>
              <Button
                type="button"
                variant="outline"
                className="h-12 w-full text-base"
                onClick={() => void start()}
                disabled={disabled || !canUseCamera || cameraState === "starting"}
              >
                {cameraState === "starting" ? "Starting camera…" : "Enable camera"}
              </Button>
              <div className="text-xs text-foreground/70">
                If camera permission is blocked, switch to Upload.
              </div>
            </div>
          )}
          {cameraError ? <div className="text-xs text-red-600">{cameraError}</div> : null}
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

  const step = useMemo(() => {
    if (openSession) return "checked_in";
    if (!emailValid) return "email";
    if (!photo) return "selfie";
    return "ready";
  }, [emailValid, openSession, photo]);

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
      containerClassName="max-w-5xl py-6"
      showHeader={false}
    >
      <div className="relative flex min-h-[70vh] items-center justify-center">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-emerald-500/10 via-transparent to-transparent" />

        <div className="w-full max-w-lg">
          <div className="rounded-2xl border bg-background/70 p-5 shadow-sm ring-1 ring-black/5 backdrop-blur supports-[backdrop-filter]:bg-background/60 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="text-2xl font-semibold tracking-tight">Office Hours Kiosk</div>
                <div className="text-sm text-foreground/60">Fast check-in for the office (email → selfie → location)</div>
              </div>
              <div className="flex items-center gap-1.5 pt-1">
                <span className={`h-2 w-2 rounded-full ${step !== "email" ? "bg-emerald-500" : "bg-foreground/20"}`} />
                <span className={`h-2 w-2 rounded-full ${step === "ready" || step === "checked_in" ? "bg-emerald-500" : step === "selfie" ? "bg-emerald-400" : "bg-foreground/20"}`} />
                <span className={`h-2 w-2 rounded-full ${step === "checked_in" ? "bg-emerald-500" : "bg-foreground/20"}`} />
              </div>
            </div>

            <div className="mt-5 space-y-5">
              <div className="space-y-2">
                <label className="space-y-1">
                  <div className="text-sm font-medium text-foreground/80">ASGC email</div>
                  <input
                    type="email"
                    inputMode="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    className="h-12 w-full rounded-xl border bg-transparent px-4 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@gcccd.edu"
                    aria-label="ASGC email"
                  />
                </label>

                <div className="flex items-center justify-between text-xs text-foreground/60">
                  <span>{emailValid ? "Looks good." : "Use your @gcccd.edu email."}</span>
                  {statusLoading ? <span>Checking…</span> : null}
                </div>
              </div>

              {emailValid ? (
                openSession ? (
                  <div className="space-y-3">
                    <div className="rounded-xl border bg-emerald-500/5 p-4 text-sm text-foreground/80">
                      <div className="font-medium">You’re checked in</div>
                      <div className="mt-1 text-xs text-foreground/60">
                        Since <span className="font-mono">{new Date(openSession.checkin_at).toLocaleString()}</span>
                      </div>
                    </div>

                    <Button onClick={onCheckOut} disabled={loading} className="h-12 w-full rounded-xl text-base">
                      {loading ? "Checking out…" : "Check out"}
                    </Button>
                    <div className="text-xs text-foreground/60">
                      Office hour credit requires manual check out.
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-medium text-foreground/80">Step 2: Take a selfie</div>
                        <div className="text-xs text-foreground/50">Required</div>
                      </div>
                      <SelfieCapture value={photo} disabled={loading} onChange={setPhoto} />
                    </div>

                    <div className="space-y-2">
                      <div className="text-sm font-medium text-foreground/80">Step 3: Check in</div>
                      {geoPermission === "denied" ? (
                        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-700 dark:text-red-300">
                          Location permission is blocked. Enable location to check in.
                        </div>
                      ) : (
                        <div className="text-xs text-foreground/60">
                          Location is verified at check-in to confirm you’re in the office.
                        </div>
                      )}

                      <Button
                        onClick={onCheckIn}
                        disabled={loading || !photo || geoPermission === "denied"}
                        className="h-12 w-full rounded-xl text-base"
                      >
                        {loading ? "Checking in…" : "Check in"}
                      </Button>
                      <div className="text-[11px] text-foreground/50">
                        Selfies are retained for 30 days. Office hours are tracked Monday–Friday.
                      </div>
                    </div>
                  </div>
                )
              ) : (
                <div className="rounded-xl border bg-foreground/[0.02] p-4 text-sm text-foreground/70">
                  Enter your email to start. You’ll then be prompted for a selfie + location.
                </div>
              )}

              {status?.user_exists === false && emailValid ? (
                <div className="rounded-xl border bg-foreground/[0.02] p-3 text-xs text-foreground/60">
                  No account found yet — a kiosk check-in will create one.
                </div>
              ) : null}

              <div className="flex items-center justify-between gap-2 pt-1">
                <Button variant="ghost" onClick={loadStatus} disabled={!emailValid || loading} className="h-9 px-2 text-xs">
                  Refresh
                </Button>
                <div className="text-[11px] text-foreground/50">
                  Need access? Ask an admin to add you to the allowlist.
                </div>
              </div>

              {notice ? (
                <div className="rounded-xl border bg-foreground/[0.02] p-3 text-sm text-foreground/80" role="status" aria-live="polite">
                  {notice}
                </div>
              ) : null}
              {error ? (
                <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-700 dark:text-red-300" role="alert">
                  {error}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
