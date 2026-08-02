const languageButtons = document.querySelectorAll(".language-button");
const languageStorageKey = "khalid-language";
const supportedLanguages = ["en", "ja", "ar"];
const originalTextValues = new WeakMap();
const originalAttributeValues = new WeakMap();
const translatedAttributes = [
  "aria-label",
  "aria-roledescription",
  "title",
  "alt",
  "data-carousel-label",
];

let currentLanguage = supportedLanguages.includes(
  document.documentElement.dataset.language,
)
  ? document.documentElement.dataset.language
  : "en";

const normalizePhrase = (value = "") => value.replace(/\s+/g, " ").trim();

const getLanguageDictionary = (language = currentLanguage) =>
  window.siteTranslations?.[language] || null;

const translatePhrase = (phrase, language = currentLanguage) => {
  if (language === "en") return phrase;
  const normalized = normalizePhrase(phrase);
  const dictionary = getLanguageDictionary(language);
  return (
    dictionary?.text?.[normalized] ||
    dictionary?.attributes?.[normalized] ||
    phrase
  );
};

const formatCarouselAnnouncement = (index, total, label) => {
  if (currentLanguage === "ja") {
    return `${total}件中${index}件目：${label}`;
  }
  if (currentLanguage === "ar") {
    return `العنصر ${index} من ${total}: ${label}`;
  }
  return `Figure ${index} of ${total}: ${label}`;
};

const preserveOuterWhitespace = (source, replacement) => {
  const leading = source.match(/^\s*/)?.[0] || "";
  const trailing = source.match(/\s*$/)?.[0] || "";
  return `${leading}${replacement}${trailing}`;
};

const translateTextNodes = (language) => {
  const dictionary = getLanguageDictionary(language);
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parentName = node.parentElement?.tagName;
      if (!parentName || ["SCRIPT", "STYLE", "NOSCRIPT"].includes(parentName)) {
        return NodeFilter.FILTER_REJECT;
      }
      return normalizePhrase(node.nodeValue)
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    },
  });

  let node = walker.nextNode();
  while (node) {
    if (!originalTextValues.has(node)) {
      originalTextValues.set(node, node.nodeValue);
    }

    const original = originalTextValues.get(node);
    const source = normalizePhrase(original);
    const translated = language === "en" ? source : dictionary?.text?.[source];
    node.nodeValue = translated
      ? preserveOuterWhitespace(original, translated)
      : original;
    node = walker.nextNode();
  }
};

const translateElementAttributes = (language) => {
  const dictionary = getLanguageDictionary(language);
  document
    .querySelectorAll(translatedAttributes.map((name) => `[${name}]`).join(","))
    .forEach((element) => {
      if (!originalAttributeValues.has(element)) {
        const values = {};
        translatedAttributes.forEach((name) => {
          if (element.hasAttribute(name)) values[name] = element.getAttribute(name);
        });
        originalAttributeValues.set(element, values);
      }

      const originals = originalAttributeValues.get(element);
      Object.entries(originals).forEach(([name, original]) => {
        const source = normalizePhrase(original);
        const translated =
          language === "en"
            ? original
            : dictionary?.attributes?.[source] ||
              dictionary?.text?.[source] ||
              original;
        element.setAttribute(name, translated);
      });
    });
};

const applyLanguage = (language, persist = false) => {
  currentLanguage = supportedLanguages.includes(language) ? language : "en";
  const dictionary = getLanguageDictionary(currentLanguage);

  document.documentElement.lang = currentLanguage;
  document.documentElement.dir = currentLanguage === "ar" ? "rtl" : "ltr";
  document.documentElement.dataset.language = currentLanguage;
  languageButtons.forEach((button) => {
    const isActive = button.dataset.language === currentLanguage;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });

  translateTextNodes(currentLanguage);
  translateElementAttributes(currentLanguage);

  document.title =
    currentLanguage === "en"
      ? "Khalid Meitani — Soft Robotics Researcher"
      : dictionary?.pageTitle || document.title;

  const description = document.querySelector('meta[name="description"]');
  const openGraphTitle = document.querySelector('meta[property="og:title"]');
  const openGraphDescription = document.querySelector(
    'meta[property="og:description"]',
  );
  if (description) {
    description.content =
      currentLanguage === "en"
        ? "The academic website of Khalid Meitani, a master's student researching 3D-printed, bio-inspired soft robotic systems at Kyoto University of Advanced Science."
        : dictionary?.metaDescription || description.content;
  }
  if (openGraphTitle) openGraphTitle.content = document.title;
  if (openGraphDescription && description) {
    openGraphDescription.content = description.content;
  }

  if (persist) {
    try {
      localStorage.setItem(languageStorageKey, currentLanguage);
    } catch {
      // The language still changes when storage is unavailable.
    }
  }

  document.dispatchEvent(
    new CustomEvent("languagechange", { detail: { language: currentLanguage } }),
  );
};

