import { describe, expect, it } from "vitest";

import {
  APP_BASE_NAME,
  APP_DISPLAY_NAME_DEVELOPMENT,
  APP_DISPLAY_NAME_PRODUCTION,
  DEFAULT_T3_DESKTOP_DEV_HOME_DIR_NAME,
  DEFAULT_T3_HOME_DIR_NAME,
  DESKTOP_APP_ID,
  DESKTOP_SCHEME,
  DESKTOP_UPDATE_REPOSITORY,
  resolveAppDisplayName,
  resolveDefaultT3HomeDirName,
  resolveDesktopUserDataDirName,
  resolveLinuxDesktopEntryName,
  resolveLinuxWmClass,
} from "./appBranding.js";

describe("appBranding", () => {
  it("exposes the custom app identity", () => {
    expect(APP_BASE_NAME).toBe("T3 Code Custom");
    expect(DESKTOP_APP_ID).toBe("com.ericsensemedo.t3codecustom");
    expect(DESKTOP_SCHEME).toBe("t3custom");
    expect(DESKTOP_UPDATE_REPOSITORY).toBe("EricsenSemedo/t3code-custom");
  });

  it("derives display names by environment", () => {
    expect(APP_DISPLAY_NAME_PRODUCTION).toBe("T3 Code Custom (Alpha)");
    expect(APP_DISPLAY_NAME_DEVELOPMENT).toBe("T3 Code Custom (Dev)");
    expect(resolveAppDisplayName(false)).toBe(APP_DISPLAY_NAME_PRODUCTION);
    expect(resolveAppDisplayName(true)).toBe(APP_DISPLAY_NAME_DEVELOPMENT);
  });

  it("uses separate home and desktop user-data directories for dev", () => {
    expect(DEFAULT_T3_HOME_DIR_NAME).toBe(".t3-custom");
    expect(DEFAULT_T3_DESKTOP_DEV_HOME_DIR_NAME).toBe(".t3-custom-dev");
    expect(resolveDefaultT3HomeDirName(false)).toBe(".t3-custom");
    expect(resolveDefaultT3HomeDirName(true)).toBe(".t3-custom-dev");
    expect(resolveDesktopUserDataDirName(false)).toBe("t3code-custom");
    expect(resolveDesktopUserDataDirName(true)).toBe("t3code-custom-dev");
  });

  it("derives linux integration names by environment", () => {
    expect(resolveLinuxDesktopEntryName(false)).toBe("t3code-custom.desktop");
    expect(resolveLinuxDesktopEntryName(true)).toBe("t3code-custom-dev.desktop");
    expect(resolveLinuxWmClass(false)).toBe("t3code-custom");
    expect(resolveLinuxWmClass(true)).toBe("t3code-custom-dev");
  });
});
