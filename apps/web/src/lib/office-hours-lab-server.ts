import type { OfficeHoursLabCleanup, OfficeHoursLabResult } from "./office-hours-lab";

type CleanupResponse = {
  ok: boolean;
  message: string | null;
};

function normalizeErrorCode(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  return "unknown";
}

function buildCleanupFallback(message: string): OfficeHoursLabCleanup {
  return {
    attempted: true,
    ok: false,
    message,
  };
}

async function runCleanup<TArtifacts>(
  cleanupArtifacts: (artifacts: TArtifacts) => Promise<CleanupResponse>,
  artifacts: TArtifacts,
): Promise<OfficeHoursLabCleanup> {
  try {
    const cleanup = await cleanupArtifacts(artifacts);
    return {
      attempted: true,
      ok: cleanup.ok,
      message: cleanup.message,
    };
  } catch (error) {
    return buildCleanupFallback(normalizeErrorCode(error));
  }
}

function buildLiveResult({
  kind,
  verdict,
  resultCode = null,
  errorCode = null,
  headline,
  trace,
  evidence,
  cleanup,
}: {
  kind: OfficeHoursLabResult["kind"];
  verdict: OfficeHoursLabResult["verdict"];
  resultCode?: string | null;
  errorCode?: string | null;
  headline: string;
  trace: OfficeHoursLabResult["trace"];
  evidence: OfficeHoursLabResult["evidence"];
  cleanup: OfficeHoursLabCleanup;
}): OfficeHoursLabResult {
  return {
    kind,
    mode: "live",
    verdict,
    resultCode,
    errorCode,
    headline,
    trace,
    evidence,
    cleanup,
  };
}

export async function runOfficeHoursLabKioskCheckInLiveProbe({
  timestamp,
  lat,
  lon,
  createVerifiedChallenge,
  performCheckIn,
  cleanupArtifacts,
}: {
  timestamp: string;
  lat: number;
  lon: number;
  createVerifiedChallenge: () => Promise<{
    id: string;
    user_id: string;
    phone_e164: string;
    verified_at: string;
  }>;
  performCheckIn: (input: {
    challenge: {
      id: string;
      user_id: string;
      phone_e164: string;
      verified_at: string;
    };
    lat: number;
    lon: number;
    timestamp: string;
    options: {
      markChallengeUsed: boolean;
      recordAudit: boolean;
    };
  }) => Promise<{
    session?: {
      id: string;
      checkin_at?: string;
      within_grace?: boolean | null;
      within_radius?: boolean | null;
    } | null;
  }>;
  cleanupArtifacts: (artifacts: { challengeId: string | null; sessionId: string | null }) => Promise<CleanupResponse>;
}): Promise<OfficeHoursLabResult> {
  let challengeId: string | null = null;
  let sessionId: string | null = null;

  try {
    const challenge = await createVerifiedChallenge();
    challengeId = challenge.id;

    const response = await performCheckIn({
      challenge,
      lat,
      lon,
      timestamp,
      options: {
        markChallengeUsed: false,
        recordAudit: false,
      },
    });

    sessionId = response.session?.id ?? null;
    const cleanup = await runCleanup(cleanupArtifacts, { challengeId, sessionId });
    const withinGrace = response.session?.within_grace === true;

    return buildLiveResult({
      kind: "kiosk_check_in",
      verdict: withinGrace ? "warning" : "pass",
      resultCode: withinGrace ? "kiosk_check_in_grace" : "kiosk_check_in_ok",
      headline: withinGrace ? "Live kiosk check-in succeeded in the grace zone" : "Live kiosk check-in succeeded",
      trace: [
        { label: "Scenario", value: "Kiosk check-in" },
        { label: "Mode", value: "Live verify" },
        { label: "Timestamp", value: timestamp },
      ],
      evidence: [
        { label: "Challenge", value: challenge.id },
        { label: "Session", value: sessionId ?? "No session" },
      ],
      cleanup,
    });
  } catch (error) {
    const cleanup = await runCleanup(cleanupArtifacts, { challengeId, sessionId });
    const errorCode = normalizeErrorCode(error);
    return buildLiveResult({
      kind: "kiosk_check_in",
      verdict: "fail",
      errorCode,
      headline: "Live kiosk check-in failed",
      trace: [
        { label: "Scenario", value: "Kiosk check-in" },
        { label: "Mode", value: "Live verify" },
        { label: "Timestamp", value: timestamp },
      ],
      evidence: [{ label: "Error", value: errorCode }],
      cleanup,
    });
  }
}

