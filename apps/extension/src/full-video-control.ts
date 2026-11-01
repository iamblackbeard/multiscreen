import type {
  ActiveMulticamSession,
  PublicMulticamSession,
} from "@multicam/contracts";

export type FullVideoControl = (() => void) & {
  updateSession(session: PublicMulticamSession): void;
};
export type RemoveFullVideoControl = FullVideoControl;
export type FullVideoControlOptions = {
  isMulticamStateValid?: () => boolean;
  reportUnsupported?: (reason: PlayerIntegrationUnsupportedReason) => void;
  /** Published session from the Multicam API. When absent or inactive the
   *  control falls back to the legacy hardcoded quadrant menu. When explicitly
   *  set to null or an inactive session, the control is not mounted at all. */
  session?: PublicMulticamSession | null;
};
export type PlayerIntegrationUnsupportedReason =
  | "missing-settings-anchor"
  | "ambiguous-settings-anchor"
  | "missing-video"
  | "ambiguous-video";

const SETTINGS_SELECTOR = '[data-a-target="player-settings-button"]';
const ADVERTISEMENT_SELECTOR = '[data-a-target="video-ad-label"]';

/** Canonical slot → CSS transform-origin mapping. */
const SLOT_ORIGINS = new Map<string, string>([
  ["topLeft", "top left"],
  ["topRight", "top right"],
  ["bottomLeft", "bottom left"],
  ["bottomRight", "bottom right"],
]);

/** Legacy label → CSS transform-origin used when no session is provided. */
const QUADRANT_ORIGINS = new Map<string, string>([
  ["Top Left", "top left"],
  ["Top Right", "top right"],
  ["Bottom Left", "bottom left"],
  ["Bottom Right", "bottom right"],
]);

const SHOW_GRID = "Show Grid";
const ALL_SCREEN = "All Screen";

const originalVideoStyles = new WeakMap<
  HTMLVideoElement,
  { transform: string; transformOrigin: string }
>();
const controlCleanups = new WeakMap<HTMLElement, () => void>();

function removeControlHost(host: HTMLElement | undefined): void {
  if (!host) return;
  controlCleanups.get(host)?.();
  controlCleanups.delete(host);
  host.remove();
}

function isPotentiallyVisible(element: HTMLElement): boolean {
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  return (
    !element.hidden &&
    element.getAttribute("aria-hidden") !== "true" &&
    style?.display !== "none" &&
    style?.visibility !== "hidden"
  );
}

function findSettingsAnchor(page: Document): {
  element?: HTMLElement;
  reason?: PlayerIntegrationUnsupportedReason;
} {
  const candidates = [
    ...page.querySelectorAll<HTMLElement>(SETTINGS_SELECTOR),
  ].filter(isPotentiallyVisible);
  if (candidates.length === 0) return { reason: "missing-settings-anchor" };
  if (candidates.length === 1) return { element: candidates[0]! };
  const rendered = candidates.filter((candidate) => {
    const bounds = candidate.getBoundingClientRect();
    return bounds.width > 0 && bounds.height > 0;
  });
  if (rendered.length === 1) return { element: rendered[0]! };
  return { reason: "ambiguous-settings-anchor" };
}

function findPlayerVideo(
  page: Document,
  settings = findSettingsAnchor(page).element,
): {
  element?: HTMLVideoElement;
  reason?: PlayerIntegrationUnsupportedReason;
} {
  if (!settings) return {};
  const scope = settings.closest('[data-a-target="video-player"]') ?? page;
  const candidates = [
    ...scope.querySelectorAll<HTMLVideoElement>("video"),
  ].filter(isPotentiallyVisible);
  if (candidates.length === 0) return { reason: "missing-video" };
  if (candidates.length === 1) return { element: candidates[0]! };
  const rendered = candidates.filter((candidate) => {
    const bounds = candidate.getBoundingClientRect();
    return bounds.width > 0 && bounds.height > 0;
  });
  if (rendered.length === 1) return { element: rendered[0]! };
  return { reason: "ambiguous-video" };
}

function rememberVideoStyles(video: HTMLVideoElement): void {
  if (originalVideoStyles.has(video)) return;
  originalVideoStyles.set(video, {
    transform: video.style.transform,
    transformOrigin: video.style.transformOrigin,
  });
}

function restoreVideoStyles(video: HTMLVideoElement): void {
  const original = originalVideoStyles.get(video);
  if (!original) return;
  video.style.transform = original.transform;
  video.style.transformOrigin = original.transformOrigin;
  originalVideoStyles.delete(video);
}

/** Build a label→origin mapping for the active session cameras. */
function buildSessionOrigins(
  session: PublicMulticamSession & { active: true },
): Map<string, string> {
  const map = new Map<string, string>();
  for (const camera of session.cameras) {
    const origin = SLOT_ORIGINS.get(camera.slot);
    if (origin) map.set(camera.label, origin);
  }
  return map;
}

