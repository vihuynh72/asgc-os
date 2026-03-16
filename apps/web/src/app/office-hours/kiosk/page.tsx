"use client";

import { motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import {
  KioskActionBar,
  KioskNotice,
  KioskShell,
  KioskStatusChip,
  KioskStepHeader,
  KioskTopNav,
} from "@/components/office-hours/kiosk";
import { Button } from "@/components/ui/button";
import {
  canSubmitKioskCheckIn,
  canSubmitKioskCheckOut,
  deriveKioskVerificationStep,
} from "@/lib/office-hours-kiosk/entry-state.mjs";
import { cn } from "@/lib/utils";

type MemberOption = {
  user_id: string;
  display_name: string;
  role_key: "president" | "executive" | "board_member";
  role_label: string;
};

type StatusPayload = {
  intent: "check_in" | "check_out";
  phone_last4: string;
  open_session: { id: string; checkin_at: string } | null;
};

type LocationSnapshot = {
  lat: number;
  lon: number;
  accuracyM: number | null;
  acquiredAt: string;
};

type LocationPreflight = {
  ok: boolean;
  band: "in_radius" | "in_grace" | "outside_grace";
  statusTone: "critical" | "warning" | "neutral" | "good";
  statusLabel: string;
  distanceM: number;
  radiusM: number;
  graceRadiusM: number;
};

type StepId = "member" | "phone" | "otp" | "location" | "action";

function friendlyError(code: string): string {
  switch (code) {
    case "invalid_phone":
      return "Enter a valid US phone number.";
    case "phone_not_allowed":
      return "This phone number is not approved for the selected member.";
    case "member_not_found":
      return "This member is not active for kiosk check-in.";
    case "otp_resend_too_soon":
      return "Please wait a moment before requesting another code.";
    case "otp_rate_limited":
      return "Too many code requests. Try again in a few minutes.";
    case "invalid_otp":
      return "That code did not match.";
    case "otp_expired":
    case "verification_expired":
      return "This code expired. Request a new one.";
    case "verification_invalid":
    case "verification_used":
      return "Your verification expired. Start again.";
    case "outside_geofence":
      return "You appear to be outside the office check-in area.";
    case "weekend_not_allowed":
      return "Office hours are not enabled today.";
    case "already_checked_in":
      return "This member already has an open session.";
    case "no_open_session":
      return "No open session was found to check out.";
    case "sms_disabled":
      return "Kiosk SMS is not enabled yet.";
    default:
      return code || "Something went wrong.";
  }
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const json = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok) {
    throw new Error(json?.error ?? `Request failed: ${response.status}`);
  }
  return json as T;
}

async function getCurrentPosition({
  timeoutMs = 15_000,
}: {
  timeoutMs?: number;
} = {}): Promise<LocationSnapshot> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("geolocation_not_supported"));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracyM: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
          acquiredAt: new Date().toISOString(),
        }),
      (err) => reject(err),
      { enableHighAccuracy: true, maximumAge: 0, timeout: timeoutMs },
    );
  });
}

