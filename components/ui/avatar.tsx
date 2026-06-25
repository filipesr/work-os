import * as React from "react";

const Avatar = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className = "", ...props }, ref) => (
    <div
      ref={ref}
      className={`relative isolate flex h-10 w-10 shrink-0 overflow-hidden rounded-full ${className}`}
      {...props}
    />
  )
);
Avatar.displayName = "Avatar";

const AvatarImage = React.forwardRef<HTMLImageElement, React.ImgHTMLAttributes<HTMLImageElement>>(
  ({ className = "", src, ...props }, ref) => {
    // Render nothing when there's no image so the fallback (initial) shows alone.
    if (!src) return null;
    return (
      // Overlay the fallback completely, cropping to fill the circle.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        ref={ref}
        src={src}
        alt={props.alt ?? ""}
        className={`absolute inset-0 z-10 h-full w-full object-cover ${className}`}
        {...props}
      />
    );
  }
);
AvatarImage.displayName = "AvatarImage";

const AvatarFallback = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className = "", ...props }, ref) => (
    <div
      ref={ref}
      className={`absolute inset-0 flex h-full w-full items-center justify-center rounded-full bg-gray-200 text-sm font-medium ${className}`}
      {...props}
    />
  )
);
AvatarFallback.displayName = "AvatarFallback";

export { Avatar, AvatarImage, AvatarFallback };