function selectVideoChoice(
  page: Document,
  choice: string,
  origins: Map<string, string>,
  gridLabel: string,
): HTMLVideoElement | undefined {
  const video = findPlayerVideo(page).element;
  if (!video) return undefined;

  const origin = origins.get(choice);
  if (origin) {
    rememberVideoStyles(video);
    video.style.transform = "scale(2)";
    video.style.transformOrigin = origin;
  } else if (choice === gridLabel) {
    restoreVideoStyles(video);
  }
  return video;
}

type InsertControlOptions = {
  choices: string[];
  notice?: string;
  onChoice?: (choice: string) => void;
};

function insertControl(
  page: Document,
  { choices, notice, onChoice = () => {} }: InsertControlOptions,
): HTMLElement | undefined {
  const settings = findSettingsAnchor(page).element;
  if (!settings) return undefined;
  if (!findPlayerVideo(page, settings).element) return undefined;

  const host = page.createElement("span");
  host.dataset.multicamFullVideoControl = "";
  const shadow = host.attachShadow({ mode: "open" });

  shadow.innerHTML = `
    <style>
      :host { display: inline-flex; position: relative; }
      button {
        border: 0;
        color: white;
        cursor: pointer;
        font: inherit;
      }
      .trigger {
        align-items: center;
        background: transparent;
        display: inline-flex;
        height: 3rem;
        justify-content: center;
        width: 3rem;
      }
      .trigger svg { height: 1.5rem; width: 1.5rem; }
      .menu {
        background: #18181b;
        border-radius: 0.4rem;
        bottom: calc(100% + 0.5rem);
        box-shadow: 0 0.25rem 1rem rgb(0 0 0 / 45%);
        min-width: 10rem;
        padding: 0.5rem;
        position: absolute;
        right: 0;
        z-index: 1000;
      }
      .menu[hidden] { display: none; }
      .menu button {
        background: transparent;
        border-radius: 0.25rem;
        display: block;
        padding: 0.6rem 0.75rem;
        text-align: left;
        width: 100%;
      }
      .menu button:hover, .menu button:focus-visible { background: #3f3f46; }
      .notice {
        background: #18181b;
        border-radius: 0.4rem;
        bottom: calc(100% + 0.5rem);
        color: white;
        padding: 0.6rem 0.75rem;
        position: absolute;
        right: 0;
        width: max-content;
      }
    </style>
    <button class="trigger" type="button" aria-label="Multicam video options" aria-haspopup="menu" aria-expanded="false">
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">
        <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h8A2.5 2.5 0 0 1 17 6.5v2.17l3.21-1.93A.52.52 0 0 1 21 7.2v9.6a.52.52 0 0 1-.79.46L17 15.33v2.17a2.5 2.5 0 0 1-2.5 2.5h-8A2.5 2.5 0 0 1 4 17.5v-11Z" />
      </svg>
    </button>
    <div class="menu" role="menu" hidden></div>
    ${notice ? `<p class="notice" role="status"></p>` : ""}
  `;

  const noticeElement = shadow.querySelector<HTMLElement>(".notice");
  if (noticeElement && notice) noticeElement.textContent = notice;

  const trigger = shadow.querySelector<HTMLButtonElement>(".trigger")!;
  const menu = shadow.querySelector<HTMLElement>(".menu")!;
  choices.forEach((label) => {
    const button = page.createElement("button");
    button.type = "button";
    button.setAttribute("role", "menuitem");
    button.textContent = label;
    menu.append(button);
  });
  const menuButtons = shadow.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');

  const closeMenu = (restoreFocus = true) => {
    menu.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    if (restoreFocus) trigger.focus();
  };
  const openMenu = (focusIndex = 0) => {
    menu.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    menuButtons.item(focusIndex).focus();
  };

  trigger.addEventListener("click", () => {
    if (menu.hidden) openMenu();
    else closeMenu();
  });
  trigger.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "Home") {
      event.preventDefault();
      openMenu();
    } else if (event.key === "ArrowUp" || event.key === "End") {
      event.preventDefault();
      openMenu(menuButtons.length - 1);
    } else if (event.key === "Escape") {
      closeMenu();
    }
  });
  menu.addEventListener("keydown", (event) => {
    const currentIndex = [...menuButtons].indexOf(
      shadow.activeElement as HTMLButtonElement,
    );
    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      menuButtons.item((currentIndex + 1) % menuButtons.length).focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      menuButtons
        .item((currentIndex - 1 + menuButtons.length) % menuButtons.length)
        .focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      menuButtons.item(0).focus();
    } else if (event.key === "End") {
      event.preventDefault();
      menuButtons.item(menuButtons.length - 1).focus();
    }
  });
  menuButtons.forEach((button) => {
    button.addEventListener("click", () => {
      onChoice(button.textContent ?? "");
      closeMenu();
    });
  });

  const closeOnOutsidePointer = (event: Event) => {
    if (!event.composedPath().includes(host)) closeMenu(false);
  };
  page.addEventListener("pointerdown", closeOnOutsidePointer);
  controlCleanups.set(host, () => {
    page.removeEventListener("pointerdown", closeOnOutsidePointer);
  });

  settings.before(host);
  return host;
}

