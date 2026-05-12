/*
  Tailwind Runtime Theme Configuration
  ------------------------------------
  Single source of truth for app colors and core visual tokens.

  Usage guidelines:
  1) Prefer token classes (e.g. bg-brand-primary) over raw utility colors.
  2) Keep all app-level colors documented here.
  3) If you introduce a new "real" color in UI, add + comment it here.
*/

var tailwind = window.tailwind || {};

tailwind.config = {
  // Safelist guarantees these classes exist even when created dynamically in JS.
  safelist: [
    "bg-brand-primary",
    "bg-brand-accent",
    "bg-brand-accent-soft",
    "hover:bg-brand-accent-soft",
    "bg-brand-focus",
    "hover:bg-brand-primary-hover",
    "hover:bg-brand-accent-hover",
    "border-brand-primary",
    "border-brand-accent",
    "text-brand-ink",
    "text-brand-accent",
    "text-brand-accent-strong",
    "ring-brand-focus",
    "accent-brand-primary",
    "bg-control-slider",
    "accent-control-slider",
    "bg-brand-ink",
    "hover:bg-brand-ink-hover",
    "bg-surface-muted",
    "border-surface-outline",
    "bg-status-info-soft",
    "bg-status-info",
    "bg-control-slider",
    "border-status-info",
    "text-status-info",
    "text-status-info-strong",
    "ring-status-info",
    "text-semantic-danger",
    "text-semantic-danger-strong",
    "bg-semantic-danger-soft",
    "bg-surface-page"
  ],
  theme: {
    extend: {
      colors: {
        // Brand colors used for primary CTAs and highlight accents.
        brand: {
          primary: "#1F6F5F",
          "primary-hover": "#2FA084",
          // Focus ring used on form fields and keyboard navigation.
          focus: "#2FA084",
          ink: "#111827",
          "ink-hover": "#1f2937",
          accent: "#F8AE1F",
          "accent-strong": "#8a5a00",
          "accent-hover": "#d97706"
        },
        // Semantic colors for status and validation messaging.
        semantic: {
          success: "#2FA084",
          warning: "#b45309",
          danger: "#e94261",
          "danger-strong": "#790830",
          "danger-soft": "#fef2f2"
        },
        // Informational blue palette (used for hints, selected borders, info chips).
        status: {
          // Main info color (e.g. selected recipe ring / info emphasis).
          info: "#F8AE1F",
          // Strong info text on soft background chips.
          "info-strong": "#B56A00",
          // Soft info surfaces (e.g. "hinzugefügt" chips, drop highlights).
          "info-soft": "#dbeafe",
          // Info borders around chips/cards.
          "info-border": "#bfdbfe"
        },
        // Surface/background tokens for page and card layers.
        surface: {
          page: "#f5f5f4",
          card: "#ffffff",
          muted: "#f9fafb",
          // Default control and card outline.
          outline: "#d1d5db"
        },
        // Neutral text helpers to avoid scattering gray-* intent.
        text: {
          primary: "#111827",
          secondary: "#4b5563",
          muted: "#6b7280"
        },
        // Checkbox / form control colors.
        control: {
          // Checkbox/radio accent color.
          checkbox: "#2FA084",
          "checkbox-border": "#9ca3af",
          // Range slider accent color on supporting browsers.
          slider: "#2FA084"
        }
      },
      // Shared elevation presets.
      boxShadow: {
        card: "0 1px 2px rgba(0, 0, 0, 0.06)",
        "card-hover": "0 8px 20px rgba(0, 0, 0, 0.08)"
      },
      // Shared radii.
      borderRadius: {
        card: "1rem"
      }
    }
  }
};

// Expose for the runtime Tailwind script loaded afterwards.
window.tailwind = tailwind;

