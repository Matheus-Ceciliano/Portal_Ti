import * as React from "react"
import { cn } from "cn"
import { classeControle } from "./input"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(classeControle, "field-sizing-content min-h-24 px-3.5 py-2.5 leading-6", className)}
      {...props}
    />
  )
}

export { Textarea }
