export const OUTSTATION_PRICING_MODEL = {
  V1_CALENDAR: 'OUTSTATION_V1_CALENDAR',
  V2_DURATION: 'OUTSTATION_V2_DURATION',
};

export const OUTSTATION_PRICING_MODEL_CURRENT = OUTSTATION_PRICING_MODEL.V2_DURATION;

export function isOutstationV2Pricing(breakdownOrVersion) {
  if (!breakdownOrVersion) return false;
  const version =
    typeof breakdownOrVersion === 'string'
      ? breakdownOrVersion
      : breakdownOrVersion.pricingModelVersion;
  return version === OUTSTATION_PRICING_MODEL.V2_DURATION;
}
