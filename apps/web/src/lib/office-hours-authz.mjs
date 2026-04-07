export function canAccessOfficeHoursAdmin({ tier, isEvp }) {
  return tier === "full" || (tier === "partial" && isEvp === true);
}

export function canViewOfficeHoursMemberFlow({ tier, isEvp }) {
  return canAccessOfficeHoursAdmin({ tier, isEvp });
}

export function canEditOfficeHoursMemberFlow({ tier }) {
  return tier === "full";
}

export function canEditOfficeHoursPhotoReview({ tier, isEvp }) {
  return canAccessOfficeHoursAdmin({ tier, isEvp });
}
