/**
 * iOS splash screens (apple-touch-startup-image). Same device list as scripts/build-icons.mjs;
 * one light and one dark image per size, picked by the media query.
 */
const DEVICES: [number, number, number][] = [
  [440, 956, 3],
  [402, 874, 3],
  [430, 932, 3],
  [393, 852, 3],
  [428, 926, 3],
  [390, 844, 3],
  [375, 812, 3],
  [414, 896, 3],
  [414, 896, 2],
  [414, 736, 3],
  [375, 667, 2],
];

export function splashScreens(): { url: string; media: string }[] {
  return DEVICES.flatMap(([w, h, dpr]) =>
    (["light", "dark"] as const).map((mode) => ({
      url: `/brand/splash/splash-${w * dpr}x${h * dpr}-${mode}.png`,
      media: `screen and (device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: portrait) and (prefers-color-scheme: ${mode})`,
    })),
  );
}
