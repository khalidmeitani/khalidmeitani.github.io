const menuButton = document.querySelector(".menu-button");
const navigation = document.querySelector(".site-nav");
const header = document.querySelector(".site-header");

menuButton?.addEventListener("click", () => {
  const isOpen = menuButton.getAttribute("aria-expanded") === "true";
  menuButton.setAttribute("aria-expanded", String(!isOpen));
  navigation.classList.toggle("open", !isOpen);
});

navigation?.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    navigation.classList.remove("open");
    menuButton?.setAttribute("aria-expanded", "false");
  });
});

window.addEventListener(
  "scroll",
  () => header?.classList.toggle("scrolled", window.scrollY > 8),
  { passive: true },
);

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const revealElements = document.querySelectorAll(".reveal");

if (reduceMotion || !("IntersectionObserver" in window)) {
  revealElements.forEach((element) => element.classList.add("visible"));
} else {
  const revealObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12 },
  );

  revealElements.forEach((element) => revealObserver.observe(element));
}

document.querySelector("#current-year").textContent = new Date().getFullYear();

document.querySelectorAll("[data-adaptive-figure]").forEach((viewport) => {
  const image = viewport.querySelector("img");
  const hint = viewport.closest("figure")?.querySelector(".figure-scroll-hint");

  if (!image) return;

  const updateFigureLayout = () => {
    const ratio = image.naturalWidth / image.naturalHeight;
    const isPanoramic = ratio >= 2.25;
    const isPortrait = ratio <= 0.82;

    viewport.classList.toggle("is-panoramic", isPanoramic);
    viewport.classList.toggle("is-portrait", isPortrait);
    viewport.tabIndex = isPanoramic ? 0 : -1;
    viewport.setAttribute(
      "aria-label",
      isPanoramic
        ? "Panoramic figure; scroll horizontally to see the full image"
        : "Publication figure",
    );

    if (hint) hint.hidden = !isPanoramic;
  };

  if (image.complete) {
    updateFigureLayout();
  } else {
    image.addEventListener("load", updateFigureLayout, { once: true });
  }
});

document.querySelectorAll("[data-figure-dialog]").forEach((button) => {
  const dialog = document.querySelector(`#${button.dataset.figureDialog}`);
  const closeButton = dialog?.querySelector(".figure-close");
  const zoomButton = dialog?.querySelector(".figure-zoom");
  const canvas = dialog?.querySelector(".figure-dialog-canvas");
  const image = dialog?.querySelector(".figure-dialog-image");

  if (!dialog || !closeButton || !zoomButton || !canvas || !image) return;

  button.addEventListener("click", () => dialog.showModal());
  closeButton.addEventListener("click", () => dialog.close());

  zoomButton.addEventListener("click", () => {
    const isZoomed = image.classList.toggle("is-zoomed");
    canvas.classList.toggle("is-zoomed", isZoomed);
    zoomButton.textContent = isZoomed ? "Fit to screen" : "View actual size";
    if (!isZoomed) {
      canvas.scrollTo({ top: 0, left: 0, behavior: reduceMotion ? "auto" : "smooth" });
    }
  });

  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });

  dialog.addEventListener("close", () => {
    image.classList.remove("is-zoomed");
    canvas.classList.remove("is-zoomed");
    zoomButton.textContent = "View actual size";
    canvas.scrollTo({ top: 0, left: 0 });
  });
});
