(() => {
  const crawlerLabs = document.querySelectorAll("[data-crawler-lab]");
  if (!crawlerLabs.length) return;

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
  const smoothstep = (minimum, maximum, value) => {
    const amount = clamp((value - minimum) / (maximum - minimum), 0, 1);
    return amount * amount * (3 - 2 * amount);
  };

  const normalizePhrase = (value = "") => value.replace(/\s+/g, " ").trim();
  const translateCrawlerPhrase = (phrase) => {
    const language = document.documentElement.lang || "en";
    if (language === "en") return phrase;
    const dictionary = window.siteTranslations?.[language];
    const normalized = normalizePhrase(phrase);
    return (
      dictionary?.text?.[normalized] ||
      dictionary?.attributes?.[normalized] ||
      phrase
    );
  };

  const parseObj = (source) => {
    const vertices = [];
    const faces = [];
    const groupIndices = new Map();
    let currentGroup = "Crawler";

    source.split(/\r?\n/).forEach((rawLine) => {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) return;

      if (line.startsWith("g ")) {
        currentGroup = line.slice(2).trim() || "Crawler";
        return;
      }

      if (line.startsWith("v ")) {
        const coordinates = line.slice(2).trim().split(/\s+/).map(Number);
        if (coordinates.length >= 3 && coordinates.every(Number.isFinite)) {
          vertices.push(coordinates.slice(0, 3));
        }
        return;
      }

      if (!line.startsWith("f ")) return;
      const indices = line
        .slice(2)
        .trim()
        .split(/\s+/)
        .map((token) => Number.parseInt(token.split("/")[0], 10))
        .map((index) => (index < 0 ? vertices.length + index : index - 1))
        .filter((index) => Number.isInteger(index) && index >= 0 && index < vertices.length);

      if (indices.length < 3) return;
      if (!groupIndices.has(currentGroup)) groupIndices.set(currentGroup, new Set());
      indices.forEach((index) => groupIndices.get(currentGroup).add(index));

      for (let index = 1; index < indices.length - 1; index += 1) {
        faces.push({
          indices: [indices[0], indices[index], indices[index + 1]],
          group: currentGroup,
        });
      }
    });

    if (!vertices.length || !faces.length) {
      throw new Error("The OBJ file did not contain renderable geometry.");
    }

    const bounds = vertices.reduce(
      (result, vertex) => ({
        minimumX: Math.min(result.minimumX, vertex[0]),
        maximumX: Math.max(result.maximumX, vertex[0]),
        minimumY: Math.min(result.minimumY, vertex[1]),
        maximumY: Math.max(result.maximumY, vertex[1]),
        minimumZ: Math.min(result.minimumZ, vertex[2]),
        maximumZ: Math.max(result.maximumZ, vertex[2]),
      }),
      {
        minimumX: Infinity,
        maximumX: -Infinity,
        minimumY: Infinity,
        maximumY: -Infinity,
        minimumZ: Infinity,
        maximumZ: -Infinity,
      },
    );

    const length = Math.max(0.0001, bounds.maximumZ - bounds.minimumZ);
    const scale = 2 / length;
    const centerX = (bounds.minimumX + bounds.maximumX) / 2;
    const centerZ = (bounds.minimumZ + bounds.maximumZ) / 2;
    const normalizedVertices = vertices.map(([x, y, z]) => [
      (x - centerX) * scale,
      (y - bounds.minimumY) * scale,
      (z - centerZ) * scale,
    ]);

    const groupCenters = new Map();
    groupIndices.forEach((indices, group) => {
      const center = [0, 0, 0];
      indices.forEach((index) => {
        const vertex = normalizedVertices[index];
        center[0] += vertex[0];
        center[1] += vertex[1];
        center[2] += vertex[2];
      });
      const count = Math.max(1, indices.size);
      groupCenters.set(group, center.map((value) => value / count));
    });

    return { vertices: normalizedVertices, faces, groupCenters };
  };

  crawlerLabs.forEach((lab) => {
    const dialog = lab.closest("[data-crawler-dialog]");
    const dialogCloseButton = dialog?.querySelector("[data-crawler-close]");
    const dialogOpeners = dialog
      ? [...document.querySelectorAll("[data-crawler-open]")].filter(
          (button) => button.dataset.crawlerOpen === dialog.id,
        )
      : [];
    const consoleElement = lab.querySelector(".crawler-motion-console");
    const canvas = lab.querySelector("[data-crawler-canvas]");
    const stage = lab.querySelector("[data-crawler-stage]");
    const status = lab.querySelector("[data-crawler-status]");
    const toggleButton = lab.querySelector("[data-crawler-toggle]");
    const toggleLabel = lab.querySelector("[data-crawler-toggle-label]");
    const toggleIcon = toggleButton?.querySelector("[aria-hidden]");
    const resetButton = lab.querySelector("[data-crawler-reset]");
    const progressInput = lab.querySelector("[data-crawler-progress]");
    const phaseIndex = lab.querySelector("[data-crawler-phase-index]");
    const phaseTitle = lab.querySelector("[data-crawler-phase-title]");
    const phaseButtons = [...lab.querySelectorAll("[data-crawler-phase]")];
    const currentState = lab.querySelector("[data-crawler-current]");
    const currentLabel = lab.querySelector("[data-crawler-current-label]");
    const context = canvas?.getContext("2d", { alpha: true });

    if (
      !consoleElement ||
      !canvas ||
      !stage ||
      !status ||
      !toggleButton ||
      !toggleLabel ||
      !resetButton ||
      !progressInput ||
      !phaseIndex ||
      !phaseTitle ||
      !currentState ||
      !currentLabel ||
      !context ||
      (dialog && !dialogCloseButton)
    ) {
      return;
    }

    const phases = [
      { index: "01", title: "Body relaxed" },
      { index: "02", title: "Repulsion & bend" },
      { index: "03", title: "Release & advance" },
    ];
    const groupColors = {
      Body96: [202, 255, 106],
      Body37: [217, 120, 73],
      Body82: [217, 120, 73],
      Body60: [119, 139, 127],
      Body81: [119, 139, 127],
    };
    const electromagnetGroups = ["Body37", "Body82"];
    const fixedYaw = -Math.PI / 2;
    const fixedPitch = 0.18;
    const gaitCount = 4;
    const travelStart = -2.15;
    const travelDistance = 4.3;
    const loopDuration = 9000;

    let model = null;
    let width = 0;
    let height = 0;
    let pixelRatio = 1;
    let progress = 0;
    const yaw = fixedYaw;
    const pitch = fixedPitch;
    let playing = !prefersReducedMotion;
    let animationFrame = 0;
    let previousTime = 0;
    let isVisible = !dialog;
    let loadState = "loading";
    let modelRequested = false;
    let activePhase = -1;
    let currentIsOn = null;
    let lastDialogTrigger = null;

    const phaseFromLocalProgress = (localProgress) => {
      if (localProgress >= 0.14 && localProgress < 0.56) return 1;
      if (localProgress >= 0.56 && localProgress < 0.9) return 2;
      return 0;
    };

    const getMotionState = () => {
      const gaitPosition = progress * gaitCount;
      const completedGaits = Math.min(gaitCount, Math.floor(gaitPosition));
      const localProgress = progress >= 1 ? 0.99 : gaitPosition % 1;
      const bend =
        smoothstep(0.11, 0.36, localProgress) *
        (1 - smoothstep(0.55, 0.84, localProgress));
      const stepProgress = smoothstep(0.47, 0.9, localProgress);
      const pathProgress = clamp(
        (completedGaits + stepProgress) / gaitCount,
        0,
        1,
      );
      return {
        localProgress,
        bend,
        travel: travelStart + pathProgress * travelDistance,
        phase: phaseFromLocalProgress(localProgress),
        currentOn: localProgress >= 0.14 && localProgress < 0.56,
      };
    };

    const setStatus = (phrase) => {
      status.textContent = translateCrawlerPhrase(phrase);
    };

    const setControlsEnabled = (enabled) => {
      toggleButton.disabled = !enabled;
      resetButton.disabled = !enabled;
      progressInput.disabled = !enabled;
      phaseButtons.forEach((button) => {
        button.disabled = !enabled;
      });
    };

    const updateToggle = () => {
      toggleLabel.textContent = translateCrawlerPhrase(
        playing ? "Pause motion" : "Play motion",
      );
      if (toggleIcon) toggleIcon.textContent = playing ? "Ⅱ" : "▶";
      toggleButton.setAttribute("aria-pressed", String(playing));
    };

    const updateInterface = (motionState, force = false) => {
      if (force || activePhase !== motionState.phase) {
        activePhase = motionState.phase;
        const phase = phases[activePhase];
        phaseIndex.textContent = phase.index;
        phaseTitle.textContent = translateCrawlerPhrase(phase.title);
        phaseButtons.forEach((button, index) => {
          const isActive = index === activePhase;
          button.classList.toggle("is-active", isActive);
          button.setAttribute("aria-pressed", String(isActive));
        });
      }

      if (force || currentIsOn !== motionState.currentOn) {
        currentIsOn = motionState.currentOn;
        currentState.classList.toggle("is-on", currentIsOn);
        currentLabel.textContent = translateCrawlerPhrase(
          currentIsOn ? "Current on" : "Current off",
        );
      }

      progressInput.value = String(Math.round(progress * 1000));
    };

    const shadeColor = (color, light, energized = false) => {
      const boost = energized ? 1.14 : 1;
      const values = color.map((channel) =>
        Math.round(clamp(channel * light * boost, 0, 255)),
      );
      return `rgb(${values[0]} ${values[1]} ${values[2]})`;
    };

    const resizeCanvas = () => {
      const bounds = canvas.getBoundingClientRect();
      const nextWidth = Math.max(280, Math.round(bounds.width));
      const nextHeight = Math.max(300, Math.round(bounds.height));
      const nextPixelRatio = Math.min(window.devicePixelRatio || 1, 2);

      if (
        nextWidth === width &&
        nextHeight === height &&
        nextPixelRatio === pixelRatio
      ) {
        return;
      }

      width = nextWidth;
      height = nextHeight;
      pixelRatio = nextPixelRatio;
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    };

    const projectVertex = (vertex, bend, travel, pixelsPerUnit, groundY) => {
      const [baseX, baseY, baseZ] = vertex;
      const archProfile = Math.pow(Math.max(0, 1 - Math.abs(baseZ)), 1.45);
      const x = baseX;
      const y = baseY + bend * 0.56 * archProfile;
      const z = baseZ * (1 - bend * 0.105) + travel;

      const cosineYaw = Math.cos(yaw);
      const sineYaw = Math.sin(yaw);
      const yawX = x * cosineYaw - z * sineYaw;
      const yawZ = x * sineYaw + z * cosineYaw;

      const cosinePitch = Math.cos(pitch);
      const sinePitch = Math.sin(pitch);
      const viewY = y * cosinePitch + yawZ * sinePitch;
      const viewZ = -y * sinePitch + yawZ * cosinePitch;
      const perspective = clamp(1 / (1 + viewZ * 0.085), 0.78, 1.24);

      return {
        screenX: width / 2 + yawX * pixelsPerUnit * perspective,
        screenY: groundY - viewY * pixelsPerUnit * perspective,
        viewX: yawX,
        viewY,
        viewZ,
      };
    };

    const drawTrack = (groundY, pixelsPerUnit) => {
      const trackStart = projectVertex(
        [0, 0, 0],
        0,
        travelStart - 1.25,
        pixelsPerUnit,
        groundY,
      );
      const trackEnd = projectVertex(
        [0, 0, 0],
        0,
        travelStart + travelDistance + 1.25,
        pixelsPerUnit,
        groundY,
      );
      const gradient = context.createLinearGradient(
        trackStart.screenX,
        trackStart.screenY,
        trackEnd.screenX,
        trackEnd.screenY,
      );
      gradient.addColorStop(0, "rgba(202, 255, 106, 0)");
      gradient.addColorStop(0.15, "rgba(202, 255, 106, 0.16)");
      gradient.addColorStop(0.85, "rgba(202, 255, 106, 0.16)");
      gradient.addColorStop(1, "rgba(202, 255, 106, 0)");
      context.strokeStyle = gradient;
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(trackStart.screenX, trackStart.screenY + 4);
      context.lineTo(trackEnd.screenX, trackEnd.screenY + 4);
      context.stroke();

      context.fillStyle = "rgba(202, 255, 106, 0.25)";
      for (let index = 0; index <= gaitCount; index += 1) {
        const worldForward = travelStart + (index / gaitCount) * travelDistance;
        const marker = projectVertex(
          [0, 0, 0],
          0,
          worldForward,
          pixelsPerUnit,
          groundY,
        );
        context.fillRect(
          Math.round(marker.screenX),
          Math.round(marker.screenY + 1),
          1,
          8,
        );
      }

      return Math.atan2(
        trackEnd.screenY - trackStart.screenY,
        trackEnd.screenX - trackStart.screenX,
      );
    };

    const drawGlow = (center, color, radius) => {
      const gradient = context.createRadialGradient(
        center.screenX,
        center.screenY,
        0,
        center.screenX,
        center.screenY,
        radius,
      );
      gradient.addColorStop(0, color);
      gradient.addColorStop(0.42, "rgba(255, 139, 112, 0.22)");
      gradient.addColorStop(1, "rgba(255, 139, 112, 0)");
      context.fillStyle = gradient;
      context.beginPath();
      context.arc(center.screenX, center.screenY, radius, 0, Math.PI * 2);
      context.fill();
    };

    const drawModel = () => {
      if (!model) return;
      resizeCanvas();
      context.clearRect(0, 0, width, height);

      const motionState = getMotionState();
      const groundY = height * (width < 560 ? 0.71 : 0.73);
      const pixelsPerUnit = width / (width < 560 ? 5.65 : 6.45);
      const trackAngle = drawTrack(groundY, pixelsPerUnit);

      const shadowCenter = projectVertex(
        [0, 0, 0],
        0,
        motionState.travel,
        pixelsPerUnit,
        groundY,
      );
      context.save();
      context.filter = "blur(8px)";
      context.fillStyle = `rgba(0, 0, 0, ${0.24 - motionState.bend * 0.07})`;
      context.beginPath();
      context.ellipse(
        shadowCenter.screenX,
        shadowCenter.screenY + 7,
        pixelsPerUnit * (0.92 - motionState.bend * 0.12),
        pixelsPerUnit * 0.13,
        trackAngle,
        0,
        Math.PI * 2,
      );
      context.fill();
      context.restore();

      const transformedVertices = model.vertices.map((vertex) =>
        projectVertex(
          vertex,
          motionState.bend,
          motionState.travel,
          pixelsPerUnit,
          groundY,
        ),
      );

      const renderedFaces = model.faces
        .map((face) => {
          const [first, second, third] = face.indices.map(
            (index) => transformedVertices[index],
          );
          const edgeOne = [
            second.viewX - first.viewX,
            second.viewY - first.viewY,
            second.viewZ - first.viewZ,
          ];
          const edgeTwo = [
            third.viewX - first.viewX,
            third.viewY - first.viewY,
            third.viewZ - first.viewZ,
          ];
          const normal = [
            edgeOne[1] * edgeTwo[2] - edgeOne[2] * edgeTwo[1],
            edgeOne[2] * edgeTwo[0] - edgeOne[0] * edgeTwo[2],
            edgeOne[0] * edgeTwo[1] - edgeOne[1] * edgeTwo[0],
          ];
          const normalLength = Math.max(
            0.0001,
            Math.hypot(normal[0], normal[1], normal[2]),
          );
          const lightDot =
            (normal[0] * -0.28 + normal[1] * 0.82 + normal[2] * -0.48) /
            normalLength;
          return {
            points: [first, second, third],
            depth: (first.viewZ + second.viewZ + third.viewZ) / 3,
            light: 0.42 + Math.max(0, lightDot) * 0.58,
            group: face.group,
          };
        })
        .sort((first, second) => second.depth - first.depth);

      renderedFaces.forEach((face) => {
        const color = groupColors[face.group] || [171, 202, 181];
        const energized = motionState.currentOn && electromagnetGroups.includes(face.group);
        context.fillStyle = shadeColor(color, face.light, energized);
        context.strokeStyle = "rgba(5, 15, 10, 0.14)";
        context.lineWidth = width < 560 ? 0.24 : 0.36;
        context.beginPath();
        context.moveTo(face.points[0].screenX, face.points[0].screenY);
        context.lineTo(face.points[1].screenX, face.points[1].screenY);
        context.lineTo(face.points[2].screenX, face.points[2].screenY);
        context.closePath();
        context.fill();
        context.stroke();
      });

      if (motionState.currentOn) {
        electromagnetGroups.forEach((group) => {
          const center = model.groupCenters.get(group);
          if (!center) return;
          const projectedCenter = projectVertex(
            center,
            motionState.bend,
            motionState.travel,
            pixelsPerUnit,
            groundY,
          );
          drawGlow(
            projectedCenter,
            "rgba(255, 171, 126, 0.48)",
            clamp(pixelsPerUnit * 0.34, 22, 54),
          );
        });
      }

      updateInterface(motionState);
    };

    const requestDraw = () => {
      if (!animationFrame) animationFrame = window.requestAnimationFrame(drawFrame);
    };

    const drawFrame = (time) => {
      animationFrame = 0;
      if (!model) return;

      if (playing && isVisible && !document.hidden) {
        if (previousTime) {
          const elapsed = Math.min(80, time - previousTime);
          progress = (progress + elapsed / loopDuration) % 1;
        }
        previousTime = time;
      } else {
        previousTime = 0;
      }

      drawModel();
      if (playing && isVisible && !document.hidden) requestDraw();
    };

    const setPlaying = (nextPlaying) => {
      playing = Boolean(nextPlaying);
      previousTime = 0;
      updateToggle();
      requestDraw();
    };

    toggleButton.addEventListener("click", () => setPlaying(!playing));

    resetButton.addEventListener("click", () => {
      progress = 0;
      setPlaying(true);
      updateInterface(getMotionState(), true);
    });

    progressInput.addEventListener("input", () => {
      progress = Number(progressInput.value) / 1000;
      setPlaying(false);
      updateInterface(getMotionState(), true);
      requestDraw();
    });

    phaseButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const target = clamp(Number(button.dataset.crawlerPhase) || 0, 0, 0.99);
        progress = (1 + target) / gaitCount;
        setPlaying(false);
        updateInterface(getMotionState(), true);
        requestDraw();
      });
    });

    if ("ResizeObserver" in window) {
      const resizeObserver = new ResizeObserver(() => {
        resizeCanvas();
        requestDraw();
      });
      resizeObserver.observe(stage);
    } else {
      window.addEventListener(
        "resize",
        () => {
          resizeCanvas();
          requestDraw();
        },
        { passive: true },
      );
    }

    if ("IntersectionObserver" in window) {
      const visibilityObserver = new IntersectionObserver(
        ([entry]) => {
          isVisible = entry.isIntersecting && (!dialog || dialog.open);
          if (isVisible) requestDraw();
          else if (animationFrame) {
            window.cancelAnimationFrame(animationFrame);
            animationFrame = 0;
            previousTime = 0;
          }
        },
        { threshold: 0.02 },
      );
      visibilityObserver.observe(lab);
    }

    document.addEventListener("visibilitychange", () => {
      previousTime = 0;
      if (!document.hidden && isVisible) requestDraw();
    });

    document.addEventListener("languagechange", () => {
      activePhase = -1;
      currentIsOn = null;
      setStatus(
        loadState === "ready"
          ? "OBJ model ready"
          : loadState === "error"
            ? "Model preview unavailable"
            : "Loading crawler geometry…",
      );
      updateToggle();
      updateInterface(getMotionState(), true);
    });

    setControlsEnabled(false);
    updateToggle();
    setStatus("Loading crawler geometry…");

    const loadModel = () => {
      if (modelRequested) return;
      modelRequested = true;

      fetch(lab.dataset.modelUrl)
        .then((response) => {
          if (!response.ok) throw new Error(`Model request failed: ${response.status}`);
          return response.text();
        })
        .then((source) => {
          model = parseObj(source);
          loadState = "ready";
          consoleElement.classList.add("is-ready");
          setControlsEnabled(true);
          setStatus("OBJ model ready");
          resizeCanvas();
          updateInterface(getMotionState(), true);
          requestDraw();
        })
        .catch(() => {
          loadState = "error";
          playing = false;
          setControlsEnabled(false);
          setStatus("Model preview unavailable");
          updateToggle();
        });
    };

    if (dialog) {
      dialogOpeners.forEach((button) => {
        button.addEventListener("click", () => {
          lastDialogTrigger = button;
          if (!dialog.open) dialog.showModal();
          document.body.classList.add("crawler-dialog-open");
          dialog.querySelector(".crawler-dialog-frame")?.scrollTo(0, 0);
          isVisible = true;
          loadModel();
          window.requestAnimationFrame(() => {
            resizeCanvas();
            requestDraw();
          });
          document.dispatchEvent(new CustomEvent("figure-dialog-opened"));
        });
      });

      dialogCloseButton.addEventListener("click", () => dialog.close());
      dialog.addEventListener("click", (event) => {
        if (event.target === dialog) dialog.close();
      });
      dialog.addEventListener("close", () => {
        document.body.classList.remove("crawler-dialog-open");
        isVisible = false;
        previousTime = 0;
        if (animationFrame) {
          window.cancelAnimationFrame(animationFrame);
          animationFrame = 0;
        }
        document.dispatchEvent(new CustomEvent("figure-dialog-closed"));
        lastDialogTrigger?.focus({ preventScroll: true });
      });
    } else {
      loadModel();
    }
  });
})();
