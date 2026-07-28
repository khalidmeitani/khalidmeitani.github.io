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

document.querySelectorAll("[data-video-frame]").forEach((frame) => {
  const playButton = frame.querySelector("[data-video-play]");
  const video = frame.querySelector("video");

  if (!playButton || !video) return;

  playButton.addEventListener("click", () => {
    playButton.hidden = true;
    video.hidden = false;
    video.play();
  });
});

document.querySelectorAll("[data-carousel]").forEach((carousel) => {
  const slides = [...carousel.querySelectorAll("[data-carousel-slide]")];
  const dots = [...carousel.querySelectorAll("[data-carousel-dot]")];
  const previousButton = carousel.querySelector("[data-carousel-prev]");
  const nextButton = carousel.querySelector("[data-carousel-next]");
  const toggleButton = carousel.querySelector("[data-carousel-toggle]");
  const announcement = carousel.querySelector("[data-carousel-announcement]");
  const disclosure = carousel.closest("details");
  const slidesContainer = carousel.querySelector(".carousel-slides");
  const videos = [...carousel.querySelectorAll("video")];

  if (
    slides.length < 2 ||
    dots.length !== slides.length ||
    !previousButton ||
    !nextButton ||
    !toggleButton
  ) {
    return;
  }

  const interval = 5000;
  let currentIndex = 0;
  let timerId;
  let interactionPaused = false;
  let manuallyPaused = reduceMotion;
  let mediaPlaying = false;
  let inViewport = true;

  const stopTimer = () => {
    window.clearTimeout(timerId);
    timerId = undefined;
  };

  const canAutoplay = () =>
    !manuallyPaused &&
    !interactionPaused &&
    !mediaPlaying &&
    !document.hidden &&
    inViewport &&
    (!disclosure || disclosure.open) &&
    !document.querySelector(".figure-dialog[open]");

  const scheduleNextSlide = () => {
    stopTimer();
    if (!canAutoplay()) return;
    timerId = window.setTimeout(() => showSlide(currentIndex + 1, false), interval);
  };

  const updateToggleButton = () => {
    toggleButton.setAttribute("aria-pressed", String(manuallyPaused));
    toggleButton.textContent = manuallyPaused ? "Play slideshow" : "Pause slideshow";
  };

  const updateArrowPosition = () => {
    const stage = slides[currentIndex]?.querySelector(
      ".adaptive-figure, .publication-video-frame",
    );

    if (!stage || !slidesContainer) return;

    const sideInset = 14;
    const left = stage.offsetLeft + sideInset;
    const right =
      slidesContainer.clientWidth - stage.offsetLeft - stage.offsetWidth + sideInset;
    const top = stage.offsetTop + stage.offsetHeight / 2;

    carousel.style.setProperty("--carousel-arrow-left", `${left}px`);
    carousel.style.setProperty("--carousel-arrow-right", `${right}px`);
    carousel.style.setProperty("--carousel-arrow-top", `${top}px`);
  };

  function showSlide(index, announce = true) {
    currentIndex = (index + slides.length) % slides.length;

    slides.forEach((slide, slideIndex) => {
      const isActive = slideIndex === currentIndex;
      slide.hidden = !isActive;
      slide.classList.toggle("is-active", isActive);
      slide.setAttribute("aria-hidden", String(!isActive));
      if (!isActive) {
        slide.querySelectorAll("video").forEach((video) => video.pause());
      }
    });

    dots.forEach((dot, dotIndex) => {
      dot.setAttribute("aria-current", String(dotIndex === currentIndex));
    });

    if (announce && announcement) {
      const label = slides[currentIndex].dataset.carouselLabel || "Publication figure";
      announcement.textContent = `Figure ${currentIndex + 1} of ${slides.length}: ${label}`;
    }

    window.requestAnimationFrame(updateArrowPosition);
    scheduleNextSlide();
  }

  previousButton.addEventListener("click", () => showSlide(currentIndex - 1));
  nextButton.addEventListener("click", () => showSlide(currentIndex + 1));
  dots.forEach((dot, dotIndex) => {
    dot.addEventListener("click", () => showSlide(dotIndex));
  });

  videos.forEach((video) => {
    video.addEventListener("play", () => {
      mediaPlaying = true;
      stopTimer();
    });

    const resumeSlideshow = () => {
      mediaPlaying = videos.some((item) => !item.paused && !item.ended);
      scheduleNextSlide();
    };

    video.addEventListener("pause", resumeSlideshow);
    video.addEventListener("ended", resumeSlideshow);
  });

  toggleButton.addEventListener("click", () => {
    manuallyPaused = !manuallyPaused;
    updateToggleButton();
    scheduleNextSlide();
  });

  carousel.addEventListener("mouseenter", () => {
    interactionPaused = true;
    stopTimer();
  });

  carousel.addEventListener("mouseleave", () => {
    interactionPaused = false;
    scheduleNextSlide();
  });

  carousel.addEventListener("focusin", () => {
    interactionPaused = true;
    stopTimer();
  });

  carousel.addEventListener("focusout", () => {
    window.setTimeout(() => {
      interactionPaused = carousel.contains(document.activeElement);
      scheduleNextSlide();
    });
  });

  disclosure?.addEventListener("toggle", scheduleNextSlide);
  disclosure?.addEventListener("toggle", () => {
    if (disclosure.open) window.requestAnimationFrame(updateArrowPosition);
  });
  window.addEventListener("resize", updateArrowPosition, { passive: true });
  document.addEventListener("visibilitychange", scheduleNextSlide);
  document.addEventListener("figure-dialog-opened", stopTimer);
  document.addEventListener("figure-dialog-closed", scheduleNextSlide);

  if ("IntersectionObserver" in window) {
    const carouselObserver = new IntersectionObserver(
      ([entry]) => {
        inViewport = entry.isIntersecting;
        scheduleNextSlide();
      },
      { threshold: 0.2 },
    );
    carouselObserver.observe(carousel);
  }

  updateToggleButton();
  showSlide(0, false);
});

document.querySelectorAll("[data-figure-dialog]").forEach((button) => {
  const dialog = document.querySelector(`#${button.dataset.figureDialog}`);
  const closeButton = dialog?.querySelector(".figure-close");
  const zoomButton = dialog?.querySelector(".figure-zoom");
  const canvas = dialog?.querySelector(".figure-dialog-canvas");
  const image = dialog?.querySelector(".figure-dialog-image");

  if (!dialog || !closeButton || !zoomButton || !canvas || !image) return;

  button.addEventListener("click", () => {
    dialog.showModal();
    document.dispatchEvent(new CustomEvent("figure-dialog-opened"));
  });
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
    document.dispatchEvent(new CustomEvent("figure-dialog-closed"));
  });
});