/*
  Fallback utility injection:
  Some runtime environments can delay custom utility generation.
  This keeps key token classes visible immediately.
*/
(function injectThemeFallbackUtilities() {
  const colors = tailwind.config?.theme?.extend?.colors || {};
  const brand = colors.brand || {};
  const semantic = colors.semantic || {};
  const status = colors.status || {};
  const surface = colors.surface || {};
  const control = colors.control || {};

  const cBrandPrimary = brand.primary || "currentColor";
  const cBrandPrimaryHover = brand["primary-hover"] || cBrandPrimary;
  const cBrandFocus = brand.focus || cBrandPrimary;
  const cBrandInk = brand.ink || "#111827";
  const cBrandInkHover = brand["ink-hover"] || cBrandInk;
  const cStatusInfoSoft = status["info-soft"] || "#e5e7eb";
  const cStatusInfoBorder = status["info-border"] || "#d1d5db";
  const cStatusInfoText = status.info || cBrandPrimary;
  const cStatusInfoStrong = status["info-strong"] || cStatusInfoText;
  const cDanger = semantic.danger || "#991b1b";
  const cDangerStrong = semantic["danger-strong"] || cDanger;
  const cDangerSoft = semantic["danger-soft"] || "#fef2f2";
  const cSurfacePage = surface.page || "#f5f5f4";
  const cSurfaceMuted = surface.muted || "#f9fafb";
  const cSurfaceOutline = surface.outline || "#d1d5db";
  const cCheckbox = control.checkbox || cBrandPrimary;
  const cSlider = control.slider || cBrandPrimary;

  const css = `
    /* Token utilities */
    .bg-brand-primary{background-color:${cBrandPrimary};}
    .hover\\:bg-brand-primary-hover:hover{background-color:${cBrandPrimaryHover};}
    .bg-brand-accent{background-color:${brand.accent || "#F8AE1F"};}
    .bg-brand-accent-soft{background-color:color-mix(in srgb, ${brand.accent || "#F8AE1F"} 16%, white);}
    .hover\\:bg-brand-accent-soft:hover{background-color:color-mix(in srgb, ${brand.accent || "#F8AE1F"} 16%, white);}
    .hover\\:bg-brand-accent-hover:hover{background-color:${brand["accent-hover"] || "#d97706"};}
    .border-brand-primary{border-color:${cBrandPrimary};}
    .border-brand-accent{border-color:${brand.accent || "#F8AE1F"};}
    .text-brand-ink{color:${cBrandInk};}
    .text-brand-accent{color:${brand.accent || "#F8AE1F"};}
    .text-brand-accent-strong{color:${brand["accent-strong"] || "#8a5a00"};}
    .ring-brand-focus{--tw-ring-color:${cBrandFocus};}
    .accent-brand-primary{accent-color:${cBrandPrimary};}
    .bg-control-slider{background-color:${cSlider};}
    .accent-control-slider{accent-color:${cSlider};}
    .bg-brand-ink{background-color:${cBrandInk};}
    .hover\\:bg-brand-ink-hover:hover{background-color:${cBrandInkHover};}
    .bg-surface-muted{background-color:${cSurfaceMuted};}
    .border-surface-outline{border-color:${cSurfaceOutline};}
    .bg-status-info-soft{background-color:${cStatusInfoSoft};}
    .bg-status-info{background-color:${cStatusInfoText};}
    .border-status-info{border-color:${cStatusInfoBorder};}
    .text-status-info{color:${cStatusInfoText};}
    .text-status-info-strong{color:${cStatusInfoStrong};}
    .ring-status-info{--tw-ring-color:${cStatusInfoText};}
    .text-semantic-danger{color:${cDanger};}
    .text-semantic-danger-strong{color:${cDangerStrong};}
    .bg-semantic-danger-soft{background-color:${cDangerSoft};}
    .bg-surface-page{background-color:${cSurfacePage};}

    /* Global checkbox/radio color alignment */
    input[type="checkbox"], input[type="radio"] {
      accent-color: ${cCheckbox};
    }

    input[type="range"] {
      accent-color: ${cSlider};
    }
  `;

  const style = document.createElement("style");
  style.setAttribute("data-theme-fallback", "true");
  style.textContent = css;
  document.head.appendChild(style);
})();