export async function runOfficeHoursLabAdminCloseLiveProbe({
  timestamp,
  sessionSeed,
  adminClose,
  createTemporarySession,
  closeSession,
  cleanupArtifacts,
}: {
  timestamp: string;
  sessionSeed: {
    userId: string;
    checkinAt: string;
  };
  adminClose: {
    checkoutAt: string;
    excludeFromTotals?: boolean;
    reason?: string;
  };
  createTemporarySession: () => Promise<{
    id: string;
    user_id: string;
  }>;
  closeSession: (input: {
    sessionId: string;
    checkoutAt: string;
    excludeFromTotals: boolean;
    reason: string;
    options: {
      suppressNotification: boolean;
    };
  }) => Promise<{
    session?: {
      id: string;
      checkout_at?: string | null;
    } | null;
  }>;
  cleanupArtifacts: (artifacts: { sessionId: string | null; auditTargetId: string | null }) => Promise<CleanupResponse>;
}): Promise<OfficeHoursLabResult> {
  let sessionId: string | null = null;

  try {
    const temporarySession = await createTemporarySession();
    sessionId = temporarySession.id;

    const result = await closeSession({
      sessionId: temporarySession.id,
      checkoutAt: adminClose.checkoutAt,
      excludeFromTotals: adminClose.excludeFromTotals === true,
      reason: adminClose.reason?.trim() || "Office Hours lab verification",
      options: {
        suppressNotification: true,
      },
    });

    const cleanup = await runCleanup(cleanupArtifacts, {
      sessionId,
      auditTargetId: sessionId,
    });

    return buildLiveResult({
      kind: "admin_close_session",
      verdict: "pass",
      resultCode: "admin_close_valid",
      headline: "Live admin close verification succeeded",
      trace: [
        { label: "Scenario", value: "Admin close session" },
        { label: "Mode", value: "Live verify" },
        { label: "Timestamp", value: timestamp },
        { label: "Check-in", value: sessionSeed.checkinAt },
        { label: "Checkout", value: adminClose.checkoutAt },
      ],
      evidence: [
        { label: "Session", value: result.session?.id ?? temporarySession.id },
        { label: "Reason", value: adminClose.reason?.trim() || "Office Hours lab verification" },
      ],
      cleanup,
    });
  } catch (error) {
    const cleanup = await runCleanup(cleanupArtifacts, {
      sessionId,
      auditTargetId: sessionId,
    });
    const errorCode = normalizeErrorCode(error);
    return buildLiveResult({
      kind: "admin_close_session",
      verdict: "fail",
      errorCode,
      headline: "Live admin close verification failed",
      trace: [
        { label: "Scenario", value: "Admin close session" },
        { label: "Mode", value: "Live verify" },
        { label: "Timestamp", value: timestamp },
      ],
      evidence: [{ label: "Error", value: errorCode }],
      cleanup,
    });
  }
}

export async function runOfficeHoursLabShiftCreationLiveProbe({
  timestamp,
  shift,
  createShift,
  cleanupArtifacts,
}: {
  timestamp: string;
  shift: {
    userId: string;
    startsAt: string;
    endsAt: string;
    officeLocationId?: string | null;
  };
  createShift: (input: {
    userId: string;
    startsAt: string;
    endsAt: string;
    officeLocationId?: string | null;
  }) => Promise<{ id: string }>;
  cleanupArtifacts: (artifacts: { shiftId: string | null; auditTargetId: string | null }) => Promise<CleanupResponse>;
}): Promise<OfficeHoursLabResult> {
  let shiftId: string | null = null;

  try {
    const createdShift = await createShift({
      userId: shift.userId,
      startsAt: shift.startsAt,
      endsAt: shift.endsAt,
      officeLocationId: shift.officeLocationId ?? null,
    });
    shiftId = createdShift.id;

    const cleanup = await runCleanup(cleanupArtifacts, {
      shiftId,
      auditTargetId: shiftId,
    });

    return buildLiveResult({
      kind: "shift_creation",
      verdict: "pass",
      resultCode: "shift_live_verified",
      headline: "Live shift creation verification succeeded",
      trace: [
        { label: "Scenario", value: "Shift creation" },
        { label: "Mode", value: "Live verify" },
        { label: "Timestamp", value: timestamp },
      ],
      evidence: [{ label: "Shift", value: shiftId }],
      cleanup,
    });
  } catch (error) {
    const cleanup = await runCleanup(cleanupArtifacts, {
      shiftId,
      auditTargetId: shiftId,
    });
    const errorCode = normalizeErrorCode(error);
    return buildLiveResult({
      kind: "shift_creation",
      verdict: "fail",
      errorCode,
      headline: "Live shift creation verification failed",
      trace: [
        { label: "Scenario", value: "Shift creation" },
        { label: "Mode", value: "Live verify" },
        { label: "Timestamp", value: timestamp },
      ],
      evidence: [{ label: "Error", value: errorCode }],
      cleanup,
    });
  }
}
