import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef(({ className, type, ...props }, ref) => {
  return (
    (<input
      type={type}
      className={cn(
        "flex h-9 w-full rounded-lg border border-slate-200 bg-white px-3 py-1 text-base shadow-sm transition-all file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-slate-400 hover:border-slate-300 focus-visible:border-teal-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600/10 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-60 md:text-sm",
        className
      )}
      ref={ref}
      {...props} />)
  );
})
Input.displayName = "Input"

export { Input }
