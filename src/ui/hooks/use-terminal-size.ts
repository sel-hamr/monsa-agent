import { useEffect, useState } from "react";
import { useStdout } from "ink";

export type TerminalSize = { columns: number; rows: number };

const FALLBACK: TerminalSize = { columns: 80, rows: 24 };

function read(stdout: NodeJS.WriteStream | undefined): TerminalSize {
  return {
    columns: stdout?.columns ?? FALLBACK.columns,
    rows: stdout?.rows ?? FALLBACK.rows,
  };
}

/** Terminal dimensions, kept current as the window is resized. */
export function useTerminalSize(): TerminalSize {
  const { stdout } = useStdout();
  const [size, setSize] = useState<TerminalSize>(() => read(stdout));

  useEffect(() => {
    if (!stdout) return;

    const onResize = () => setSize(read(stdout));
    onResize();
    stdout.on("resize", onResize);
    return () => {
      stdout.off("resize", onResize);
    };
  }, [stdout]);

  return size;
}