export function mountFullVideoControl(
  page: Document,
  options: FullVideoControlOptions = {},
): FullVideoControl {
  let currentSession = options.session;

  // When a session is explicitly provided (not undefined) and it is inactive
  // or null, do not mount the control at all.
  if (currentSession !== undefined && (!currentSession || !currentSession.active)) {
    const observer = new MutationObserver(() => {});
    observer.observe(page.documentElement, { childList: true, subtree: true });
    let activeControl: FullVideoControl | undefined;
    const remove = () => {
      observer.disconnect();
      activeControl?.();
    };
    return Object.assign(remove, {
      updateSession(nextSession: PublicMulticamSession) {
        if (activeControl) {
          activeControl.updateSession(nextSession);
          return;
        }
        if (!nextSession.active) return;
        observer.disconnect();
        activeControl = mountFullVideoControl(page, { ...options, session: nextSession });
      },
    });
  }

  // Determine the choice set and origin map based on whether we have an active
  // published session.
  let origins: Map<string, string>;
  let choices: string[];
  let initialChoice: string;

  if (currentSession && currentSession.active) {
    origins = buildSessionOrigins(currentSession);
    choices = [...currentSession.cameras.map((c) => c.label), SHOW_GRID];
    const mainSlot = currentSession.mainSlot;
    const mainCamera = currentSession.cameras.find((c) => c.slot === mainSlot);
    initialChoice = mainCamera?.label ?? SHOW_GRID;
  } else {
    // Legacy mode: hardcoded quadrant names
    origins = QUADRANT_ORIGINS;
    choices = ["Top Left", "Top Right", "Bottom Left", "Bottom Right", ALL_SCREEN];
    initialChoice = ALL_SCREEN;
  }

  let gridLabel = currentSession?.active ? SHOW_GRID : ALL_SCREEN;

  let selectedChoice = initialChoice;
  let selectedSlot: ActiveMulticamSession["mainSlot"] | "grid" | undefined =
    currentSession?.active ? currentSession.mainSlot : undefined;
  let unsupportedReason: PlayerIntegrationUnsupportedReason | undefined;
  const reportUnsupported = (reason: PlayerIntegrationUnsupportedReason) => {
    if (reason === unsupportedReason) return;
    unsupportedReason = reason;
    options.reportUnsupported?.(reason);
  };
  const initialSettings = findSettingsAnchor(page);
  if (initialSettings.reason) {
    reportUnsupported(initialSettings.reason);
  } else {
    const initialVideo = findPlayerVideo(page, initialSettings.element);
    if (initialVideo.reason) reportUnsupported(initialVideo.reason);
  }
  let advertisementWasPlaying = Boolean(
    page.querySelector(ADVERTISEMENT_SELECTOR),
  );
  let multicamIsSuspended = advertisementWasPlaying;
  let activeVideo: HTMLVideoElement | undefined;

  const onChoice = (choice: string) => {
    selectedChoice = choice;
    if (currentSession?.active) {
      selectedSlot =
        choice === SHOW_GRID
          ? "grid"
          : currentSession.cameras.find((camera) => camera.label === choice)?.slot;
    }
    activeVideo = selectVideoChoice(page, choice, origins, gridLabel);
  };

  const reapplyCurrentSelection = () => {
    if (multicamIsSuspended) return;
    activeVideo = selectVideoChoice(
      page,
      selectedChoice,
      origins,
      gridLabel,
    );
  };
  const ResizeObserverConstructor = page.defaultView?.ResizeObserver;
  const resizeObserver = ResizeObserverConstructor
    ? new ResizeObserverConstructor(reapplyCurrentSelection)
    : undefined;
  let observedPlayer: Element | undefined;
  const observePlayerSize = () => {
    const nextPlayer =
      activeVideo?.closest('[data-a-target="video-player"]') ?? activeVideo;
    if (!resizeObserver || nextPlayer === observedPlayer) return;
    resizeObserver.disconnect();
    observedPlayer = nextPlayer;
    if (nextPlayer) resizeObserver.observe(nextPlayer);
  };

  let host = insertControl(page, { choices, onChoice });
  let noticeTimer: number | undefined;

  // Apply the initial main-camera crop immediately.
  if (host) {
    activeVideo = selectVideoChoice(page, initialChoice, origins, gridLabel);
    if (advertisementWasPlaying) host.hidden = true;
  }
  observePlayerSize();
  page.defaultView?.addEventListener("resize", reapplyCurrentSelection);
  page.addEventListener("fullscreenchange", reapplyCurrentSelection);

  const observer = new MutationObserver(() => {
    const settingsState = findSettingsAnchor(page);
    const videoState = settingsState.element
      ? findPlayerVideo(page, settingsState.element)
      : {};
    const nextUnsupportedReason = settingsState.reason ?? videoState.reason;
    if (nextUnsupportedReason) {
      reportUnsupported(nextUnsupportedReason);
      if (activeVideo) restoreVideoStyles(activeVideo);
      activeVideo = undefined;
      observePlayerSize();
      removeControlHost(host);
      host = undefined;
      return;
    }
    unsupportedReason = undefined;
    if (currentSession && !currentSession.active) {
      if (activeVideo) restoreVideoStyles(activeVideo);
      activeVideo = videoState.element;
      multicamIsSuspended = true;
      removeControlHost(host);
      host = undefined;
      return;
    }

    if (page.querySelector(ADVERTISEMENT_SELECTOR)) {
      page
        .querySelectorAll<HTMLVideoElement>("video")
        .forEach(restoreVideoStyles);
      if (host) host.hidden = true;
      advertisementWasPlaying = true;
      multicamIsSuspended = true;
      return;
    }
    if (advertisementWasPlaying) {
      const stateIsValid = options.isMulticamStateValid?.() ?? true;
      multicamIsSuspended = !stateIsValid;
      if (stateIsValid) {
        activeVideo = selectVideoChoice(
          page,
          selectedChoice,
          origins,
          gridLabel,
        );
        if (host) host.hidden = false;
      }
      advertisementWasPlaying = false;
    }
    const discoveredVideo = videoState.element;
    if (discoveredVideo !== activeVideo) {
      if (activeVideo) restoreVideoStyles(activeVideo);
      activeVideo = discoveredVideo;
      if (activeVideo && !multicamIsSuspended) {
        activeVideo = selectVideoChoice(
          page,
          selectedChoice,
          origins,
          gridLabel,
        );
      }
      observePlayerSize();
    }
    if (!host?.isConnected) {
      removeControlHost(host);
      host = insertControl(page, { choices, onChoice });
      if (host && multicamIsSuspended) host.hidden = true;
    }
  });

  observer.observe(page.documentElement, { childList: true, subtree: true });

  const remove = () => {
    observer.disconnect();
    resizeObserver?.disconnect();
    page.defaultView?.removeEventListener("resize", reapplyCurrentSelection);
    page.removeEventListener("fullscreenchange", reapplyCurrentSelection);
    if (noticeTimer !== undefined) page.defaultView?.clearTimeout(noticeTimer);
    removeControlHost(host);
    if (activeVideo) restoreVideoStyles(activeVideo);
    page
      .querySelectorAll<HTMLVideoElement>("video")
      .forEach(restoreVideoStyles);
  };

  return Object.assign(remove, {
    updateSession(nextSession: PublicMulticamSession) {
      currentSession = nextSession;
      removeControlHost(host);
      host = undefined;
      if (!nextSession.active) {
        multicamIsSuspended = true;
        page
          .querySelectorAll<HTMLVideoElement>("video")
          .forEach(restoreVideoStyles);
        return;
      }

      multicamIsSuspended = Boolean(
        page.querySelector(ADVERTISEMENT_SELECTOR),
      );

      origins = buildSessionOrigins(nextSession);
      choices = [...nextSession.cameras.map((camera) => camera.label), SHOW_GRID];
      gridLabel = SHOW_GRID;
      const selectedCamera = nextSession.cameras.find(
        (camera) => camera.slot === selectedSlot,
      );
      let notice: string | undefined;
      if (selectedSlot === "grid") {
        selectedChoice = SHOW_GRID;
      } else if (selectedCamera) {
        selectedChoice = selectedCamera.label;
      } else {
        selectedSlot = nextSession.mainSlot;
        selectedChoice =
          nextSession.cameras.find(
            (camera) => camera.slot === nextSession.mainSlot,
          )?.label ?? SHOW_GRID;
        notice = `That camera is no longer live. Switched to ${selectedChoice}.`;
      }
      host = insertControl(page, {
        choices,
        ...(notice ? { notice } : {}),
        onChoice,
      });
      if (notice) {
        if (noticeTimer !== undefined) page.defaultView?.clearTimeout(noticeTimer);
        noticeTimer = page.defaultView?.setTimeout(() => {
          host?.shadowRoot?.querySelector(".notice")?.remove();
          noticeTimer = undefined;
        }, 4_000);
      }
      activeVideo = selectVideoChoice(
        page,
        selectedChoice,
        origins,
        gridLabel,
      );
      observePlayerSize();
    },
  });
}
