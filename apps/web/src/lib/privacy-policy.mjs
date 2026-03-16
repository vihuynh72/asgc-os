export function getPrivacyPolicyContent() {
  return {
    title: "Privacy Policy",
    description: "How ASGC OS handles privacy for operational records and office-hours kiosk information.",
    intro:
      "ASGC OS supports internal student government operations. This policy explains what information we handle for the office-hours kiosk and related ASGC workflows.",
    sections: [
      {
        id: "information-we-collect",
        title: "Information we collect",
        paragraphs: [
          "We store the account, role, and operational records needed to run ASGC meetings, tasks, compliance workflows, and office hours.",
          "For the office-hours kiosk, we may store a member's approved phone number, kiosk check-in and check-out timestamps, and related notification records.",
        ],
      },
      {
        id: "text-messaging",
        title: "Text messaging",
        paragraphs: [
          "ASGC OS sends one-time verification codes and office-hours reminder texts only when they are needed for the office-hours kiosk flow.",
          "These texts are limited to only registered ASGC members whose approved phone number has been added to the kiosk allowlist by an administrator.",
          "Members of the public do not receive these texts, and the public cannot subscribe to kiosk SMS messages.",
        ],
        bullets: [
          "One-time verification codes are sent to confirm a kiosk check-in or check-out attempt.",
          "Reminder texts may be sent while an office-hours session remains open.",
          "Removing a phone number from the kiosk allowlist stops future kiosk SMS messages for that number.",
        ],
      },
      {
        id: "how-we-use-data",
        title: "How we use data",
        paragraphs: [
          "We use this information to verify member identity, support office-hours attendance workflows, and maintain operational audit records for ASGC administration.",
          "Access to internal records is limited to authorized ASGC personnel who need the information to operate or administer the platform.",
        ],
      },
      {
        id: "contact",
        title: "Questions",
        paragraphs: [
          "If you have questions about this policy, contact ASGC leadership or an ASGC OS administrator before using the kiosk flow.",
        ],
      },
    ],
  };
}
