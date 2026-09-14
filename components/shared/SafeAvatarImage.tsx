import React from "react";

type SafeAvatarImageProps = React.ImgHTMLAttributes<HTMLImageElement>;

/** Keeps user-provided avatars fully inside rounded or circular icon frames. */
export const SafeAvatarImage: React.FC<SafeAvatarImageProps> = ({ src, style, alt = "", className = "", ...props }) => {
  const isBundledPreset = typeof src === "string" && src.startsWith("/avatars/");

  return (
    <span
      className={`inline-flex items-center justify-center overflow-hidden bg-white ${className}`}
      data-avatar-fit="contain"
      style={style}
    >
      <img
        {...props}
        src={src}
        alt={alt}
        className={isBundledPreset ? "h-full w-full object-contain" : "h-[70%] w-[70%] object-contain"}
      />
    </span>
  );
};

export default SafeAvatarImage;