applyLanguage(currentLanguage);

const menuButton = document.querySelector(".menu-button");
const navigation = document.querySelector(".site-nav");
const header = document.querySelector(".site-header");
const themeToggle = document.querySelector(".theme-toggle");
const themeColor = document.querySelector("#theme-color");
const themeStorageKey = "khalid-theme";

const applyTheme = (theme, persist = false) => {
  const isDark = theme === "dark";
  document.documentElement.dataset.theme = isDark ? "dark" : "light";
  themeToggle?.setAttribute("aria-pressed", String(isDark));
  themeToggle?.setAttribute(
    "aria-label",
    translatePhrase(isDark ? "Switch to light mode" : "Switch to dark mode"),
  );
  if (themeToggle) {
    themeToggle.title = translatePhrase(
      isDark ? "Switch to light mode" : "Switch to dark mode",
    );
  }
  themeColor?.setAttribute("content", isDark ? "#101613" : "#f7f8f5");

  if (persist) {
    try {
      localStorage.setItem(themeStorageKey, isDark ? "dark" : "light");
    } catch {
      // The visual preference still applies when storage is unavailable.
    }
  }
};

applyTheme(document.documentElement.dataset.theme || "light");

languageButtons.forEach((button) => {
  button.addEventListener("click", () => {
    applyLanguage(button.dataset.language, true);
    applyTheme(document.documentElement.dataset.theme || "light");
  });
});

themeToggle?.addEventListener("click", () => {
  const nextTheme =
    document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(nextTheme, true);
});

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
    const isPanoramic = ratio >= 2.25 && !viewport.hasAttribute("data-fit-entire");
    const isPortrait = ratio <= 0.82;

    viewport.classList.toggle("is-panoramic", isPanoramic);
    viewport.classList.toggle("is-portrait", isPortrait);
    viewport.tabIndex = isPanoramic ? 0 : -1;
    viewport.setAttribute(
      "aria-label",
      translatePhrase(
        isPanoramic
          ? "Panoramic figure; scroll horizontally to see the full image"
          : "Publication figure",
      ),
    );

    if (hint) hint.hidden = !isPanoramic;
  };

  if (image.complete) {
    updateFigureLayout();
  } else {
    image.addEventListener("load", updateFigureLayout, { once: true });
  }
  document.addEventListener("languagechange", updateFigureLayout);
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
    toggleButton.textContent = translatePhrase(
      manuallyPaused ? "Play slideshow" : "Pause slideshow",
    );
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
      const slideVideo = slide.querySelector("video");
      const slidePlayButton = slide.querySelector("[data-video-play]");

      slide.hidden = !isActive;
      slide.classList.toggle("is-active", isActive);
      slide.setAttribute("aria-hidden", String(!isActive));

      if (!slideVideo) return;

      if (isActive) {
        if (slidePlayButton) slidePlayButton.hidden = true;
        slideVideo.hidden = false;
        slideVideo.muted = true;
        const playback = slideVideo.play();

        playback?.catch(() => {
          slideVideo.hidden = true;
          if (slidePlayButton) slidePlayButton.hidden = false;
        });
      } else {
        slideVideo.pause();
        if (slideVideo.readyState > 0) slideVideo.currentTime = 0;
        slideVideo.hidden = true;
        if (slidePlayButton) slidePlayButton.hidden = false;
      }
    });

    dots.forEach((dot, dotIndex) => {
      dot.setAttribute("aria-current", String(dotIndex === currentIndex));
    });

    if (announcement) {
      const label = slides[currentIndex].dataset.carouselLabel || "Publication figure";
      announcement.textContent = formatCarouselAnnouncement(
        currentIndex + 1,
        slides.length,
        label,
      );
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
  document.addEventListener("languagechange", () => {
    updateToggleButton();
    showSlide(currentIndex, false);
  });

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
    zoomButton.textContent = translatePhrase(
      isZoomed ? "Fit to screen" : "View actual size",
    );
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
    zoomButton.textContent = translatePhrase("View actual size");
    canvas.scrollTo({ top: 0, left: 0 });
    document.dispatchEvent(new CustomEvent("figure-dialog-closed"));
  });

  document.addEventListener("languagechange", () => {
    zoomButton.textContent = translatePhrase(
      image.classList.contains("is-zoomed")
        ? "Fit to screen"
        : "View actual size",
    );
  });
});
