(() => {
  const gripperLabs = document.querySelectorAll("[data-gripper-lab]");
  if (!gripperLabs.length) return;

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
  const smoothstep = (minimum, maximum, value) => {
    const amount = clamp((value - minimum) / (maximum - minimum), 0, 1);
    return amount * amount * (3 - 2 * amount);
  };
  const normalizePhrase = (value = "") => value.replace(/\s+/g, " ").trim();
  const translateGripperPhrase = (phrase) => {
    const language = document.documentElement.lang || "en";
    if (language === "en") return phrase;
    const dictionary = window.siteTranslations?.[language];
    const normalized = normalizePhrase(phrase);
    return dictionary?.text?.[normalized] || dictionary?.attributes?.[normalized] || phrase;
  };

  const parseObj = (source) => {
    const rawVertices = [];
    const faces = [];
    const groupIndices = new Map();
    let currentGroup = "Gripper";

    source.split(/\r?\n/).forEach((rawLine) => {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) return;

      if (line.startsWith("g ")) {
        currentGroup = line.slice(2).trim() || "Gripper";
        return;
      }

      if (line.startsWith("v ")) {
        const coordinates = line.slice(2).trim().split(/\s+/).map(Number);
        if (coordinates.length >= 3 && coordinates.slice(0, 3).every(Number.isFinite)) {
          rawVertices.push(coordinates.slice(0, 3));
        }
        return;
      }

      if (!line.startsWith("f ")) return;
      const indices = line
        .slice(2)
        .trim()
        .split(/\s+/)
        .map((token) => Number.parseInt(token.split("/")[0], 10))
        .map((index) => (index < 0 ? rawVertices.length + index : index - 1))
        .filter(
          (index) => Number.isInteger(index) && index >= 0 && index < rawVertices.length,
        );
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

    if (!rawVertices.length || !faces.length) {
      throw new Error("The gripper OBJ did not contain renderable geometry.");
    }

    const bounds = rawVertices.reduce(
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

    const axialLength = Math.max(0.0001, bounds.maximumX - bounds.minimumX);
    const scale = 2.25 / axialLength;
    const centerY = (bounds.minimumY + bounds.maximumY) / 2;
    const centerZ = (bounds.minimumZ + bounds.maximumZ) / 2;
    const vertices = rawVertices.map(([x, y, z]) => [
      (y - centerY) * scale,
      (x - bounds.minimumX) * scale,
      (z - centerZ) * scale,
    ]);

    const groupCenters = new Map();
    const groupBounds = new Map();
    groupIndices.forEach((indices, group) => {
      const center = [0, 0, 0];
      const minimum = [Infinity, Infinity, Infinity];
      const maximum = [-Infinity, -Infinity, -Infinity];
      indices.forEach((index) => {
        const vertex = vertices[index];
        vertex.forEach((value, axis) => {
          center[axis] += value;
          minimum[axis] = Math.min(minimum[axis], value);
          maximum[axis] = Math.max(maximum[axis], value);
        });
      });
      const count = Math.max(1, indices.size);
      groupCenters.set(group, center.map((value) => value / count));
      groupBounds.set(group, { minimum, maximum });
    });

    const mountCenter = groupCenters.get("Body1") || [0, 0, 0];
    return {
      vertices,
      faces,
      groupIndices,
      groupCenters,
      groupBounds,
      axisCenter: [mountCenter[0], mountCenter[2]],
    };
  };

  gripperLabs.forEach((lab) => {
    const dialog = lab.closest("[data-gripper-dialog]");
    const dialogCloseButton = dialog?.querySelector("[data-gripper-close]");
    const dialogOpeners = dialog
      ? [...document.querySelectorAll("[data-gripper-open]")].filter(
          (button) => button.dataset.gripperOpen === dialog.id,
        )
      : [];
    const consoleElement = lab.querySelector(".gripper-motion-console");
    const stage = lab.querySelector("[data-gripper-stage]");
    const canvas = lab.querySelector("[data-gripper-canvas]");
    const status = lab.querySelector("[data-gripper-status]");
    const toggleButton = lab.querySelector("[data-gripper-toggle]");
    const toggleLabel = lab.querySelector("[data-gripper-toggle-label]");
    const toggleIcon = toggleButton?.querySelector("[aria-hidden]");
    const resetButton = lab.querySelector("[data-gripper-reset]");
    const progressInput = lab.querySelector("[data-gripper-progress]");
    const phaseIndex = lab.querySelector("[data-gripper-phase-index]");
    const phaseTitle = lab.querySelector("[data-gripper-phase-title]");
    const phaseButtons = [...lab.querySelectorAll("[data-gripper-phase]")];
    const pressureState = lab.querySelector("[data-gripper-pressure]");
    const pressureLabel = lab.querySelector("[data-gripper-pressure-label]");
    const context = canvas?.getContext("2d", { alpha: true });

    if (
      !dialog ||
      !dialogCloseButton ||
      !consoleElement ||
      !stage ||
      !canvas ||
      !status ||
      !toggleButton ||
      !toggleLabel ||
      !resetButton ||
      !progressInput ||
      !phaseIndex ||
      !phaseTitle ||
      !pressureState ||
      !pressureLabel ||
      !context
    ) {
      return;
    }

    const phases = [
      { index: "01", title: "Approach" },
      { index: "02", title: "Conform & grasp" },
      { index: "03", title: "Lift" },
      { index: "04", title: "Place & release" },
    ];
    const fingerGroups = new Set(["Body4", "Body14", "Body15"]);
    const groupColors = {
      Body1: [212, 220, 213],
      Body3: [54, 73, 62],
      Body4: [77, 103, 86],
      Body10: [142, 154, 148],
      Body11: [165, 176, 170],
      Body14: [77, 103, 86],
      Body15: [77, 103, 86],
    };
    const tomatoRadius = 0.42;
    const fixedYaw = -0.48;
    const fixedPitch = 0.1;
    const loopDuration = 11000;
    const minimumFrameInterval = 1000 / 30;

    let model = null;
    let width = 0;
    let height = 0;
    let pixelRatio = 1;
    let progress = 0;
    let playing = !prefersReducedMotion;
    let animationFrame = 0;
    let previousTime = 0;
    let previousRenderTime = 0;
    let isVisible = false;
    let modelRequested = false;
    let loadState = "loading";
    let activePhase = -1;
    let activePressure = "";
    let lastDialogTrigger = null;

    const phaseFromProgress = (value) => {
      if (value < 0.23) return 0;
      if (value < 0.44) return 1;
      if (value < 0.68) return 2;
      return 3;
    };

    const getGraspState = () => {
      const descent = smoothstep(0.05, 0.2, progress);
      const returnRise = smoothstep(0.88, 0.98, progress);
      const close =
        smoothstep(0.23, 0.4, progress) *
        (1 - smoothstep(0.77, 0.9, progress));
      const lift =
        smoothstep(0.43, 0.55, progress) *
        (1 - smoothstep(0.64, 0.76, progress));
      const phase = phaseFromProgress(progress);
      const pressurePhrase =
        phase === 0
          ? "Pressure off"
          : phase === 1
            ? "Pressure rising"
            : phase === 2
              ? "Grasp secured"
              : progress < 0.78
                ? "Lowering object"
                : "Releasing pressure";

      return {
        close,
        phase,
        pressurePhrase,
        assemblyLift: (1 - descent) * 0.52 + returnRise * 0.52 + lift * 0.82,
        objectLift: lift * 0.82,
      };
    };

    const setStatus = (phrase) => {
      status.textContent = translateGripperPhrase(phrase);
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
      toggleLabel.textContent = translateGripperPhrase(
        playing ? "Pause motion" : "Play motion",
      );
      if (toggleIcon) toggleIcon.textContent = playing ? "Ⅱ" : "▶";
      toggleButton.setAttribute("aria-pressed", String(playing));
    };

    const updateInterface = (state, force = false) => {
      if (force || activePhase !== state.phase) {
        activePhase = state.phase;
        const phase = phases[activePhase];
        phaseIndex.textContent = phase.index;
        phaseTitle.textContent = translateGripperPhrase(phase.title);
        phaseButtons.forEach((button, index) => {
          const isActive = index === activePhase;
          button.classList.toggle("is-active", isActive);
          button.setAttribute("aria-pressed", String(isActive));
        });
      }

      if (force || activePressure !== state.pressurePhrase) {
        activePressure = state.pressurePhrase;
        pressureLabel.textContent = translateGripperPhrase(activePressure);
        pressureState.classList.toggle("is-pressurized", state.close > 0.08);
        pressureState.classList.toggle("is-secured", state.phase === 2);
      }

      progressInput.value = String(Math.round(progress * 1000));
    };

    const resizeCanvas = () => {
      const bounds = canvas.getBoundingClientRect();
      const nextWidth = Math.max(280, Math.round(bounds.width));
      const nextHeight = Math.max(360, Math.round(bounds.height));
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

    const deformVertex = (vertex, group, state) => {
      let [x, y, z] = vertex;
      if (fingerGroups.has(group)) {
        const bounds = model.groupBounds.get(group);
        const fingerLength = Math.max(0.001, bounds.maximum[1] - bounds.minimum[1]);
        const axialProgress = clamp(
          (bounds.maximum[1] - y) / fingerLength,
          0,
          1,
        );
        const bendProfile = smoothstep(0.04, 1, axialProgress);
        const [axisX, axisZ] = model.axisCenter;

        if (group === "Body14") {
          const direction = Math.sign(model.groupCenters.get(group)[2] - axisZ) || -1;
          const targetZ = axisZ + direction * tomatoRadius * 0.72;
          z += (targetZ - z) * state.close * 0.84 * bendProfile;
        } else {
          const direction = Math.sign(model.groupCenters.get(group)[0] - axisX) || 1;
          const targetX = axisX + direction * tomatoRadius * 0.72;
          x += (targetX - x) * state.close * 0.84 * bendProfile;
        }
        y += state.close * 0.11 * bendProfile;
      }
      y += state.assemblyLift;
      return [x, y, z];
    };

    const projectPoint = (point, pixelsPerUnit, groundY) => {
      const [x, y, z] = point;
      const cosineYaw = Math.cos(fixedYaw);
      const sineYaw = Math.sin(fixedYaw);
      const yawX = x * cosineYaw - z * sineYaw;
      const yawZ = x * sineYaw + z * cosineYaw;
      const cosinePitch = Math.cos(fixedPitch);
      const sinePitch = Math.sin(fixedPitch);
      const viewY = y * cosinePitch + yawZ * sinePitch;
      const viewZ = -y * sinePitch + yawZ * cosinePitch;
      const perspective = clamp(1 / (1 + viewZ * 0.075), 0.78, 1.25);
      return {
        screenX: width / 2 + yawX * pixelsPerUnit * perspective,
        screenY: groundY - viewY * pixelsPerUnit * perspective,
        viewX: yawX,
        viewY,
        viewZ,
        perspective,
      };
    };

    const shadeColor = (color, light, activeFinger = false) => {
      const boost = activeFinger ? 1.08 : 1;
      const values = color.map((channel) =>
        Math.round(clamp(channel * light * boost, 0, 255)),
      );
      return `rgb(${values[0]} ${values[1]} ${values[2]})`;
    };

    const drawGround = (groundY) => {
      const gradient = context.createLinearGradient(0, 0, width, 0);
      gradient.addColorStop(0, "rgba(202, 255, 106, 0)");
      gradient.addColorStop(0.17, "rgba(202, 255, 106, 0.14)");
      gradient.addColorStop(0.83, "rgba(202, 255, 106, 0.14)");
      gradient.addColorStop(1, "rgba(202, 255, 106, 0)");
      context.strokeStyle = gradient;
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(0, groundY + 5);
      context.lineTo(width, groundY + 5);
      context.stroke();
    };

    const drawTomato = (center, radius) => {
      const gradient = context.createRadialGradient(
        center.screenX - radius * 0.3,
        center.screenY - radius * 0.34,
        radius * 0.08,
        center.screenX,
        center.screenY,
        radius,
      );
      gradient.addColorStop(0, "#ffad82");
      gradient.addColorStop(0.34, "#ef6247");
      gradient.addColorStop(0.78, "#c92f2d");
      gradient.addColorStop(1, "#761719");
      context.fillStyle = gradient;
      context.strokeStyle = "rgba(74, 12, 12, 0.72)";
      context.lineWidth = 1.2;
      context.beginPath();
      context.ellipse(
        center.screenX,
        center.screenY,
        radius,
        radius * 0.92,
        0,
        0,
        Math.PI * 2,
      );
      context.fill();
      context.stroke();

      context.fillStyle = "#5e853d";
      for (let index = 0; index < 5; index += 1) {
        const angle = -Math.PI / 2 + (index / 5) * Math.PI * 2;
        context.save();
        context.translate(center.screenX, center.screenY - radius * 0.78);
        context.rotate(angle);
        context.beginPath();
        context.moveTo(0, 0);
        context.lineTo(radius * 0.42, radius * 0.08);
        context.lineTo(radius * 0.12, radius * 0.2);
        context.closePath();
        context.fill();
        context.restore();
      }
    };

    const drawModel = () => {
      if (!model) return;
      resizeCanvas();
      context.clearRect(0, 0, width, height);

      const state = getGraspState();
      const groundY = height * 0.87;
      const pixelsPerUnit = Math.min(width / 4.8, height / 3.75);
      drawGround(groundY);

      const [axisX, axisZ] = model.axisCenter;
      const tomatoWorld = [axisX, tomatoRadius + 0.03 + state.objectLift, axisZ];
      const tomatoCenter = projectPoint(tomatoWorld, pixelsPerUnit, groundY);
      const tomatoScreenRadius = tomatoRadius * pixelsPerUnit * tomatoCenter.perspective;

      context.save();
      context.filter = "blur(8px)";
      context.fillStyle = `rgba(0, 0, 0, ${0.27 - state.objectLift * 0.12})`;
      context.beginPath();
      context.ellipse(
        tomatoCenter.screenX,
        groundY + 8,
        tomatoScreenRadius * (1.1 - state.objectLift * 0.2),
        tomatoScreenRadius * 0.23,
        0,
        0,
        Math.PI * 2,
      );
      context.fill();
      context.restore();

      const transformedVertices = new Array(model.vertices.length);
      model.groupIndices.forEach((indices, group) => {
        indices.forEach((index) => {
          transformedVertices[index] = projectPoint(
            deformVertex(model.vertices[index], group, state),
            pixelsPerUnit,
            groundY,
          );
        });
      });

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
            (normal[0] * -0.32 + normal[1] * 0.84 + normal[2] * -0.42) /
            normalLength;
          return {
            points: [first, second, third],
            depth: (first.viewZ + second.viewZ + third.viewZ) / 3,
            light: 0.38 + Math.max(0, lightDot) * 0.62,
            group: face.group,
          };
        })
        .sort((first, second) => second.depth - first.depth);

      let tomatoDrawn = false;
      const paintTomato = () => {
        if (tomatoDrawn) return;
        drawTomato(tomatoCenter, tomatoScreenRadius);
        tomatoDrawn = true;
      };

      renderedFaces.forEach((face) => {
        if (!tomatoDrawn && face.depth < tomatoCenter.viewZ) paintTomato();
        const color = groupColors[face.group] || [130, 150, 138];
        const activeFinger = fingerGroups.has(face.group) && state.close > 0.08;
        context.fillStyle = shadeColor(color, face.light, activeFinger);
        context.strokeStyle = activeFinger
          ? "rgba(202, 255, 106, 0.12)"
          : "rgba(5, 15, 10, 0.13)";
        context.lineWidth = width < 560 ? 0.2 : 0.34;
        context.beginPath();
        context.moveTo(face.points[0].screenX, face.points[0].screenY);
        context.lineTo(face.points[1].screenX, face.points[1].screenY);
        context.lineTo(face.points[2].screenX, face.points[2].screenY);
        context.closePath();
        context.fill();
        context.stroke();
      });
      paintTomato();
      updateInterface(state);
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
      if (!playing || !previousRenderTime || time - previousRenderTime >= minimumFrameInterval) {
        previousRenderTime = time;
        drawModel();
      }
      if (playing && isVisible && !document.hidden) requestDraw();
    };

    const setPlaying = (nextPlaying) => {
      playing = Boolean(nextPlaying);
      previousTime = 0;
      previousRenderTime = 0;
      updateToggle();
      requestDraw();
    };

    toggleButton.addEventListener("click", () => setPlaying(!playing));
    resetButton.addEventListener("click", () => {
      progress = 0;
      setPlaying(true);
      updateInterface(getGraspState(), true);
    });
    progressInput.addEventListener("input", () => {
      progress = Number(progressInput.value) / 1000;
      setPlaying(false);
      updateInterface(getGraspState(), true);
      requestDraw();
    });
    phaseButtons.forEach((button) => {
      button.addEventListener("click", () => {
        progress = clamp(Number(button.dataset.gripperPhase) || 0, 0, 0.99);
        setPlaying(false);
        updateInterface(getGraspState(), true);
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

    document.addEventListener("visibilitychange", () => {
      previousTime = 0;
      if (!document.hidden && isVisible) requestDraw();
    });
    document.addEventListener("languagechange", () => {
      activePhase = -1;
      activePressure = "";
      setStatus(
        loadState === "ready"
          ? "Gripper OBJ ready"
          : loadState === "error"
            ? "Gripper preview unavailable"
            : "Loading gripper geometry…",
      );
      updateToggle();
      updateInterface(getGraspState(), true);
    });

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
          setStatus("Gripper OBJ ready");
          resizeCanvas();
          updateInterface(getGraspState(), true);
          requestDraw();
        })
        .catch(() => {
          loadState = "error";
          playing = false;
          setControlsEnabled(false);
          setStatus("Gripper preview unavailable");
          updateToggle();
        });
    };

    dialogOpeners.forEach((button) => {
      button.addEventListener("click", () => {
        lastDialogTrigger = button;
        if (!dialog.open) dialog.showModal();
        document.body.classList.add("gripper-dialog-open");
        dialog.querySelector(".gripper-dialog-frame")?.scrollTo(0, 0);
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
      document.body.classList.remove("gripper-dialog-open");
      isVisible = false;
      previousTime = 0;
      previousRenderTime = 0;
      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame);
        animationFrame = 0;
      }
      document.dispatchEvent(new CustomEvent("figure-dialog-closed"));
      lastDialogTrigger?.focus({ preventScroll: true });
    });

    setControlsEnabled(false);
    updateToggle();
    setStatus("Loading gripper geometry…");
  });
})();
