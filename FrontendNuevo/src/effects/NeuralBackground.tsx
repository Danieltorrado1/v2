import { useCallback } from "react";
import Particles, { ParticlesProvider } from "@tsparticles/react";
import { loadSlim } from "@tsparticles/slim";
import type { Engine, ISourceOptions } from "@tsparticles/engine";

const options: ISourceOptions = {
  fullScreen: { enable: false },
  background: { color: { value: "transparent" } },
  detectRetina: true,
  particles: {
    number: {
      value: 60,
      density: { enable: true, width: 1200, height: 800 },
    },
    color: { value: ["#5EEAD4", "#18A0A3", "#FFFFFF"] },
    links: {
      enable: true,
      distance: 130,
      color: "#5EEAD4",
      opacity: 0.18,
      width: 1,
    },
    move: {
      enable: true,
      speed: 0.5,
      outModes: { default: "out" },
    },
    opacity: {
      value: { min: 0.15, max: 0.55 },
    },
    size: {
      value: { min: 1, max: 3 },
    },
  },
  interactivity: {
    events: {
      onHover: { enable: true, mode: "grab" },
    },
    modes: {
      grab: { distance: 150, links: { opacity: 0.35 } },
    },
  },
};

export default function NeuralBackground() {
  const init = useCallback(async (engine: Engine) => {
    await loadSlim(engine);
  }, []);

  return (
    <ParticlesProvider init={init}>
      <Particles id="empiria-neural-bg" options={options} className="neural-particles" />
    </ParticlesProvider>
  );
}
