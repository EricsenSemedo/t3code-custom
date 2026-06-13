import appBrandingConfig from "./appBranding.json" with { type: "json" };

export const APP_BRANDING = appBrandingConfig;
export const APP_BASE_NAME = APP_BRANDING.appBaseName;
export const APP_STAGE_LABEL_PRODUCTION = APP_BRANDING.productionStageLabel;
export const APP_STAGE_LABEL_DEVELOPMENT = APP_BRANDING.developmentStageLabel;
export const APP_DISPLAY_NAME_PRODUCTION = `${APP_BASE_NAME} (${APP_STAGE_LABEL_PRODUCTION})`;
export const APP_DISPLAY_NAME_DEVELOPMENT = `${APP_BASE_NAME} (${APP_STAGE_LABEL_DEVELOPMENT})`;
export const DESKTOP_APP_ID = APP_BRANDING.desktopAppId;
export const DESKTOP_UPDATE_REPOSITORY = APP_BRANDING.desktopUpdateRepository;
export const DEFAULT_T3_HOME_DIR_NAME = APP_BRANDING.defaultHomeDirName;
export const DEFAULT_T3_DESKTOP_DEV_HOME_DIR_NAME = APP_BRANDING.defaultDesktopDevHomeDirName;
export const DESKTOP_SCHEME = APP_BRANDING.desktopScheme;
export const DESKTOP_USER_DATA_DIR_NAME_PRODUCTION = APP_BRANDING.desktopUserDataDirBaseName;
export const DESKTOP_USER_DATA_DIR_NAME_DEVELOPMENT = `${APP_BRANDING.desktopUserDataDirBaseName}-dev`;
export const LINUX_DESKTOP_ENTRY_NAME_PRODUCTION = `${APP_BRANDING.linuxDesktopEntryBaseName}.desktop`;
export const LINUX_DESKTOP_ENTRY_NAME_DEVELOPMENT = `${APP_BRANDING.linuxDesktopEntryBaseName}-dev.desktop`;
export const LINUX_WM_CLASS_PRODUCTION = APP_BRANDING.linuxWmClassBaseName;
export const LINUX_WM_CLASS_DEVELOPMENT = `${APP_BRANDING.linuxWmClassBaseName}-dev`;

export function resolveAppDisplayName(isDevelopment: boolean): string {
  return isDevelopment ? APP_DISPLAY_NAME_DEVELOPMENT : APP_DISPLAY_NAME_PRODUCTION;
}

export function resolveAppStageLabel(isDevelopment: boolean): string {
  return isDevelopment ? APP_STAGE_LABEL_DEVELOPMENT : APP_STAGE_LABEL_PRODUCTION;
}

export function resolveDefaultT3HomeDirName(isDevelopment: boolean): string {
  return isDevelopment ? DEFAULT_T3_DESKTOP_DEV_HOME_DIR_NAME : DEFAULT_T3_HOME_DIR_NAME;
}

export function resolveLinuxDesktopEntryName(isDevelopment: boolean): string {
  return isDevelopment ? LINUX_DESKTOP_ENTRY_NAME_DEVELOPMENT : LINUX_DESKTOP_ENTRY_NAME_PRODUCTION;
}

export function resolveLinuxWmClass(isDevelopment: boolean): string {
  return isDevelopment ? LINUX_WM_CLASS_DEVELOPMENT : LINUX_WM_CLASS_PRODUCTION;
}

export function resolveDesktopUserDataDirName(isDevelopment: boolean): string {
  return isDevelopment
    ? DESKTOP_USER_DATA_DIR_NAME_DEVELOPMENT
    : DESKTOP_USER_DATA_DIR_NAME_PRODUCTION;
}

export function resolveLegacyDesktopUserDataDirName(isDevelopment: boolean): string {
  return resolveAppDisplayName(isDevelopment);
}
