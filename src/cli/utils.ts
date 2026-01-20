import { render } from "ink";
import React from "react";

// Magic prefix for shell function to detect cd commands
export const CD_PREFIX = "__lane_cd:";

// Render Ink to stderr so it shows while shell wrapper captures stdout
export function renderUI(element: React.ReactElement) {
  return render(element, {
    stdout: process.stderr,
    stdin: process.stdin,
  });
}
