export type ThemeMode = "light" | "warm" | "midnight";
export type BackgroundStyle = "sky" | "paper" | "forest" | "sunset" | "slate";
export type CardStyle = "soft" | "glass";
export type LanguageCode = "zh-HK" | "zh-CN" | "en";

export type UserPreferences = {
  appearance: {
    themeMode: ThemeMode;
    backgroundStyle: BackgroundStyle;
    cardStyle: CardStyle;
  };
  notifications: {
    productUpdates: boolean;
    weeklySummary: boolean;
    securityEmail: boolean;
  };
  experience: {
    language: LanguageCode;
    autoPlayVoice: boolean;
    enterToSend: boolean;
    reduceMotion: boolean;
  };
};

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  appearance: {
    themeMode: "light",
    backgroundStyle: "sky",
    cardStyle: "soft",
  },
  notifications: {
    productUpdates: true,
    weeklySummary: false,
    securityEmail: true,
  },
  experience: {
    language: "zh-HK",
    autoPlayVoice: true,
    enterToSend: true,
    reduceMotion: false,
  },
};

export function normalizeUserPreferences(input?: Partial<UserPreferences> | null): UserPreferences {
  return {
    appearance: {
      themeMode:
        input?.appearance?.themeMode && ["light", "warm", "midnight"].includes(input.appearance.themeMode)
          ? input.appearance.themeMode
          : DEFAULT_USER_PREFERENCES.appearance.themeMode,
      backgroundStyle:
        input?.appearance?.backgroundStyle &&
        ["sky", "paper", "forest", "sunset", "slate"].includes(input.appearance.backgroundStyle)
          ? input.appearance.backgroundStyle
          : DEFAULT_USER_PREFERENCES.appearance.backgroundStyle,
      cardStyle:
        input?.appearance?.cardStyle && ["soft", "glass"].includes(input.appearance.cardStyle)
          ? input.appearance.cardStyle
          : DEFAULT_USER_PREFERENCES.appearance.cardStyle,
    },
    notifications: {
      productUpdates:
        typeof input?.notifications?.productUpdates === "boolean"
          ? input.notifications.productUpdates
          : DEFAULT_USER_PREFERENCES.notifications.productUpdates,
      weeklySummary:
        typeof input?.notifications?.weeklySummary === "boolean"
          ? input.notifications.weeklySummary
          : DEFAULT_USER_PREFERENCES.notifications.weeklySummary,
      securityEmail:
        typeof input?.notifications?.securityEmail === "boolean"
          ? input.notifications.securityEmail
          : DEFAULT_USER_PREFERENCES.notifications.securityEmail,
    },
    experience: {
      language:
        input?.experience?.language && ["zh-HK", "zh-CN", "en"].includes(input.experience.language)
          ? input.experience.language
          : DEFAULT_USER_PREFERENCES.experience.language,
      autoPlayVoice:
        typeof input?.experience?.autoPlayVoice === "boolean"
          ? input.experience.autoPlayVoice
          : DEFAULT_USER_PREFERENCES.experience.autoPlayVoice,
      enterToSend:
        typeof input?.experience?.enterToSend === "boolean"
          ? input.experience.enterToSend
          : DEFAULT_USER_PREFERENCES.experience.enterToSend,
      reduceMotion:
        typeof input?.experience?.reduceMotion === "boolean"
          ? input.experience.reduceMotion
          : DEFAULT_USER_PREFERENCES.experience.reduceMotion,
    },
  };
}

export function getAppShellThemeClasses(preferences: UserPreferences) {
  const themeMode = preferences.appearance.themeMode;
  const backgroundStyle = preferences.appearance.backgroundStyle;

  const backgrounds: Record<BackgroundStyle, string> = {
    sky: "bg-[radial-gradient(circle_at_top_left,_rgba(96,165,250,0.18),_transparent_30%),linear-gradient(180deg,_#f8fbff_0%,_#eef4ff_45%,_#f8fafc_100%)]",
    paper: "bg-[linear-gradient(180deg,_#fffdf6_0%,_#faf6ec_45%,_#f8fafc_100%)]",
    forest: "bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.16),_transparent_28%),linear-gradient(180deg,_#f3fbf7_0%,_#ecfdf5_40%,_#f8fafc_100%)]",
    sunset: "bg-[radial-gradient(circle_at_top_right,_rgba(251,146,60,0.16),_transparent_28%),linear-gradient(180deg,_#fff7ed_0%,_#ffedd5_40%,_#f8fafc_100%)]",
    slate: "bg-[linear-gradient(180deg,_#f2f5f9_0%,_#e8edf4_45%,_#f8fafc_100%)]",
  };

  const modeClasses: Record<ThemeMode, string> = {
    light: "text-slate-800",
    warm: "text-stone-800",
    midnight: "text-slate-100 bg-slate-950",
  };

  return `${themeMode === "midnight" ? "bg-slate-950" : backgrounds[backgroundStyle]} ${modeClasses[themeMode]}`;
}
