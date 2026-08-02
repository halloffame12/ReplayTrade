/**
 * Command-pattern undo/redo history.
 *
 * Every mutating operation pushes an action with `redo()`/`undo()` lambdas.
 * The engine records lightweight closures (not whole-app snapshots), so drag
 * gestures commit exactly one action on pointer release.
 */
export interface HistoryAction {
  label: string;
  redo: () => void;
  undo: () => void;
}

export class HistoryManager {
  private undoStack: HistoryAction[] = [];
  private redoStack: HistoryAction[] = [];
  private max = 200;
  private onChange: (() => void) | null = null;

  setOnChange(cb: () => void): void {
    this.onChange = cb;
  }

  push(action: HistoryAction): void {
    this.undoStack.push(action);
    if (this.undoStack.length > this.max) this.undoStack.shift();
    this.redoStack = [];
    this.onChange?.();
  }

  undo(): void {
    const action = this.undoStack.pop();
    if (!action) return;
    try {
      action.undo();
    } finally {
      this.redoStack.push(action);
      this.onChange?.();
    }
  }

  redo(): void {
    const action = this.redoStack.pop();
    if (!action) return;
    try {
      action.redo();
    } finally {
      this.undoStack.push(action);
      this.onChange?.();
    }
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.onChange?.();
  }
}
