import { Composition } from "remotion";
import { CaptionedVideo, type CaptionedVideoProps } from "./CaptionedVideo";
import sample from "./sample-captions.json";
import { markEmphasis } from "./words";

// Valeurs utilisées par le Studio sans vidéo ; le script de rendu les remplace
// par les métadonnées réelles de la vidéo via les inputProps.
const defaultProps: CaptionedVideoProps = {
  videoSrc: "",
  captions: markEmphasis(sample),
  segments: null,
  style: "submagic",
  width: 1080,
  height: 1920,
  fps: 30,
  durationInFrames: 30 * 8,
};

export const Root: React.FC = () => (
  <Composition
    id="Captioned"
    component={CaptionedVideo}
    defaultProps={defaultProps}
    calculateMetadata={({ props }) => ({
      width: props.width,
      height: props.height,
      fps: props.fps,
      durationInFrames: props.durationInFrames,
    })}
  />
);
