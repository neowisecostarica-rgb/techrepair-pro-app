import * as React from "react"

import { cn } from "@/lib/utils"

const Card = React.forwardRef(
  /** @param {import("react").HTMLAttributes<HTMLDivElement>} props */
  ({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("rounded-[22px] border border-[#e5ecea] bg-white text-card-foreground shadow-[0_12px_40px_-30px_rgba(7,25,35,0.35)]", className)}
    {...props} />
))
Card.displayName = "Card"

const CardHeader = React.forwardRef(
  /** @param {import("react").HTMLAttributes<HTMLDivElement>} props */
  ({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-6", className)}
    {...props} />
))
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef(
  /** @param {import("react").HTMLAttributes<HTMLDivElement>} props */
  ({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("font-semibold leading-none tracking-tight", className)}
    {...props} />
))
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef(
  /** @param {import("react").HTMLAttributes<HTMLDivElement>} props */
  ({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props} />
))
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef(
  /** @param {import("react").HTMLAttributes<HTMLDivElement>} props */
  ({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
))
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef(
  /** @param {import("react").HTMLAttributes<HTMLDivElement>} props */
  ({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-6 pt-0", className)}
    {...props} />
))
CardFooter.displayName = "CardFooter"

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
