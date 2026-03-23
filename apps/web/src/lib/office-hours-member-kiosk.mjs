const CHECK_IN_SUMMARIES = {
  selfie: {
    tone: "neutral",
    chipLabel: "Selfie first",
    title: "Take a fresh selfie",
    detail: "Capture your photo to unlock check-in.",
    hint: "Selfie first, then location.",
  },
  location: {
    tone: "warning",
    chipLabel: "Location",
    title: "Confirm your location",
    detail: "Refresh location until you are in range.",
    hint: "You must be inside the office zone to check in.",
  },
  submit: {
    tone: "good",
    chipLabel: "Ready",
    title: "Ready to check in",
    detail: "Selfie and location are set.",
    hint: "Check in to start your session.",
  },
};

const CHECK_OUT_SUMMARY = {
  tone: "good",
  chipLabel: "Checked in",
  title: "Ready to check out",
  detail: "You already have an open session.",
  hint: "Check out when you are done.",
};

function deriveCurrentStep({ mode, hasPhoto, preflightReady, preflightAllowed }) {
  if (mode === "check_out") return "confirm";
  if (!hasPhoto) return "selfie";
  if (!preflightReady || !preflightAllowed) return "location";
  return "submit";
}

export function normalizeMemberCheckInSession(rawValue) {
  const raw = Array.isArray(rawValue) ? rawValue[0] : rawValue;
  if (!raw || typeof raw !== "object") return null;

  const id = typeof raw.id === "string" ? raw.id : typeof raw.session_id === "string" ? raw.session_id : null;
  const checkinAt = typeof raw.checkin_at === "string" ? raw.checkin_at : null;

  if (!id || !checkinAt) return null;

  return {
    ...raw,
    id,
    checkin_at: checkinAt,
  };
}

export function getMemberKioskStateSummary({ mode, currentStep }) {
  if (mode === "check_out") {
    return CHECK_OUT_SUMMARY;
  }

  return CHECK_IN_SUMMARIES[currentStep] ?? CHECK_IN_SUMMARIES.selfie;
}

export function getMemberKioskFlowModel({ mode, hasPhoto, preflightReady, preflightAllowed }) {
  const currentStep = deriveCurrentStep({ mode, hasPhoto, preflightReady, preflightAllowed });

  if (mode === "check_out") {
    return {
      currentStep,
      nextSectionId: "action",
      sections: [
        { id: "session", state: "complete", expanded: false },
        { id: "action", state: "current", expanded: true },
      ],
    };
  }

  return {
    currentStep,
    nextSectionId:
      currentStep === "selfie" ? "selfie" : currentStep === "location" ? "location" : "action",
    sections: [
      {
        id: "selfie",
        state: currentStep === "selfie" ? "current" : hasPhoto ? "complete" : "locked",
        expanded: currentStep === "selfie",
      },
      {
        id: "location",
        state: currentStep === "location" ? "current" : preflightReady && preflightAllowed ? "complete" : "locked",
        expanded: currentStep === "location",
      },
      {
        id: "action",
        state: currentStep === "submit" ? "current" : "locked",
        expanded: currentStep === "submit",
      },
    ],
  };
}
