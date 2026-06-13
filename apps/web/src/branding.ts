import {
  APP_BASE_NAME,
  resolveAppDisplayName,
  resolveAppStageLabel,
} from "@t3tools/shared/appBranding";

export { APP_BASE_NAME };
export const APP_STAGE_LABEL = resolveAppStageLabel(import.meta.env.DEV);
export const APP_DISPLAY_NAME = resolveAppDisplayName(import.meta.env.DEV);
export const APP_VERSION = import.meta.env.APP_VERSION || "0.0.0";