function stepIndex(stepId: StepId): number {
  return ["member", "phone", "otp", "location", "action"].indexOf(stepId) + 1;
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function formatDistance(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return `${Math.round(value)}m`;
}

function StepCard({
  step,
  title,
  summary,
  active,
  tone,
  statusLabel,
  onActivate,
  children,
}: {
  step: number;
  title: string;
  summary: string;
  active: boolean;
  tone: "critical" | "warning" | "neutral" | "good";
  statusLabel: string;
  onActivate: () => void;
  children: ReactNode;
}) {
  return (
    <section className={cn("kiosk-section kiosk-step-card", active && "kiosk-step-card-active")}>
      <button type="button" className="kiosk-step-trigger" onClick={onActivate}>
        <div className="min-w-0">
          <p className="kiosk-step-title">{step}. {title}</p>
          {!active ? <p className="kiosk-step-summary">{summary}</p> : null}
        </div>
        <KioskStatusChip
          tone={tone}
          label={statusLabel}
          className="max-w-full shrink-0 self-start sm:max-w-[58%] sm:self-center"
        />
      </button>
      {active ? <div className="kiosk-step-body">{children}</div> : null}
    </section>
  );
}

function selectedMemberLabel(members: MemberOption[], userId: string): string {
  const member = members.find((row) => row.user_id === userId);
  return member ? `${member.display_name} • ${member.role_label}` : "Choose a member";
}

export default function OfficeHoursKioskPage() {
  const reduceMotion = useReducedMotion();
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [phone, setPhone] = useState("");

  const [statusResolved, setStatusResolved] = useState(false);
  const [statusPayload, setStatusPayload] = useState<StatusPayload | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);

  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [verificationToken, setVerificationToken] = useState<string | null>(null);

  const [location, setLocation] = useState<LocationSnapshot | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [preflight, setPreflight] = useState<LocationPreflight | null>(null);
  const [preflightLoading, setPreflightLoading] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [focusedStep, setFocusedStep] = useState<StepId>("member");
  const [geoPermission, setGeoPermission] = useState<"granted" | "denied" | "prompt" | "unsupported">("prompt");

  const intent = statusPayload?.intent ?? null;
  const requiresLocation = intent === "check_in";

  const verificationStep = useMemo(
    () =>
      deriveKioskVerificationStep({
        otpVerified: Boolean(verificationToken),
        requiresLocation,
        preflightReady: Boolean(preflight) && !preflightLoading,
        preflightAllowed: Boolean(preflight?.ok),
      }),
    [preflight, preflightLoading, requiresLocation, verificationToken],
  );

  const currentStep = useMemo<StepId>(() => {
    if (!selectedUserId) return "member";
    if (!statusResolved) return "phone";
    if (verificationStep === "otp") return "otp";
    if (verificationStep === "location") return "location";
    return "action";
  }, [selectedUserId, statusResolved, verificationStep]);

  useEffect(() => {
    void (async () => {
      try {
        setMembersLoading(true);
        const data = await fetchJson<{ members: MemberOption[] }>("/api/office-hours/kiosk/members");
        setMembers(data.members ?? []);
      } catch (e) {
        setError(friendlyError(e instanceof Error ? e.message : "Could not load members."));
      } finally {
        setMembersLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!navigator?.permissions?.query) {
      setGeoPermission("unsupported");
      return;
    }

    let cancelled = false;
    navigator.permissions
      .query({ name: "geolocation" as PermissionName })
      .then((permission) => {
        if (cancelled) return;
        setGeoPermission(permission.state);
        permission.onchange = () => setGeoPermission(permission.state);
      })
      .catch(() => setGeoPermission("unsupported"));

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setStatusResolved(false);
    setStatusPayload(null);
    setChallengeId(null);
    setOtpCode("");
    setVerificationToken(null);
    setLocation(null);
    setLocationError(null);
    setPreflight(null);
    if (selectedUserId) setFocusedStep("phone");
  }, [selectedUserId, phone]);

  useEffect(() => {
    setFocusedStep(currentStep);
  }, [currentStep]);

  const resetFlow = useCallback(() => {
    setSelectedUserId("");
    setPhone("");
    setStatusResolved(false);
    setStatusPayload(null);
    setChallengeId(null);
    setOtpCode("");
    setVerificationToken(null);
    setLocation(null);
    setLocationError(null);
    setPreflight(null);
    setFocusedStep("member");
  }, []);

  const onResolveStatus = useCallback(async () => {
    if (!selectedUserId || !phone.trim()) {
      setError("Choose a member and enter the approved phone number.");
      return;
    }

    setStatusLoading(true);
    setError(null);
    setNotice(null);

    try {
      const data = await fetchJson<StatusPayload>("/api/office-hours/kiosk/status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: selectedUserId, phone }),
      });
      setStatusPayload(data);
      setStatusResolved(true);
      setNotice(`Verified phone ending in ${data.phone_last4}.`);
      setFocusedStep("otp");
    } catch (e) {
      setStatusResolved(false);
      setStatusPayload(null);
      setError(friendlyError(e instanceof Error ? e.message : "Could not verify phone."));
    } finally {
      setStatusLoading(false);
    }
  }, [phone, selectedUserId]);

  const onRequestOtp = useCallback(async () => {
    if (!selectedUserId || !phone.trim()) return;

    setOtpSending(true);
    setError(null);
    setNotice(null);

    try {
      const data = await fetchJson<{ challengeId: string; intent: "check_in" | "check_out"; expiresAt: string }>(
        "/api/office-hours/kiosk/otp/request",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ userId: selectedUserId, phone }),
        },
      );
      setChallengeId(data.challengeId);
      setNotice(
        data.intent === "check_in"
          ? "A 6-digit code was sent for check-in."
          : "A 6-digit code was sent for check-out.",
      );
    } catch (e) {
      setError(friendlyError(e instanceof Error ? e.message : "Could not send code."));
    } finally {
      setOtpSending(false);
    }
  }, [phone, selectedUserId]);

  const onVerifyOtp = useCallback(async () => {
    if (!selectedUserId || !phone.trim() || !challengeId || !intent) {
      setError("Request a code first.");
      return;
    }

    setOtpVerifying(true);
    setError(null);
    setNotice(null);

    try {
      const data = await fetchJson<{ verificationToken: string }>("/api/office-hours/kiosk/otp/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          userId: selectedUserId,
          phone,
          challengeId,
          intent,
          code: otpCode,
        }),
      });
      setVerificationToken(data.verificationToken);
      setNotice(intent === "check_in" ? "Code verified. Continue with location." : "Code verified. Ready to check out.");
      setFocusedStep(requiresLocation ? "location" : "action");
    } catch (e) {
      setError(friendlyError(e instanceof Error ? e.message : "Could not verify code."));
    } finally {
      setOtpVerifying(false);
    }
  }, [challengeId, intent, otpCode, phone, requiresLocation, selectedUserId]);

  const onRequestLocation = useCallback(async () => {
    if (!verificationToken) return;

    setLocationLoading(true);
    setPreflightLoading(true);
    setLocationError(null);
    setError(null);

    try {
      const coords = await getCurrentPosition();
      setLocation(coords);
      const result = await fetchJson<LocationPreflight>("/api/office-hours/kiosk/location-check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          verificationToken,
          lat: coords.lat,
          lon: coords.lon,
        }),
      });
      setPreflight(result);
      setNotice(result.ok ? "Location verified." : friendlyError("outside_geofence"));
    } catch (e) {
      const message = e instanceof Error ? e.message : "Location unavailable.";
      setLocationError(friendlyError(message));
      setPreflight(null);
    } finally {
      setLocationLoading(false);
      setPreflightLoading(false);
    }
  }, [verificationToken]);

  const onSubmit = useCallback(async () => {
    if (!verificationToken || !intent) return;

    setLoading(true);
    setError(null);
    setNotice(null);

    try {
      if (intent === "check_in") {
        if (!location || !preflight?.ok) {
          setError("Verify location before checking in.");
          return;
        }

        const data = await fetchJson<{ session?: { checkin_at?: string } }>("/api/office-hours/kiosk/check-in", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            verificationToken,
            lat: location.lat,
            lon: location.lon,
          }),
        });
        setNotice(data.session?.checkin_at ? `Checked in ${formatWhen(data.session.checkin_at)}.` : "Checked in.");
      } else {
        const data = await fetchJson<{ session?: { duration_minutes?: number } }>("/api/office-hours/kiosk/check-out", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ verificationToken }),
        });
        setNotice(
          typeof data.session?.duration_minutes === "number"
            ? `Checked out • ${data.session.duration_minutes}m.`
            : "Checked out.",
        );
      }

      resetFlow();
    } catch (e) {
      setError(friendlyError(e instanceof Error ? e.message : "Kiosk action failed."));
    } finally {
      setLoading(false);
    }
  }, [intent, location, preflight?.ok, resetFlow, verificationToken]);

  const actionReady =
    intent === "check_in"
      ? canSubmitKioskCheckIn({
          otpVerified: Boolean(verificationToken),
          preflightReady: Boolean(preflight),
          preflightAllowed: Boolean(preflight?.ok),
        })
      : canSubmitKioskCheckOut({ otpVerified: Boolean(verificationToken) });

  return (
    <KioskShell topNav={<KioskTopNav />}>
      <div className="kiosk-panel kiosk-panel-with-sticky kiosk-page-stack">
        <KioskStepHeader
          eyebrow="Office Hours"
          title="Kiosk"
          subtitle="Board and executive members verify with an approved phone before checking in or out."
          step={stepIndex(currentStep)}
          totalSteps={5}
        />

        <motion.section
          className="space-y-4"
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.24, ease: "easeOut" }}
        >
          <StepCard
            step={1}
            title="Member"
            summary="Choose the active member."
            active={focusedStep === "member"}
            tone={selectedUserId ? "good" : "neutral"}
            statusLabel={selectedUserId ? selectedMemberLabel(members, selectedUserId) : "Choose member"}
            onActivate={() => setFocusedStep("member")}
          >
            <label className="kiosk-control-label">
              Member
              <select
                className="kiosk-input"
                value={selectedUserId}
                onChange={(event) => setSelectedUserId(event.target.value)}
                disabled={membersLoading}
              >
                <option value="">{membersLoading ? "Loading members..." : "Select a member"}</option>
                {members.map((member) => (
                  <option key={member.user_id} value={member.user_id}>
                    {member.display_name} — {member.role_label}
                  </option>
                ))}
              </select>
            </label>
          </StepCard>

          <StepCard
            step={2}
            title="Phone match"
            summary="Confirm the approved phone number."
            active={focusedStep === "phone"}
            tone={statusResolved ? "good" : "neutral"}
            statusLabel={statusResolved ? `Verified • ending ${statusPayload?.phone_last4 ?? ""}` : "Phone required"}
            onActivate={() => setFocusedStep("phone")}
          >
            <div className="space-y-4">
              <label className="kiosk-control-label">
                Phone number
                <input
                  className="kiosk-input"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="(619) 555-1234"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                />
              </label>
              <KioskActionBar
                primary={
                  <Button
                    className="h-12 rounded-xl"
                    onClick={() => void onResolveStatus()}
                    disabled={statusLoading || !selectedUserId || !phone.trim()}
                  >
                    {statusLoading ? "Verifying..." : "Continue"}
                  </Button>
                }
                hint="This number must match the kiosk phone allowlist for the selected member."
              />
            </div>
          </StepCard>

          <StepCard
            step={3}
            title="OTP verification"
            summary="Request and confirm the SMS code."
            active={focusedStep === "otp"}
            tone={verificationToken ? "good" : challengeId ? "warning" : "neutral"}
            statusLabel={verificationToken ? "Verified" : challengeId ? "Code sent" : "OTP required"}
            onActivate={() => setFocusedStep("otp")}
          >
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
                <label className="kiosk-control-label">
                  6-digit code
                  <input
                    className="kiosk-input"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="123456"
                    value={otpCode}
                    onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  />
                </label>
                <div className="flex items-end">
                  <Button
                    variant="outline"
                    className="h-12 rounded-xl px-4"
                    onClick={() => void onRequestOtp()}
                    disabled={otpSending || !statusResolved}
                  >
                    {otpSending ? "Sending..." : challengeId ? "Resend code" : "Send code"}
                  </Button>
                </div>
              </div>
              <KioskActionBar
                primary={
                  <Button
                    className="h-12 rounded-xl"
                    onClick={() => void onVerifyOtp()}
                    disabled={otpVerifying || otpCode.length !== 6 || !challengeId}
                  >
                    {otpVerifying ? "Verifying..." : "Verify code"}
                  </Button>
                }
                hint="The code expires in 5 minutes. Ask an admin to update the phone allowlist if you never receive it."
              />
            </div>
          </StepCard>

          {requiresLocation ? (
            <StepCard
              step={4}
              title="Location"
              summary="Verify the office geofence."
              active={focusedStep === "location"}
              tone={preflight?.ok ? "good" : locationError ? "critical" : "neutral"}
              statusLabel={preflight?.statusLabel ?? locationError ?? "Location required"}
              onActivate={() => setFocusedStep("location")}
            >
              <div className="space-y-4">
                {location ? (
                  <div className="grid gap-3 sm:grid-cols-3">
                    <KioskStatusChip tone="neutral" label={`Lat ${location.lat.toFixed(5)}`} />
                    <KioskStatusChip tone="neutral" label={`Lon ${location.lon.toFixed(5)}`} />
                    <KioskStatusChip tone="neutral" label={`Accuracy ${formatDistance(location.accuracyM ?? NaN)}`} />
                  </div>
                ) : null}
                {preflight ? (
                  <p className="text-sm text-foreground/70">
                    Distance {formatDistance(preflight.distanceM)} • Radius {formatDistance(preflight.radiusM)} • Grace{" "}
                    {formatDistance(preflight.graceRadiusM)}
                  </p>
                ) : null}
                {geoPermission === "denied" ? (
                  <KioskNotice tone="critical">Location permission is blocked on this device.</KioskNotice>
                ) : null}
                <KioskActionBar
                  primary={
                    <Button
                      className="h-12 rounded-xl"
                      onClick={() => void onRequestLocation()}
                      disabled={locationLoading || !verificationToken}
                    >
                      {locationLoading || preflightLoading ? "Checking..." : "Verify location"}
                    </Button>
                  }
                  hint="Check-in only works inside the configured office area."
                />
              </div>
            </StepCard>
          ) : null}

          <StepCard
            step={requiresLocation ? 5 : 4}
            title={intent === "check_out" ? "Check out" : "Check in"}
            summary="Finish the kiosk flow."
            active={focusedStep === "action"}
            tone={actionReady ? "good" : "neutral"}
            statusLabel={
              actionReady
                ? intent === "check_out"
                  ? "Ready to check out"
                  : "Ready to check in"
                : "Finish the previous steps"
            }
            onActivate={() => setFocusedStep("action")}
          >
            <div className="space-y-4">
              {statusPayload?.open_session ? (
                <p className="text-sm text-foreground/70">
                  Open since {formatWhen(statusPayload.open_session.checkin_at)}.
                </p>
              ) : (
                <p className="text-sm text-foreground/70">No open session was found, so this kiosk flow will check in.</p>
              )}
              <KioskActionBar
                primary={
                  <Button className="h-12 rounded-xl" onClick={() => void onSubmit()} disabled={loading || !actionReady}>
                    {loading
                      ? intent === "check_out"
                        ? "Checking out..."
                        : "Checking in..."
                      : intent === "check_out"
                        ? "Check out"
                        : "Check in"}
                  </Button>
                }
                secondary={
                  <Button variant="outline" className="h-12 rounded-xl px-4" onClick={resetFlow} disabled={loading}>
                    Start over
                  </Button>
                }
                hint={intent === "check_out" ? "The member must verify their phone and code again to check out." : "Hourly reminder texts will go to the verified phone number while the session stays open."}
              />
            </div>
          </StepCard>
        </motion.section>

        {notice ? (
          <KioskNotice tone="good">
            <span role="status" aria-live="polite">
              {notice}
            </span>
          </KioskNotice>
        ) : null}

        {error ? (
          <KioskNotice tone="critical">
            <span role="alert">{error}</span>
          </KioskNotice>
        ) : null}
      </div>
    </KioskShell>
  );
}
