import * as React from "react";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "destructive" | "outline" | "success";
}

function Badge({ className = "", variant = "default", ...props }: BadgeProps) {
  const variants = {
    default: "bg-primary text-primary-foreground shadow-sm",
    secondary: "bg-secondary text-secondary-foreground shadow-sm",
    destructive: "bg-destructive text-destructive-foreground shadow-sm",
    outline: "border-2 border-border bg-card text-foreground",
    success: "bg-green-600 text-white shadow-sm",
  };

  return (
    <div
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold transition-all ${variants[variant]} ${className}`}
      {...props}
    />
  );
}

export { Badge };
