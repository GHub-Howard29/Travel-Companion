import type { SVGProps } from "react";

import type { TravelMode } from "../types";

type MaterialTravelModeIconProps = Omit<SVGProps<SVGSVGElement>, "children"> & {
  mode: TravelMode;
  size?: number;
};

const ICON_PATHS: Record<TravelMode, { name: string; path: string; viewBox: string }> = {
  drive: {
    name: "directions_car",
    viewBox: "0 -960 960 960",
    path: "M240-200v40q0 17-11.5 28.5T200-120h-40q-17 0-28.5-11.5T120-160v-320l84-240q6-18 21.5-29t34.5-11h440q19 0 34.5 11t21.5 29l84 240v320q0 17-11.5 28.5T800-120h-40q-17 0-28.5-11.5T720-160v-40H240Zm-8-360h496l-42-120H274l-42 120Zm68 240q25 0 42.5-17.5T360-380q0-25-17.5-42.5T300-440q-25 0-42.5 17.5T240-380q0 25 17.5 42.5T300-320Zm360 0q25 0 42.5-17.5T720-380q0-25-17.5-42.5T660-440q-25 0-42.5 17.5T600-380q0 25 17.5 42.5T660-320Zm-460 40h560v-200H200v200Z",
  },
  walk: {
    name: "directions_walk",
    viewBox: "0 -960 960 960",
    path: "m280-40 112-564-72 28v136h-80v-188l202-86q14-6 29.5-7t29.5 4q14 5 26.5 14t20.5 23l40 64q26 42 70.5 69T760-520v80q-70 0-125-29t-94-74l-25 123 84 80v300h-80v-260l-84-64-72 324h-84Zm260-700q-33 0-56.5-23.5T460-820q0-33 23.5-56.5T540-900q33 0 56.5 23.5T620-820q0 33-23.5 56.5T540-740Z",
  },
  transit: {
    name: "directions_transit",
    viewBox: "0 0 24 24",
    path: "M12 2c-4.42 0-8 .5-8 4v9.5C4 17.43 5.57 19 7.5 19L6 20.5v.5h12v-.5L16.5 19c1.93 0 3.5-1.57 3.5-3.5V6c0-3.5-3.58-4-8-4zM7.5 17c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm3.5-6H6V6h5v5zm5.5 6c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm1.5-6h-5V6h5v5z",
  },
};

export const MaterialTravelModeIcon = ({
  mode,
  size = 16,
  ...svgProps
}: MaterialTravelModeIconProps) => {
  const icon = ICON_PATHS[mode];

  return (
    <svg
      viewBox={icon.viewBox}
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      data-material-symbol={icon.name}
      {...svgProps}
    >
      <path d={icon.path} />
    </svg>
  );
};
