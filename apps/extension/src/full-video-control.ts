export type RemoveFullVideoControl = () => void;

const SETTINGS_SELECTOR = '[data-a-target="player-settings-button"]';
const QUADRANT_ORIGINS = new Map<string, string>([
  ["Top Left", "top left"],
  ["Top Right", "top right"],
  ["Bottom Left", "bottom left"],
  ["Bottom Right", "bottom right"],
]);
const originalVideoStyles = new WeakMap<
  HTMLVideoElement,
  { transform: string; transformOrigin: string }
>();

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

function selectVideoChoice(page: Document, choice: string): void {
  const video = page.querySelector<HTMLVideoElement>("video");
  if (!video) return;

  const origin = QUADRANT_ORIGINS.get(choice);
  if (origin) {
    rememberVideoStyles(video);
    video.style.transform = "scale(2)";
    video.style.transformOrigin = origin;
  } else if (choice === "All Screen") {
    restoreVideoStyles(video);
  }
}

function insertControl(page: Document): HTMLElement | undefined {
  const settings = page.querySelector<HTMLElement>(SETTINGS_SELECTOR);
  if (!settings) return undefined;

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
    </style>
    <button class="trigger" type="button" aria-label="Multicam video options" aria-haspopup="menu" aria-expanded="false">
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">
        <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h8A2.5 2.5 0 0 1 17 6.5v2.17l3.21-1.93A.52.52 0 0 1 21 7.2v9.6a.52.52 0 0 1-.79.46L17 15.33v2.17a2.5 2.5 0 0 1-2.5 2.5h-8A2.5 2.5 0 0 1 4 17.5v-11Z" />
      </svg>
    </button>
    <div class="menu" role="menu" hidden>
      <button type="button" role="menuitem">Top Left</button>
      <button type="button" role="menuitem">Top Right</button>
      <button type="button" role="menuitem">Bottom Left</button>
      <button type="button" role="menuitem">Bottom Right</button>
      <button type="button" role="menuitem">All Screen</button>
    </div>
  `;

  const trigger = shadow.querySelector<HTMLButtonElement>(".trigger")!;
  const menu = shadow.querySelector<HTMLElement>(".menu")!;
  const choices = shadow.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');

  trigger.addEventListener("click", () => {
    menu.hidden = !menu.hidden;
    trigger.setAttribute("aria-expanded", String(!menu.hidden));
  });
  choices.forEach((choice) => {
    choice.addEventListener("click", () => {
      selectVideoChoice(page, choice.textContent ?? "");
      menu.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
    });
  });

  settings.before(host);
  return host;
}

export function mountFullVideoControl(page: Document): RemoveFullVideoControl {
  let host = insertControl(page);
  const observer = new MutationObserver(() => {
    if (!host?.isConnected) host = insertControl(page);
  });

  observer.observe(page.documentElement, { childList: true, subtree: true });

  return () => {
    observer.disconnect();
    host?.remove();
    page
      .querySelectorAll<HTMLVideoElement>("video")
      .forEach(restoreVideoStyles);
  };
}
