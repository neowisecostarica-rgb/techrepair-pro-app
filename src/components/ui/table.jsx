import * as React from "react"

import { cn } from "@/lib/utils"

const Table = React.forwardRef(
  /** @param {import("react").TableHTMLAttributes<HTMLTableElement>} props */
  ({ className, ...props }, ref) => (
  <div className="relative w-full overflow-auto">
    <table
      ref={ref}
      className={cn("w-full caption-bottom text-sm text-slate-700", className)}
      {...props} />
  </div>
))
Table.displayName = "Table"

const TableHeader = React.forwardRef(
  /** @param {import("react").HTMLAttributes<HTMLTableSectionElement>} props */
  ({ className, ...props }, ref) => (
  <thead ref={ref} className={cn("bg-[#f2f7f5] [&_tr]:border-b [&_tr]:border-[#e3ebe8]", className)} {...props} />
))
TableHeader.displayName = "TableHeader"

const TableBody = React.forwardRef(
  /** @param {import("react").HTMLAttributes<HTMLTableSectionElement>} props */
  ({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn("[&_tr:last-child]:border-0", className)}
    {...props} />
))
TableBody.displayName = "TableBody"

const TableFooter = React.forwardRef(
  /** @param {import("react").HTMLAttributes<HTMLTableSectionElement>} props */
  ({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn("border-t border-slate-200 bg-slate-50 font-medium [&>tr]:last:border-b-0", className)}
    {...props} />
))
TableFooter.displayName = "TableFooter"

const TableRow = React.forwardRef(
  /** @param {import("react").HTMLAttributes<HTMLTableRowElement>} props */
  ({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      "border-b border-[#edf1f0] transition-colors hover:bg-teal-50/40 data-[state=selected]:bg-teal-50/60",
      className
    )}
    {...props} />
))
TableRow.displayName = "TableRow"

const TableHead = React.forwardRef(
  /** @param {import("react").ThHTMLAttributes<HTMLTableCellElement>} props */
  ({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      "h-11 px-4 text-left align-middle text-[10px] font-semibold uppercase tracking-[0.13em] text-slate-600 [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
      className
    )}
    {...props} />
))
TableHead.displayName = "TableHead"

const TableCell = React.forwardRef(
  /** @param {import("react").TdHTMLAttributes<HTMLTableCellElement>} props */
  ({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn(
      "px-4 py-3 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
      className
    )}
    {...props} />
))
TableCell.displayName = "TableCell"

const TableCaption = React.forwardRef(
  /** @param {import("react").HTMLAttributes<HTMLTableCaptionElement>} props */
  ({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn("mt-4 text-sm text-muted-foreground", className)}
    {...props} />
))
TableCaption.displayName = "TableCaption"

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
