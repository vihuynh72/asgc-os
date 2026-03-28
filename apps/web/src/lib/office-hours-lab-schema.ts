import { z } from "zod";

export const OfficeHoursLabScenarioKindSchema = z.enum([
  "allowed_day",
  "geofence",
  "member_flow",
  "member_check_in",
  "kiosk_status",
  "kiosk_check_in",
  "presence_ping",
  "presence_heartbeat",
  "shift_creation",
  "admin_close_session",
]);

const IsoDateTimeSchema = z.string().datetime({ offset: true });

export const OfficeHoursLabRequestSchema = z.object({
  kind: OfficeHoursLabScenarioKindSchema,
  timestamp: IsoDateTimeSchema,
  userId: z.string().uuid().optional(),
  lat: z.number().finite().optional(),
  lon: z.number().finite().optional(),
  policyOverride: z
    .object({
      office_hours_allow_weekends: z.boolean().optional(),
      office_hours_allowed_weekdays: z.array(z.number().int()).optional(),
      office_hours_extra_allowed_dates: z.array(z.string()).optional(),
    })
    .optional(),
  locationOverride: z
    .object({
      name: z.string().optional(),
      timezone: z.string().optional(),
      lat: z.number().finite().optional(),
      lon: z.number().finite().optional(),
      radius_m: z.number().finite().optional(),
      grace_radius_m: z.number().finite().optional(),
    })
    .optional(),
  hasPhoto: z.boolean().optional(),
  preflightReady: z.boolean().optional(),
  preflightAllowed: z.boolean().optional(),
  hasOpenSession: z.boolean().optional(),
  phoneMatched: z.boolean().optional(),
  shift: z
    .object({
      userId: z.string().uuid().optional(),
      startsAt: IsoDateTimeSchema,
      endsAt: IsoDateTimeSchema,
      officeLocationId: z.string().uuid().optional(),
    })
    .optional(),
  adminClose: z
    .object({
      checkoutAt: IsoDateTimeSchema,
      excludeFromTotals: z.boolean().optional(),
      reason: z.string().trim().min(2).optional(),
    })
    .optional(),
  session: z
    .object({
      checkinAt: IsoDateTimeSchema,
      lastPresenceAt: IsoDateTimeSchema.optional(),
      requiresPresence: z.boolean().optional(),
    })
    .optional(),
});

export type OfficeHoursLabParsedRequest = z.infer<typeof OfficeHoursLabRequestSchema>;
